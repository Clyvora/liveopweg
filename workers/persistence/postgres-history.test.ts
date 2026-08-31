import { describe, expect, it } from "vitest";
import type { RoadEvent } from "../../packages/protocol/road.js";
import { roadGeometryGeoJson } from "./postgres-history.js";

describe("PostgresHistoryStore helpers", () => {
  it("bewaart NDW-brongeometrie als geldige GeoJSON zonder afleiding", () => {
    const event = {
      geometry: { type: "LineString", coordinates: [[5.1, 52.1], [5.2, 52.2]] },
    } as RoadEvent;
    expect(JSON.parse(roadGeometryGeoJson(event))).toEqual(event.geometry);
  });
});
