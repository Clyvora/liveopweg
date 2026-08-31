import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { RailObservation } from "../../packages/protocol/rail.js";
import { decodeTrainPositions } from "./decode.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const latest = JSON.parse(await readFile(resolve(dataRoot, "live", "tracked-rail-observation.json"), "utf8")) as RailObservation;
const payload = await readFile(resolve(dataRoot, "raw", "rail", "messages", `${latest.provenance.payloadSha256}.xml.gz`));
const iterations = 100;
const startedAt = performance.now();
let decodedObservations = 0;

for (let index = 0; index < iterations; index += 1) {
  decodedObservations += decodeTrainPositions(payload, {
    receivedAt: latest.time.receivedAt,
    payloadSha256: latest.provenance.payloadSha256,
  }).length;
}

const durationMs = performance.now() - startedAt;
console.log(JSON.stringify({
  iterations,
  payloadBytes: payload.length,
  decodedObservations,
  totalMs: Number(durationMs.toFixed(2)),
  averageMs: Number((durationMs / iterations).toFixed(3)),
}));
