import type { TrackEdge, TrackGraph } from "./graph.js";

export const NATIONAL_MATCH_BBOX = {
  west: 3,
  south: 50.5,
  east: 7.5,
  north: 53.7,
} as const;
export const AUDIT_ZONE_SIZE_DEGREES = 0.25;

export interface GraphAuditZone {
  id: string;
  bbox: [number, number, number, number];
  edgeCount: number;
  nodeCount: number;
  danglingNodeCount: number;
  shortEdgeCount: number;
  longEdgeCount: number;
  smallComponentEdgeCount: number;
  quality: "NORMAL" | "CAUTION" | "SPARSE" | "BLOCKED";
  fallbackAllowed: boolean;
  reasons: string[];
}

export interface GraphAudit {
  schemaVersion: 1;
  method: "rail-graph-audit@1.0.0";
  auditedAt: string;
  graphPayloadSha256: string;
  graphSourceUpdatedAt: string | null;
  zoneSizeDegrees: number;
  thresholds: {
    shortEdgeMeters: number;
    longEdgeMeters: number;
    smallComponentEdges: number;
    sparseZoneEdges: number;
    cautionDanglingRatio: number;
  };
  stats: {
    nodes: number;
    edges: number;
    invalidEdges: number;
    shortEdges: number;
    longEdges: number;
    danglingNodes: number;
    connectedComponents: number;
    smallComponents: number;
    smallComponentEdges: number;
    zones: number;
    normalZones: number;
    cautionZones: number;
    sparseZones: number;
    blockedZones: number;
    fallbackAllowedZones: number;
  };
  anomalies: {
    invalidEdgeIds: string[];
    shortEdgeIds: string[];
    longEdgeIds: string[];
    smallComponentIds: string[];
  };
  zones: Record<string, GraphAuditZone>;
}

const SHORT_EDGE_METERS = 2;
const LONG_EDGE_METERS = 20_000;
const SMALL_COMPONENT_EDGES = 2;
const SPARSE_ZONE_EDGES = 4;
const CAUTION_DANGLING_RATIO = 0.35;

export function auditZoneId(longitude: number, latitude: number): string {
  const x = Math.floor(longitude / AUDIT_ZONE_SIZE_DEGREES);
  const y = Math.floor(latitude / AUDIT_ZONE_SIZE_DEGREES);
  return `nl:${x}:${y}`;
}

function zoneBbox(id: string): [number, number, number, number] {
  const [, xText, yText] = id.split(":");
  const west = Number(xText) * AUDIT_ZONE_SIZE_DEGREES;
  const south = Number(yText) * AUDIT_ZONE_SIZE_DEGREES;
  return [west, south, west + AUDIT_ZONE_SIZE_DEGREES, south + AUDIT_ZONE_SIZE_DEGREES];
}

function validEdge(edge: TrackEdge): boolean {
  return edge.geometry.coordinates.length >= 2
    && edge.geometry.coordinates.every((position) => Number.isFinite(position[0]) && Number.isFinite(position[1]))
    && Number.isFinite(edge.lengthMeters) && edge.lengthMeters >= 0;
}

export function auditTrackGraph(graph: TrackGraph, auditedAt = new Date().toISOString()): GraphAudit {
  const invalidEdges = graph.edges.filter((edge) => !validEdge(edge));
  const shortEdges = graph.edges.filter((edge) => validEdge(edge) && edge.lengthMeters < SHORT_EDGE_METERS);
  const longEdges = graph.edges.filter((edge) => validEdge(edge) && edge.lengthMeters > LONG_EDGE_METERS);
  const edgeByNode = new Map<string, TrackEdge[]>();
  for (const edge of graph.edges) {
    edgeByNode.set(edge.fromNode, [...(edgeByNode.get(edge.fromNode) ?? []), edge]);
    edgeByNode.set(edge.toNode, [...(edgeByNode.get(edge.toNode) ?? []), edge]);
  }

  const visitedEdges = new Set<string>();
  const componentByEdge = new Map<string, string>();
  const componentSizes = new Map<string, number>();
  for (const start of graph.edges) {
    if (visitedEdges.has(start.id)) continue;
    const componentId = `component:${componentSizes.size + 1}`;
    const stack = [start];
    let size = 0;
    while (stack.length) {
      const edge = stack.pop()!;
      if (visitedEdges.has(edge.id)) continue;
      visitedEdges.add(edge.id);
      componentByEdge.set(edge.id, componentId);
      size += 1;
      for (const nodeId of [edge.fromNode, edge.toNode]) {
        for (const neighbor of edgeByNode.get(nodeId) ?? []) {
          if (!visitedEdges.has(neighbor.id)) stack.push(neighbor);
        }
      }
    }
    componentSizes.set(componentId, size);
  }
  const smallComponentIds = Array.from(componentSizes)
    .filter(([, size]) => size <= SMALL_COMPONENT_EDGES)
    .map(([id]) => id);
  const smallComponentSet = new Set(smallComponentIds);

  type MutableZone = Omit<GraphAuditZone, "quality" | "fallbackAllowed" | "reasons"> & {
    nodeIds: Set<string>;
    edgeIds: Set<string>;
    danglingNodeIds: Set<string>;
    shortEdgeIds: Set<string>;
    longEdgeIds: Set<string>;
    smallComponentEdgeIds: Set<string>;
  };
  const zones = new Map<string, MutableZone>();
  const ensureZone = (id: string): MutableZone => {
    const existing = zones.get(id);
    if (existing) return existing;
    const created: MutableZone = {
      id,
      bbox: zoneBbox(id),
      edgeCount: 0,
      nodeCount: 0,
      danglingNodeCount: 0,
      shortEdgeCount: 0,
      longEdgeCount: 0,
      smallComponentEdgeCount: 0,
      nodeIds: new Set(),
      edgeIds: new Set(),
      danglingNodeIds: new Set(),
      shortEdgeIds: new Set(),
      longEdgeIds: new Set(),
      smallComponentEdgeIds: new Set(),
    };
    zones.set(id, created);
    return created;
  };

  const shortEdgeSet = new Set(shortEdges.map((edge) => edge.id));
  const longEdgeSet = new Set(longEdges.map((edge) => edge.id));
  for (const edge of graph.edges) {
    const [west, south, east, north] = edge.bbox;
    const startX = Math.floor(west / AUDIT_ZONE_SIZE_DEGREES);
    const endX = Math.floor(east / AUDIT_ZONE_SIZE_DEGREES);
    const startY = Math.floor(south / AUDIT_ZONE_SIZE_DEGREES);
    const endY = Math.floor(north / AUDIT_ZONE_SIZE_DEGREES);
    for (let x = startX; x <= endX; x += 1) {
      for (let y = startY; y <= endY; y += 1) {
        const zone = ensureZone(`nl:${x}:${y}`);
        zone.edgeIds.add(edge.id);
        if (shortEdgeSet.has(edge.id)) zone.shortEdgeIds.add(edge.id);
        if (longEdgeSet.has(edge.id)) zone.longEdgeIds.add(edge.id);
        if (smallComponentSet.has(componentByEdge.get(edge.id) ?? "")) zone.smallComponentEdgeIds.add(edge.id);
      }
    }
  }
  for (const node of graph.nodes) {
    const zone = ensureZone(auditZoneId(node.longitude, node.latitude));
    zone.nodeIds.add(node.id);
    if (node.degree <= 1) zone.danglingNodeIds.add(node.id);
  }

  const finalZones: Record<string, GraphAuditZone> = {};
  for (const zone of zones.values()) {
    zone.edgeCount = zone.edgeIds.size;
    zone.nodeCount = zone.nodeIds.size;
    zone.danglingNodeCount = zone.danglingNodeIds.size;
    zone.shortEdgeCount = zone.shortEdgeIds.size;
    zone.longEdgeCount = zone.longEdgeIds.size;
    zone.smallComponentEdgeCount = zone.smallComponentEdgeIds.size;
    const reasons: string[] = [];
    if (zone.edgeCount < SPARSE_ZONE_EDGES) reasons.push("SPARSE_GRAPH_COVERAGE");
    if (zone.nodeCount > 0 && zone.danglingNodeCount / zone.nodeCount > CAUTION_DANGLING_RATIO) reasons.push("HIGH_DANGLING_NODE_RATIO");
    if (zone.longEdgeCount > 0) reasons.push("EXTREME_LENGTH_EDGE_PRESENT");
    if (zone.edgeCount > 0 && zone.smallComponentEdgeCount / zone.edgeCount > 0.5) reasons.push("SMALL_COMPONENT_DOMINANCE");
    const containsInvalidEdge = invalidEdges.some((edge) => (
      edge.bbox[0] <= zone.bbox[2] && edge.bbox[2] >= zone.bbox[0]
      && edge.bbox[1] <= zone.bbox[3] && edge.bbox[3] >= zone.bbox[1]
    ));
    if (containsInvalidEdge) reasons.push("INVALID_EDGE_PRESENT");
    const quality = containsInvalidEdge
      ? "BLOCKED" as const
      : zone.edgeCount < SPARSE_ZONE_EDGES
        ? "SPARSE" as const
        : reasons.length
          ? "CAUTION" as const
          : "NORMAL" as const;
    finalZones[zone.id] = {
      id: zone.id,
      bbox: zone.bbox,
      edgeCount: zone.edgeCount,
      nodeCount: zone.nodeCount,
      danglingNodeCount: zone.danglingNodeCount,
      shortEdgeCount: zone.shortEdgeCount,
      longEdgeCount: zone.longEdgeCount,
      smallComponentEdgeCount: zone.smallComponentEdgeCount,
      quality,
      fallbackAllowed: quality === "NORMAL",
      reasons,
    };
  }
  const zoneList = Object.values(finalZones);
  return {
    schemaVersion: 1,
    method: "rail-graph-audit@1.0.0",
    auditedAt,
    graphPayloadSha256: graph.source.payloadSha256,
    graphSourceUpdatedAt: graph.source.sourceUpdatedAt,
    zoneSizeDegrees: AUDIT_ZONE_SIZE_DEGREES,
    thresholds: {
      shortEdgeMeters: SHORT_EDGE_METERS,
      longEdgeMeters: LONG_EDGE_METERS,
      smallComponentEdges: SMALL_COMPONENT_EDGES,
      sparseZoneEdges: SPARSE_ZONE_EDGES,
      cautionDanglingRatio: CAUTION_DANGLING_RATIO,
    },
    stats: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      invalidEdges: invalidEdges.length,
      shortEdges: shortEdges.length,
      longEdges: longEdges.length,
      danglingNodes: graph.nodes.filter((node) => node.degree <= 1).length,
      connectedComponents: componentSizes.size,
      smallComponents: smallComponentIds.length,
      smallComponentEdges: Array.from(componentSizes.values()).filter((size) => size <= SMALL_COMPONENT_EDGES)
        .reduce((total, size) => total + size, 0),
      zones: zoneList.length,
      normalZones: zoneList.filter((zone) => zone.quality === "NORMAL").length,
      cautionZones: zoneList.filter((zone) => zone.quality === "CAUTION").length,
      sparseZones: zoneList.filter((zone) => zone.quality === "SPARSE").length,
      blockedZones: zoneList.filter((zone) => zone.quality === "BLOCKED").length,
      fallbackAllowedZones: zoneList.filter((zone) => zone.fallbackAllowed).length,
    },
    anomalies: {
      invalidEdgeIds: invalidEdges.map((edge) => edge.id),
      shortEdgeIds: shortEdges.map((edge) => edge.id),
      longEdgeIds: longEdges.map((edge) => edge.id),
      smallComponentIds,
    },
    zones: finalZones,
  };
}
