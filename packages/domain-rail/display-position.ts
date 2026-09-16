import type { RailObservation, RailTrackMatch } from "../protocol/rail.js";

export type DisplayPosition = { longitude: number; latitude: number };

export interface TrainDisplayPosition {
  position: DisplayPosition;
  /** True when the position was snapped to a known track by the rail matcher. */
  matched: boolean;
  /** True when the underlying measurement is older than the source freshness threshold. */
  stale: boolean;
}

const MAX_MATCH_AGE_MS = 90_000;
const MAX_SNAP_DISTANCE_METERS = 60;
/** Used when a fleet observation does not carry its own freshness threshold. */
const DEFAULT_STALE_AFTER_MS = 60_000;

/** Show only measured positions that the rail matcher placed on a known track. */
export function reliableTrainPosition(
  observation: RailObservation | null | undefined,
  match: RailTrackMatch | null | undefined,
  nowMs: number,
): DisplayPosition | null {
  if (!observation || !match || observation.vehicleId !== match.vehicleId) return null;
  if (!match.status.startsWith("MATCHED") || !match.snappedPosition || !match.edgeId) return null;
  if (match.status === "MATCHED_LOW_REGIONAL_FALLBACK") return null;
  if (match.zone?.quality === "BLOCKED") return null;
  if (match.distanceMeters === null || match.distanceMeters > MAX_SNAP_DISTANCE_METERS) return null;
  const measuredAt = Date.parse(match.sourceMeasuredAt ?? match.matchedAt);
  if (!Number.isFinite(measuredAt) || Math.abs(nowMs - measuredAt) > MAX_MATCH_AGE_MS) return null;
  return match.snappedPosition;
}

/**
 * Resolve a position for a train that is part of the live fleet.
 *
 * The realtime gateway owns fleet membership: it removes vehicles that stopped
 * reporting and announces that with `removedVehicleIds`. Repeating that
 * retention logic on the client hid perfectly healthy trains (matcher still
 * running, GPS drifting beyond the snap tolerance, sparse track geometry), so
 * every vehicle the client receives is now drawn.
 *
 * The rail matcher result stays preferred because it is exact; when it is
 * missing or not trustworthy the last measured GPS point is used and flagged
 * with `matched: false`. `stale` marks measurements that are older than their
 * own source freshness threshold so the renderer can show them as less certain
 * instead of hiding them.
 */
export function trainDisplayPosition(
  observation: RailObservation | null | undefined,
  match: RailTrackMatch | null | undefined,
  nowMs: number,
): TrainDisplayPosition | null {
  if (!observation) return null;
  // Staleness describes the train's own measurement, independent of whether a
  // track match exists, so an old fix never looks like a guaranteed position.
  const stale = observationIsStale(observation, nowMs);
  const snapped = reliableTrainPosition(observation, match, nowMs);
  if (snapped) return { position: snapped, matched: true, stale };
  return {
    position: {
      longitude: observation.position.longitude,
      latitude: observation.position.latitude,
    },
    matched: false,
    stale,
  };
}

/** True when a fleet observation's own measurement is older than its freshness threshold. */
export function observationIsStale(observation: RailObservation, nowMs: number): boolean {
  // De bron/pijplijn kent de versheidsregels het beste: een expliciet STALE-label
  // is leidend. Anders wordt de ouderdom van de meting zelf getoetst, zodat een
  // bericht dat tijdens een lange sessie veroudert ook echt als oud geldt.
  if (observation.quality?.state === "STALE") return true;
  const parsed = Date.parse(observation.time.sourceMeasuredAt ?? observation.time.receivedAt);
  if (!Number.isFinite(parsed)) return true;
  const thresholdSeconds = observation.quality?.freshnessThresholdSeconds ?? null;
  const thresholdMs = thresholdSeconds !== null && Number.isFinite(thresholdSeconds) && thresholdSeconds > 0
    ? thresholdSeconds * 1_000
    : DEFAULT_STALE_AFTER_MS;
  return Math.abs(nowMs - parsed) > thresholdMs;
}
