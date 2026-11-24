import { describe, expect, it } from "vitest";
import type { StationBoardEntry } from "../packages/protocol/station";
import { departurePlatforms, movedFromPlatform, showsOnPlatform } from "./station-platform";

const entry = (track: string | null, plannedTrack = track, trackChanged = false, cancelled = false) =>
  ({ track, plannedTrack, trackChanged, cancelled } as StationBoardEntry);

describe("station platform mode", () => {
  it("groups the a/b sections of a track and orders platform options naturally", () => {
    expect(departurePlatforms([entry("12"), entry(" 5b "), entry("5A"), entry("2"), entry(null)])).toEqual(["2", "5", "12"]);
    expect(showsOnPlatform(entry("5b"), "5")).toBe(true);
    expect(showsOnPlatform(entry("15b"), "5")).toBe(false);
  });

  it("shows a moved departure on both the planned and current track", () => {
    const moved = entry("7a", "5b", true);
    expect(showsOnPlatform(moved, "5")).toBe(true);
    expect(showsOnPlatform(moved, "7")).toBe(true);
    expect(movedFromPlatform(moved, "5")).toBe(true);
    expect(movedFromPlatform(moved, "7")).toBe(false);
  });

  it("keeps cancelled departures on their planned track and skips unknown positions when filtering", () => {
    expect(showsOnPlatform(entry(null, "5", false, true), "5")).toBe(true);
    expect(showsOnPlatform(entry(null), "5")).toBe(false);
    expect(showsOnPlatform(entry(null), "")).toBe(true);
  });
});
