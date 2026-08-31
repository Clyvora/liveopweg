import { createHash } from "node:crypto";

export type Position = [number, number] | [number, number, number];

export interface PdokFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
}

export interface TrackNode {
  id: string;
  longitude: number;
  latitude: number;
  degree: number;
  kind: "ENDPOINT" | "JUNCTION" | "SWITCH";
  sourceSwitchIds: string[];
}

export interface TrackEdge {
  id: string;
  fromNode: string;
  toNode: string;
  lengthMeters: number;
  geometry: { type: "LineString"; coordinates: Position[] };
  bbox: [number, number, number, number];
  name: string | null;
  puic: string | null;
  lifecycleStatus: string | null;
  sourcePublishedAt: string | null;
  sourceCollection: "spooras" | "wissel";
  directionality: "unknown";
  inferred: false;
}

export interface TrackGraph {
  schemaVersion: 1;
  source: {
    id: "pdok.prorail.spoorwegen.spooras";
    url: string;
    license: "CC0-1.0";
    importedAt: string;
    sourceUpdatedAt: string | null;
    payloadSha256: string;
  };
  nodes: TrackNode[];
  edges: TrackEdge[];
  spatialIndex: {
    type: "GRID_BBOX";
    cellSizeDegrees: number;
    cells: Record<string, string[]>;
  };
  stats: {
    sourceTrackFeatures: number;
    sourceSwitchFeatures: number;
    nodes: number;
    edges: number;
    endpointNodes: number;
    junctionNodes: number;
    branchNodes: number;
    switchNodes: number;
    connectedComponents: number;
    largestComponentNodes: number;
    largestComponentEdges: number;
    totalLengthMeters: number;
  };
}

export interface GraphMeta {
  importedAt: string;
  sourceUpdatedAt: string | null;
  payloadSha256: string;
  sourceUrl: string;
}

const NODE_MERGE_TOLERANCE_METERS = 0.75;
const SWITCH_SNAP_TOLERANCE_METERS = 12;
const SWITCH_LOOKUP_CELL_DEGREES = 0.0002;
const GRID_CELL_SIZE_DEGREES = 0.02;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2
    && typeof value[0] === "number" && Number.isFinite(value[0])
    && typeof value[1] === "number" && Number.isFinite(value[1]);
}

function lineCoordinates(feature: PdokFeature): Position[] | null {
  if (feature.geometry?.type !== "LineString" || !Array.isArray(feature.geometry.coordinates)) return null;
  const coordinates = feature.geometry.coordinates.filter(isPosition);
  return coordinates.length >= 2 ? coordinates : null;
}

function distanceMeters(left: Position, right: Position): number {
  const radius = 6_371_000;
  const latitude1 = left[1] * Math.PI / 180;
  const latitude2 = right[1] * Math.PI / 180;
  const latitudeDelta = (right[1] - left[1]) * Math.PI / 180;
  const longitudeDelta = (right[0] - left[0]) * Math.PI / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computedLength(coordinates: Position[]): number {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += distanceMeters(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

function nodeBucket(position: Position): string {
  const toleranceDegrees = NODE_MERGE_TOLERANCE_METERS / 111_320;
  return `${Math.floor(position[0] / toleranceDegrees)}:${Math.floor(position[1] / toleranceDegrees)}`;
}

function neighborBuckets(position: Position): string[] {
  const [x, y] = nodeBucket(position).split(":").map(Number);
  const result: string[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) result.push(`${x + dx}:${y + dy}`);
  }
  return result;
}

function nodeId(position: Position): string {
  const value = `${position[0].toFixed(8)},${position[1].toFixed(8)}`;
  return `track-node:${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function edgeId(feature: PdokFeature, sourceCollection: "spooras" | "wissel"): string {
  const sourceId = String(feature.id ?? feature.properties.puic ?? feature.properties.objectid ?? JSON.stringify(feature.geometry));
  return `track-edge:${createHash("sha256").update(`${sourceCollection}:${sourceId}`).digest("hex").slice(0, 24)}`;
}

function bbox(coordinates: Position[]): [number, number, number, number] {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const position of coordinates) {
    west = Math.min(west, position[0]);
    south = Math.min(south, position[1]);
    east = Math.max(east, position[0]);
    north = Math.max(north, position[1]);
  }
  return [west, south, east, north];
}

function sourceUpdatedAt(features: PdokFeature[]): string | null {
  return features.map((feature) => text(feature.properties.publicatiedatum))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

export function buildTrackGraph(
  trackFeatures: PdokFeature[],
  switchFeatures: PdokFeature[],
  meta: GraphMeta,
): TrackGraph {
  const nodes = new Map<string, TrackNode>();
  const nodeBuckets = new Map<string, string[]>();
  const edges: TrackEdge[] = [];

  const findOrCreateNode = (position: Position): TrackNode => {
    for (const bucket of neighborBuckets(position)) {
      for (const candidateId of nodeBuckets.get(bucket) ?? []) {
        const candidate = nodes.get(candidateId)!;
        if (distanceMeters(position, [candidate.longitude, candidate.latitude]) <= NODE_MERGE_TOLERANCE_METERS) {
          return candidate;
        }
      }
    }
    const id = nodeId(position);
    const node: TrackNode = {
      id, longitude: position[0], latitude: position[1], degree: 0, kind: "ENDPOINT", sourceSwitchIds: [],
    };
    nodes.set(id, node);
    const bucket = nodeBucket(position);
    nodeBuckets.set(bucket, [...(nodeBuckets.get(bucket) ?? []), id]);
    return node;
  };

  const addFeature = (feature: PdokFeature, sourceCollection: "spooras" | "wissel") => {
    const coordinates = lineCoordinates(feature);
    if (!coordinates) return;
    const from = findOrCreateNode(coordinates[0]);
    const to = findOrCreateNode(coordinates.at(-1)!);
    from.degree += 1;
    to.degree += 1;
    if (sourceCollection === "wissel") {
      const sourceSwitchId = String(feature.id ?? feature.properties.puic ?? feature.properties.objectid);
      from.kind = "SWITCH";
      to.kind = "SWITCH";
      from.sourceSwitchIds.push(sourceSwitchId);
      to.sourceSwitchIds.push(sourceSwitchId);
    }
    edges.push({
      id: edgeId(feature, sourceCollection),
      fromNode: from.id,
      toNode: to.id,
      lengthMeters: numberValue(feature.properties.lengte) ?? computedLength(coordinates),
      geometry: { type: "LineString", coordinates },
      bbox: bbox(coordinates),
      name: text(feature.properties.naam),
      puic: text(feature.properties.puic),
      lifecycleStatus: text(feature.properties.levenscyclus_status),
      sourcePublishedAt: text(feature.properties.publicatiedatum),
      sourceCollection,
      directionality: "unknown",
      inferred: false,
    });
  };

  for (const feature of [...trackFeatures].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    addFeature(feature, "spooras");
  }
  for (const feature of [...switchFeatures].sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    addFeature(feature, "wissel");
  }

  const nodeList = Array.from(nodes.values());
  const switchLookup = new Map<string, TrackNode[]>();
  for (const node of nodeList) {
    const key = `${Math.floor(node.longitude / SWITCH_LOOKUP_CELL_DEGREES)}:${Math.floor(node.latitude / SWITCH_LOOKUP_CELL_DEGREES)}`;
    switchLookup.set(key, [...(switchLookup.get(key) ?? []), node]);
  }
  for (const feature of switchFeatures) {
    const longitude = numberValue(feature.properties.longitude);
    const latitude = numberValue(feature.properties.latitude);
    if (longitude === null || latitude === null) continue;
    let nearest: TrackNode | null = null;
    let nearestDistance = Infinity;
    const centerX = Math.floor(longitude / SWITCH_LOOKUP_CELL_DEGREES);
    const centerY = Math.floor(latitude / SWITCH_LOOKUP_CELL_DEGREES);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const node of switchLookup.get(`${centerX + dx}:${centerY + dy}`) ?? []) {
          const distance = distanceMeters([longitude, latitude], [node.longitude, node.latitude]);
          if (distance < nearestDistance) {
            nearest = node;
            nearestDistance = distance;
          }
        }
      }
    }
    if (nearest && nearestDistance <= SWITCH_SNAP_TOLERANCE_METERS) {
      nearest.kind = "SWITCH";
      nearest.sourceSwitchIds.push(String(feature.id ?? feature.properties.puic ?? feature.properties.objectid));
    }
  }
  for (const node of nodeList) {
    if (node.kind !== "SWITCH" && node.degree >= 3) node.kind = "JUNCTION";
  }

  const cells: Record<string, string[]> = {};
  for (const edge of edges) {
    const [west, south, east, north] = edge.bbox;
    const startX = Math.floor(west / GRID_CELL_SIZE_DEGREES);
    const endX = Math.floor(east / GRID_CELL_SIZE_DEGREES);
    const startY = Math.floor(south / GRID_CELL_SIZE_DEGREES);
    const endY = Math.floor(north / GRID_CELL_SIZE_DEGREES);
    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        const key = `${x}:${y}`;
        (cells[key] ??= []).push(edge.id);
      }
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    (adjacency.get(edge.fromNode) ?? adjacency.set(edge.fromNode, new Set()).get(edge.fromNode)!).add(edge.toNode);
    (adjacency.get(edge.toNode) ?? adjacency.set(edge.toNode, new Set()).get(edge.toNode)!).add(edge.fromNode);
  }
  const visited = new Set<string>();
  let connectedComponents = 0;
  let largestComponentNodes = 0;
  let largestComponentEdges = 0;
  for (const start of adjacency.keys()) {
    if (visited.has(start)) continue;
    connectedComponents += 1;
    const stack = [start];
    let componentNodes = 0;
    let degreeSum = 0;
    while (stack.length) {
      const nodeId = stack.pop()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      componentNodes += 1;
      const neighbors = adjacency.get(nodeId) ?? new Set<string>();
      degreeSum += nodes.get(nodeId)?.degree ?? 0;
      for (const neighbor of neighbors) if (!visited.has(neighbor)) stack.push(neighbor);
    }
    largestComponentNodes = Math.max(largestComponentNodes, componentNodes);
    largestComponentEdges = Math.max(largestComponentEdges, degreeSum / 2);
  }

  return {
    schemaVersion: 1,
    source: {
      id: "pdok.prorail.spoorwegen.spooras",
      url: meta.sourceUrl,
      license: "CC0-1.0",
      importedAt: meta.importedAt,
      sourceUpdatedAt: meta.sourceUpdatedAt ?? sourceUpdatedAt(trackFeatures),
      payloadSha256: meta.payloadSha256,
    },
    nodes: nodeList,
    edges,
    spatialIndex: { type: "GRID_BBOX", cellSizeDegrees: GRID_CELL_SIZE_DEGREES, cells },
    stats: {
      sourceTrackFeatures: trackFeatures.length,
      sourceSwitchFeatures: switchFeatures.length,
      nodes: nodeList.length,
      edges: edges.length,
      endpointNodes: nodeList.filter((node) => node.degree <= 1).length,
      junctionNodes: nodeList.filter((node) => node.kind === "JUNCTION").length,
      branchNodes: nodeList.filter((node) => node.degree >= 3).length,
      switchNodes: nodeList.filter((node) => node.kind === "SWITCH").length,
      connectedComponents,
      largestComponentNodes,
      largestComponentEdges,
      totalLengthMeters: edges.reduce((total, edge) => total + edge.lengthMeters, 0),
    },
  };
}

export function graphGeoJson(graph: TrackGraph) {
  return {
    type: "FeatureCollection" as const,
    features: graph.edges.map((edge) => ({
      type: "Feature" as const,
      id: edge.id,
      geometry: edge.geometry,
      properties: {
        edgeId: edge.id,
        fromNode: edge.fromNode,
        toNode: edge.toNode,
        name: edge.name,
        lifecycleStatus: edge.lifecycleStatus,
        sourcePublishedAt: edge.sourcePublishedAt,
        sourceCollection: edge.sourceCollection,
        origin: "SOURCE",
        mapMatching: "NOT_APPLIED",
      },
    })),
  };
}
