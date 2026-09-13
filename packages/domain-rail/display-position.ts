import type { RailObservation, RailTrackMatch } from "../protocol/rail.js";

export type DisplayPosition = { longitude: number; latitude: number };

const MAX_MATCH_AGE_MS = 90_000;
const MAX_SNAP_DISTANCE_METERS = 60;

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
