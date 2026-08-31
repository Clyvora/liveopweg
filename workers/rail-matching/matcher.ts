import type { RailObservation, RailTrackMatch } from "../../packages/protocol/rail.js";
import { auditZoneId, NATIONAL_MATCH_BBOX, type GraphAudit } from "../rail-geometry/audit.js";
import type { Position, TrackEdge, TrackGraph } from "../rail-geometry/graph.js";

export const UTRECHT_PILOT_BBOX = {
  west: 4.95,
  south: 51.95,
  east: 5.35,
  north: 52.22,
} as const;

export interface TrackMatcherOptions {
  searchRadiusMeters?: number;
  fallbackSearchRadiusMeters?: number;
  ambiguityGap?: number;
  highScore?: number;
  mediumScore?: number;
  graphAudit?: GraphAudit;
}

interface Projection {
  longitude: number;
  latitude: number;
  distanceMeters: number;
  edgeProgress: number;
  headingDegrees: number;
}

interface MatcherHistory {
  match: RailTrackMatch;
  rawPosition: [number, number];
  sourceTimeMs: number | null;
}

interface ScoredCandidate extends Projection {
  edge: TrackEdge;
  headingDifferenceDegrees: number | null;
  internalScore: number;
  continuity: "SAME_EDGE" | "CONNECTED_EDGE" | "UNCONNECTED_EDGE" | "NO_HISTORY";
}

const METHOD_VERSION = "1.0.0" as const;
const NATIONAL_METHOD_VERSION = "2.0.0" as const;
const MAX_DEBUG_CANDIDATES = 5;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function distanceMeters(left: [number, number], right: [number, number]): number {
  const radius = 6_371_000;
  const latitude1 = left[1] * Math.PI / 180;
  const latitude2 = right[1] * Math.PI / 180;
  const latitudeDelta = (right[1] - left[1]) * Math.PI / 180;
  const longitudeDelta = (right[0] - left[0]) * Math.PI / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(from: Position, to: Position): number {
  const latitude1 = from[1] * Math.PI / 180;
  const latitude2 = to[1] * Math.PI / 180;
  const longitudeDelta = (to[0] - from[0]) * Math.PI / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
  const x = Math.cos(latitude1) * Math.sin(latitude2)
    - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function bidirectionalHeadingDifference(left: number, right: number): number {
  const direct = Math.abs(((left - right + 540) % 360) - 180);
  return Math.min(direct, 180 - direct);
}

function projectPoint(point: [number, number], edge: TrackEdge): Projection {
  const latitudeRadians = point[1] * Math.PI / 180;
  const metersPerLongitude = 111_320 * Math.cos(latitudeRadians);
  const metersPerLatitude = 110_540;
  const coordinates = edge.geometry.coordinates;
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const length = distanceMeters(
      [coordinates[index - 1][0], coordinates[index - 1][1]],
      [coordinates[index][0], coordinates[index][1]],
    );
    segmentLengths.push(length);
    totalLength += length;
  }

  let bestDistance = Infinity;
  let bestLongitude = coordinates[0][0];
  let bestLatitude = coordinates[0][1];
  let bestHeading = 0;
  let bestProgressMeters = 0;
  let completedLength = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1];
    const to = coordinates[index];
    const fromX = (from[0] - point[0]) * metersPerLongitude;
    const fromY = (from[1] - point[1]) * metersPerLatitude;
    const toX = (to[0] - point[0]) * metersPerLongitude;
    const toY = (to[1] - point[1]) * metersPerLatitude;
    const deltaX = toX - fromX;
    const deltaY = toY - fromY;
    const denominator = deltaX * deltaX + deltaY * deltaY;
    const progress = denominator > 0 ? clamp01(-(fromX * deltaX + fromY * deltaY) / denominator) : 0;
    const projectedX = fromX + progress * deltaX;
    const projectedY = fromY + progress * deltaY;
    const distance = Math.hypot(projectedX, projectedY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLongitude = from[0] + progress * (to[0] - from[0]);
      bestLatitude = from[1] + progress * (to[1] - from[1]);
      bestHeading = bearingDegrees(from, to);
      bestProgressMeters = completedLength + progress * segmentLengths[index - 1];
    }
    completedLength += segmentLengths[index - 1];
  }

  return {
    longitude: bestLongitude,
    latitude: bestLatitude,
    distanceMeters: bestDistance,
    edgeProgress: totalLength > 0 ? clamp01(bestProgressMeters / totalLength) : 0,
    headingDegrees: bestHeading,
  };
}

function gpsQuality(observation: RailObservation): number | null {
  const hdop = observation.gpsQuality.hdop;
  const satellites = observation.gpsQuality.satellites;
  const parts: number[] = [];
  if (hdop !== null && hdop > 0) parts.push(clamp01(1 - (hdop - 0.8) / 4.2));
  if (satellites !== null && satellites > 0) parts.push(clamp01((satellites - 4) / 8));
  return parts.length ? parts.reduce((total, value) => total + value, 0) / parts.length : null;
}

function sourceTimeMs(observation: RailObservation): number | null {
  const value = observation.time.sourceMeasuredAt ?? observation.time.receivedAt;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isInUtrechtPilot(longitude: number, latitude: number): boolean {
  return longitude >= UTRECHT_PILOT_BBOX.west && longitude <= UTRECHT_PILOT_BBOX.east
    && latitude >= UTRECHT_PILOT_BBOX.south && latitude <= UTRECHT_PILOT_BBOX.north;
}

export function isInNationalMatchArea(longitude: number, latitude: number): boolean {
  return longitude >= NATIONAL_MATCH_BBOX.west && longitude <= NATIONAL_MATCH_BBOX.east
    && latitude >= NATIONAL_MATCH_BBOX.south && latitude <= NATIONAL_MATCH_BBOX.north;
}

class TrackMatcher {
  readonly graph: TrackGraph;
  readonly searchRadiusMeters: number;
  readonly fallbackSearchRadiusMeters: number;
  private readonly scope: "UTRECHT_PILOT" | "NETHERLANDS";
  private readonly ambiguityGap: number;
  private readonly highScore: number;
  private readonly mediumScore: number;
  private readonly edgeById: Map<string, TrackEdge>;
  private readonly history = new Map<string, MatcherHistory>();
  private readonly graphAudit: GraphAudit | null;

  constructor(
    graph: TrackGraph,
    scope: "UTRECHT_PILOT" | "NETHERLANDS",
    options: TrackMatcherOptions = {},
  ) {
    this.graph = graph;
    this.scope = scope;
    this.searchRadiusMeters = options.searchRadiusMeters ?? 75;
    this.fallbackSearchRadiusMeters = options.fallbackSearchRadiusMeters ?? 125;
    this.ambiguityGap = options.ambiguityGap ?? 0.055;
    this.highScore = options.highScore ?? 0.82;
    this.mediumScore = options.mediumScore ?? 0.68;
    this.edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
    if (options.graphAudit && options.graphAudit.graphPayloadSha256 !== graph.source.payloadSha256) {
      throw new Error("Graph-audit hoort bij een andere graphversie");
    }
    this.graphAudit = options.graphAudit ?? null;
  }

  remove(vehicleId: string): void {
    this.history.delete(vehicleId);
  }

  private connected(left: TrackEdge, right: TrackEdge): boolean {
    return left.id === right.id
      || left.fromNode === right.fromNode
      || left.fromNode === right.toNode
      || left.toNode === right.fromNode
      || left.toNode === right.toNode;
  }

  private candidateEdges(longitude: number, latitude: number, radiusMeters: number): TrackEdge[] {
    const size = this.graph.spatialIndex.cellSizeDegrees;
    const cellRadius = Math.ceil((radiusMeters / 110_000) / size) + 1;
    const centerX = Math.floor(longitude / size);
    const centerY = Math.floor(latitude / size);
    const ids = new Set<string>();
    for (let x = centerX - cellRadius; x <= centerX + cellRadius; x += 1) {
      for (let y = centerY - cellRadius; y <= centerY + cellRadius; y += 1) {
        for (const edgeId of this.graph.spatialIndex.cells[`${x}:${y}`] ?? []) ids.add(edgeId);
      }
    }
    return Array.from(ids, (edgeId) => this.edgeById.get(edgeId)).filter((edge): edge is TrackEdge => Boolean(edge));
  }

  private suspiciousJump(observation: RailObservation, previous: MatcherHistory | undefined): boolean {
    if (!previous) return false;
    const currentTime = sourceTimeMs(observation);
    if (currentTime === null || previous.sourceTimeMs === null) return false;
    const elapsedSeconds = (currentTime - previous.sourceTimeMs) / 1_000;
    if (elapsedSeconds <= 0 || elapsedSeconds > 120) return false;
    const jumpMeters = distanceMeters(previous.rawPosition, [observation.position.longitude, observation.position.latitude]);
    const maximumPlausibleMeters = Math.max(500, elapsedSeconds * (350 / 3.6) + 200);
    return jumpMeters > maximumPlausibleMeters;
  }

  match(observation: RailObservation, matchedAt = new Date().toISOString()): RailTrackMatch | null {
    const rawPosition: [number, number] = [observation.position.longitude, observation.position.latitude];
    const inScope = this.scope === "UTRECHT_PILOT"
      ? isInUtrechtPilot(...rawPosition)
      : isInNationalMatchArea(...rawPosition);
    if (!inScope) return null;

    const previous = this.history.get(observation.vehicleId);
    const auditZone = this.scope === "NETHERLANDS"
      ? this.graphAudit?.zones[auditZoneId(...rawPosition)] ?? null
      : null;
    const zone = this.scope === "NETHERLANDS" ? {
      id: auditZone?.id ?? auditZoneId(...rawPosition),
      quality: auditZone?.quality ?? "UNKNOWN" as const,
      fallbackAllowed: auditZone?.fallbackAllowed ?? false,
      reasons: auditZone?.reasons ?? ["GRAPH_AUDIT_UNAVAILABLE_FOR_ZONE"],
    } : undefined;
    const method: RailTrackMatch["method"] = this.scope === "UTRECHT_PILOT"
      ? {
          id: "utrecht-track-matcher",
          version: METHOD_VERSION,
          graphPayloadSha256: this.graph.source.payloadSha256,
          origin: "DERIVED",
          scoreIsProbability: false,
        }
      : {
          id: "national-track-matcher",
          version: NATIONAL_METHOD_VERSION,
          graphPayloadSha256: this.graph.source.payloadSha256,
          origin: "DERIVED",
          scoreIsProbability: false,
        };
    const base = {
      observationId: observation.observationId,
      vehicleId: observation.vehicleId,
      region: this.scope,
      rawPosition: { longitude: rawPosition[0], latitude: rawPosition[1] },
      searchRadiusMeters: this.searchRadiusMeters,
      method,
      sourceMeasuredAt: observation.time.sourceMeasuredAt,
      matchedAt,
      ...(zone ? { zone } : {}),
    };

    if (this.suspiciousJump(observation, previous)) {
      return {
        ...base,
        status: "REJECTED_SUSPICIOUS_OBSERVATION",
        confidenceClass: "UNKNOWN",
        snappedPosition: null,
        edgeId: null,
        edgeProgress: null,
        distanceMeters: null,
        candidateCount: 0,
        internalScore: null,
        runnerUpGap: null,
        candidates: [],
        components: {
          distance: "USED", heading: "UNAVAILABLE", continuity: "USED", topology: "USED",
          gpsQuality: gpsQuality(observation) === null ? "UNAVAILABLE" : "USED",
          routeAlignment: "UNAVAILABLE", directionality: "UNAVAILABLE",
        },
      };
    }

    const headingMode = observation.headingDegrees === null
      ? "UNAVAILABLE" as const
      : (observation.speed?.valueKmh ?? 0) < 8
        ? "IGNORED_LOW_SPEED" as const
        : "USED" as const;
    const quality = gpsQuality(observation);
    const previousEdge = previous?.match.edgeId ? this.edgeById.get(previous.match.edgeId) : undefined;
    const scoreCandidates = (radiusMeters: number): ScoredCandidate[] => {
      const scored: ScoredCandidate[] = [];
      for (const edge of this.candidateEdges(...rawPosition, radiusMeters)) {
        const projection = projectPoint(rawPosition, edge);
        if (projection.distanceMeters > radiusMeters) continue;
        const continuity = previousEdge
          ? previousEdge.id === edge.id
            ? "SAME_EDGE" as const
            : this.connected(previousEdge, edge)
              ? "CONNECTED_EDGE" as const
              : "UNCONNECTED_EDGE" as const
          : "NO_HISTORY" as const;
        const headingDifferenceDegrees = headingMode === "USED" && observation.headingDegrees !== null
          ? bidirectionalHeadingDifference(observation.headingDegrees, projection.headingDegrees)
          : null;
        const weighted: Array<[number, number]> = [
          [0.35, clamp01(1 - projection.distanceMeters / radiusMeters)],
        ];
        if (headingDifferenceDegrees !== null) weighted.push([0.2, clamp01(1 - headingDifferenceDegrees / 90)]);
        if (previousEdge) {
          weighted.push([0.25, continuity === "SAME_EDGE" ? 1 : continuity === "CONNECTED_EDGE" ? 0.78 : 0.1]);
          weighted.push([0.15, continuity === "UNCONNECTED_EDGE" ? 0 : 1]);
        }
        if (quality !== null) weighted.push([0.05, quality]);
        const totalWeight = weighted.reduce((total, [weight]) => total + weight, 0);
        let internalScore = weighted.reduce((total, [weight, value]) => total + weight * value, 0) / totalWeight;
        if (previousEdge && continuity === "UNCONNECTED_EDGE") internalScore = Math.max(0, internalScore - 0.12);
        scored.push({ ...projection, edge, headingDifferenceDegrees, internalScore, continuity });
      }
      return scored.sort((left, right) => right.internalScore - left.internalScore || left.distanceMeters - right.distanceMeters);
    };

    let effectiveRadiusMeters = this.searchRadiusMeters;
    let fallbackApplied = false;
    let fallbackReason: NonNullable<RailTrackMatch["fallback"]>["reason"] = "NOT_NEEDED";
    let candidates = scoreCandidates(this.searchRadiusMeters);
    if (!candidates.length && this.scope === "NETHERLANDS") {
      if (!this.graphAudit || !auditZone) {
        fallbackReason = "AUDIT_UNAVAILABLE";
      } else if (!auditZone.fallbackAllowed) {
        fallbackReason = "GRAPH_ZONE_NOT_ELIGIBLE";
      } else {
        effectiveRadiusMeters = this.fallbackSearchRadiusMeters;
        fallbackApplied = true;
        fallbackReason = "PRIMARY_RADIUS_NO_CANDIDATES";
        candidates = scoreCandidates(effectiveRadiusMeters);
      }
    }
    const fallback = this.scope === "NETHERLANDS" ? {
      applied: fallbackApplied,
      reason: fallbackReason,
      primaryRadiusMeters: this.searchRadiusMeters,
      effectiveRadiusMeters,
    } : undefined;

    const components = {
      distance: "USED" as const,
      heading: headingMode,
      continuity: previousEdge ? "USED" as const : "UNAVAILABLE" as const,
      topology: previousEdge ? "USED" as const : "UNAVAILABLE" as const,
      gpsQuality: quality === null ? "UNAVAILABLE" as const : "USED" as const,
      routeAlignment: "UNAVAILABLE" as const,
      directionality: "UNAVAILABLE" as const,
    };

    if (!candidates.length) {
      const result: RailTrackMatch = {
        ...base,
        searchRadiusMeters: effectiveRadiusMeters,
        ...(fallback ? { fallback } : {}),
        status: "UNMATCHED_NO_CANDIDATES",
        confidenceClass: "UNKNOWN",
        snappedPosition: null,
        edgeId: null,
        edgeProgress: null,
        distanceMeters: null,
        candidateCount: 0,
        internalScore: null,
        runnerUpGap: null,
        candidates: [],
        components,
      };
      this.history.set(observation.vehicleId, { match: result, rawPosition, sourceTimeMs: sourceTimeMs(observation) });
      return result;
    }

    const best = candidates[0];
    const distinctRunnerUp = candidates.slice(1).find((candidate) => (
      distanceMeters(
        [best.longitude, best.latitude],
        [candidate.longitude, candidate.latitude],
      ) > 1.5
    ));
    const runnerUpGap = distinctRunnerUp ? Math.max(0, best.internalScore - distinctRunnerUp.internalScore) : 1;
    const debugCandidates = candidates.slice(0, MAX_DEBUG_CANDIDATES).map((candidate) => ({
      edgeId: candidate.edge.id,
      distanceMeters: candidate.distanceMeters,
      edgeProgress: candidate.edgeProgress,
      snappedPosition: { longitude: candidate.longitude, latitude: candidate.latitude },
      headingDifferenceDegrees: candidate.headingDifferenceDegrees,
      internalScore: candidate.internalScore,
      continuity: candidate.continuity,
    }));

    if (distinctRunnerUp && runnerUpGap < this.ambiguityGap) {
      const result: RailTrackMatch = {
        ...base,
        searchRadiusMeters: effectiveRadiusMeters,
        ...(fallback ? { fallback } : {}),
        status: "UNMATCHED_AMBIGUOUS",
        confidenceClass: "UNKNOWN",
        snappedPosition: null,
        edgeId: null,
        edgeProgress: null,
        distanceMeters: best.distanceMeters,
        candidateCount: candidates.length,
        internalScore: best.internalScore,
        runnerUpGap,
        candidates: debugCandidates,
        components,
      };
      this.history.set(observation.vehicleId, { match: result, rawPosition, sourceTimeMs: sourceTimeMs(observation) });
      return result;
    }

    const status = fallbackApplied
      ? "MATCHED_LOW_REGIONAL_FALLBACK" as const
      : best.internalScore >= this.highScore && best.distanceMeters <= 25 && runnerUpGap >= 0.1
      ? "MATCHED_HIGH" as const
      : best.internalScore >= this.mediumScore && best.distanceMeters <= 45
        ? "MATCHED_MEDIUM" as const
        : "MATCHED_LOW" as const;
    const result: RailTrackMatch = {
      ...base,
      searchRadiusMeters: effectiveRadiusMeters,
      ...(fallback ? { fallback } : {}),
      status,
      confidenceClass: status === "MATCHED_HIGH" ? "HIGH" : status === "MATCHED_MEDIUM" ? "MEDIUM" : "LOW",
      snappedPosition: { longitude: best.longitude, latitude: best.latitude },
      edgeId: best.edge.id,
      edgeProgress: best.edgeProgress,
      distanceMeters: best.distanceMeters,
      candidateCount: candidates.length,
      internalScore: best.internalScore,
      runnerUpGap,
      candidates: debugCandidates,
      components,
    };
    this.history.set(observation.vehicleId, { match: result, rawPosition, sourceTimeMs: sourceTimeMs(observation) });
    return result;
  }
}

export class UtrechtTrackMatcher extends TrackMatcher {
  constructor(graph: TrackGraph, options: TrackMatcherOptions = {}) {
    super(graph, "UTRECHT_PILOT", options);
  }
}

export class NationalTrackMatcher extends TrackMatcher {
  constructor(graph: TrackGraph, graphAudit: GraphAudit | null, options: TrackMatcherOptions = {}) {
    super(graph, "NETHERLANDS", { ...options, graphAudit: graphAudit ?? undefined });
  }
}
