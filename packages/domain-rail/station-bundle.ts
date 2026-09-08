import { createHash } from "node:crypto";
import type { LocalPosition } from "./station-3d.js";

export interface StationTrackGraph {
  source: {
    payloadSha256: string;
    sourceUpdatedAt: string | null;
  };
  edges: Array<{
    id: string;
    bbox: [number, number, number, number];
    sourceCollection: "spooras" | "wissel";
    name: string | null;
    geometry: { coordinates: Array<[number, number] | [number, number, number]> };
    lengthMeters: number;
  }>;
}

export interface StationDefinition {
  id: string;
  sourceFeatureId: string;
  name: string;
  code: string;
  origin: readonly [number, number, number];
  bounds: readonly [number, number, number, number];
}

export const UTRECHT_CENTRAAL: StationDefinition = {
  id: "utrecht-centraal",
  sourceFeatureId: "09f03bdc-2bcd-5640-aaa4-d8b65408cd11",
  name: "Utrecht Centraal",
  code: "Ut",
  origin: [5.108927666259347, 52.09078682062937, 0] as const,
  bounds: [5.095, 52.083, 5.122, 52.099] as const,
};

export const STATION_DEFINITIONS: readonly StationDefinition[] = [
  UTRECHT_CENTRAAL,
  {
    id: "amsterdam-centraal",
    sourceFeatureId: "0a743f44-b7b1-58df-bb0b-17bcac293349",
    name: "Amsterdam Centraal",
    code: "Asd",
    origin: [4.900805521786684, 52.379074049492075, 0],
    bounds: [4.886, 52.371, 4.916, 52.387],
  },
  {
    id: "rotterdam-centraal",
    sourceFeatureId: "6b12b5c0-1c77-5ec7-9147-c4323bdacb86",
    name: "Rotterdam Centraal",
    code: "Rtd",
    origin: [4.466485469679739, 51.92433939788924, 0],
    bounds: [4.451, 51.916, 4.482, 51.933],
  },
] as const;

export interface BgtPlatformFeature {
  type: "Feature";
  id: string;
  properties: {
    type?: string | null;
    status?: string | null;
    relatieve_hoogteligging?: number | null;
    lv_publicatiedatum?: string | null;
    termination_date?: string | null;
    eind_registratie?: string | null;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface StationBundle {
  schemaVersion: 1;
  station: StationDefinition;
  generatedAt: string;
  coordinateSystem: {
    id: "STATION_LOCAL_ENU";
    units: "METERS";
    axes: { x: "EAST"; y: "NORTH"; z: "UP" };
    originWgs84: [number, number, number];
    approximation: "LOCAL_EQUIRECTANGULAR";
    maximumRadiusMeters: number;
  };
  rail: {
    sourcePayloadSha256: string;
    sourceUpdatedAt: string | null;
    curves: Array<{
      edgeId: string;
      sourceCollection: "spooras" | "wissel";
      name: string | null;
      localPoints: LocalPosition[];
      lengthMeters: number;
    }>;
  };
  platforms: {
    sourcePayloadSha256: string;
    sourceUpdatedAt: string | null;
    sourceUrl: string;
    license: "CC0-1.0";
    polygons: Array<{
      id: string;
      relativeHeightLevel: number | null;
      localPolygons: LocalPosition[][][];
      sourcePublishedAt: string | null;
    }>;
  };
  pdok3d: {
    provider: "Kadaster via PDOK";
    datasetYear: 2025;
    sourceUpdatedAt: "2026-07-01T12:00:00Z";
    license: "CC-BY-4.0";
    buildingsTilesetUrl: string;
    terrainTilesetUrl: string;
  };
  renderBudget: {
    maxStationRailSegments: number;
    sleeperSpacingMeters: number;
    maxConcurrentTileDownloads: number;
    maxConcurrentTileParses: number;
    memoryBudgetMb: { low: number; standard: number; high: number };
  };
  limitations: string[];
  bundleSha256: string;
}

export type UtrechtStationBundle = StationBundle;

export function wgs84ToLocal(
  longitude: number,
  latitude: number,
  elevationMeters = 0,
  origin: readonly [number, number, number] = UTRECHT_CENTRAAL.origin,
): LocalPosition {
  const latitudeRadians = origin[1] * Math.PI / 180;
  return [
    (longitude - origin[0]) * 111_320 * Math.cos(latitudeRadians),
    (latitude - origin[1]) * 110_540,
    elevationMeters - origin[2],
  ];
}

export function localToWgs84(
  position: LocalPosition,
  origin: readonly [number, number, number] = UTRECHT_CENTRAAL.origin,
): [number, number, number] {
  const latitudeRadians = origin[1] * Math.PI / 180;
  return [
    origin[0] + position[0] / (111_320 * Math.cos(latitudeRadians)),
    origin[1] + position[1] / 110_540,
    origin[2] + position[2],
  ];
}

function intersectsBounds(edgeBounds: [number, number, number, number], station: StationDefinition): boolean {
  const [west, south, east, north] = station.bounds;
  return edgeBounds[0] <= east && edgeBounds[2] >= west && edgeBounds[1] <= north && edgeBounds[3] >= south;
}

function featurePolygons(feature: BgtPlatformFeature): number[][][][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates as number[][][]]
    : feature.geometry.coordinates as number[][][][];
}

export function createStationBundle(
  station: StationDefinition,
  graph: StationTrackGraph,
  platformFeatures: BgtPlatformFeature[],
  platformPayloadSha256: string,
  generatedAt = new Date().toISOString(),
): StationBundle {
  const curves = graph.edges.filter((edge) => intersectsBounds(edge.bbox, station)).map((edge) => ({
    edgeId: edge.id,
    sourceCollection: edge.sourceCollection,
    name: edge.name,
    localPoints: edge.geometry.coordinates.map((position) => wgs84ToLocal(position[0], position[1], 0, station.origin)),
    lengthMeters: edge.lengthMeters,
  }));
  const currentPlatforms = platformFeatures.filter((feature) => feature.properties.type === "perron"
    && feature.properties.status === "bestaand"
    && !feature.properties.termination_date
    && !feature.properties.eind_registratie);
  const sourceUpdatedAt = currentPlatforms.map((feature) => feature.properties.lv_publicatiedatum ?? "")
    .sort().at(-1) || null;
  const withoutHash = {
    schemaVersion: 1 as const,
    station,
    generatedAt,
    coordinateSystem: {
      id: "STATION_LOCAL_ENU" as const,
      units: "METERS" as const,
      axes: { x: "EAST" as const, y: "NORTH" as const, z: "UP" as const },
      originWgs84: [...station.origin] as [number, number, number],
      approximation: "LOCAL_EQUIRECTANGULAR" as const,
      maximumRadiusMeters: 1_500,
    },
    rail: {
      sourcePayloadSha256: graph.source.payloadSha256,
      sourceUpdatedAt: graph.source.sourceUpdatedAt,
      curves,
    },
    platforms: {
      sourcePayloadSha256: platformPayloadSha256,
      sourceUpdatedAt,
      sourceUrl: "https://api.pdok.nl/lv/bgt/ogc/v1/collections/kunstwerkdeel_vlak/items",
      license: "CC0-1.0" as const,
      polygons: currentPlatforms.map((feature) => ({
        id: feature.id,
        relativeHeightLevel: feature.properties.relatieve_hoogteligging ?? null,
        localPolygons: featurePolygons(feature).map((polygon) => (
          polygon.map((ring) => ring.map((position) => wgs84ToLocal(position[0], position[1], 0, station.origin)))
        )),
        sourcePublishedAt: feature.properties.lv_publicatiedatum ?? null,
      })),
    },
    pdok3d: {
      provider: "Kadaster via PDOK" as const,
      datasetYear: 2025 as const,
      sourceUpdatedAt: "2026-07-01T12:00:00Z" as const,
      license: "CC-BY-4.0" as const,
      buildingsTilesetUrl: "https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1/collections/gebouwen/3dtiles?f=json",
      terrainTilesetUrl: "https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1/collections/terreinen/3dtiles?f=json",
    },
    renderBudget: {
      maxStationRailSegments: 8_000,
      sleeperSpacingMeters: 2.4,
      maxConcurrentTileDownloads: 4,
      maxConcurrentTileParses: 2,
      memoryBudgetMb: { low: 96, standard: 192, high: 256 },
    },
    limitations: [
      `Rail- en perronhoogtes bij ${station.name} zijn niet metrisch aan elkaar gekoppeld; kleine render-offsets voorkomen z-fighting.`,
      "PDOK 3D Tiles zijn visualisatiegeometrie en bewijzen geen spoor- of perronhoogte.",
      "Een bronpositie beschrijft geen betrouwbare bakindeling; live materieel wordt daarom als één neutrale unit getoond.",
    ],
  };
  return {
    ...withoutHash,
    bundleSha256: createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex"),
  };
}

export function createUtrechtStationBundle(
  graph: StationTrackGraph,
  platformFeatures: BgtPlatformFeature[],
  platformPayloadSha256: string,
  generatedAt = new Date().toISOString(),
): StationBundle {
  return createStationBundle(UTRECHT_CENTRAAL, graph, platformFeatures, platformPayloadSha256, generatedAt);
}
