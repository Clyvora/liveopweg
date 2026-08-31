import { describe, expect, it } from "vitest";
import { buildTrackGraph } from "../../workers/rail-geometry/graph.js";
import { createStationBundle, createUtrechtStationBundle, localToWgs84, STATION_DEFINITIONS, wgs84ToLocal, type BgtPlatformFeature } from "./station-bundle.js";
import { curveLength, placeCarsOnCurve, sampleCurveAtDistance, type LocalPosition } from "./station-3d.js";

describe("lokale Utrecht-3D-coördinaten", () => {
  it("houdt meterwaarden lokaal en converteert zonder zichtbare jitter terug", () => {
    const source: [number, number, number] = [5.112345, 52.088765, 8.4];
    const local = wgs84ToLocal(...source);
    expect(Math.abs(local[0])).toBeLessThan(1_500);
    expect(Math.abs(local[1])).toBeLessThan(1_500);
    const restored = localToWgs84(local);
    expect(restored[0]).toBeCloseTo(source[0], 10);
    expect(restored[1]).toBeCloseTo(source[1], 10);
    expect(restored[2]).toBeCloseTo(source[2], 10);
  });
});

it("gebruikt dezelfde metrische bundelketen voor Amsterdam en Rotterdam", () => {
  for (const station of STATION_DEFINITIONS.slice(1)) {
    const graph = buildTrackGraph([{
      type: "Feature",
      id: `${station.id}-track`,
      geometry: { type: "LineString", coordinates: [
        [station.origin[0] - 0.0002, station.origin[1]],
        [station.origin[0] + 0.0002, station.origin[1]],
      ] },
      properties: { puic: `${station.id}-track`, levenscyclus_status: "Bestaand" },
    }], [], {
      importedAt: "2026-08-21T00:00:00.000Z", sourceUpdatedAt: null,
      payloadSha256: "a".repeat(64), sourceUrl: "https://api.pdok.nl/prorail/spoorwegen/ogc/v1",
    });
    const feature: BgtPlatformFeature = {
      type: "Feature", id: station.id,
      properties: { type: "perron", status: "bestaand", termination_date: null, eind_registratie: null },
      geometry: { type: "Polygon", coordinates: [[[
        [station.origin[0] - 0.0001, station.origin[1] - 0.0001],
        [station.origin[0] + 0.0001, station.origin[1] - 0.0001],
        [station.origin[0] + 0.0001, station.origin[1] + 0.0001],
        [station.origin[0] - 0.0001, station.origin[1] - 0.0001],
      ]]] },
    };
    const bundle = createStationBundle(station, graph, [feature], "c".repeat(64), "2026-08-21T12:00:00Z");
    expect(bundle.station.id).toBe(station.id);
    expect(bundle.coordinateSystem.id).toBe("STATION_LOCAL_ENU");
    expect(bundle.platforms.polygons).toHaveLength(1);
    expect(bundle.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
  }
});

describe("treinbakken op een rendercurve", () => {
  const curve: LocalPosition[] = [[-80, -20, 0], [-20, -20, 0], [20, 0, 0], [35, 50, 0], [35, 100, 0]];

  it("samplet begrensd op afstand met een genormaliseerde tangent", () => {
    const sample = sampleCurveAtDistance(curve, curveLength(curve) * 0.55);
    expect(sample).not.toBeNull();
    expect(Math.hypot(...sample!.tangent)).toBeCloseTo(1, 8);
    expect(sample!.progress).toBeCloseTo(0.55, 8);
  });

  it("plaatst iedere bak afzonderlijk langs dezelfde boog", () => {
    const cars = placeCarsOnCurve(curve, 0.55, 4, 18, 1.2);
    expect(cars).toHaveLength(4);
    expect(cars.map((car) => car.distanceMeters)).toEqual([...cars.map((car) => car.distanceMeters)].sort((a, b) => a - b));
    expect(new Set(cars.map((car) => car.tangent.map((value) => value.toFixed(3)).join(":"))).size).toBeGreaterThan(1);
    expect(cars[1].distanceMeters - cars[0].distanceMeters).toBeCloseTo(19.2, 6);
  });
});

describe("Utrecht-stationbundel", () => {
  it("neemt alleen rail in de detailzone en alleen actuele BGT-perrons op", () => {
    const graph = buildTrackGraph([{
      type: "Feature",
      id: "utrecht-track",
      geometry: { type: "LineString", coordinates: [[5.106, 52.09], [5.113, 52.089]] },
      properties: { puic: "utrecht-track", levenscyclus_status: "Bestaand" },
    }, {
      type: "Feature",
      id: "outside-track",
      geometry: { type: "LineString", coordinates: [[4.9, 52.2], [4.91, 52.2]] },
      properties: { puic: "outside-track", levenscyclus_status: "Bestaand" },
    }], [], {
      importedAt: "2026-08-21T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-08T11:47:24.000Z",
      payloadSha256: "a".repeat(64),
      sourceUrl: "https://api.pdok.nl/prorail/spoorwegen/ogc/v1",
    });
    const platform = (id: string, ended: boolean): BgtPlatformFeature => ({
      type: "Feature",
      id,
      properties: {
        type: "perron", status: "bestaand", relatieve_hoogteligging: 1,
        lv_publicatiedatum: "2026-08-07T00:00:00.000Z",
        termination_date: null, eind_registratie: ended ? "2025-01-01T00:00:00.000Z" : null,
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[5.107, 52.09], [5.108, 52.09], [5.108, 52.091], [5.107, 52.09]]],
      },
    });
    const bundle = createUtrechtStationBundle(graph, [platform("current", false), platform("ended", true)], "b".repeat(64));
    expect(bundle.rail.curves.map((curve) => curve.edgeId)).toHaveLength(1);
    expect(bundle.platforms.polygons.map((item) => item.id)).toEqual(["current"]);
    expect(bundle.bundleSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
