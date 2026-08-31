import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { RailJourney } from "../../packages/protocol/journey.js";
import { decodeJourney } from "./decode.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const trainNumber = process.env.TRAIN_NUMBER ?? "5879";
const serviceDate = process.env.SERVICE_DATE ?? new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const latest = JSON.parse(await readFile(
  resolve(dataRoot, "live", "journeys", `${serviceDate}-${trainNumber}.json`), "utf8",
)) as RailJourney;
const payload = await readFile(resolve(
  dataRoot, "raw", "rail-journey", "messages", `${latest.provenance.payloadSha256}.xml.gz`,
));
const iterations = 100;
const startedAt = performance.now();

for (let index = 0; index < iterations; index += 1) {
  decodeJourney(payload, {
    receivedAt: latest.provenance.receivedAt,
    payloadSha256: latest.provenance.payloadSha256,
  });
}

const durationMs = performance.now() - startedAt;
console.log(JSON.stringify({
  iterations,
  payloadBytes: payload.length,
  stopsPerJourney: latest.stops.length,
  totalMs: Number(durationMs.toFixed(2)),
  averageMs: Number((durationMs / iterations).toFixed(3)),
}));
