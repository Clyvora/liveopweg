import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeTrainPositions } from "./decode.js";
import { trainPositionPayload } from "./fixtures.js";

describe("decodeTrainPositions", () => {
  it("behoudt het echte WGS84-punt en houdt onbekende tijden null", () => {
    const observations = decodeTrainPositions(trainPositionPayload(), {
      receivedAt: "2026-08-20T18:50:51.974Z",
      freshnessThresholdSeconds: 30,
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      vehicleId: "rail:ndov:material:2015",
      trainNumber: "8667",
      position: {
        longitude: 4.6467455,
        latitude: 52.0783348333,
        mapMatching: "NOT_APPLIED",
      },
      speed: { valueKmh: 28, origin: "MEASURED_GPS" },
      time: {
        sourceMeasuredAt: "2026-08-20T18:50:45.000Z",
        sourceGeneratedAt: null,
        sourcePublishedAt: null,
      },
      quality: { state: "FRESH_SOURCE" },
    });
  });

  it("quarantaint onbekende wirevelden als schema drift", () => {
    expect(() => decodeTrainPositions(trainPositionPayload({ extraField: "<tns3:NieuwVeld>1</tns3:NieuwVeld>" }), {
      receivedAt: "2026-08-20T18:50:51.974Z",
    })).toThrow(/schema drift/i);
  });

  it("weigert DTD en entities vóór XML-parsing", () => {
    const payload = gzipSync(`<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>`);
    expect(() => decodeTrainPositions(payload, { receivedAt: "2026-08-20T18:50:51.974Z" })).toThrow(/DTD\/entity/i);
  });
});
