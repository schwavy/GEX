import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [datasetId, sourceArg] = process.argv.slice(2);
if (!datasetId || !sourceArg) {
  console.error("Usage: node tools/update-data.mjs <spx-0dte|spx-1dte|ndx-0dte|ndx-1dte> <path-to-csv>");
  process.exit(1);
}
const config = JSON.parse(await fs.readFile(path.join(root, "data", "config.json"), "utf8"));
const dataset = config.datasets.find((d) => d.id === datasetId);
if (!dataset) {
  console.error(`Unknown dataset id: ${datasetId}`);
  process.exit(1);
}
const source = path.resolve(sourceArg);
const csv = await fs.readFile(source, "utf8");
const symbol = csv.match(/\.?((?:SPX|NDX)[A-Z]*)(\d{6})([CP])(\d+(?:\.\d+)?)/i);
if (!symbol) {
  console.error("No SPX or NDX option symbol was found in the CSV.");
  process.exit(1);
}
const detected = symbol[1].toUpperCase().startsWith("NDX") ? "NDX" : "SPX";
if (detected !== dataset.ticker) {
  console.error(`Ticker mismatch: this file contains ${detected}, but ${datasetId} expects ${dataset.ticker}.`);
  process.exit(1);
}
const target = path.join(root, "data", "inbox", dataset.file);
await fs.copyFile(source, target);
console.log(`Updated ${path.relative(root, target)}.`);
const result = spawnSync(process.execPath, [path.join(root, "tools", "build.mjs")], { stdio: "inherit" });
process.exit(result.status ?? 1);
