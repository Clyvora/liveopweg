import { describe, expect, it } from "vitest";
import { railObservationSchema, type RailObservation } from "../../packages/protocol/rail.js";
import { auditTrackGraph } from "../rail-geometry/audit.js";
import { buildTrackGraph, type PdokFeature } from "../rail-geometry/graph.js";
import { NationalTrackMatcher, UtrechtTrackMatcher } from "./matcher.js";

function line(id: string, coordinates: number[][]): PdokFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "LineString", coordinates },
    properties: { puic: id, levenscyclus_status: "Bestaand" },
  };
}

function graph(lines: PdokFeature[]) {
  return buildTrackGraph(lines, [], {
    importedAt: "2026-08-21T00:00:00.000Z",
    sourceUpdatedAt: "2026-07-08T11:47:24.000Z",
    payloadSha256: "a".repeat(64),
    sourceUrl: "https://api.pdok.nl/prorail/spoorwegen/ogc/v1",
  });
}

function observation(
  longitude: number,
  latitude: number,
  overrides: Partial<Pick<RailObservation, "vehicleId" | "observationId" | "headingDegrees">> = {},
  measuredAt = "2026-08-21T12:00:00.000Z",
): RailObservation {
  return railObservationSchema.parse({
    observationId: overrides.observationId ?? `obs:${longitude}:${latitude}:${measuredAt}`,
    vehicleId: overrides.vehicleId ?? "rail:ndov:material:test",
    trainNumber: "1234",
    materialNumber: "9999",
    materialSequence: "1",
    position: { longitude, latitude, elevationMeters: null, reference: "GPS_SOURCE", mapMatching: "NOT_APPLIED" },
    speed: { valueKmh: 80, origin: "MEASURED_GPS" },
    headingDegrees: overrides.headingDegrees ?? 90,
    gpsQuality: { hdop: 0.9, satellites: 11, fix: "3D" },
    time: {
      sourceMeasuredAt: measuredAt,
      sourceGeneratedAt: null,
      sourcePublishedAt: null,
      receivedAt: measuredAt,
      normalizedAt: measuredAt,
    },
    provenance: {
      sourceId: "ndov.ns.train-positions.interface-5",
      sourceTopic: "/RIG/NStreinpositiesInterface5",
      schemaVersion: "TreinLocatie.xsd@2016-10-10",
      payloadSha256: "b".repeat(64),
      origin: "SOURCE",
    },
    quality: { state: "FRESH_SOURCE", flags: [], freshnessThresholdSeconds: 30 },
  });
}

describe("UtrechtTrackMatcher", () => {
  it("projecteert een GPS-punt op een uniek spoor en bewaart raw GPS afzonderlijk", () => {
    const matcher = new UtrechtTrackMatcher(graph([line("track-a", [[5.05, 52.08], [5.08, 52.08]])]));
    const result = matcher.match(observation(5.06, 52.08005));
    expect(result?.status).toBe("MATCHED_HIGH");
    expect(result?.snappedPosition?.latitude).toBeCloseTo(52.08, 6);
    expect(result?.rawPosition.latitude).toBe(52.08005);
    expect(result?.method.scoreIsProbability).toBe(false);
  });

  it("weigert een schijnzekere keuze tussen twee parallelsporen", () => {
    const matcher = new UtrechtTrackMatcher(graph([
      line("parallel-a", [[5.05, 52.08], [5.08, 52.08]]),
      line("parallel-b", [[5.05, 52.08004], [5.08, 52.08004]]),
    ]));
    const result = matcher.match(observation(5.06, 52.08002));
    expect(result?.status).toBe("UNMATCHED_AMBIGUOUS");
    expect(result?.snappedPosition).toBeNull();
    expect(result?.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("geeft op een wissel voorrang aan een topologisch verbonden vervolg", () => {
    const matcher = new UtrechtTrackMatcher(graph([
      line("approach", [[5, 52.08], [5.002, 52.08]]),
      line("connected", [[5.002, 52.08], [5.006, 52.08]]),
      line("unconnected-parallel", [[5.002, 52.080035], [5.006, 52.080035]]),
    ]));
    const first = matcher.match(observation(5.0002, 52.08));
    expect(first?.status.startsWith("MATCHED")).toBe(true);
    const second = matcher.match(observation(5.003, 52.080025, {}, "2026-08-21T12:00:10.000Z"));
    expect(second?.status.startsWith("MATCHED")).toBe(true);
    expect(second?.candidates[0].continuity).toBe("CONNECTED_EDGE");
    expect(second?.edgeId).not.toBeNull();
  });

  it("verwerpt een fysiek onmogelijke GPS-sprong", () => {
    const matcher = new UtrechtTrackMatcher(graph([
      line("long-track", [[5, 52.08], [5.2, 52.08]]),
    ]));
    matcher.match(observation(5.01, 52.08));
    const jumped = matcher.match(observation(5.11, 52.08, {}, "2026-08-21T12:00:01.000Z"));
    expect(jumped?.status).toBe("REJECTED_SUSPICIOUS_OBSERVATION");
    expect(jumped?.snappedPosition).toBeNull();
  });

  it("rapporteert geen kandidaten zonder een punt te verzinnen", () => {
    const matcher = new UtrechtTrackMatcher(graph([line("far-away", [[5.2, 52.2], [5.21, 52.2]])]));
    const result = matcher.match(observation(5.01, 52.01));
    expect(result?.status).toBe("UNMATCHED_NO_CANDIDATES");
    expect(result?.edgeId).toBeNull();
  });

  it("beperkt matching expliciet tot de Utrecht-proefregio", () => {
    const matcher = new UtrechtTrackMatcher(graph([line("outside", [[5.4, 52.3], [5.5, 52.3]])]));
    expect(matcher.match(observation(5.45, 52.3))).toBeNull();
  });
});

describe("NationalTrackMatcher", () => {
  it("matcht ook buiten de voormalige Utrecht-proefregio", () => {
    const nationalGraph = graph([line("zeeland", [[3.75, 51.5], [3.8, 51.5]])]);
    const matcher = new NationalTrackMatcher(nationalGraph, auditTrackGraph(nationalGraph));
    const result = matcher.match(observation(3.77, 51.50002));
    expect(result?.region).toBe("NETHERLANDS");
    expect(result?.method.id).toBe("national-track-matcher");
    expect(result?.status.startsWith("MATCHED")).toBe(true);
  });

  it("gebruikt alleen in een gezonde graphzone de regionale 125-meterfallback", () => {
    const nationalGraph = graph(Array.from({ length: 6 }, (_, index) => line(
      `segment-${index}`,
      [[4.5 + index * 0.01, 51.5], [4.51 + index * 0.01, 51.5]],
    )));
    const audit = auditTrackGraph(nationalGraph);
    const matcher = new NationalTrackMatcher(nationalGraph, audit);
    const result = matcher.match(observation(4.525, 51.50082));
    expect(result?.status).toBe("MATCHED_LOW_REGIONAL_FALLBACK");
    expect(result?.confidenceClass).toBe("LOW");
    expect(result?.fallback).toMatchObject({
      applied: true,
      reason: "PRIMARY_RADIUS_NO_CANDIDATES",
      primaryRadiusMeters: 75,
      effectiveRadiusMeters: 125,
    });
    expect(result?.zone?.quality).toBe("NORMAL");
  });

  it("vergroot de zoekstraal niet in een schaarse graphzone", () => {
    const nationalGraph = graph([line("sparse", [[4.5, 51.5], [4.56, 51.5]])]);
    const matcher = new NationalTrackMatcher(nationalGraph, auditTrackGraph(nationalGraph));
    const result = matcher.match(observation(4.53, 51.50082));
    expect(result?.status).toBe("UNMATCHED_NO_CANDIDATES");
    expect(result?.fallback).toMatchObject({
      applied: false,
      reason: "GRAPH_ZONE_NOT_ELIGIBLE",
      effectiveRadiusMeters: 75,
    });
    expect(result?.zone?.quality).toBe("SPARSE");
  });

  it("geeft buiten het Nederlandse werkgebied geen matchobject terug", () => {
    const nationalGraph = graph([line("belgium", [[4.4, 50.4], [4.5, 50.4]])]);
    const matcher = new NationalTrackMatcher(nationalGraph, auditTrackGraph(nationalGraph));
    expect(matcher.match(observation(4.45, 50.4))).toBeNull();
  });
});
