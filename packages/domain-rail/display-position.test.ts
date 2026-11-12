import { describe, expect, it } from "vitest";
import type { RailObservation, RailTrackMatch } from "../protocol/rail.js";
import { reliableTrainPosition, trainDisplayPosition } from "./display-position.js";

const now = Date.parse("2026-09-13T12:00:00.000Z");
const observation = {
  observationId: "fix-1",
  vehicleId: "train-1",
  position: { longitude: 5.1001, latitude: 52.0801 },
  time: { sourceMeasuredAt: "2026-09-13T11:59:50.000Z", receivedAt: "2026-09-13T11:59:55.000Z" },
} as RailObservation;
const match = {
  observationId: "fix-1",
  vehicleId: "train-1",
  status: "MATCHED_HIGH",
  snappedPosition: { longitude: 5.10015, latitude: 52.08011 },
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

  it("rejects a previous measurement while a newer fix awaits its own match", () => {
    const newerObservation = { ...observation, observationId: "newer-fix" };
    expect(reliableTrainPosition(newerObservation, match, now)).toBeNull();
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

  it("does not turn an unknown measurement time into a fresh position", () => {
    const missing = { ...observation, time:{...observation.time,sourceMeasuredAt:null} };
    expect(trainDisplayPosition(missing,null,now)).toBeNull();
  });
  it("expires old measurements when the connection stops without a removal", () => {
    const ancient={...observation,time:{...observation.time,sourceMeasuredAt:"2026-09-13T11:50:00.000Z"}};
    expect(trainDisplayPosition(ancient,null,now)).toBeNull();
    expect(trainDisplayPosition(ancient,match,now)).toBeNull();
  });
  it("rejects failed fixes, future times and suspicious jumps",()=>{
    expect(trainDisplayPosition({...observation,gpsQuality:{fix:"0"}} as RailObservation,null,now)).toBeNull();
    expect(trainDisplayPosition({...observation,time:{...observation.time,sourceMeasuredAt:"2026-09-13T12:01:00Z"}},null,now)).toBeNull();
    expect(trainDisplayPosition(observation,{...match,status:"REJECTED_SUSPICIOUS_OBSERVATION"},now)).toBeNull();
    expect(reliableTrainPosition(observation,{...match,snappedPosition:{longitude:6,latitude:53}},now)).toBeNull();
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
