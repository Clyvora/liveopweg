import { describe, expect, it } from "vitest";
import type { RailObservation } from "../packages/protocol/rail";
import { fleetStats } from "./DelayStats";

describe("live fleet statistics", () => {
  it("uses measured speed and freshness without inventing values", () => {
    const vehicles = [
      { speed: { valueKmh: 132 }, quality: { state: "FRESH_SOURCE" } },
      { speed: { valueKmh: 0 }, quality: { state: "STALE" } },
      { speed: null, quality: { state: "UNKNOWN" } },
    ] as RailObservation[];
    expect(fleetStats(vehicles)).toEqual({ total: 3, measured: 2, moving: 1, fresh: 1, maxSpeed: 132 });
    expect(fleetStats([])).toEqual({ total: 0, measured: 0, moving: 0, fresh: 0, maxSpeed: null });
  });
});
