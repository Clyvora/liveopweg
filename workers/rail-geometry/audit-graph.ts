import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TrackGraph } from "./graph.js";
import { auditTrackGraph } from "./audit.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const graphPath = resolve(dataRoot, "rail-geometry", "track-graph.json");
const outputPath = resolve(dataRoot, "rail-geometry", "graph-audit.json");
const graph = JSON.parse(await readFile(graphPath, "utf8")) as TrackGraph;
const report = auditTrackGraph(graph);
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, JSON.stringify(report), "utf8");
await rename(temporaryPath, outputPath);
console.log(JSON.stringify({ outputPath, ...report.stats }, null, 2));
