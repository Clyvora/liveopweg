import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { z } from "zod";
import { railObservationSchema } from "../../packages/protocol/rail.js";
import type { GraphAudit } from "../rail-geometry/audit.js";
import type { TrackGraph } from "../rail-geometry/graph.js";
import { isInNationalMatchArea, NationalTrackMatcher } from "./matcher.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const [graphText, auditText, fleetText] = await Promise.all([
  readFile(resolve(dataRoot, "rail-geometry", "track-graph.json"), "utf8"),
  readFile(resolve(dataRoot, "rail-geometry", "graph-audit.json"), "utf8"),
  readFile(resolve(dataRoot, "live", "rail-fleet.json"), "utf8"),
]);
const graph = JSON.parse(graphText) as TrackGraph;
const audit = JSON.parse(auditText) as GraphAudit;
const fleet = z.array(railObservationSchema).parse(JSON.parse(fleetText));
const observations = fleet.filter((observation) => isInNationalMatchArea(
  observation.position.longitude,
  observation.position.latitude,
));
if (!observations.length) throw new Error("Geen actuele observaties in het Nederlandse werkgebied");

const matcher = new NationalTrackMatcher(graph, audit);
const durations: number[] = [];
const statuses = new Map<string, number>();
const zoneQualities = new Map<string, number>();
let regionalFallbacks = 0;
for (let round = 0; round < 100; round += 1) {
  for (const observation of observations) {
    const startedAt = performance.now();
    const result = matcher.match(observation);
    durations.push(performance.now() - startedAt);
    if (round === 99 && result) {
      statuses.set(result.status, (statuses.get(result.status) ?? 0) + 1);
      const quality = result.zone?.quality ?? "UNKNOWN";
      zoneQualities.set(quality, (zoneQualities.get(quality) ?? 0) + 1);
      if (result.fallback?.applied) regionalFallbacks += 1;
    }
  }
}
durations.sort((left, right) => left - right);
const percentile = (value: number) => durations[Math.min(durations.length - 1, Math.floor(durations.length * value))];
console.log(JSON.stringify({
  graphEdges: graph.edges.length,
  nationalObservations: observations.length,
  matchesCalculated: durations.length,
  durationMs: {
    total: durations.reduce((total, duration) => total + duration, 0),
    mean: durations.reduce((total, duration) => total + duration, 0) / durations.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: durations.at(-1),
  },
  finalStatuses: Object.fromEntries(statuses),
  finalZoneQualities: Object.fromEntries(zoneQualities),
  regionalFallbackAttempts: regionalFallbacks,
}, null, 2));
