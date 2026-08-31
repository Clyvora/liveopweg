import { describe, expect, it } from "vitest";
import type { RailObservation } from "../protocol/rail.js";
import { renderMotion, type MotionSample } from "./client-motion.js";

function observation(time: string, longitude: number, latitude = 52): RailObservation {
  return {
    observationId: `${time}:${longitude}`,
    vehicleId: "rail:ndov:material:test",
    trainNumber: "1",
    materialNumber: "test",
    materialSequence: "1",
    position: { longitude, latitude, elevationMeters: null, reference: "GPS_SOURCE", mapMatching: "NOT_APPLIED" },
    speed: { valueKmh: 100, origin: "MEASURED_GPS" },
    headingDegrees: 90,
    gpsQuality: { hdop: 1.5, satellites: 9, fix: "3D" },
    time: { sourceMeasuredAt: time, sourceGeneratedAt: time, sourcePublishedAt: null, receivedAt: time, normalizedAt: time },
    provenance: {
      sourceId: "ndov.ns.train-positions.interface-5",
      sourceTopic: "/RIG/NStreinpositiesInterface5",
      schemaVersion: "TreinLocatie.xsd@2016-10-10",
      payloadSha256: "a".repeat(64),
      origin: "SOURCE",
    },
    quality: { state: "FRESH_SOURCE", flags: [], freshnessThresholdSeconds: 30 },
  };
}

function sample(): MotionSample {
  return {
    previous: observation("2026-08-21T12:00:00Z", 5),
    current: observation("2026-08-21T12:00:10Z", 5.01),
  };
}

describe("client motion", () => {
  it("interpoleert monotoon tussen twee bekende bronposities", () => {
    const first = renderMotion(sample(), Date.parse("2026-08-21T12:00:17Z"), 12_000);
    const second = renderMotion(sample(), Date.parse("2026-08-21T12:00:19Z"), 12_000);
    expect(first.mode).toBe("INTERPOLATED");
    expect(second.mode).toBe("INTERPOLATED");
    expect(first.longitude).toBeGreaterThanOrEqual(5);
    expect(second.longitude).toBeGreaterThan(first.longitude);
    expect(second.longitude).toBeLessThanOrEqual(5.01);
  });

  it("blijft kort doorbewegen tussen twee bronupdates", () => {
    const rendered = renderMotion(sample(), Date.parse("2026-08-21T12:00:25Z"), 12_000);
    expect(rendered.mode).toBe("EXTRAPOLATED");
    expect(rendered.longitude).toBeGreaterThan(5.01);
    expect(rendered.sourceLongitude).toBe(5.01);
  });

  it("stopt beweging en verlaagt confidence zodra de bron stale is", () => {
    const rendered = renderMotion(sample(), Date.parse("2026-08-21T12:00:45Z"), 12_000);
    expect(rendered.mode).toBe("STALE_HOLD");
    expect(rendered.stale).toBe(true);
    expect(rendered.longitude).toBe(5.01);
    expect(rendered.confidence.band).toBe("LOW");
  });

  it("interpoleert een onwaarschijnlijke GPS-sprong niet", () => {
    const jumping: MotionSample = {
      previous: observation("2026-08-21T12:00:00Z", 5),
      current: observation("2026-08-21T12:00:10Z", 6),
    };
    const rendered = renderMotion(jumping, Date.parse("2026-08-21T12:00:17Z"), 12_000);
    expect(rendered.mode).toBe("SOURCE_HOLD");
    expect(rendered.confidence.movementPlausibility).toBe(0);
    expect(rendered.confidence.final).toBeLessThan(0.8);
  });
});
