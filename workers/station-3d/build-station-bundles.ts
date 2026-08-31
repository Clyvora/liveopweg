import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createStationBundle,
  STATION_DEFINITIONS,
  type BgtPlatformFeature,
  type StationDefinition,
} from "../../packages/domain-rail/station-bundle.js";
import type { TrackGraph } from "../rail-geometry/graph.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const graph = JSON.parse(await readFile(resolve(dataRoot, "rail-geometry", "track-graph.json"), "utf8")) as TrackGraph;
const generatedAt = new Date().toISOString();
const rawDirectory = resolve(dataRoot, "raw", "station-3d", generatedAt.replaceAll(":", "-"));
const outputDirectory = resolve(dataRoot, "station-bundles");
await Promise.all([mkdir(rawDirectory, { recursive: true }), mkdir(outputDirectory, { recursive: true })]);

async function build(station: StationDefinition) {
  const bbox = station.bounds.join(",");
  const sourceUrl = `https://api.pdok.nl/lv/bgt/ogc/v1/collections/kunstwerkdeel_vlak/items?f=json&bbox=${bbox}&limit=1000`;
  const response = await fetch(sourceUrl, {
    headers: { accept: "application/geo+json, application/json", "user-agent": "MobilityRadar-NL/0.1" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${station.name}: BGT-platformimport gaf HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 20_000_000) throw new Error(`${station.name}: BGT-platformantwoord overschrijdt 20 MB`);
  const payloadSha256 = createHash("sha256").update(bytes).digest("hex");
  const decoded = JSON.parse(bytes.toString("utf8")) as { features?: BgtPlatformFeature[]; links?: Array<{ rel?: string }> };
  if (!Array.isArray(decoded.features)) throw new Error(`${station.name}: BGT-platformantwoord mist features`);
  if (decoded.links?.some((link) => link.rel === "next")) throw new Error(`${station.name}: BGT-platformimport vereist paginering`);
  const bundle = createStationBundle(station, graph, decoded.features, payloadSha256, generatedAt);
  if (!bundle.rail.curves.length) throw new Error(`${station.name}: geen railcurves in detailzone`);
  if (!bundle.platforms.polygons.length) throw new Error(`${station.name}: geen actuele BGT-perrons in detailzone`);
  const rawPath = resolve(rawDirectory, `${station.id}-bgt-platforms-${payloadSha256}.geojson`);
  const outputPath = resolve(outputDirectory, `${station.id}.json`);
  await writeFile(rawPath, bytes);
  await writeFile(`${outputPath}.tmp`, JSON.stringify(bundle), "utf8");
  await rename(`${outputPath}.tmp`, outputPath);
  return {
    id: station.id,
    name: station.name,
    sourceFeatureId: station.sourceFeatureId,
    bundleSha256: bundle.bundleSha256,
    railCurves: bundle.rail.curves.length,
    platforms: bundle.platforms.polygons.length,
  };
}

const results = [];
for (const station of STATION_DEFINITIONS) results.push(await build(station));
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify({
  schemaVersion: 1,
  generatedAt,
  sourceGraphPayloadSha256: graph.source.payloadSha256,
  stations: results,
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ generatedAt, stations: results }, null, 2));
