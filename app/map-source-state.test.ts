import { describe, expect, it } from "vitest";
import { failedBaseMaps } from "./map-source-state";
describe("map background failures", () => {
  it("identifies the active source without affecting unrelated layers", () => { expect(failedBaseMaps({ sourceId: "base-standard" })).toEqual(["base-standard"]); });
  it("identifies shared standard/night tile outages", () => { expect(failedBaseMaps({ error: { message: "Failed to fetch: https://tile.openstreetmap.org/5/16/10.png" } })).toEqual(["base-standard", "base-light"]); });
  it("identifies satellite failures", () => { expect(failedBaseMaps({ error: { url: "https://server.arcgisonline.com/ArcGIS/tile" } })).toEqual(["base-satellite"]); });
  it("does not report train or geometry errors as a background outage", () => { expect(failedBaseMaps({ sourceId: "rail-fleet", error: { message: "Invalid geometry" } })).toEqual([]); });
});
