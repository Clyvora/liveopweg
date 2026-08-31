import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createUtrechtStationBundle,
  type BgtPlatformFeature,
} from "../../packages/domain-rail/station-bundle.js";
import type { TrackGraph } from "../rail-geometry/graph.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const platformUrl = "https://api.pdok.nl/lv/bgt/ogc/v1/collections/kunstwerkdeel_vlak/items?f=json&bbox=5.095,52.083,5.122,52.099&limit=1000";
const response = await fetch(platformUrl, { headers: { accept: "application/geo+json, application/json" } });
if (!response.ok) throw new Error(`BGT-platformimport faalde met HTTP ${response.status}`);
const platformBytes = Buffer.from(await response.arrayBuffer());
const platformPayloadSha256 = createHash("sha256").update(platformBytes).digest("hex");
const decoded = JSON.parse(platformBytes.toString("utf8")) as { features?: BgtPlatformFeature[]; links?: Array<{ rel?: string }> };
if (!Array.isArray(decoded.features)) throw new Error("BGT-platformantwoord mist features");
if (decoded.links?.some((link) => link.rel === "next")) throw new Error("BGT-platformimport is onvolledig: paginering vereist");

const graph = JSON.parse(await readFile(resolve(dataRoot, "rail-geometry", "track-graph.json"), "utf8")) as TrackGraph;
const generatedAt = new Date().toISOString();
const bundle = createUtrechtStationBundle(graph, decoded.features, platformPayloadSha256, generatedAt);
if (!bundle.rail.curves.length) throw new Error("Stationbundel bevat geen railcurves");
if (!bundle.platforms.polygons.length) throw new Error("Stationbundel bevat geen actuele BGT-perrons");

const rawDirectory = resolve(dataRoot, "raw", "station-3d", generatedAt.replaceAll(":", "-"));
const outputDirectory = resolve(dataRoot, "station-bundles");
const outputPath = resolve(outputDirectory, "utrecht-centraal.json");
await Promise.all([mkdir(rawDirectory, { recursive: true }), mkdir(outputDirectory, { recursive: true })]);
await writeFile(resolve(rawDirectory, `bgt-platforms-${platformPayloadSha256}.geojson`), platformBytes);
await writeFile(`${outputPath}.tmp`, JSON.stringify(bundle), "utf8");
await rename(`${outputPath}.tmp`, outputPath);
console.log(JSON.stringify({
  outputPath,
  bundleSha256: bundle.bundleSha256,
  railCurves: bundle.rail.curves.length,
  platforms: bundle.platforms.polygons.length,
  localOrigin: bundle.coordinateSystem.originWgs84,
  pdok3dDatasetYear: bundle.pdok3d.datasetYear,
}, null, 2));
