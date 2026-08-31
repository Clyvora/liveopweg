import { describe, expect, it, vi } from "vitest";
import { RuntimeMetrics } from "./metrics.js";

describe("RuntimeMetrics", () => {
  it("publiceert alleen eindige Prometheus-waarden met bronbetekenis", () => {
    vi.setSystemTime(new Date("2026-08-31T08:00:10Z"));
    const metrics = new RuntimeMetrics();
    metrics.recordRailBatch({
      observations: 4,
      duplicates: 1,
      outOfOrder: 2,
      newestSourceMeasuredAt: "2026-08-31T08:00:06Z",
    });
    metrics.setWebsocketClients(3);
    const body = metrics.render();
    expect(body).toContain("mobilityradar_rail_observations_total 4");
    expect(body).toContain("mobilityradar_rail_source_position_age_seconds 4");
    expect(body).toContain("mobilityradar_websocket_clients 3");
    expect(body).not.toContain("NaN");
    vi.useRealTimers();
  });
});
