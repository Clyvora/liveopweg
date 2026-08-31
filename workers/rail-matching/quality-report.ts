import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { railObservationSchema } from "../../packages/protocol/rail.js";
import type { GraphAudit } from "../rail-geometry/audit.js";
import type { TrackGraph } from "../rail-geometry/graph.js";
import { isInNationalMatchArea, NationalTrackMatcher } from "./matcher.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const outputDirectory = resolve(dataRoot, "rail-matching");
const outputPath = resolve(outputDirectory, "national-quality-report.json");
const temporaryPath = `${outputPath}.tmp`;
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
const matcher = new NationalTrackMatcher(graph, audit);
const matches = observations.flatMap((observation) => {
  const result = matcher.match(observation);
  return result ? [result] : [];
});
const countBy = (values: string[]) => Object.fromEntries(
  Array.from(values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<string, number>()))
    .sort(([left], [right]) => left.localeCompare(right)),
);
const accepted = matches.filter((match) => match.status.startsWith("MATCHED"));
const distances = accepted.flatMap((match) => match.distanceMeters === null ? [] : [match.distanceMeters])
  .sort((left, right) => left - right);
const percentile = (value: number) => distances.length
  ? distances[Math.min(distances.length - 1, Math.floor(distances.length * value))]
  : null;
const report = {
  schemaVersion: 1,
  method: "national-track-quality-report@1.0.0",
  measuredAt: new Date().toISOString(),
  graphPayloadSha256: graph.source.payloadSha256,
  graphAuditMethod: audit.method,
  scope: "NETHERLANDS",
  sample: {
    fleetObservations: fleet.length,
    observationsInScope: observations.length,
    matchesProduced: matches.length,
  },
  outcomes: {
    byStatus: countBy(matches.map((match) => match.status)),
    byZoneQuality: countBy(matches.map((match) => match.zone?.quality ?? "UNKNOWN")),
    accepted: accepted.length,
    regionalFallbackAttempts: matches.filter((match) => match.fallback?.applied).length,
    acceptedRegionalFallbacks: matches.filter((match) => match.status === "MATCHED_LOW_REGIONAL_FALLBACK").length,
  },
  acceptedDistanceMeters: {
    mean: distances.length ? distances.reduce((total, distance) => total + distance, 0) / distances.length : null,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: distances.at(-1) ?? null,
  },
  interpretation: {
    scoreIsProbability: false,
    accuracyClaim: "NOT_MEASURED_WITHOUT_LABELLED_GROUND_TRUTH",
    note: "Dit rapport meet dekking, uitkomsten en afstanden op een actuele live steekproef; niet de feitelijke spoorcorrectheid.",
  },
};
await mkdir(outputDirectory, { recursive: true });
await writeFile(temporaryPath, JSON.stringify(report, null, 2), "utf8");
await rename(temporaryPath, outputPath);
console.log(JSON.stringify({ outputPath, ...report }, null, 2));
