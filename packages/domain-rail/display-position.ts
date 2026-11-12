import type { RailObservation, RailTrackMatch } from "../protocol/rail.js";
import { matchBelongsToObservation, measurementTime, observationIsStale, reliableTrainPosition, validMeasuredPosition } from "./position-quality.js";
export { observationIsStale, reliableTrainPosition } from "./position-quality.js";
export type DisplayPosition = { longitude: number; latitude: number };
export interface TrainDisplayPosition { position: DisplayPosition; matched: boolean; stale: boolean }

/** Keep measured GPS distinct from a validated projection onto a rail segment. */
export function trainDisplayPosition(observation: RailObservation | null | undefined, match: RailTrackMatch | null | undefined, nowMs: number): TrainDisplayPosition | null {
  if (!observation || !validMeasuredPosition(observation)) return null;
  const time = measurementTime(observation);
  // A disconnected client cannot keep a train on the map indefinitely.
  if (time === null || nowMs - time > 300_000 || time - nowMs > 5_000) return null;
  if (match && matchBelongsToObservation(observation, match) && match.status === "REJECTED_SUSPICIOUS_OBSERVATION") return null;
  const snapped = reliableTrainPosition(observation, match, nowMs);
  return { position: snapped ?? { longitude:observation.position.longitude, latitude:observation.position.latitude }, matched:Boolean(snapped), stale:observationIsStale(observation, nowMs) };
}
