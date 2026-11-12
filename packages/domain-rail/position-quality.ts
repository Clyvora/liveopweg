import type { RailObservation, RailTrackMatch } from "../protocol/rail.js";

const MAX_FUTURE_MS = 5_000;
export function measurementTime(observation: RailObservation): number | null {
  const value = Date.parse(observation.time?.sourceMeasuredAt ?? "");
  return Number.isFinite(value) ? value : null;
}
export function observationIsStale(observation: RailObservation, nowMs: number): boolean {
  if (observation.quality?.state === "STALE" || observation.quality?.state === "UNKNOWN") return true;
  const time = measurementTime(observation);
  if (time === null) return true;
  const threshold = observation.quality?.freshnessThresholdSeconds ?? 30;
  return nowMs - time > threshold * 1_000 || time - nowMs > MAX_FUTURE_MS;
}
export function validMeasuredPosition(observation: RailObservation): boolean {
  const { longitude, latitude } = observation.position;
  return Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= -180 && longitude <= 180
    && latitude >= -90 && latitude <= 90 && !(longitude === 0 && latitude === 0)
    && !["0", "false"].includes(observation.gpsQuality?.fix?.toLowerCase() ?? "");
}
/** A match belongs to one measurement, never to an arbitrary newer position of the same train. */
export function matchBelongsToObservation(observation: RailObservation, match: RailTrackMatch): boolean {
  return observation.vehicleId === match.vehicleId && observation.observationId === match.observationId;
}
export function reliableTrainPosition(observation: RailObservation | null | undefined, match: RailTrackMatch | null | undefined, nowMs: number) {
  if (!observation || !match || !validMeasuredPosition(observation) || !matchBelongsToObservation(observation, match)) return null;
  if (!["MATCHED_HIGH", "MATCHED_MEDIUM"].includes(match.status) || !match.snappedPosition || !match.edgeId) return null;
  if (match.zone?.quality === "BLOCKED" || match.distanceMeters === null || match.distanceMeters > 45) return null;
  const dx=(match.snappedPosition.longitude-observation.position.longitude)*111_320*Math.cos(observation.position.latitude*Math.PI/180);
  const dy=(match.snappedPosition.latitude-observation.position.latitude)*110_540;
  if (Math.hypot(dx,dy)>60) return null;
  const measured = measurementTime(observation);
  if (measured !== Date.parse(match.sourceMeasuredAt ?? "")) return null;
  if (measured === null || nowMs - measured > 90_000 || measured - nowMs > MAX_FUTURE_MS) return null;
  return match.snappedPosition;
}
