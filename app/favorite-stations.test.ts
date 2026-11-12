import { describe, expect, it } from "vitest";
import { parseFavoriteStations, toggleFavoriteStation } from "./favorite-stations";

describe("station favorites", () => {
  it("preserves existing favorites when adding a seventh station", () => { const saved = ["UT", "ASD", "GVC", "RTD", "EHV", "HT"]; expect(toggleFavoriteStation(saved, "MT")).toEqual([...saved, "MT"]); });
  it("removes only the station the user chose", () => { expect(toggleFavoriteStation(["UT", "ASD", "GVC"], "ASD")).toEqual(["UT", "GVC"]); });
  it("recovers valid unique codes from malformed browser data", () => { expect(parseFavoriteStations('["ut","UT",null,34," ASD ","a station"]')).toEqual(["UT", "ASD"]); expect(parseFavoriteStations("broken")).toEqual([]); });
});
