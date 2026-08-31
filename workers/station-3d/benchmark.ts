import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import type { StationBundle } from "../../packages/domain-rail/station-bundle.js";
import { placeCarsOnCurve } from "../../packages/domain-rail/station-3d.js";

const bundlePath = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var", "station-bundles", "utrecht-centraal.json");
const payload = await readFile(bundlePath);
const bundle = JSON.parse(payload.toString("utf8")) as StationBundle;
const usableCurves = bundle.rail.curves.filter((curve) => curve.localPoints.length >= 2 && curve.lengthMeters >= 80);
if (!usableCurves.length) throw new Error("Stationbundel bevat geen bruikbare rendercurves");
const durations: number[] = [];
let placements = 0;
for (let round = 0; round < 100; round += 1) {
  for (const curve of usableCurves) {
    const startedAt = performance.now();
    placements += placeCarsOnCurve(curve.localPoints, 0.5, 6, 18, 1.2).length;
    durations.push(performance.now() - startedAt);
  }
}
durations.sort((left, right) => left - right);
const percentile = (value: number) => durations[Math.min(durations.length - 1, Math.floor(durations.length * value))];
console.log(JSON.stringify({
  bundleBytes: payload.length,
  railCurves: bundle.rail.curves.length,
  railPoints: bundle.rail.curves.reduce((total, curve) => total + curve.localPoints.length, 0),
  platforms: bundle.platforms.polygons.length,
  platformPoints: bundle.platforms.polygons.reduce((total, platform) => (
    total + platform.localPolygons.reduce((polygonTotal, polygon) => (
      polygonTotal + polygon.reduce((ringTotal, ring) => ringTotal + ring.length, 0)
    ), 0)
  ), 0),
  compositionCalculations: durations.length,
  carPlacements: placements,
  durationMs: {
    mean: durations.reduce((total, duration) => total + duration, 0) / durations.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: durations.at(-1),
  },
  budgets: bundle.renderBudget,
}, null, 2));
