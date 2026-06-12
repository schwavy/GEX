"use strict";

import { analyzeRows, clamp, normalizeRow, parseCSV } from "./core.js?v=11";

const state = {
  manifest: null,
  datasets: [],
  dataset: null,
  analysis: null,
  priceCap: (() => {
    const saved = Number(localStorage.getItem("wavyFlowPriceCap"));
    return Number.isFinite(saved) && saved >= 0.25 && saved <= 50 ? saved : 5;
  })(),
  tableFilter: "NEAR"
};

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const money = (v, digits = 2) => Number.isFinite(v) ? `$${Number(v).toFixed(digits)}M` : "—";
const signedMoney = (v) => Number.isFinite(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}M` : "—";
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function flowTone(row) {
  const stateName = row.flowState || "";
  if (/CALL_BUY|PUT_SELL/.test(stateName)) return "flow-positive";
  if (/CALL_SELL|PUT_BUY/.test(stateName)) return "flow-negative";
  return "flow-mixed";
}

function biasTone(bias) {
  if (/BULL/.test(bias)) return "bull";
  if (/BEAR/.test(bias)) return "bear";
  return "neutral";
}

function modeLabel(dataset, analysis) {
  if (dataset?.sample === true || String(dataset?.mode || "").toLowerCase() === "sample") return "SAMPLE DATA";
  if (analysis.sessionState === "locked") return String(dataset?.mode || "").toLowerCase() === "close" ? "CLOSE STRUCTURE" : "OVERNIGHT STRUCTURE";
  if (analysis.sessionState === "building") return "BUILDING LIVE WINDOW";
  if (analysis.sessionState === "incomplete") return "LIVE DATA INCOMPLETE";
  return "LIVE FLOW";
}

function displayFlowState(value) {
  return String(value || "INSUFFICIENT_DATA").replaceAll("_", " ");
}

function setWarningBanner(analysis) {
  const critical = analysis.qualityChecks.filter((x) => x.tone === "bad");
  const warnings = analysis.qualityChecks.filter((x) => x.tone === "warn");
  const banner = $("dataWarningBanner");
  if (!critical.length && warnings.length < 2) {
    banner.hidden = true;
    return;
  }
  const first = critical[0] || warnings[0];
  banner.hidden = false;
  banner.className = `data-banner ${critical.length ? "bad" : "warn"}`;
  banner.innerHTML = `<strong>${esc(first.title)}</strong><span>${esc(first.text)}</span><a href="#quality">Review data quality</a>`;
}

function heroTitle(a) {
  if (a.sessionState === "locked") return `${a.ticker} overnight structure is mapped; live contract gates are locked.`;
  if (a.sessionState === "building") return `${a.ticker} live window is still building around ${fmt0.format(a.pivot)}.`;
  if (a.sessionState === "incomplete") return `${a.ticker} radar is active, but live inputs are incomplete near ${fmt0.format(a.pivot)}.`;
  if (/BULL/.test(a.bias)) return `${a.ticker} pressure favors the upside above ${fmt0.format(a.pivot)}.`;
  if (/BEAR/.test(a.bias)) return `${a.ticker} pressure weakens below ${fmt0.format(a.support)}.`;
  return `${a.ticker} is balanced around ${fmt0.format(a.pivot)}.`;
}

function heroRead(a) {
  if (state.dataset?.sample === true || String(state.dataset?.mode || "").toLowerCase() === "sample") return `This dashboard is using bundled sample data. Replace the CSV before treating any level as current.`;
  if (a.sessionState === "locked") return `This is a structural overnight map built from distance, OI, turnover, session premium, and available GEX. Live 10-minute pressure and contract qualification remain off until five completed 2-minute bars after the open. Watch ${fmt0.format(a.ignition)} above and ${fmt0.format(a.support)} below.`;
  if (a.sessionState === "building") return `The first five 2-minute bars are still forming. Contract qualification begins after the full 10-minute window is available.`;
  if (a.sessionState === "incomplete") return `The 10-minute clock has completed, but one or more required fields are missing or invalid. The radar now shows each contract's exact blockers instead of hiding the candidate list.`;
  if (/BULL/.test(a.bias)) return `Acceptance through ${fmt0.format(a.ignition)} opens the path toward ${fmt0.format(a.king)}. ${fmt0.format(a.fortress)} remains the first major reaction zone.`;
  if (/BEAR/.test(a.bias)) return `Failure below ${fmt0.format(a.support)} exposes ${fmt0.format(a.trapdoor)} and then ${fmt0.format(a.floor)}. Reclaims above ${fmt0.format(a.pivot)} invalidate the immediate bear case.`;
  return `Price remains between ${fmt0.format(a.support)} support and ${fmt0.format(a.ignition)} ignition. Wait for acceptance outside the range.`;
}

function renderHero(a) {
  $("heroTitle").textContent = heroTitle(a);
  $("heroRead").textContent = heroRead(a);
  $("spotValue").textContent = fmt.format(a.spot);
  $("spotLabel").textContent = `EST. ${a.ticker}`;
  $("spotContext").textContent = a.spotSource;
  $("instrumentPill").textContent = a.ticker;
  $("dtePill").textContent = a.dte >= 0 ? `${a.dte}DTE` : "ARCHIVED";
  $("biasPill").textContent = a.bias;
  $("biasPill").className = `pill ${biasTone(a.bias)}`;
  $("confidencePill").textContent = `${a.sessionState === "locked" ? "MAP" : "MODEL"} CONFIDENCE ${a.confidence}%`;
  $("qualityPill").textContent = `${a.sessionState === "locked" ? "STRUCTURAL" : "DATA"} QUALITY ${a.dataQuality}%`;
  document.body.dataset.ticker = a.ticker.toLowerCase();
  setWarningBanner(a);
}

function renderMetrics(a) {
  const locked = a.sessionState === "locked";
  const building = a.sessionState === "building";
  const incomplete = a.sessionState === "incomplete";
  $("flowMetricLabel").textContent = locked ? "Live Flow-Pressure Axis" : "Flow-Pressure Axis";
  $("marketFlowValue").textContent = locked ? "LOCKED" : building ? "BUILDING" : incomplete ? "INCOMPLETE" : signedMoney(a.aggregatePressure);
  $("marketFlowValue").className = !locked && !building && !incomplete && a.aggregatePressure > 0 ? "flow-positive" : !locked && !building && !incomplete && a.aggregatePressure < 0 ? "flow-negative" : "";
  $("marketFlowNote").textContent = locked ? "opens after five completed 2-minute bars" : building ? "first 10-minute window is forming" : incomplete ? "radar diagnostics active; missing fields are listed below" : "single flow-pressure axis";
  $("premiumMetricLabel").textContent = locked ? "Prior Session Gross Premium" : "Fresh Gross Premium (Est.)";
  $("freshPremiumValue").textContent = money(locked ? a.sessionGrossTotal : a.freshPremium);
  $("premiumMetricNote").textContent = locked ? "session turnover baseline; not directional" : "gross 10-minute turnover estimate";
  $("contractCount").textContent = String(a.rows.length);
  $("contractCoverage").textContent = `${a.calls} calls / ${a.puts} puts`;
  const capRows = a.cheapInventory;
  const qualified = a.candidates.filter((c) => c.contract.status === "ACTIONABLE" || c.contract.status === "WATCH");
  $("cheapPoolLabel").textContent = `UNDER-$${state.priceCap.toFixed(2)} POOL`;
  $("cheapCount").textContent = String(capRows.length);
  $("cheapQuality").textContent = locked ? "inventory only · qualification opens after 9:40 ET" : building ? "first 10-minute window is forming" : incomplete ? "diagnostics active · no promotion until coverage recovers" : `${qualified.length} actionable/watch candidates`;
}

function renderLevels(a) {
  $("levelGrid").innerHTML = a.levels.map((level) => `<article class="level-card" style="--accent:${level.color}">
    <span>${esc(level.label)}</span><strong>${fmt0.format(level.value)}</strong>
    <small>${esc(level.detail)}${level.row ? ` · score ${level.row.structureScore}` : ""}</small>
  </article>`).join("");
}

function pathHTML(values) {
  return values.map((v, i) => `${i ? '<span class="path-arrow">→</span>' : ""}<span class="path-node">${fmt0.format(v)}</span>`).join("");
}

function renderScenarios(a) {
  $("bullNarrative").textContent = `Calls become cleaner only after ${fmt0.format(a.pivot)} holds and ${fmt0.format(a.ignition)} accepts. The primary structural pull is ${fmt0.format(a.king)}, with first reaction risk near ${fmt0.format(a.fortress)}.`;
  $("bearNarrative").textContent = `Puts become cleaner after ${fmt0.format(a.support)} fails and cannot reclaim. Acceptance below ${fmt0.format(a.trapdoor)} opens the path toward the ${fmt0.format(a.floor)} floor.`;
  $("bullPath").innerHTML = pathHTML([a.pivot, a.ignition, a.king, a.fortress]);
  $("bearPath").innerHTML = pathHTML([a.support, a.trapdoor, a.floor]);
}

function candidateReason(row, a) {
  const reasons = [];
  if (row.contract.status === "ACTIONABLE") reasons.push("all price, spread, distance, activity, pressure, and momentum gates passed");
  else if (row.contract.status === "WATCH") reasons.push("all safety gates passed; full actionable confirmation is incomplete");
  else if (row.contract.status === "CONDITIONAL") reasons.push("shortlisted for the next price trigger; momentum or another live gate still needs confirmation");
  else if (row.contract.status === "LIVE LOCKED") reasons.push("overnight inventory only");
  else if (row.contract.status === "BUILDING") reasons.push("live 10-minute window is still building");
  else if (row.contract.blockers?.length) reasons.push(row.contract.blockers.join(" · "));
  if (!a.liveReady) reasons.push("live window is not active");
  return reasons.join("; ") || "low-quality contract under current rules";
}

function blockerChips(row) {
  const blockers = row.contract.blockers || [];
  return blockers.slice(0, 4).map((item) => `<span class="blocker-chip">${esc(item)}</span>`).join("");
}

function candidateCard(row, a, slotLabel = "") {
  const tone = row.type === "C" ? "call" : "put";
  const strict = row.contract.status === "ACTIONABLE" || row.contract.status === "WATCH";
  const conditional = row.contract.status === "CONDITIONAL";
  const rankText = strict ? row.contract.status : conditional ? "CONDITIONAL SETUP" : "BLOCKED";
  const statusClass = strict ? "primary" : conditional ? "conditional-card" : "blocked-card";
  const trigger = row.type === "C" ? `accept above ${fmt0.format(a.ignition)}` : `fail below ${fmt0.format(a.support)}`;
  return `<article class="contract-card ${tone} ${statusClass}">
    <div class="contract-rank">${slotLabel ? `${esc(slotLabel)} · ` : ""}${rankText} · ${row.contract.readiness || 0}% READY</div>
    <div class="contract-top"><div><div class="contract-symbol">${fmt0.format(row.strike)}${row.type}</div><span class="contract-badge">FLOW SCORE ${row.contract.score}</span></div><div class="contract-price">$${fmt.format(row.price)}</div></div>
    <div class="contract-stats">
      <div class="contract-stat"><span>Distance</span><strong>${fmt.format(row.distancePct)}%</strong></div>
      <div class="contract-stat"><span>Spread</span><strong>${row.spreadPct == null ? "—" : `${fmt.format(row.spreadPct)}%`}</strong></div>
      <div class="contract-stat"><span>${row.activityVolumeEstimated ? "10m volume (est.)" : "10m volume"}</span><strong>${row.contract.activityVolume == null ? "—" : fmt0.format(row.contract.activityVolume)}</strong></div>
      <div class="contract-stat"><span>Fresh gross</span><strong>${money(row.fresh)}</strong></div>
    </div>
    ${strict ? "" : `<div class="blocker-list">${blockerChips(row)}</div>`}
    <div class="contract-trigger">${strict ? esc(candidateReason(row, a)) : `Conditional only. ${esc(candidateReason(row, a))}`} Underlying trigger: ${trigger}.${row.activityVolumeEstimated ? " Activity is estimated from Fresh Gross Premium and contract price." : ""}</div>
  </article>`;
}

function renderContracts(a) {
  if (a.sessionState === "locked") {
    const call = a.cheapInventory.find((r) => r.type === "C");
    const put = a.cheapInventory.find((r) => r.type === "P");
    const inventory = [call, put].filter(Boolean);
    if (!inventory.length) {
      $("contractCards").innerHTML = `<div class="empty-card"><strong>No contracts under $${state.priceCap.toFixed(2)}</strong><p>The premium pool is empty in this published snapshot. Live contract qualification remains locked until after the open.</p></div>`;
      return;
    }
    $("contractCards").innerHTML = inventory.map((row) => `<article class="contract-card ${row.type === "C" ? "call" : "put"}">
      <div class="contract-rank">INVENTORY ONLY</div>
      <div class="contract-top"><div><div class="contract-symbol">${fmt0.format(row.strike)}${row.type}</div><span class="contract-badge">STRUCTURE ${row.structureScore}</span></div><div class="contract-price">$${fmt.format(row.price)}</div></div>
      <div class="contract-stats">
        <div class="contract-stat"><span>Distance</span><strong>${fmt.format(row.distancePct)}%</strong></div>
        <div class="contract-stat"><span>Steps</span><strong>${fmt.format(row.distanceSteps)}</strong></div>
        <div class="contract-stat"><span>Session gross</span><strong>${money(row.sessionGross)}</strong></div>
        <div class="contract-stat"><span>OI value</span><strong>${money(row.oiValue)}</strong></div>
      </div>
      <div class="contract-trigger">Not a trade recommendation. Live qualification reopens after five completed 2-minute bars.</div>
    </article>`).join("");
    return;
  }
  if (a.sessionState === "building") {
    $("contractCards").innerHTML = `<div class="empty-card"><strong>First 10-minute live window is still forming</strong><p>Contract diagnostics will appear after five completed 2-minute bars.</p></div>`;
    return;
  }

  const pool = a.candidates;
  if (!pool.length) {
    $("contractCards").innerHTML = `<div class="empty-card"><strong>No contracts under $${state.priceCap.toFixed(2)}</strong><p>The selected premium pool is empty.</p></div>`;
    return;
  }
  const primaryCall = pool.find((r) => r.type === "C");
  const primaryPut = pool.find((r) => r.type === "P");
  const selected = [primaryCall, primaryPut].filter(Boolean);
  const runner = pool.find((r) => !selected.includes(r));
  if (runner) selected.push(runner);

  const qualifiedCount = pool.filter((r) => r.contract.status === "ACTIONABLE" || r.contract.status === "WATCH").length;
  const conditionalCount = pool.filter((r) => r.contract.status === "CONDITIONAL").length;
  const banner = qualifiedCount
    ? `<div class="empty-card radar-diagnostic good-diagnostic"><strong>${qualifiedCount} qualified contract${qualifiedCount === 1 ? "" : "s"} under $${state.priceCap.toFixed(2)}</strong><p>Cards are ordered by live status, readiness, flow score, and distance.</p></div>`
    : `<div class="empty-card radar-diagnostic"><strong>No live entry is confirmed under $${state.priceCap.toFixed(2)}</strong><p>${conditionalCount ? `${conditionalCount} conditional setup${conditionalCount === 1 ? " is" : "s are"} still available for the next price trigger.` : "The highest-readiness call and put are shown below with exact blockers."} CONDITIONAL does not mean enter now.</p></div>`;
  const labels = selected.map((r, i) => i === 0 ? (r.type === "C" ? "PRIMARY CALL" : "PRIMARY PUT") : i === 1 ? (r.type === "P" ? "PRIMARY PUT" : "PRIMARY CALL") : "RUNNER");
  $("contractCards").innerHTML = banner + selected.map((row, i) => candidateCard(row, a, labels[i])).join("");
}

function renderTradePlan(a) {
  const call = a.liveReady ? (a.candidates.find((r) => r.type === "C" && r.contract.status === "ACTIONABLE") || a.candidates.find((r) => r.type === "C" && r.contract.status === "WATCH") || a.candidates.find((r) => r.type === "C" && r.contract.status === "CONDITIONAL")) : null;
  const put = a.liveReady ? (a.candidates.find((r) => r.type === "P" && r.contract.status === "ACTIONABLE") || a.candidates.find((r) => r.type === "P" && r.contract.status === "WATCH") || a.candidates.find((r) => r.type === "P" && r.contract.status === "CONDITIONAL")) : null;
  const lockedText = a.sessionState === "locked" ? "contract selected only after the live 10-minute window opens" : "no qualifying contract under the selected premium cap";
  const callText = call ? `${fmt0.format(call.strike)}C near $${fmt.format(call.price)} (${call.contract.status})` : lockedText;
  const putText = put ? `${fmt0.format(put.strike)}P near $${fmt.format(put.price)} (${put.contract.status})` : lockedText;
  $("tradePlanBody").innerHTML = `
    <tr><td data-label="Bias" class="flow-positive"><strong>Long</strong></td><td data-label="Entry Zone">Acceptance above ${fmt0.format(a.ignition)}; ${callText}</td><td data-label="Stop Loss">Below ${fmt0.format(a.support)}</td><td data-label="Take Profit">TP1 ${fmt0.format(a.king)}, TP2 ${fmt0.format(a.fortress)}, TP3 ${fmt0.format(a.fortress + 2 * a.strikeStep)}</td><td data-label="Rationale">Requires price acceptance plus valid buy pressure, activity, spread, and momentum. Overnight structure alone does not activate the trade.</td></tr>
    <tr><td data-label="Bias" class="flow-negative"><strong>Short</strong></td><td data-label="Entry Zone">Loss of ${fmt0.format(a.support)} and failed reclaim; ${putText}</td><td data-label="Stop Loss">Above ${fmt0.format(a.pivot)}</td><td data-label="Take Profit">TP1 ${fmt0.format(a.trapdoor)}, TP2 ${fmt0.format(a.floor)}, TP3 ${fmt0.format(a.floor - 5 * a.strikeStep)}</td><td data-label="Rationale">Requires support failure and live put pressure aligned with underlying momentum. Prior-session flow alone is insufficient.</td></tr>
    <tr><td data-label="Bias" class="flow-mixed"><strong>Neutral</strong></td><td data-label="Entry Zone">${fmt0.format(a.support)}–${fmt0.format(a.ignition)}</td><td data-label="Stop Loss">No position inside the box</td><td data-label="Take Profit">Wait for boundary acceptance</td><td data-label="Rationale">Structure maps the levels; fresh live pressure and momentum activate the trade.</td></tr>`;
}

function renderContext(a) {
  const expiry = a.expiry ? a.expiry.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "Not detected";
  const published = state.dataset?.asOf ? new Date(state.dataset.asOf).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Not supplied";
  const items = [
    ["Instrument", a.ticker], ["Expiration", expiry], ["Effective DTE", a.dte], ["Strike increment", a.strikeStep],
    ["Session mode", modeLabel(state.dataset, a)], ["Published", published], ["Spot method", a.spotSource], ["Source fingerprint", state.dataset?.sha256 || "not supplied"], ["Source rows", state.dataset?.rowCount ?? a.rows.length], ["GEX in score", a.useGex ? "Yes" : "No"], ["Live gates", a.liveReady ? "Open" : "Locked"], ["Aggregation flags", a.aggregationMismatchRows]
  ];
  $("contextGrid").innerHTML = items.map(([label, value]) => `<div class="context-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
}

function renderQuality(a) {
  $("qualityList").innerHTML = a.qualityChecks.map((q) => `<div class="quality-item"><span class="quality-dot ${q.tone}"></span><div><strong>${esc(q.title)}</strong><p>${esc(q.text)}</p></div></div>`).join("");
}

function renderTable(a) {
  let rows = [...a.rows];
  if (state.tableFilter === "NEAR") rows = rows.filter((r) => r.distanceSteps <= 12).sort((x, y) => x.distance - y.distance);
  if (state.tableFilter === "TOP") rows = rows.sort((x, y) => y.structureScore - x.structureScore);
  if (state.tableFilter === "C" || state.tableFilter === "P") rows = rows.filter((r) => r.type === state.tableFilter).sort((x, y) => y.structureScore - x.structureScore);
  if (state.tableFilter === "CHEAP") rows = rows.filter((r) => r.price <= state.priceCap).sort((x, y) => y.structureScore - x.structureScore);
  const mobileView = window.matchMedia("(max-width: 760px)").matches;
  rows = rows.slice(0, mobileView ? 12 : 24);
  const suppressLive = !a.liveReady;
  $("strikeTableTitle").textContent = suppressLive ? "Near-Spot Overnight Structure" : "Near-Spot Structure & Pressure";
  $("strikeTable").innerHTML = rows.map((r) => `<tr>
    <td data-label="Contract"><strong>${fmt0.format(r.strike)}${r.type}</strong></td><td data-label="Price">$${fmt.format(r.price)}</td><td data-label="Distance">${fmt.format(r.distancePct)}%</td><td data-label="Steps">${fmt.format(r.distanceSteps)}</td>
    <td data-label="Pressure" class="${suppressLive ? "flow-mixed" : flowTone(r)}">${suppressLive ? "LIVE LOCKED" : esc(displayFlowState(r.flowState))}</td><td data-label="Sell Pressure">${suppressLive || r.sell == null ? "—" : `${fmt.format(r.sell)}%`}</td>
    <td data-label="GEX Proxy">${r.gex == null ? "—" : fmt0.format(r.gex)}</td><td data-label="OI Value">${r.oiValue == null ? "—" : `$${fmt.format(r.oiValue)}`}</td><td data-label="Vol/OI">${r.volOi == null ? "—" : fmt.format(r.volOi)}</td>
    <td data-label="Fresh Gross">${suppressLive ? "—" : money(r.fresh)}</td><td data-label="Directional Proxy" class="${!suppressLive && (r.directionalPressure || 0) >= 0 ? "flow-positive" : "flow-negative"}">${suppressLive ? "—" : signedMoney(r.directionalPressure)}</td>
    <td data-label="Structure"><span class="score-chip">${r.structureScore}</span></td><td data-label="Contract Status"><span class="status-chip ${r.contract.status.toLowerCase().replaceAll(" ", "-")}">${r.contract.status}</span></td>
  </tr>`).join("");
  const aggregationNote = a.aggregationMismatchRows ? ` ${a.aggregationMismatchRows} invalid Recent Volume values were excluded.` : "";
  $("tableSummary").textContent = `Showing ${rows.length} contracts.${aggregationNote} Unverified DWF, Delta, Dominance, Gamma Trap, DHP, and Fresh % fields are ignored.`;
}

function render() {
  const a = state.analysis;
  renderHero(a);
  renderMetrics(a);
  renderLevels(a);
  renderScenarios(a);
  renderContracts(a);
  renderTradePlan(a);
  renderContext(a);
  renderQuality(a);
  renderTable(a);
  $("marketStatus").textContent = modeLabel(state.dataset, a);
  $("snapshotLabel").textContent = `${a.ticker} · ${a.dte >= 0 ? `${a.dte}DTE` : "ARCHIVED"}`;
  $("cheapFilterLabel").textContent = `Under $${state.priceCap.toFixed(2)}`;
  document.title = `${a.ticker} ${fmt0.format(a.spot)} | Wavy Flow Terminal`;
}

async function fetchPublished(path, { as = "text", retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const separator = path.includes("?") ? "&" : "?";
      const requestPath = attempt ? `${path}${separator}mobileRetry=${Date.now()}` : path;
      const response = await fetch(requestPath, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return as === "json" ? response.json() : response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => window.setTimeout(resolve, 450));
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError || new Error("Published data request failed.");
}

async function fetchJSON(path) {
  return fetchPublished(path, { as: "json", retries: 1 });
}

function populateDatasetSelect() {
  const select = $("datasetSelect");
  select.innerHTML = state.datasets.map((d) => `<option value="${esc(d.id)}">${esc(d.label || d.id)}</option>`).join("");
  const multiple = state.datasets.length > 1;
  select.hidden = !multiple;
  document.querySelector(".dataset-label").hidden = !multiple;
}

async function loadDataset(id) {
  const dataset = state.datasets.find((item) => item.id === id) || state.datasets[0];
  if (!dataset) throw new Error("No enabled dataset is configured.");
  let text;
  try {
    const separator = dataset.file.includes("?") ? "&" : "?";
    const sourceVersion = encodeURIComponent(dataset.sha256 || state.manifest?.generatedAt || Date.now());
    text = await fetchPublished(`${dataset.file}${separator}source=${sourceVersion}`, { as: "text", retries: 1 });
  } catch (error) {
    throw new Error(`Could not load ${dataset.file}. Check the published CSV and mobile connection. ${error.message || error}`);
  }
  const rows = parseCSV(text).map(normalizeRow);
  state.dataset = dataset;
  state.analysis = analyzeRows(rows, dataset, state.priceCap);
  $("datasetSelect").value = dataset.id;
  const url = new URL(window.location.href);
  url.searchParams.set("view", dataset.id);
  window.history.replaceState({}, "", url);
  render();
}

async function loadManifest() {
  const manifest = await fetchJSON("./data/manifest.json");
  const datasets = Array.isArray(manifest.datasets) ? manifest.datasets.filter((d) => d?.enabled !== false && d?.file) : [];
  if (!datasets.length) throw new Error("Manifest contains no enabled datasets.");
  state.manifest = manifest;
  state.datasets = datasets;
  populateDatasetSelect();
  const requested = new URLSearchParams(window.location.search).get("view");
  const initial = datasets.some((d) => d.id === requested) ? requested : (datasets.some((d) => d.id === manifest.default) ? manifest.default : datasets[0].id);
  await loadDataset(initial);
}

function showFatal(error) {
  $("heroTitle").textContent = "Dashboard data did not load.";
  $("heroRead").innerHTML = `${esc(error.message || String(error))} <button id="inlineRetry" class="inline-retry" type="button">Try again</button>`;
  $("qualityPill").textContent = "RETRY DATA";
  $("qualityPill").className = "pill bear";
  window.setTimeout(() => $("inlineRetry")?.addEventListener("click", () => loadManifest().catch(showFatal)), 0);
}

$("datasetSelect").addEventListener("change", (event) => loadDataset(event.target.value).catch(showFatal));
$("refreshButton").addEventListener("click", () => loadDataset(state.dataset?.id).catch(showFatal));

const priceCapInput = $("priceCapInput");
priceCapInput.value = state.priceCap.toFixed(2);
const applyCap = () => {
  const next = Number(priceCapInput.value);
  if (!Number.isFinite(next)) return;
  state.priceCap = clamp(next, 0.25, 50);
  priceCapInput.value = state.priceCap.toFixed(2);
  localStorage.setItem("wavyFlowPriceCap", String(state.priceCap));
  if (state.dataset) loadDataset(state.dataset.id).catch(showFatal);
};
priceCapInput.addEventListener("change", applyCap);
priceCapInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); applyCap(); priceCapInput.blur(); } });

document.querySelectorAll(".table-filter").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".table-filter").forEach((b) => b.classList.remove("active"));
  button.classList.add("active");
  state.tableFilter = button.dataset.filter;
  if (state.analysis) renderTable(state.analysis);
}));

let resizeTimer;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => { if (state.analysis) render(); }, 160);
}, { passive: true });

loadManifest().catch(showFatal);
