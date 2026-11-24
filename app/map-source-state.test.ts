import { describe, expect, it } from "vitest";
import { failedBaseMaps } from "./map-source-state";
describe("map background failures", () => {
  it("identifies the active source without affecting unrelated layers", () => { expect(failedBaseMaps({ sourceId: "base-standard" })).toEqual(["base-standard"]); });
  it("isolates standard and night tile outages", () => {
    expect(failedBaseMaps({ error: { message: "Failed to fetch: https://tile.openstreetmap.org/5/16/10.png" } })).toEqual(["base-standard"]);
    expect(failedBaseMaps({ error: { url: "https://tiles.openfreemap.org/planet" } })).toEqual(["base-light"]);
  });
  it("identifies PDOK aerial imagery failures", () => { expect(failedBaseMaps({ error: { url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/tile" } })).toEqual(["base-satellite"]); });
  it("does not report train or geometry errors as a background outage", () => { expect(failedBaseMaps({ sourceId: "rail-fleet", error: { message: "Invalid geometry" } })).toEqual([]); });
});
