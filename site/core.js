"use strict";

export const NULL_TOKENS = /^(nan|loading|n\/a|null|undefined|—|-|)$/i;

export const COLUMN_ALIASES = {
  symbol: ["symbol", "contract"],
  last: ["last", "price"],
  mark: ["mark", "mark price", "mark pr"],
  bid: ["bid", "bid price"],
  ask: ["ask", "ask price"],
  pts: ["pts", "dist (pts)", "distance", "distance to spot", "distance from spot"],
  distPct: ["dist %", "distance %", "distance pct"],
  sell: ["sell-pressure % (est.)", "sell-pressure %", "sell pressure %", "sell %", "sell%", "sell pct", "sell-press", "sell press"],
  flowState: ["flow pressure state", "flow press state", "flow state", "flowstate", "flow pressure", "flow press"],
  gex: ["gex proxy $m/1% (conv. c+/p−)", "gex proxy $m/1% (conv. c+/p-)", "gex proxy $m/1%", "gex proxy", "gex pro", "gex"],
  oiValue: ["oi market value (last) $m", "oi market val $m", "oi market", "oi $m", "oi value", "oi value $m"],
  volOi: ["vol/oi (turnover)", "vol/oi turnover", "vol/oi tu", "vol/oi ratio", "vol/oi", "volume/oi"],
  fresh: ["fresh gross premium (est.) $m", "fresh grs prem$m", "fresh grs prem $m", "fresh gr", "fresh prem $m", "fresh premium $m", "fresh premium"],
  directional: ["directional premium proxy $m", "directional premium", "dollar flow $m", "dollar flow", "dollar flo"],
  netOption: ["net option premium proxy $m (option-side)", "net option premium proxy $m", "net prem", "fnpf $m", "fnpf"],
  sessionGross: ["session gross premium (est.) $m", "sess grs prem $m", "sess grs", "session grs prem $m", "cum prem $m", "cumulative premium", "cum premium", "ovr prem $m"],
  recentConcentration: ["flow conc. (10-min)", "flow conc (10-min)", "rec flow con", "rec fl", "recent flow concentration"],
  sessionConcentration: ["flow conc. (session)", "flow conc (session)", "session flow con", "session fl", "flow concentrate", "flow concentration"],
  openInterest: ["open.int", "open interest", "oi"],
  volume: ["volume", "vol"],
  recentVolume: ["recent volume 10m", "recent volume", "recent vol 10m", "rolling volume", "10m volume"],
  underlyingMovePct: ["underlying move 10m %", "underlying move %", "underlying move", "underly", "underlying momentum %"],
  contractScore: ["contract flow score", "score", "buy strike"],
  delta: ["signed delta", "0dte delta", "delta"],
  dwf: ["dwf $m", "dwf"],
  dominance: ["net dominance", "lflow dominance", "flow dominance"],
  gammaTrap: ["gamma trap"],
  dhp: ["dhp"],
  freshPct: ["fresh %"]
};

export const PRESETS = {
  "SPX-0": { ticker: "SPX", dte: 0, maxDistancePct: 0.55, momentumThreshold: 0.08, minFreshM: 0.01, minRecentVolume: 25, maxSpreadPct: 12, nearSteps: 10 },
  "SPX-1": { ticker: "SPX", dte: 1, maxDistancePct: 0.75, momentumThreshold: 0.06, minFreshM: 0.01, minRecentVolume: 25, maxSpreadPct: 10, nearSteps: 10 },
  "NDX-0": { ticker: "NDX", dte: 0, maxDistancePct: 0.55, momentumThreshold: 0.10, minFreshM: 0.015, minRecentVolume: 10, maxSpreadPct: 15, nearSteps: 10 },
  "NDX-1": { ticker: "NDX", dte: 1, maxDistancePct: 0.75, momentumThreshold: 0.08, minFreshM: 0.015, minRecentVolume: 10, maxSpreadPct: 12, nearSteps: 10 }
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/[.\u2026]+$/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/[%$()]/g, " ")
    .replace(/[^a-zA-Z0-9/+.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseCSVLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += char;
  }
  cells.push(value);
  return cells;
}

export function parseCSV(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const headerIndex = lines.findIndex((line) => /(^|,)\s*Symbol\s*(,|$)/i.test(line));
  if (headerIndex < 0) throw new Error("Could not find a Symbol header in the CSV.");
  const matrix = lines.slice(headerIndex).map(parseCSVLine);
  const headers = matrix.shift().map((x) => x.trim());
  return matrix
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
}

export function numberOrNull(value) {
  const cleaned = String(value ?? "")
    .replace(/[$,%+]/g, "")
    .replace(/,/g, "")
    .trim();
  if (NULL_TOKENS.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function findValue(raw, aliasKey) {
  const entries = Object.keys(raw).map((key) => [normalizeHeader(key), raw[key]]);
  const index = new Map(entries);
  const aliases = (COLUMN_ALIASES[aliasKey] || []).map(normalizeHeader);
  for (const alias of aliases) {
    if (index.has(alias)) return index.get(alias);
  }
  // Thinkorswim can export shortened custom-column names. Match only a
  // unique, meaningful prefix so GEX PRO..., Fresh GR..., etc. survive.
  for (const alias of aliases) {
    if (alias.length < 4) continue;
    const matches = entries.filter(([key]) => key.length >= 4 && (key.startsWith(alias) || alias.startsWith(key)));
    if (matches.length === 1) return matches[0][1];
  }
  return "";
}

export function parseExpiry(yymmdd) {
  if (!/^\d{6}$/.test(yymmdd || "")) return null;
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  return new Date(Date.UTC(year, month - 1, day));
}

export function parseContract(symbol) {
  const text = String(symbol || "").trim().toUpperCase();
  const match = text.match(/^\.?([A-Z]+?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (match) {
    const root = match[1];
    const ticker = root.startsWith("NDX") ? "NDX" : root.startsWith("SPX") ? "SPX" : root.replace(/[WP]$/, "");
    return { root, ticker, expiryCode: match[2], expiry: parseExpiry(match[2]), type: match[3], strike: Number(match[4]) };
  }
  const fallback = text.match(/([CP])(\d+(?:\.\d+)?)$/);
  return fallback
    ? { root: "", ticker: "INDEX", expiryCode: "", expiry: null, type: fallback[1], strike: Number(fallback[2]) }
    : { root: "", ticker: "INDEX", expiryCode: "", expiry: null, type: "?", strike: null };
}

function normalizeFlowStateLabel(value) {
  const state = String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
  const map = {
    BULL_CALL_BUY: "CALL_BUY_PRESSURE",
    BEAR_CALL_SELL: "CALL_SELL_PRESSURE",
    BEAR_PUT_BUY: "PUT_BUY_PRESSURE",
    BULL_PUT_SELL: "PUT_SELL_PRESSURE",
    NO_DATA: "INSUFFICIENT_DATA",
    CALL_BUY_PRESSURE: "CALL_BUY_PRESSURE",
    CALL_SELL_PRESSURE: "CALL_SELL_PRESSURE",
    PUT_BUY_PRESSURE: "PUT_BUY_PRESSURE",
    PUT_SELL_PRESSURE: "PUT_SELL_PRESSURE",
    MIXED: "MIXED",
    INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
    LIVE_LOCKED: "INSUFFICIENT_DATA",
    BUILDING_LIVE_WINDOW: "INSUFFICIENT_DATA"
  };
  return map[state] || "INSUFFICIENT_DATA";
}

export function resolveFlowState(row) {
  if (row.sell != null && row.type !== "?") {
    if (row.sell <= 40) return row.type === "C" ? "CALL_BUY_PRESSURE" : "PUT_BUY_PRESSURE";
    if (row.sell >= 60) return row.type === "C" ? "CALL_SELL_PRESSURE" : "PUT_SELL_PRESSURE";
    return "MIXED";
  }
  return normalizeFlowStateLabel(row.suppliedFlowState);
}

export function inferDirectionalPressure(row) {
  if (row.directional != null) return { value: row.directional, source: "directional-premium" };
  if (row.netOption != null) return { value: row.type === "P" ? -row.netOption : row.netOption, source: "net-option-premium" };
  if (row.sell != null && row.fresh != null && row.fresh >= 0) {
    const optionFactor = clamp((50 - row.sell) / 50, -1, 1);
    return { value: row.type === "P" ? -row.fresh * optionFactor : row.fresh * optionFactor, source: "sell-pressure-derived" };
  }
  return { value: null, source: "missing" };
}

export function parseContractScore(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return { status: "NO DATA", score: null, raw: "" };
  if (/NAN|NO[ _]DATA|SKIP|INSUFFICIENT/.test(text)) return { status: "NO DATA", score: null, raw: text };
  if (/LIVE[ _]LOCKED|BUILDING[ _]LIVE/.test(text)) return { status: "LIVE LOCKED", score: null, raw: text };
  const scoreMatch = text.match(/(?:\||SCORE\s*)\s*(\d+(?:\.\d+)?)/);
  const score = scoreMatch ? Number(scoreMatch[1]) : numberOrNull(text);
  let status = "LOW";
  if (/ACTIONABLE/.test(text)) status = "ACTIONABLE";
  else if (/WATCH/.test(text)) status = "WATCH";
  return { status, score, raw: text };
}

export function normalizeRow(raw) {
  const symbol = String(findValue(raw, "symbol") || "").trim();
  const contract = parseContract(symbol);
  const last = numberOrNull(findValue(raw, "last"));
  const mark = numberOrNull(findValue(raw, "mark"));
  const bid = numberOrNull(findValue(raw, "bid"));
  const ask = numberOrNull(findValue(raw, "ask"));
  const openInterest = numberOrNull(findValue(raw, "openInterest"));
  let oiValue = numberOrNull(findValue(raw, "oiValue"));
  if (oiValue == null && openInterest != null && last != null) oiValue = openInterest * last * 100 / 1_000_000;
  const contractScore = parseContractScore(findValue(raw, "contractScore"));
  const row = {
    raw,
    symbol,
    ticker: contract.ticker,
    root: contract.root,
    expiryCode: contract.expiryCode,
    expiry: contract.expiry,
    type: contract.type,
    strike: contract.strike,
    last,
    mark,
    bid,
    ask,
    price: mark != null && mark > 0 ? mark : last,
    pts: numberOrNull(findValue(raw, "pts")),
    distPctExported: numberOrNull(findValue(raw, "distPct")),
    sell: numberOrNull(findValue(raw, "sell")),
    suppliedFlowState: String(findValue(raw, "flowState") || "").trim(),
    gex: numberOrNull(findValue(raw, "gex")),
    oiValue,
    volOi: numberOrNull(findValue(raw, "volOi")),
    fresh: numberOrNull(findValue(raw, "fresh")),
    directional: numberOrNull(findValue(raw, "directional")),
    netOption: numberOrNull(findValue(raw, "netOption")),
    sessionGross: numberOrNull(findValue(raw, "sessionGross")),
    recentConcentration: numberOrNull(findValue(raw, "recentConcentration")),
    sessionConcentration: numberOrNull(findValue(raw, "sessionConcentration")),
    openInterest,
    volume: numberOrNull(findValue(raw, "volume")),
    recentVolume: numberOrNull(findValue(raw, "recentVolume")),
    underlyingMovePct: numberOrNull(findValue(raw, "underlyingMovePct")),
    suppliedContractStatus: contractScore.status,
    suppliedContractScore: contractScore.score,
    unverified: {
      delta: numberOrNull(findValue(raw, "delta")),
      dwf: numberOrNull(findValue(raw, "dwf")),
      dominance: String(findValue(raw, "dominance") || "").trim(),
      gammaTrap: String(findValue(raw, "gammaTrap") || "").trim(),
      dhp: numberOrNull(findValue(raw, "dhp")),
      freshPct: numberOrNull(findValue(raw, "freshPct"))
    }
  };
  row.flowState = resolveFlowState(row);
  const directional = inferDirectionalPressure(row);
  row.directionalPressure = directional.value;
  row.directionalSource = directional.source;
  row.spreadPct = bid != null && ask != null && bid > 0 && ask >= bid && (bid + ask) > 0
    ? 100 * (ask - bid) / ((bid + ask) / 2)
    : null;
  return row;
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function paritySpot(rows) {
  const byStrike = new Map();
  for (const row of rows) {
    if (!Number.isFinite(row.strike) || !Number.isFinite(row.price) || row.price <= 0) continue;
    if (!byStrike.has(row.strike)) byStrike.set(row.strike, {});
    byStrike.get(row.strike)[row.type] = row.price;
  }
  const estimates = [];
  for (const [strike, pair] of byStrike.entries()) {
    if (Number.isFinite(pair.C) && Number.isFinite(pair.P)) estimates.push(strike + pair.C - pair.P);
  }
  return median(estimates);
}

function densestSpotCluster(rows, ticker) {
  const candidates = [];
  for (const row of rows) {
    if (!Number.isFinite(row.strike) || !Number.isFinite(row.pts) || row.pts < 0) continue;
    if (row.pts > Math.max(row.strike * 0.08, ticker === "NDX" ? 1200 : 300)) continue;
    candidates.push(row.strike - row.pts, row.strike + row.pts);
  }
  if (!candidates.length) return null;
  const radius = ticker === "NDX" ? 80 : 20;
  let best = [];
  for (const candidate of candidates) {
    const cluster = candidates.filter((x) => Math.abs(x - candidate) <= radius);
    if (cluster.length > best.length) best = cluster;
  }
  return median(best);
}

export function estimateSpot(rows, dataset = {}) {
  const configured = Number(dataset?.spot);
  if (Number.isFinite(configured) && configured > 0) return { value: configured, source: "manifest" };
  const ticker = String(dataset?.ticker || rows.find((r) => r.ticker !== "INDEX")?.ticker || "SPX").toUpperCase();
  const parity = paritySpot(rows);
  if (Number.isFinite(parity)) {
    const ptsResolved = rows.flatMap((row) => {
      if (!Number.isFinite(row.strike) || !Number.isFinite(row.pts) || row.pts < 0) return [];
      const a = row.strike - row.pts;
      const b = row.strike + row.pts;
      const chosen = Math.abs(a - parity) <= Math.abs(b - parity) ? a : b;
      return Math.abs(chosen - parity) <= Math.max(parity * 0.012, ticker === "NDX" ? 250 : 60) ? [chosen] : [];
    });
    const resolved = median(ptsResolved);
    return { value: Number.isFinite(resolved) ? resolved : parity, source: Number.isFinite(resolved) ? "parity+distance" : "put-call parity" };
  }
  const clustered = densestSpotCluster(rows, ticker);
  return Number.isFinite(clustered) ? { value: clustered, source: "distance cluster" } : { value: null, source: "unavailable" };
}

export function inferStrikeStep(rows, ticker) {
  const strikes = [...new Set(rows.map((r) => r.strike).filter(Number.isFinite))].sort((a, b) => a - b);
  const diffs = strikes.slice(1).map((value, index) => value - strikes[index]).filter((x) => x > 0 && x <= 250);
  const inferred = median(diffs.sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(diffs.length * 0.6)))) || (ticker === "NDX" ? 25 : 5);
  return ticker === "NDX" ? clamp(inferred, 5, 100) : clamp(inferred, 1, 25);
}

export function majority(values, fallback) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || fallback;
}

export function deriveDteMeta(rows, dataset = {}) {
  const expiry = rows.find((row) => row.expiry)?.expiry || null;
  const asOf = dataset?.asOf ? new Date(dataset.asOf) : new Date();
  let derived = null;
  if (expiry && !Number.isNaN(asOf.getTime())) {
    const dateParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(asOf);
    const get = (type) => Number(dateParts.find((p) => p.type === type)?.value);
    const asOfDate = Date.UTC(get("year"), get("month") - 1, get("day"));
    derived = Math.round((expiry.getTime() - asOfDate) / 86_400_000);
  }
  const configured = Number.isFinite(Number(dataset?.dte)) ? Number(dataset.dte) : null;
  return { expiry, derived, configured, effective: derived != null ? derived : configured, mismatch: derived != null && configured != null && derived !== configured };
}

function percentileRank(rows, field, absolute = false) {
  const values = rows.map((r) => r[field]).filter(Number.isFinite).map((x) => absolute ? Math.abs(x) : x).sort((a, b) => a - b);
  return (value) => {
    if (!Number.isFinite(value) || !values.length) return null;
    const target = absolute ? Math.abs(value) : value;
    let idx = 0;
    while (idx < values.length && values[idx] <= target) idx += 1;
    return idx / values.length;
  };
}

function weightedAvailable(parts) {
  let total = 0;
  let weight = 0;
  for (const [value, w] of parts) {
    if (Number.isFinite(value)) { total += value * w; weight += w; }
  }
  return weight ? total / weight : null;
}

function pressureDirection(row) {
  if (Number.isFinite(row.directionalPressure)) return clamp(row.directionalPressure / Math.max(0.01, Math.abs(row.fresh || 0.01)), -1, 1);
  if (row.sell == null) return null;
  const optionDirection = clamp((50 - row.sell) / 20, -1, 1);
  return row.type === "P" ? -optionDirection : optionDirection;
}

function pressureStrength(row) {
  const direction = pressureDirection(row);
  return direction == null ? null : Math.abs(direction);
}

function classifyBias(value, sessionState) {
  if (sessionState === "locked") return "STRUCTURAL / WAIT";
  if (sessionState === "building") return "BUILDING LIVE WINDOW";
  if (sessionState === "incomplete") return "PARTIAL LIVE DATA";
  if (value > 0.45) return "BULLISH";
  if (value > 0.18) return "SLIGHT BULLISH";
  if (value < -0.45) return "BEARISH";
  if (value < -0.18) return "SLIGHT BEARISH";
  return "NEUTRAL / PIN";
}

function modeLiveReady(dataset) {
  const mode = String(dataset?.mode || "snapshot").toLowerCase();
  if (mode !== "live") return false;
  if (!dataset?.asOf) return true;
  const asOf = new Date(dataset.asOf);
  if (Number.isNaN(asOf.getTime())) return true;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(asOf);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute >= 9 * 60 + 40;
}

function contractScore(row, preset, priceCap, sessionState = "live") {
  if (sessionState === "locked") return { score: 0, readiness: 0, status: "LIVE LOCKED", actionable: false, watch: false, aligned: false, against: false, missing: ["live session"], blockers: ["live qualification locked"] };
  if (sessionState === "building") return { score: 0, readiness: 0, status: "BUILDING", actionable: false, watch: false, aligned: false, against: false, missing: ["complete 10m live window"], blockers: ["complete 10-minute live window required"] };

  const chainCoverageIncomplete = sessionState === "incomplete";
  const price = row.price;
  const sell = row.sell;
  const fresh = row.fresh;
  const recentVolume = row.activityVolume;
  const activitySource = row.activityVolumeEstimated ? "fresh-premium-derived" : Number.isFinite(row.activityVolume) ? "reported-10m-volume" : "missing";
  const move = row.underlyingMovePct;
  const typeSign = row.type === "P" ? -1 : 1;
  const aligned = Number.isFinite(move) && typeSign * move >= preset.momentumThreshold;
  const strong = aligned && Math.abs(move) >= 2 * preset.momentumThreshold;
  const against = Number.isFinite(move) && typeSign * move <= -preset.momentumThreshold;

  const pressure = sell == null ? 0 : sell <= 30 ? 30 : sell <= 40 ? 22 : sell <= 45 ? 14 : sell <= 50 ? 6 : 0;
  const proximity = !Number.isFinite(row.distancePct) ? 0 : row.distancePct <= 0.10 ? 20 : row.distancePct <= 0.20 ? 16 : row.distancePct <= 0.35 ? 10 : row.distancePct <= preset.maxDistancePct ? 4 : 0;
  const premium = fresh == null ? 0 : fresh >= 0.10 ? 25 : fresh >= 0.05 ? 18 : fresh >= 0.02 ? 10 : fresh >= preset.minFreshM ? 5 : 0;
  const momentum = strong ? 25 : aligned ? 15 : 0;
  const score = pressure + proximity + premium + momentum;

  const gates = {
    price: Number.isFinite(price) && price > 0 && price <= priceCap,
    distance: Number.isFinite(row.distancePct) && row.distancePct <= preset.maxDistancePct,
    pressure: Number.isFinite(sell) && sell <= 50,
    premium: Number.isFinite(fresh) && fresh >= preset.minFreshM,
    activity: Number.isFinite(recentVolume) && recentVolume >= preset.minRecentVolume,
    spread: Number.isFinite(row.spreadPct) && row.spreadPct <= preset.maxSpreadPct,
    momentum: aligned,
    score: score >= 58
  };
  const passed = Object.values(gates).filter(Boolean).length;
  const readiness = Math.round(100 * passed / Object.keys(gates).length);
  const hardGates = gates.price && gates.distance && gates.pressure && gates.premium;
  const actionable = hardGates && gates.activity && gates.spread && gates.momentum && score >= 75;
  const watch = hardGates && gates.activity && gates.spread && !against && score >= 58;
  const baseData = Number.isFinite(price) && Number.isFinite(row.distancePct) && Number.isFinite(sell) && Number.isFinite(fresh);
  // CONDITIONAL is a shortlist status, not an entry signal. It keeps the
  // radar useful when the option is close/active but live momentum has not
  // confirmed yet. ACTIONABLE remains strict and unchanged.
  const conditional = !actionable && !watch && baseData && gates.price && gates.distance
    && fresh >= preset.minFreshM && sell <= 60 && !against && score >= 35;
  const status = actionable ? "ACTIONABLE" : watch ? "WATCH" : conditional ? "CONDITIONAL" : baseData ? "LOW" : "NO DATA";
  const missing = [];
  const blockers = [];
  if (!Number.isFinite(row.spreadPct)) { missing.push("spread"); blockers.push("Bid/Ask missing"); }
  else if (row.spreadPct > preset.maxSpreadPct) blockers.push(`spread ${row.spreadPct.toFixed(1)}% > ${preset.maxSpreadPct}%`);
  if (!Number.isFinite(recentVolume)) { missing.push("10m volume"); blockers.push("10m volume missing"); }
  else if (recentVolume < preset.minRecentVolume) blockers.push(`10m volume ${Math.round(recentVolume)} < ${preset.minRecentVolume}`);
  if (!Number.isFinite(move)) { missing.push("momentum"); blockers.push("underlying momentum missing"); }
  else if (against) blockers.push(`momentum against ${row.type === "C" ? "call" : "put"}`);
  else if (!aligned) blockers.push("momentum not yet aligned");
  if (!Number.isFinite(price) || price <= 0) blockers.push("price missing");
  else if (price > priceCap) blockers.push(`price $${price.toFixed(2)} > $${priceCap.toFixed(2)}`);
  if (!Number.isFinite(row.distancePct)) blockers.push("distance missing");
  else if (row.distancePct > preset.maxDistancePct) blockers.push(`distance ${row.distancePct.toFixed(2)}% > ${preset.maxDistancePct}%`);
  if (!Number.isFinite(sell)) blockers.push("sell pressure missing");
  else if (sell > 50) blockers.push(`seller pressure ${sell.toFixed(0)}% > 50%`);
  if (!Number.isFinite(fresh)) blockers.push("fresh premium missing");
  else if (fresh < preset.minFreshM) blockers.push(`fresh premium below $${(preset.minFreshM * 1_000_000).toLocaleString()}`);
  if (score < 58) blockers.push(`flow score ${score} < 58`);
  return { score, readiness, status, actionable, watch, conditional, aligned, against, missing, blockers, gates, activitySource, activityVolume: recentVolume, chainCoverageIncomplete };
}

function coverage(rows, field) {
  return rows.length ? rows.filter((r) => r[field] != null && r[field] !== "").length / rows.length : 0;
}

function dataProfile(rows) {
  return {
    pts: coverage(rows, "pts"),
    sell: coverage(rows, "sell"),
    gex: coverage(rows, "gex"),
    oiValue: coverage(rows, "oiValue"),
    volOi: coverage(rows, "volOi"),
    fresh: coverage(rows, "fresh"),
    directional: coverage(rows, "directionalPressure"),
    sessionGross: coverage(rows, "sessionGross"),
    recentConcentration: coverage(rows, "recentConcentration"),
    sessionConcentration: coverage(rows, "sessionConcentration"),
    spread: coverage(rows, "spreadPct"),
    recentVolume: coverage(rows, "activityVolume"),
    explicitRecentVolume: coverage(rows, "recentVolume"),
    estimatedRecentVolume: rows.length ? rows.filter((r) => r.activityVolumeEstimated === true).length / rows.length : 0,
    momentum: coverage(rows, "underlyingMovePct"),
    volume: coverage(rows, "volume")
  };
}

function buildQualityChecks(profile, dataset, dteMeta, spotMeta, rows, sessionState, aggregationMismatchRows = 0) {
  const checks = [];
  if (dataset?.sample === true) checks.push({ tone: "warn", title: "Bundled sample dataset", text: "Replace the CSV in data/inbox and set sample to false in data/config.json before treating this as a current read." });
  const percent = (x) => Math.round(x * 100);
  const structural = (profile.pts + profile.oiValue + profile.volOi + profile.sessionGross) / 4;
  checks.push({ tone: structural >= 0.8 ? "good" : structural >= 0.6 ? "warn" : "bad", title: `Structural coverage ${percent(structural)}%`, text: structural >= 0.8 ? "Distance, OI value, turnover, and session premium are sufficiently populated for an overnight map." : "Missing structural fields reduce level reliability." });
  checks.push({ tone: profile.gex >= 0.4 ? "good" : "warn", title: `GEX coverage ${percent(profile.gex)}%`, text: profile.gex >= 0.4 ? "GEX may participate in the structural axis as a convention-signed proxy." : "GEX is unavailable and has been excluded from scoring. It does not block the Premium Strike Radar." });

  if (aggregationMismatchRows > 0) {
    checks.unshift({ tone: "bad", title: `Recent-volume aggregation mismatch on ${aggregationMismatchRows} rows`, text: "Recent Volume 10m exceeds native DAY Volume, which is impossible. Set Recent Volume 10m to 2-minute aggregation; the invalid values are excluded from contract gates." });
  }

  if (sessionState === "locked") {
    checks.push({ tone: "good", title: "Live-flow gates correctly locked", text: "Outside the live session, 10-minute pressure, momentum, and contract selection are intentionally suppressed. Structural fields remain active." });
    if (profile.spread === 0) checks.push({ tone: "warn", title: "Bid/Ask columns not detected", text: "Add native Mark, Bid, and Ask before the open. They are required for spread-qualified contract selection once live flow activates." });
  } else {
    checks.push({ tone: profile.directional >= 0.5 ? "good" : profile.directional > 0 ? "warn" : "bad", title: `Flow-pressure coverage ${percent(profile.directional)}%`, text: "Sell Pressure, Flow State, Net Option Premium, and Directional Premium count as one evidence axis." });
    checks.push({ tone: profile.spread >= 0.6 ? "good" : "warn", title: `Spread coverage ${percent(profile.spread)}%`, text: profile.spread >= 0.6 ? "Spread gates can be enforced on most contracts." : "Missing Bid/Ask prevents contracts from becoming ACTIONABLE." });
    checks.push({ tone: profile.recentVolume >= 0.5 ? "good" : "warn", title: `Recent-activity coverage ${percent(profile.recentVolume)}%`, text: profile.recentVolume >= 0.5 ? `Activity gates are available. ${percent(profile.estimatedRecentVolume)}% of rows use a Fresh Gross Premium-derived volume estimate.` : "Recent activity is missing. Fresh Gross Premium can provide an estimated activity fallback when price is available." });
    if (profile.explicitRecentVolume < 0.5 && profile.estimatedRecentVolume > 0) checks.push({ tone: "warn", title: `Explicit 10-minute volume coverage ${percent(profile.explicitRecentVolume)}%`, text: "The radar is using a labeled Fresh Gross Premium-derived activity estimate. Fix the Thinkorswim Recent Volume aggregation when convenient; it is no longer a global blocker." });
    checks.push({ tone: profile.momentum >= 0.5 ? "good" : "warn", title: `Underlying-momentum coverage ${percent(profile.momentum)}%`, text: profile.momentum >= 0.5 ? "Independent underlying momentum is available." : "Underlying Move 10m must populate before contracts can become ACTIONABLE." });
  }

  if (sessionState === "building") checks.push({ tone: "warn", title: "Live window still building", text: "Wait for five completed 2-minute bars before using directional pressure or contract rankings." });
  if (sessionState === "incomplete") checks.push({ tone: "warn", title: "Partial live-chain coverage", text: "Contracts are evaluated row by row. Missing chain-wide fields reduce confidence but no longer suppress otherwise complete contracts." });
  if (dteMeta.mismatch) checks.unshift({ tone: "bad", title: "DTE mismatch corrected", text: `Manifest says ${dteMeta.configured}DTE; the contract expiration and publication date resolve to ${dteMeta.derived}DTE.` });
  if (spotMeta.source === "distance cluster") checks.push({ tone: "warn", title: "Spot estimated from distance clustering", text: "Put-call parity was unavailable. Review PTS coverage and add Mark/Last for paired strikes." });
  const unaudited = rows.some((r) => Object.values(r.unverified).some((v) => v != null && v !== ""));
  if (unaudited) checks.push({ tone: "warn", title: "Unaudited fields ignored", text: "DWF, Delta, Net Dominance, Gamma Trap, DHP, and Fresh % do not affect site scoring." });
  return checks;
}

function chooseLevel(rows, predicate, scoreFn, fallback = null) {
  const list = rows.filter(predicate);
  if (!list.length) return fallback;
  return [...list].sort((a, b) => scoreFn(b) - scoreFn(a))[0];
}

export function analyzeRows(inputRows, dataset = {}, priceCap = 5) {
  const rows = inputRows.filter((r) => r.symbol && Number.isFinite(r.strike) && Number.isFinite(r.price));
  if (!rows.length) throw new Error("The CSV did not contain valid option rows.");
  const ticker = majority(rows.map((r) => r.ticker).filter((x) => x !== "INDEX"), String(dataset.ticker || "SPX").toUpperCase());
  const spotMeta = estimateSpot(rows, dataset);
  if (!Number.isFinite(spotMeta.value)) throw new Error("Could not safely estimate the underlying. Add paired call/put prices or a valid PTS column.");
  const spot = spotMeta.value;
  const dteMeta = deriveDteMeta(rows, dataset);
  const dte = dteMeta.effective == null ? Number(dataset.dte || 0) : dteMeta.effective;
  const preset = PRESETS[`${ticker}-${dte === 1 ? 1 : 0}`] || PRESETS[`${ticker}-0`] || PRESETS["SPX-0"];
  const strikeStep = Number(dataset.strikeStep) || inferStrikeStep(rows, ticker);
  const mode = String(dataset?.mode || "snapshot").toLowerCase();
  const timeReady = modeLiveReady(dataset);
  let sessionState = mode === "live" ? (timeReady ? "live" : "building") : "locked";
  let aggregationMismatchRows = 0;
  let estimatedRecentVolumeRows = 0;

  for (const row of rows) {
    row.distance = Math.abs(row.strike - spot);
    row.distancePct = row.distPctExported != null ? row.distPctExported : 100 * row.distance / spot;
    row.distanceSteps = row.distance / strikeStep;

    const impliedDayVolume = Number.isFinite(row.volOi) && Number.isFinite(row.openInterest) && row.volOi >= 0 && row.openInterest > 0
      ? row.volOi * row.openInterest
      : null;
    if (Number.isFinite(row.recentVolume) && Number.isFinite(impliedDayVolume) && row.recentVolume > impliedDayVolume * 1.20 + 5) {
      row.recentVolumeReported = row.recentVolume;
      row.recentVolume = null;
      row.recentVolumeInvalid = true;
      aggregationMismatchRows += 1;
    } else row.recentVolumeInvalid = false;

    row.activityVolumeEstimated = false;
    row.activityVolume = row.recentVolume;
    if (!Number.isFinite(row.activityVolume) && Number.isFinite(row.fresh) && row.fresh > 0 && Number.isFinite(row.price) && row.price > 0) {
      row.activityVolume = row.fresh * 1_000_000 / (row.price * 100);
      row.activityVolumeEstimated = Number.isFinite(row.activityVolume);
      if (row.activityVolumeEstimated) estimatedRecentVolumeRows += 1;
    }
  }

  const ranks = {
    fresh: percentileRank(rows, "fresh"),
    sessionGross: percentileRank(rows, "sessionGross"),
    volume: percentileRank(rows, "volume"),
    oiValue: percentileRank(rows, "oiValue"),
    gex: percentileRank(rows, "gex", true),
    volOi: percentileRank(rows, "volOi"),
    recentConcentration: percentileRank(rows, "recentConcentration"),
    sessionConcentration: percentileRank(rows, "sessionConcentration")
  };
  const profile = dataProfile(rows);
  const useGex = profile.gex >= 0.4;
  const useLiveAxes = sessionState === "live";

  for (const row of rows) {
    const proximityAxis = clamp(1 - row.distancePct / Math.max(0.01, preset.maxDistancePct * 2), 0, 1);
    const activityAxis = useLiveAxes
      ? weightedAvailable([
          [ranks.fresh(row.fresh), 0.45],
          [ranks.sessionGross(row.sessionGross), 0.25],
          [ranks.volume(row.volume), 0.20],
          [ranks.recentConcentration(row.recentConcentration), 0.10]
        ])
      : weightedAvailable([
          [ranks.sessionGross(row.sessionGross), 0.60],
          [ranks.volume(row.volume), 0.25],
          [ranks.sessionConcentration(row.sessionConcentration), 0.15]
        ]);
    const oiGammaAxis = weightedAvailable([
      [ranks.oiValue(row.oiValue), 0.45],
      [ranks.volOi(row.volOi), 0.25],
      [useGex ? ranks.gex(row.gex) : null, 0.30]
    ]);
    const pressureAxis = useLiveAxes ? pressureStrength(row) : null;
    row.axes = { proximity: proximityAxis, activity: activityAxis, oiGamma: oiGammaAxis, pressure: pressureAxis };
    row.structureScore = Math.round(100 * (useLiveAxes
      ? weightedAvailable([[proximityAxis, 0.30], [activityAxis, 0.25], [oiGammaAxis, 0.30], [pressureAxis, 0.15]])
      : weightedAvailable([[proximityAxis, 0.35], [activityAxis, 0.25], [oiGammaAxis, 0.40]])));
  }

  const near = rows.filter((r) => r.distanceSteps <= preset.nearSteps);
  const nearProfile = dataProfile(near.length ? near : rows);
  if (sessionState === "live") {
    const coverageReady = nearProfile.sell >= 0.25 && nearProfile.fresh >= 0.25 && nearProfile.spread >= 0.25 && nearProfile.momentum >= 0.25;
    if (!coverageReady) sessionState = "incomplete";
  }
  const liveReady = sessionState === "live" || sessionState === "incomplete";
  for (const row of rows) row.contract = contractScore(row, preset, priceCap, sessionState);

  const pressureRows = liveReady ? near.filter((r) => pressureDirection(r) != null) : [];
  let pressureBias = null;
  if (pressureRows.length) {
    let weighted = 0;
    let weights = 0;
    for (const row of pressureRows) {
      const weight = Math.max(0.01, row.fresh || 0.01) * (1 + Math.min(2, Math.max(0, row.volOi || 0) / 5));
      weighted += pressureDirection(row) * weight;
      weights += weight;
    }
    pressureBias = weights ? weighted / weights : null;
  }
  const momentumValues = liveReady ? near.map((r) => r.underlyingMovePct).filter(Number.isFinite) : [];
  const underlyingMove = median(momentumValues);
  const momentumBias = Number.isFinite(underlyingMove) ? clamp(underlyingMove / (preset.momentumThreshold * 2), -1, 1) : null;
  const rawBias = liveReady ? (weightedAvailable([[pressureBias, 0.65], [momentumBias, 0.35]]) ?? 0) : 0;
  const bias = classifyBias(rawBias, sessionState);

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.strike)) grouped.set(row.strike, []);
    grouped.get(row.strike).push(row);
  }
  const strikeAgg = [...grouped.entries()].map(([strike, list]) => ({
    strike,
    rows: list,
    score: list.reduce((sum, row) => sum + row.structureScore, 0) / list.length,
    pressure: liveReady ? median(list.map(pressureDirection).filter(Number.isFinite)) : null
  }));
  const nearestAgg = [...strikeAgg].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
  const pivotAgg = chooseLevel(strikeAgg, (x) => Math.abs(x.strike - spot) <= 3 * strikeStep, (x) => x.score + (3 - Math.abs(x.strike - spot) / strikeStep) * 4, nearestAgg);
  const pivot = pivotAgg?.strike ?? Math.round(spot / strikeStep) * strikeStep;
  const calls = rows.filter((r) => r.type === "C" && r.strike > spot).sort((a, b) => a.strike - b.strike);
  const puts = rows.filter((r) => r.type === "P" && r.strike < spot).sort((a, b) => b.strike - a.strike);
  const pressureBonus = liveReady ? 1 : 0;

  const support = chooseLevel(puts, (r) => r.distanceSteps <= 4, (r) => r.structureScore + pressureBonus * Math.max(0, pressureDirection(r) || 0) * 18 - r.distanceSteps, puts[0]);
  const ignition = chooseLevel(calls, (r) => r.strike > pivot && r.strike <= pivot + 4 * strikeStep, (r) => r.structureScore + pressureBonus * Math.max(0, pressureDirection(r) || 0) * 15 + (r.volOi || 0), calls[0]);
  const king = chooseLevel(calls, (r) => r.strike >= pivot + 4 * strikeStep && r.strike <= pivot + 10 * strikeStep, (r) => r.structureScore + (r.axes.oiGamma || 0) * 20, ignition);
  const fortress = chooseLevel(calls, (r) => king && r.strike >= king.strike + 2 * strikeStep && r.distanceSteps <= 28, (r) => r.structureScore + (r.axes.oiGamma || 0) * 25, king);

  const supportStrike = support?.strike ?? pivot - strikeStep;
  let trapdoor = chooseLevel(puts,
    (r) => r.strike <= supportStrike - 2 * strikeStep && r.distanceSteps <= 8,
    (r) => r.structureScore + pressureBonus * Math.max(0, -(pressureDirection(r) || 0)) * 12 - r.distanceSteps * 0.5,
    null);
  if (!trapdoor) trapdoor = puts.find((r) => r.strike < supportStrike) || support;
  const trapdoorStrike = trapdoor?.strike ?? supportStrike - 2 * strikeStep;
  let floor = chooseLevel(puts,
    (r) => r.strike <= trapdoorStrike - 3 * strikeStep && r.distanceSteps <= 20,
    (r) => r.structureScore + (r.axes.oiGamma || 0) * 25,
    null);
  if (!floor) floor = puts.find((r) => r.strike < trapdoorStrike) || trapdoor;
  if (floor && trapdoor && floor.strike === trapdoor.strike) floor = null;

  const structuralQuality = weightedAvailable([
    [profile.pts, 0.20], [profile.oiValue, 0.25], [profile.volOi, 0.20], [profile.sessionGross, 0.20], [useGex ? profile.gex : null, 0.15]
  ]) ?? 0;
  const liveQuality = weightedAvailable([
    [profile.sell, 0.22], [profile.fresh, 0.23], [profile.directional, 0.20], [profile.spread, 0.15], [profile.explicitRecentVolume >= 0.5 ? profile.recentVolume : null, 0.10], [profile.momentum, 0.20]
  ]) ?? 0;
  const structuralAvailability = weightedAvailable([[Math.max(profile.oiValue, useGex ? profile.gex : 0), 0.55], [Math.max(profile.sessionGross, profile.volume || 0), 0.45]]) ?? 0;
  let confidence = liveReady
    ? Math.round(100 * (0.50 * structuralQuality + 0.25 * liveQuality + 0.25 * Math.abs(rawBias)))
    : Math.round(100 * (0.75 * structuralQuality + 0.25 * structuralAvailability));
  if (!liveReady) confidence = Math.min(confidence, 75);
  if (profile.gex < 0.4) confidence = Math.min(confidence, 70);
  if (liveReady && profile.directional < 0.5) confidence = Math.min(confidence, 60);
  if (dteMeta.mismatch) confidence = Math.min(confidence, 55);
  if (aggregationMismatchRows > 0 && liveReady) confidence = Math.min(confidence, 55);
  confidence = clamp(confidence, 20, 92);
  const dataQuality = Math.round(100 * (liveReady ? (0.60 * structuralQuality + 0.40 * liveQuality) : structuralQuality));

  const candidates = rows
    .filter((r) => Number.isFinite(r.price) && r.price <= priceCap)
    .sort((a, b) => {
      const rank = { ACTIONABLE: 6, WATCH: 5, CONDITIONAL: 4, LOW: 3, BUILDING: 2, "LIVE LOCKED": 1, "NO DATA": 0 };
      return rank[b.contract.status] - rank[a.contract.status]
        || (b.contract.readiness || 0) - (a.contract.readiness || 0)
        || b.contract.score - a.contract.score
        || a.distance - b.distance;
    });

  const qualityChecks = buildQualityChecks(profile, dataset, dteMeta, spotMeta, rows, sessionState, aggregationMismatchRows);
  const levels = [
    { label: "SUPPORT", value: support?.strike, detail: "Nearest defended put structure", color: "#35e09a", row: support },
    { label: "PIVOT", value: pivot, detail: "Primary pin / decision", color: "#d8b75b", row: pivotAgg?.rows?.[0] },
    { label: "IGNITION", value: ignition?.strike, detail: "First upside acceptance gate", color: "#35d7ff", row: ignition },
    { label: "KING", value: king?.strike, detail: "Primary upside structural magnet", color: "#8f70ff", row: king },
    { label: "FORTRESS", value: fortress?.strike, detail: "Extension wall / reaction zone", color: "#ff9b45", row: fortress },
    { label: "TRAPDOOR", value: trapdoor?.strike, detail: "First bearish breakdown gate", color: "#ff5577", row: trapdoor },
    { label: "FLOOR", value: floor?.strike, detail: "Primary downside catch", color: "#ff7e9a", row: floor }
  ].filter((x) => Number.isFinite(x.value));

  return {
    rows, ticker, dte, dteMeta, expiry: dteMeta.expiry, strikeStep, preset, spot, spotSource: spotMeta.source,
    bias, rawBias, liveReady, sessionState, pressureBias, momentumBias, underlyingMove, confidence, dataQuality,
    structuralQuality, liveQuality, profile, nearProfile, useGex, aggregationMismatchRows, estimatedRecentVolumeRows, qualityChecks, candidates, levels,
    pivot,
    support: support?.strike ?? pivot - 2 * strikeStep,
    ignition: ignition?.strike ?? pivot + 2 * strikeStep,
    king: king?.strike ?? pivot + 5 * strikeStep,
    fortress: fortress?.strike ?? pivot + 10 * strikeStep,
    trapdoor: trapdoor?.strike ?? pivot - 3 * strikeStep,
    floor: floor?.strike ?? (Number.isFinite(trapdoor?.strike) ? trapdoor.strike - 6 * strikeStep : pivot - 9 * strikeStep),
    calls: rows.filter((r) => r.type === "C").length,
    puts: rows.filter((r) => r.type === "P").length,
    freshPremium: rows.reduce((sum, r) => sum + Math.max(0, r.fresh || 0), 0),
    sessionGrossTotal: rows.reduce((sum, r) => sum + Math.max(0, r.sessionGross || 0), 0),
    aggregatePressure: liveReady ? pressureRows.reduce((sum, r) => sum + (r.directionalPressure || 0), 0) : null,
    cheapInventory: rows.filter((r) => Number.isFinite(r.price) && r.price <= priceCap).sort((a, b) => a.distance - b.distance)
  };
}
