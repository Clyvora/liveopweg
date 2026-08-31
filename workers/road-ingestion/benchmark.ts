import { performance } from "node:perf_hooks";
import { decodeRoadPublication } from "./decode.js";

const sourceUrl = process.env.NDW_ROAD_URL ?? "https://opendata.ndw.nu/actueel_beeld.xml.gz";
const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(25_000) });
if (!response.ok) throw new Error(`NDW download failed: HTTP ${response.status}`);
const payload = Buffer.from(await response.arrayBuffer());
const durations: number[] = [];
let eventCount = 0;
let rejectedCount = 0;
for (let run = 0; run < 5; run += 1) {
  const started = performance.now();
  const result = decodeRoadPublication(payload, { receivedAt: new Date().toISOString(), sourceUrl });
  durations.push(performance.now() - started);
  eventCount = result.events.length;
  rejectedCount = result.rejected.length;
}
durations.sort((left, right) => left - right);
console.log(JSON.stringify({
  benchmark: "ndw-actueel-beeld-decode",
  compressedBytes: payload.length,
  events: eventCount,
  rejected: rejectedCount,
  runs: durations.length,
  medianMilliseconds: Number(durations[Math.floor(durations.length / 2)].toFixed(2)),
  maxMilliseconds: Number(Math.max(...durations).toFixed(2)),
}, null, 2));
