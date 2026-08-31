import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import type { RailObservation } from "../../packages/protocol/rail.js";
import type { GraphAudit } from "../rail-geometry/audit.js";
import type { TrackGraph } from "../rail-geometry/graph.js";
import { ReplayArchive } from "./archive.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const graph = JSON.parse(await readFile(resolve(dataRoot, "rail-geometry", "track-graph.json"), "utf8")) as TrackGraph;
const audit = JSON.parse(await readFile(resolve(dataRoot, "rail-geometry", "graph-audit.json"), "utf8")) as GraphAudit;
const fleet = JSON.parse(await readFile(resolve(dataRoot, "live", "rail-fleet.json"), "utf8")) as RailObservation[];
const archive = new ReplayArchive(resolve(dataRoot, "raw", "rail"), graph, audit);
const catalog = await archive.catalog();
if (!catalog.availableFrom || !catalog.availableUntil || !fleet.length) throw new Error("Replaybenchmark heeft live fleet en raw archief nodig");

const vehicleId = process.env.REPLAY_VEHICLE_ID ?? fleet[0].vehicleId;
const until = Date.parse(catalog.availableUntil);
const from = Math.max(Date.parse(catalog.availableFrom), until - 20 * 60_000);
const startedAt = performance.now();
const sequence = await archive.sequence(vehicleId, new Date(from), new Date(until));
const elapsedMilliseconds = performance.now() - startedAt;
const budgetMilliseconds = 5_000;

console.log(JSON.stringify({
  vehicleId,
  sourceMessages: catalog.capturedMessages,
  frames: sequence.frames.length,
  elapsedMilliseconds: Math.round(elapsedMilliseconds),
  budgetMilliseconds,
  withinBudget: elapsedMilliseconds <= budgetMilliseconds,
  graphPayloadSha256: sequence.reconstruction.graphPayloadSha256,
}, null, 2));

if (!sequence.frames.length) throw new Error("Geselecteerd voertuig heeft geen replayframes in het meetvenster");
if (elapsedMilliseconds > budgetMilliseconds) throw new Error(`Replaybenchmark overschrijdt ${budgetMilliseconds} ms`);
