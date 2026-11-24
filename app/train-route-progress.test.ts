import { describe, expect, it } from "vitest";
import type { RailJourney } from "../packages/protocol/journey";
import type { ExpectedRoute } from "../packages/protocol/expected-route";
import { nextTrainStop } from "./next-train-stop";
import { trainRouteFeatures, trainTrailFeatures, updateTrainTrail } from "./train-route-progress";

const now = Date.parse("2026-11-24T12:00:00Z");

describe("selected train progress", () => {
  it("draws the next and passed stops and leaves out cancelled stops", () => {
    const stops = [
      { code: "UT", name: "Utrecht Centraal", minutes: -10, served: true },
      { code: "ASB", name: "Amsterdam Bijlmer ArenA", minutes: 2, served: false },
      { code: "ASA", name: "Amsterdam Amstel", minutes: 5, served: true },
    ].map(({ code, name, minutes, served }, order) => {
      const plannedAt = new Date(now + minutes * 60_000).toISOString();
      return {
        order, station: { code, longName: name }, calls: { actual: served, planned: true },
        arrival: { plannedAt }, departure: { plannedAt },
      } as RailJourney["stops"][number];
    });
    const stations = new Map(stops.map(stop => [stop.station.code, { latitude: 52, longitude: 5 }]));
    const next = nextTrainStop(stops, now);
    const fallback = trainRouteFeatures(null, stops, next?.order, stations, "en");
    expect(fallback.features.map(feature => feature.properties)).toEqual([
      { kind: "passed", label: "" },
      { kind: "next", label: "Next stop · Amsterdam Amstel · 13:05" },
    ]);
    const route: ExpectedRoute = {
      method: "EXPECTED_SHORTEST_TRACK_PATH", exactSwitchPathKnown: false, stops: [], routedStops: 1,
      geometry: { type: "MultiLineString", coordinates: [[[5, 52], [5.01, 52.01]]] },
    };
    expect(trainRouteFeatures(route, stops, next?.order, stations, "nl").features[0].properties).toEqual({ kind: "route" });
    expect(trainRouteFeatures(route, stops, undefined, stations, "nl").features.map(feature => feature.properties?.kind)).toEqual(["passed", "passed"]);
  });

  it("expires old positions and skips repeated, delayed or implausibly distant recordings", () => {
    const sample = (seconds: number, longitude: number) => ({ at: now + seconds * 1000, latitude: 52, longitude });
    const readings = [sample(-400, 5), sample(-80, 5), sample(-70, 5.005), sample(-76, 5.002), sample(-20, 5.006), sample(-10, 6)];
    const points = readings.reduce<ReturnType<typeof updateTrainTrail>>((history, point) => updateTrainTrail(history, point, now), []);
    const recent = updateTrainTrail(points, null, now);
    expect(recent.map(point => point.longitude)).toEqual([5, 5.005, 5.006, 6]);
    expect(trainTrailFeatures(recent).features.map(feature => feature.geometry)).toEqual([
      { type: "LineString", coordinates: [[5, 52], [5.005, 52]] },
    ]);
  });
});
