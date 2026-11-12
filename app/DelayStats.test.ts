import { describe, expect, it } from "vitest";
import type { RailObservation } from "../packages/protocol/rail";
import { fleetStats } from "./DelayStats";

describe("live fleet statistics", () => {
  it("uses measured speed and freshness without inventing values", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    const time = { sourceMeasuredAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString() };
    const vehicles = [
      { speed: { valueKmh: 132 }, quality: { state: "FRESH_SOURCE" }, time },
      { speed: { valueKmh: 0 }, quality: { state: "STALE" }, time },
      { speed: null, quality: { state: "UNKNOWN" }, time },
    ] as RailObservation[];
    expect(fleetStats(vehicles, now)).toEqual({ total: 3, measured: 1, moving: 1, fresh: 1, maxSpeed: 132 });
    expect(fleetStats([])).toEqual({ total: 0, measured: 0, moving: 0, fresh: 0, maxSpeed: null });
  });
  it("ages out a formerly fresh speed even without another incoming update", () => {
    const now = Date.parse("2026-11-12T12:00:00Z");
    const vehicle = { speed: { valueKmh: 299 }, quality: { state: "FRESH_SOURCE", freshnessThresholdSeconds: 30 }, time: { sourceMeasuredAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString() } } as RailObservation;
    expect(fleetStats([vehicle], now + 31_000)).toEqual({ total: 1, measured: 0, moving: 0, fresh: 0, maxSpeed: null });
  });
});
