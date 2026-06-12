import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { COLUMN_ALIASES, normalizeHeader, normalizeRow, parseCSV } from "../site/core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "site");
const inboxDir = path.join(root, "data", "inbox");
const configPath = path.join(root, "data", "config.json");
const distDir = path.join(root, "dist");
const validateOnly = process.argv.includes("--validate-only");

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const buildTime = process.env.WAVY_FLOW_AS_OF || new Date().toISOString();

function parseSymbol(csv) {
  const match = csv.match(/\.?((?:SPX|NDX)[A-Z]*)(\d{6})([CP])(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const root = match[1].toUpperCase();
  const ticker = root.startsWith("NDX") ? "NDX" : "SPX";
  const code = match[2];
  const expiry = `20${code.slice(0, 2)}-${code.slice(2, 4)}-${code.slice(4, 6)}`;
  return { ticker, expiry, type: match[3].toUpperCase(), strike: Number(match[4]) };
}

function etParts(iso) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date(iso));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function dteFrom(expiry, asOf) {
  if (!expiry) return null;
  const p = etParts(asOf);
  const asOfDate = Date.UTC(p.year, p.month - 1, p.day);
  const [y, m, d] = expiry.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - asOfDate) / 86_400_000);
}

function sampleAsOf(expiry, targetDte) {
  if (!expiry) return null;
  const [year, month, day] = expiry.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - Math.max(0, Number(targetDte || 0)));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T15:00:00-04:00`;
}

function autoMode(dte, asOf) {
  if (dte == null) return "snapshot";
  if (dte > 0) return "overnight";
  if (dte < 0) return "archived";
  const p = etParts(asOf);
  const minutes = p.hour * 60 + p.minute;
  if (minutes < 570) return "overnight";
  if (minutes <= 960) return "live";
  return "close";
}

function findHeader(csv) {
  return csv.split(/\r?\n/).find((line) => /(^|,)\s*Symbol\s*(,|$)/i.test(line)) || "";
}

const report = { generatedAt: buildTime, errors: [], warnings: [], datasets: [] };
const manifestDatasets = [];

for (const item of config.datasets || []) {
  const source = path.join(inboxDir, item.file);
  let csv;
  try { csv = await fs.readFile(source, "utf8"); }
  catch {
    report.errors.push(`${item.id}: missing data/inbox/${item.file}`);
    continue;
  }
  const detected = parseSymbol(csv);
  const header = findHeader(csv);
  const normalizedHeaders = header.split(",").map(normalizeHeader);
  const recommendedGroups = {
    Mark: ["mark"], Bid: ["bid"], Ask: ["ask"], PTS: ["pts", "dist (pts)"],
    SellPressure: ["sell-pressure % (est.)", "sell-pressure %", "sell %"],
    FlowPressureState: ["flow pressure state", "flow press state", "flow state"],
    GEX: ["gex proxy $m/1% (conv. c+/p-)", "gex proxy $m/1%", "gex proxy", "gex"],
    VolOI: ["vol/oi (turnover)", "vol/oi turnover", "vol/oi ratio"],
    OIValue: ["oi market value (last) $m", "oi market val $m", "oi $m"],
    FreshGross: ["fresh gross premium (est.) $m", "fresh grs prem$m", "fresh grs prem $m", "fresh prem $m"],
    DirectionalProxy: ["directional premium proxy $m", "dollar flow $m"],
    NetOptionProxy: ["net option premium proxy $m (option-side)", "net prem", "fnpf $m"],
    SessionGross: ["session gross premium (est.) $m", "sess grs prem $m", "cum prem $m"],
    RecentConcentration: ["flow conc. (10-min)", "rec flow con"],
    SessionConcentration: ["flow conc. (session)", "session flow con", "flow concentrate"],
    ContractFlowScore: ["contract flow score", "score", "buy strike"],
    UnderlyingMove: ["underlying move 10m %", "underlying move"],
    RecentVolume: ["recent volume 10m", "recent volume"],
    Volume: ["volume"], OpenInterest: ["open.int", "open interest"]
  };
  const headerMatches = (aliases) => aliases.map(normalizeHeader).some((alias) => normalizedHeaders.some((key) => key === alias || (key.length >= 4 && alias.length >= 4 && (key.startsWith(alias) || alias.startsWith(key)))));
  const missingRecommended = Object.entries(recommendedGroups)
    .filter(([, aliases]) => !headerMatches(aliases))
    .map(([name]) => name);
  if (missingRecommended.length) report.warnings.push(`${item.id}: missing recommended columns: ${missingRecommended.join(", ")}`);
  let aggregationMismatchRows = 0;
  let rowCount = 0;
  try {
    const normalizedRows = parseCSV(csv).map(normalizeRow);
    rowCount = normalizedRows.length;
    aggregationMismatchRows = normalizedRows.filter((row) => Number.isFinite(row.recentVolume) && Number.isFinite(row.volume) && row.recentVolume > row.volume * 1.02 + 2).length;
    if (aggregationMismatchRows) report.warnings.push(`${item.id}: Recent Volume exceeds DAY Volume on ${aggregationMismatchRows} rows; set Recent Volume 10m to 2-minute aggregation.`);
  } catch (error) {
    report.warnings.push(`${item.id}: CSV parser validation skipped (${error.message}).`);
  }
  if (!detected) report.errors.push(`${item.id}: no SPX/NDX option symbol found`);
  if (!header) report.errors.push(`${item.id}: no Symbol header found`);
  if (detected && item.ticker && detected.ticker !== item.ticker) report.errors.push(`${item.id}: config ticker ${item.ticker} does not match ${detected.ticker}`);
  const fileHash = crypto.createHash("sha256").update(csv).digest("hex");
  const isSample = Boolean(item.sampleSha256 && item.sampleSha256 === fileHash);
  const asOf = item.asOf || (isSample ? sampleAsOf(detected?.expiry, item.targetDte) : null) || buildTime;
  const dte = detected ? dteFrom(detected.expiry, asOf) : item.targetDte;
  if (dte != null && item.targetDte != null && dte !== item.targetDte) report.warnings.push(`${item.id}: target ${item.targetDte}DTE but expiration/asOf resolves to ${dte}DTE`);
  const mode = isSample ? "sample" : (item.mode === "auto" || !item.mode ? autoMode(dte, asOf) : item.mode);
  const label = item.label || `${detected?.ticker || item.ticker} · ${dte != null && dte >= 0 ? `${dte}DTE` : "Archived"} · ${mode.charAt(0).toUpperCase()}${mode.slice(1)}`;
  const outputFile = `./data/${item.file}`;
  manifestDatasets.push({
    id: item.id,
    label,
    ticker: detected?.ticker || item.ticker,
    dte,
    targetDte: item.targetDte,
    mode,
    asOf,
    expiry: detected?.expiry || null,
    file: outputFile,
    enabled: item.enabled !== false,
    sample: isSample,
    expectedAggregation: "2-minute × 5 bars for intraday fields; DAY for structural fields",
    dataProfileVersion: 3,
    sha256: fileHash.slice(0, 12),
    rowCount
  });
  report.datasets.push({ id: item.id, file: item.file, detected, dte, mode, enabled: item.enabled !== false, sha256: fileHash, rowCount, headers: header.split(",").map((x) => x.trim()), missingRecommended, aggregationMismatchRows });
}

if (report.errors.length) {
  console.error(report.errors.join("\n"));
  process.exitCode = 1;
  if (validateOnly) process.exit();
}
if (validateOnly) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.errors.length ? 1 : 0);
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.cp(siteDir, distDir, { recursive: true });
await fs.mkdir(path.join(distDir, "data"), { recursive: true });
for (const item of config.datasets || []) {
  const source = path.join(inboxDir, item.file);
  try { await fs.copyFile(source, path.join(distDir, "data", item.file)); } catch { /* reported above */ }
}
const enabled = manifestDatasets.filter((d) => d.enabled);
const defaultId = enabled.some((d) => d.id === config.default) ? config.default : enabled[0]?.id;
const manifest = { version: 2, generatedAt: buildTime, default: defaultId, datasets: manifestDatasets };
await fs.writeFile(path.join(distDir, "data", "manifest.json"), JSON.stringify(manifest, null, 2));
await fs.writeFile(path.join(distDir, "data", "build-report.json"), JSON.stringify(report, null, 2));
console.log(`Built ${distDir} with ${enabled.length} enabled datasets.`);
if (report.warnings.length) console.warn(report.warnings.join("\n"));
