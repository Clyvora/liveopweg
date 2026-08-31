import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { buildTrackGraph, graphGeoJson, type PdokFeature } from "./graph.js";

const apiRoot = "https://api.pdok.nl/prorail/spoorwegen/ogc/v1";
const collections = ["spooras", "wissel", "kruising", "station"] as const;
const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const outputDirectory = resolve(dataRoot, "rail-geometry");
const rawDirectory = resolve(dataRoot, "raw", "rail-geometry");
const importedAt = new Date().toISOString();
const importId = importedAt.replaceAll(":", "-");

interface CollectionPage {
  type: "FeatureCollection";
  features: PdokFeature[];
  links?: Array<{ rel?: string; href?: string }>;
  numberReturned?: number;
}

interface RawPageRecord {
  collection: string;
  page: number;
  url: string;
  payloadSha256: string;
  bytes: number;
  features: number;
}

function validateApiUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "api.pdok.nl"
    || !url.pathname.startsWith("/prorail/spoorwegen/ogc/v1/")) {
    throw new Error(`Onveilige of onverwachte PDOK-vervolg-URL: ${value}`);
  }
  return url.toString();
}

function parsePage(raw: string, collection: string): CollectionPage {
  const parsed = JSON.parse(raw) as Partial<CollectionPage>;
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error(`PDOK ${collection} antwoord is geen FeatureCollection`);
  }
  for (const feature of parsed.features) {
    if (!feature || feature.type !== "Feature" || typeof feature.properties !== "object") {
      throw new Error(`PDOK ${collection} bevat een ongeldig feature`);
    }
  }
  return parsed as CollectionPage;
}

async function fetchCollection(collection: string): Promise<{ features: PdokFeature[]; raw: RawPageRecord[] }> {
  const features: PdokFeature[] = [];
  const rawRecords: RawPageRecord[] = [];
  const seenUrls = new Set<string>();
  let nextUrl: string | null = `${apiRoot}/collections/${collection}/items?f=json&limit=1000`;
  let page = 0;

  while (nextUrl) {
    if (page >= 100) throw new Error(`PDOK ${collection} overschrijdt de limiet van 100 pagina's`);
    const safeUrl = validateApiUrl(nextUrl);
    if (seenUrls.has(safeUrl)) throw new Error(`PDOK ${collection} paginering bevat een lus`);
    seenUrls.add(safeUrl);
    const response = await fetch(safeUrl, {
      headers: { Accept: "application/geo+json, application/json", "User-Agent": "MobilityRadar-NL/0.1" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`PDOK ${collection} pagina ${page + 1} gaf HTTP ${response.status}`);
    const raw = await response.text();
    if (raw.length > 60_000_000) throw new Error(`PDOK ${collection} pagina ${page + 1} is groter dan 60 MB`);
    const parsed = parsePage(raw, collection);
    const payloadSha256 = createHash("sha256").update(raw).digest("hex");
    const rawPath = resolve(rawDirectory, importId, `${collection}-${String(page + 1).padStart(3, "0")}-${payloadSha256}.geojson`);
    await mkdir(resolve(rawDirectory, importId), { recursive: true });
    await writeFile(rawPath, raw, "utf8");
    features.push(...parsed.features);
    rawRecords.push({
      collection,
      page: page + 1,
      url: safeUrl,
      payloadSha256,
      bytes: Buffer.byteLength(raw),
      features: parsed.features.length,
    });
    const next = parsed.links?.find((link) => link.rel === "next")?.href;
    nextUrl = next ? validateApiUrl(next) : null;
    page += 1;
    console.log(JSON.stringify({ event: "pdok.collection.page", collection, page, features: parsed.features.length }));
  }
  return { features, raw: rawRecords };
}

const allFeatures = new Map<string, PdokFeature[]>();
const rawRecords: RawPageRecord[] = [];
for (const collection of collections) {
  const result = await fetchCollection(collection);
  allFeatures.set(collection, result.features);
  rawRecords.push(...result.raw);
}

const aggregateHash = createHash("sha256")
  .update(rawRecords.map((record) => record.payloadSha256).join("\n"))
  .digest("hex");
const sourceUpdatedAt = (allFeatures.get("spooras") ?? [])
  .map((feature) => typeof feature.properties.publicatiedatum === "string" ? feature.properties.publicatiedatum : null)
  .filter((value): value is string => Boolean(value))
  .sort()
  .at(-1) ?? null;
const operationalTracks = (allFeatures.get("spooras") ?? [])
  .filter((feature) => feature.properties.levenscyclus_status === "Bestaand");
const operationalSwitches = (allFeatures.get("wissel") ?? [])
  .filter((feature) => feature.properties.levenscyclus_status === "Bestaand");
const graph = buildTrackGraph(
  operationalTracks,
  operationalSwitches,
  {
    importedAt,
    sourceUpdatedAt,
    payloadSha256: aggregateHash,
    sourceUrl: apiRoot,
  },
);
const geoJson = graphGeoJson(graph);
const manifest = {
  schemaVersion: 1,
  importId,
  importedAt,
  source: {
    id: "pdok.prorail.spoorwegen",
    url: apiRoot,
    provider: "ProRail via PDOK",
    license: "CC0-1.0",
    authentication: "NONE",
    updateFrequency: "MANUAL",
    sourceUpdatedAt,
    aggregatePayloadSha256: aggregateHash,
  },
  collections: Object.fromEntries(collections.map((collection) => [collection, allFeatures.get(collection)?.length ?? 0])),
  pages: rawRecords,
  graph: graph.stats,
  excludedFromOperationalGraph: {
    trackFeatures: (allFeatures.get("spooras")?.length ?? 0) - operationalTracks.length,
    switchFeatures: (allFeatures.get("wissel")?.length ?? 0) - operationalSwitches.length,
    reason: "levenscyclus_status is niet Bestaand",
  },
  limitations: [
    "Lijnen worden alleen op bron-eindpunten verbonden; geometrische middenkruisingen worden niet automatisch graph-nodes.",
    "Directionality en actuele wisselstand zijn onbekend.",
    "Objecten met status Definitief ontwerp blijven raw bewaard maar zijn uitgesloten van de operationele graph.",
    "Deze infrastructuurgeometrie is niet realtime en bewijst geen operationele treinroute.",
  ],
};

await mkdir(outputDirectory, { recursive: true });
for (const [name, value] of [
  ["track-graph.json", graph],
  ["track-geometry.geojson", geoJson],
  ["manifest.json", manifest],
] as const) {
  const target = resolve(outputDirectory, name);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporary, target);
}
const compressedGeometryTarget = resolve(outputDirectory, "track-geometry.geojson.gz");
const compressedGeometryTemporary = `${compressedGeometryTarget}.tmp`;
await writeFile(compressedGeometryTemporary, gzipSync(`${JSON.stringify(geoJson)}\n`, { level: 9 }));
await rename(compressedGeometryTemporary, compressedGeometryTarget);
await writeFile(resolve(rawDirectory, importId, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ event: "pdok.import.complete", ...graph.stats, sourceUpdatedAt, aggregateHash }));
