import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { StationBundle } from "../../packages/domain-rail/station-bundle.js";

interface TilesetNode {
  content?: { uri?: string; url?: string };
  children?: TilesetNode[];
}

interface Tileset {
  asset?: { version?: string };
  root?: TilesetNode;
}

function firstContent(node: TilesetNode | undefined): string | null {
  if (!node) return null;
  const own = node.content?.uri ?? node.content?.url;
  if (own) return own;
  for (const child of node.children ?? []) {
    const nested = firstContent(child);
    if (nested) return nested;
  }
  return null;
}

const bundle = JSON.parse(await readFile(
  resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var", "station-bundles", "utrecht-centraal.json"),
  "utf8",
)) as StationBundle;
const sources = {
  buildings: bundle.pdok3d.buildingsTilesetUrl,
  terrain: bundle.pdok3d.terrainTilesetUrl,
};
const results = [];
for (const [name, url] of Object.entries(sources)) {
  const rootResponse = await fetch(url, { headers: { accept: "application/json, application/octet-stream" } });
  if (!rootResponse.ok) throw new Error(`${name}: tilesetroot gaf HTTP ${rootResponse.status}`);
  const tileset = JSON.parse(await rootResponse.text()) as Tileset;
  if (!tileset.asset?.version || !tileset.root) throw new Error(`${name}: ongeldig 3D Tiles-rootdocument`);
  const contentUri = firstContent(tileset.root);
  if (!contentUri) throw new Error(`${name}: geen tilecontent gevonden`);
  const contentUrl = new URL(contentUri, url);
  const tileResponse = await fetch(contentUrl, { headers: { range: "bytes=0-1023" } });
  if (![200, 206].includes(tileResponse.status)) throw new Error(`${name}: eerste tile gaf HTTP ${tileResponse.status}`);
  const bytes = (await tileResponse.arrayBuffer()).byteLength;
  if (!bytes) throw new Error(`${name}: eerste tile is leeg`);
  results.push({
    name,
    assetVersion: tileset.asset.version,
    rootHttpStatus: rootResponse.status,
    tileHttpStatus: tileResponse.status,
    tileBytesChecked: bytes,
    cors: tileResponse.headers.get("access-control-allow-origin"),
  });
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), datasetYear: bundle.pdok3d.datasetYear, results }, null, 2));
