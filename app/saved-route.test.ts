import { describe, expect, it } from "vitest";
import { railStations } from "../packages/domain-rail/stations";
import { parseSavedRoute } from "./saved-route";

describe("saved routes", () => {
  it("resolves canonical station names from the current catalog", () => {
    expect(parseSavedRoute(JSON.stringify({ originCode: "UT", originName: "Old name", destinationCode: "ASD", destinationName: "Old name" }), railStations)).toMatchObject({ originName: "Utrecht Centraal", destinationName: "Amsterdam Centraal" });
  });
  it("rejects corrupt, incomplete, unknown and identical stations", () => {
    for (const value of [null, "{broken", "[]", JSON.stringify({ originCode: "UT" }), JSON.stringify({ originCode: "UT", destinationCode: "UT" }), JSON.stringify({ originCode: "XYZXYZ", destinationCode: "UT" })]) expect(parseSavedRoute(value, railStations)).toBeNull();
  });
});
