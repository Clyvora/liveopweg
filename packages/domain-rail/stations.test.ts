import { describe, expect, it } from "vitest";
import { normalizeSearchText, searchStations } from "./stations";

describe("station search", () => {
  it("matches a station when punctuation is omitted", () => {
    expect(searchStations("s hertogenbosch").some((station) => station.code === "HT")).toBe(true);
  });

  it("prioritizes an exact case-insensitive station code", () => {
    expect(searchStations("ht")[0]?.code).toBe("HT");
  });

  it("normalizes accents, case, and repeated whitespace consistently", () => {
    expect(normalizeSearchText("  ÉINDHOVEN   Centraal ")).toBe("eindhoven centraal");
    expect(searchStations("Eindhoven Centraal").some((station) => station.name === "Eindhoven Centraal")).toBe(true);
  });
});
