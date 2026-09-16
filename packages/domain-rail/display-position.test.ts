import { describe, expect, it } from "vitest";
import type { RailObservation, RailTrackMatch } from "../protocol/rail.js";
import { reliableTrainPosition, trainDisplayPosition } from "./display-position.js";

const now = Date.parse("2026-09-13T12:00:00.000Z");
const observation = {
  vehicleId: "train-1",
  position: { longitude: 5.1001, latitude: 52.0801 },
  time: { sourceMeasuredAt: "2026-09-13T11:59:50.000Z", receivedAt: "2026-09-13T11:59:55.000Z" },
} as RailObservation;
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

describe("trainDisplayPosition", () => {
  it("prefers the matched track position and flags it as matched", () => {
    expect(trainDisplayPosition(observation, match, now)).toEqual({
      position: match.snappedPosition,
      matched: true,
      stale: false,
    });
  });

  it("falls back to the raw GPS fix when the matcher has no trustworthy match", () => {
    // Every train the gateway still keeps in the fleet stays visible on the map,
    // even while its GPS fix has no (reliable) track match yet.
    expect(trainDisplayPosition(observation, null, now)).toEqual({
      position: { longitude: 5.1001, latitude: 52.0801 },
      matched: false,
      stale: false,
    });
    expect(trainDisplayPosition(observation, { ...match, status: "UNMATCHED_AMBIGUOUS" }, now)).toEqual({
      position: { longitude: 5.1001, latitude: 52.0801 },
      matched: false,
      stale: false,
    });
    expect(trainDisplayPosition(observation, { ...match, status: "MATCHED_LOW_REGIONAL_FALLBACK" }, now)).toEqual({
      position: { longitude: 5.1001, latitude: 52.0801 },
      matched: false,
      stale: false,
    });
    expect(trainDisplayPosition(observation, { ...match, distanceMeters: 250 }, now)).toEqual({
      position: { longitude: 5.1001, latitude: 52.0801 },
      matched: false,
      stale: false,
    });
  });

  it("uses the receipt time when the source measurement time is missing", () => {
    const withoutMeasureTime = { ...observation, time: { ...observation.time, sourceMeasuredAt: null } };
    expect(trainDisplayPosition(withoutMeasureTime, null, now)).toEqual({
      position: { longitude: 5.1001, latitude: 52.0801 },
      matched: false,
      stale: false,
    });
  });

  it("keeps old measurements visible but marks them as stale", () => {
    // The realtime gateway owns fleet retention: it drops vehicles that stopped
    // reporting. The client must not hide trains a second time, otherwise
    // perfectly healthy trains disappear from the map.
    const ancient = { ...observation, time: { ...observation.time, sourceMeasuredAt: "2026-09-13T11:50:00.000Z" } };
    expect(trainDisplayPosition(ancient, null, now)).toEqual({
      position: { longitude: 5.1001, latitude: 52.0801 },
      matched: false,
      stale: true,
    });
    expect(trainDisplayPosition(ancient, match, now)).toEqual({
      position: match.snappedPosition,
      matched: true,
      stale: true,
    });
  });

  it("honours the pipeline's own STALE quality flag", () => {
    // Een verse meettijd wil nog niet zeggen dat de pijplijn de meting goedkeurt;
    // het bronlabel is leidend boven de klok van de client.
    const flagged = {
      ...observation,
      quality: { state: "STALE", flags: [], freshnessThresholdSeconds: 30 },
    } as RailObservation;
    expect(trainDisplayPosition(flagged, null, now)).toEqual({
      position: { longitude: 5.1001, latitude: 52.0801 },
      matched: false,
      stale: true,
    });
    expect(trainDisplayPosition(flagged, match, now)).toEqual({
      position: match.snappedPosition,
      matched: true,
      stale: true,
    });
  });

  it("only returns null when there is no observation at all", () => {
    expect(trainDisplayPosition(null, null, now)).toBeNull();
    expect(trainDisplayPosition(undefined, null, now)).toBeNull();
  });
});
