import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRows, normalizeRow, parseCSV } from "../site/core.js";

function rows(csv) { return parseCSV(csv).map(normalizeRow); }

const baseHeader = "Symbol,Last,Mark,Bid,Ask,PTS,Sell-Pressure % (Est.),Flow Pressure State,GEX Proxy $M/1% (conv. C+/P-),Vol/OI (Turnover),OI Market Value (Last) $M,Fresh Gross Premium (Est.) $M,Directional Premium Proxy $M,Net Option Premium Proxy $M (option-side),Recent Volume 10m,Underlying Move 10m %,Volume,Open.Int";

test("missing values remain null instead of false zero", () => {
  const row = normalizeRow(Object.fromEntries(baseHeader.split(",").map((h) => [h, "NaN"])));
  assert.equal(row.gex, null);
  assert.equal(row.oiValue, null);
  assert.equal(row.fresh, null);
});

test("spot estimate resolves absolute PTS with put-call parity", () => {
  const csv = `${baseHeader}\n.SPXW260612C7390,10.5,10.5,10.4,10.6,5,35,CALL_BUY_PRESSURE,NaN,2,1,.03,.01,.01,100,.10,1000,500\n.SPXW260612P7390,5.5,5.5,5.4,5.6,5,65,PUT_SELL_PRESSURE,NaN,2,1,.03,.01,-.01,100,.10,1000,500\n.SPXW260612C7400,5.5,5.5,5.4,5.6,5,35,CALL_BUY_PRESSURE,NaN,2,1,.03,.01,.01,100,.10,1000,500\n.SPXW260612P7400,10.5,10.5,10.4,10.6,5,65,PUT_SELL_PRESSURE,NaN,2,1,.03,.01,-.01,100,.10,1000,500`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 5.5);
  assert.ok(Math.abs(a.spot - 7395) < 0.5);
});

test("GEX is excluded when coverage is insufficient", () => {
  const csv = `${baseHeader}\n.SPXW260612C7400,5,5,4.9,5.1,5,35,CALL_BUY_PRESSURE,NaN,2,1,.03,.01,.01,100,.10,1000,500\n.SPXW260612P7400,5,5,4.9,5.1,5,65,PUT_SELL_PRESSURE,NaN,2,1,.03,.01,-.01,100,.10,1000,500`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7400, dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 5);
  assert.equal(a.useGex, false);
  assert.ok(a.confidence <= 70);
});

test("contract cannot be actionable without spread, recent volume and momentum", () => {
  const csv = `Symbol,Last,PTS,Sell %,Fresh Prem $M,Dollar Flow $M,Volume,Open.Int\n.SPXW260612C7400,4.5,5,30,.10,.05,5000,1000\n.SPXW260612P7400,4.5,5,70,.10,.05,5000,1000`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7395, dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 5);
  assert.equal(a.candidates[0].contract.actionable, false);
});

test("contract becomes actionable only when all gates pass", () => {
  const csv = `${baseHeader}\n.SPXW260612C7400,4.5,4.5,4.3,4.5,5,28,CALL_BUY_PRESSURE,10,3,2,.12,.08,.08,1200,.20,5000,1000\n.SPXW260612P7400,5.5,5.5,5.3,5.7,5,70,PUT_SELL_PRESSURE,-10,3,2,.12,.08,-.08,1200,.20,5000,1000`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7395, dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 5);
  const call = a.candidates.find((r) => r.type === "C");
  assert.equal(call.contract.status, "ACTIONABLE");
});

test("abbreviated Thinkorswim headers are recognized", () => {
  const csv = `Symbol,Last,PTS,Sell-Pressure %,Flow Press STATE,GEX proxy,OI Market Val $M,Vol/OI turnover,Fresh GRS Prem$M,Dollar Flow $M,Net Prem,SESS GRS Prem $M,REC Flow Con,Score,Session flow con,Underlying Move,Recent Volume,Open.Int,Volume\n.SPXW260612C7400,4.5,5,30,CALL_BUY_PRESSURE,10,2,3,.05,.02,.02,4.2,1.1,WATCH C 7400 | 70,8,.10,100,1000,500`;
  const row = rows(csv)[0];
  assert.equal(row.sell, 30);
  assert.equal(row.oiValue, 2);
  assert.equal(row.volOi, 3);
  assert.equal(row.fresh, .05);
  assert.equal(row.sessionGross, 4.2);
  assert.equal(row.recentVolume, 100);
  assert.equal(row.underlyingMovePct, .10);
});

test("LOW NaN score is treated as no data", () => {
  const csv = `Symbol,Last,PTS,Score\n.SPXW260612C7400,4.5,5,LOW | NaN`;
  const row = rows(csv)[0];
  assert.equal(row.suppliedContractStatus, "NO DATA");
  assert.equal(row.suppliedContractScore, null);
});

test("overnight mode locks live contract selection and uses distinct downside levels", () => {
  const csv = `Symbol,Last,PTS,GEX proxy,OI Market Val $M,Vol/OI turnover,SESS GRS Prem $M,Session flow con,Open.Int,Volume\n.SPXW260612C7400,35,5,700,10,7,40,40,3000,1000\n.SPXW260612P7390,29,5,-200,2,3,12,12,700,1000\n.SPXW260612P7380,26,15,-300,3,2,11,8,1000,800\n.SPXW260612P7350,16,45,-1400,10,1.5,33,9,6000,700\n.SPXW260612C7425,23,30,650,6,2,8,6,2500,600\n.SPXW260612C7450,14,55,1300,9,2.5,14,10,6000,1200`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7395, dte: 0, mode: "overnight", asOf: "2026-06-12T01:15:00-04:00" }, 5);
  assert.equal(a.sessionState, "locked");
  assert.equal(a.liveReady, false);
  assert.ok(a.candidates.every((r) => r.contract.status === "LIVE LOCKED"));
  assert.notEqual(a.trapdoor, a.floor);
});


test("invalid recent volume falls back to fresh-premium-derived activity", () => {
  const csv = `${baseHeader}\n.SPXW260612C7400,4.5,4.5,4.3,4.5,5,28,CALL_BUY_PRESSURE,10,3,2,.12,.08,.08,5000,.20,1000,1000\n.SPXW260612P7400,5.5,5.5,5.3,5.7,5,70,PUT_SELL_PRESSURE,-10,3,2,.12,.08,-.08,5000,.20,1000,1000`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7395, dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 5);
  assert.equal(a.aggregationMismatchRows, 2);
  assert.ok(a.rows.every((r) => r.recentVolume == null));
  const call = a.candidates.find((r) => r.type === "C");
  assert.equal(call.activityVolumeEstimated, true);
  assert.equal(call.contract.activitySource, "fresh-premium-derived");
  assert.ok(call.contract.activityVolume > 25);
  assert.equal(call.contract.actionable, true);
});

test("incomplete live coverage returns per-contract blockers instead of BUILDING rows", () => {
  const csv = `${baseHeader}\n.SPXW260612C7400,4.5,4.5,NaN,NaN,5,28,CALL_BUY_PRESSURE,10,3,2,.12,.08,.08,NaN,NaN,5000,1000\n.SPXW260612P7400,5.5,5.5,NaN,NaN,5,70,PUT_SELL_PRESSURE,-10,3,2,NaN,NaN,NaN,NaN,NaN,5000,1000`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7395, dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 10);
  assert.equal(a.sessionState, "incomplete");
  assert.ok(a.candidates.length > 0);
  assert.ok(a.candidates.every((r) => r.contract.status !== "BUILDING"));
  assert.ok(a.candidates.some((r) => r.contract.blockers.includes("Bid/Ask missing")));
});

test("partial chain coverage does not globally block a complete contract", () => {
  const complete = `.SPXW260612C7400,4.5,4.5,4.3,4.5,5,28,CALL_BUY_PRESSURE,NaN,3,2,.12,.08,.08,NaN,.20,5000,1000`;
  const incomplete = [7410, 7420, 7430, 7440].map((k) => `.SPXW260612C${k},4.5,4.5,NaN,NaN,${k-7395},NaN,INSUFFICIENT_DATA,NaN,3,2,NaN,NaN,NaN,NaN,NaN,5000,1000`).join("\n");
  const csv = `${baseHeader}\n${complete}\n${incomplete}`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7395, dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 5);
  assert.equal(a.sessionState, "incomplete");
  const call = a.candidates.find((r) => r.strike === 7400);
  assert.equal(call.contract.status, "ACTIONABLE");
});

test("GEX absence does not block an otherwise actionable contract", () => {
  const csv = `${baseHeader}\n.SPXW260612C7400,4.5,4.5,4.3,4.5,5,28,CALL_BUY_PRESSURE,NaN,3,2,.12,.08,.08,NaN,.20,5000,1000`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7395, dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 5);
  assert.equal(a.useGex, false);
  assert.equal(a.candidates[0].contract.status, "ACTIONABLE");
});

test("truncated Thinkorswim custom-column headers are recognized", () => {
  const csv = `Symbol,Last,Mark,Bid,Ask,PTS,Sell-Press...,Flow Pressure STATE,GEX PRO...,OI Market...,Vol/OI tu...,SESS GRS...,Fresh GR...,Dollar Flo...,Net Prem,REC Fl...,Score,Session fl...,Underly...,Open.Int,Volume\n.SPXW260612C7435,9.7,9.7,9.6,9.8,5,42,CALL_BUY_PRESSURE,123,2.4,8,10.5,.12,.04,.04,2.1,LOW | 55,8.8,.09,1000,5000`;
  const row = rows(csv)[0];
  assert.equal(row.bid, 9.6);
  assert.equal(row.ask, 9.8);
  assert.equal(row.gex, 123);
  assert.equal(row.oiValue, 2.4);
  assert.equal(row.volOi, 8);
  assert.equal(row.sessionGross, 10.5);
  assert.equal(row.fresh, .12);
  assert.equal(row.directional, .04);
  assert.equal(row.recentConcentration, 2.1);
  assert.equal(row.sessionConcentration, 8.8);
  assert.equal(row.underlyingMovePct, .09);
});

test("a close active contract can be shortlisted as CONDITIONAL before momentum confirms", () => {
  const csv = `${baseHeader}\n.SPXW260612C7400,4.5,4.5,4.3,4.5,5,48,MIXED,NaN,3,2,.02,.01,.01,NaN,.01,5000,1000`;
  const a = analyzeRows(rows(csv), { ticker: "SPX", spot: 7395, dte: 0, mode: "live", asOf: "2026-06-12T10:00:00-04:00" }, 5);
  assert.equal(a.candidates[0].contract.status, "CONDITIONAL");
  assert.equal(a.candidates[0].contract.actionable, false);
});
