import { describe, expect, it } from "vitest";
import type { RailObservation, RailTrackMatch } from "../protocol/rail.js";
import { reliableTrainPosition } from "./display-position.js";

const now = Date.parse("2026-09-13T12:00:00.000Z");
const observation = { vehicleId: "train-1" } as RailObservation;
const match = {
  vehicleId: "train-1",
  status: "MATCHED_HIGH",
  snappedPosition: { longitude: 5.12, latitude: 52.09 },
  edgeId: "edge-1",
  distanceMeters: 12,
  sourceMeasuredAt: "2026-09-13T11:59:50.000Z",
  matchedAt: "2026-09-13T11:59:51.000Z",
} as RailTrackMatch;

describe("reliableTrainPosition", () => {
  it("uses the matched track coordinate, not raw GPS", () => {
    expect(reliableTrainPosition(observation, match, now)).toEqual(match.snappedPosition);
  });

  it("rejects unmatched and distant or regional fallback guesses", () => {
    expect(reliableTrainPosition(observation, null, now)).toBeNull();
    expect(reliableTrainPosition(observation, { ...match, status: "UNMATCHED_AMBIGUOUS" }, now)).toBeNull();
    expect(reliableTrainPosition(observation, { ...match, distanceMeters: 80 }, now)).toBeNull();
    expect(reliableTrainPosition(observation, { ...match, status: "MATCHED_LOW_REGIONAL_FALLBACK" }, now)).toBeNull();
    expect(reliableTrainPosition(observation, { ...match, zone: { id: "z", quality: "BLOCKED", fallbackAllowed: false, reasons: [] } }, now)).toBeNull();
  });

  it("rejects a match for another train or a stale fix", () => {
    expect(reliableTrainPosition(observation, { ...match, vehicleId: "train-2" }, now)).toBeNull();
    expect(reliableTrainPosition(observation, { ...match, sourceMeasuredAt: "2026-09-13T11:58:00.000Z" }, now)).toBeNull();
  });

  it("keeps the last known track point while a newer fleet message is awaiting its match", () => {
    const newerObservation = { ...observation, observationId: "newer-fix" };
    expect(reliableTrainPosition(newerObservation, match, now)).toEqual(match.snappedPosition);
  });
});
