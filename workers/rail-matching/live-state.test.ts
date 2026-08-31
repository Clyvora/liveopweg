import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { railTrackMatchSchema } from "../../packages/protocol/rail.js";
import { TrackMatchLiveStateStore } from "./live-state.js";

const root = resolve("var", "test-track-match-live-state");
afterEach(() => rm(root, { recursive: true, force: true }));

describe("TrackMatchLiveStateStore", () => {
  it("bewaart afgeleide matches apart van raw observaties en herstelt ze", async () => {
    const path = resolve(root, "matches.json");
    const store = new TrackMatchLiveStateStore(path);
    const match = railTrackMatchSchema.parse({
      observationId: "raw-observation-id",
      vehicleId: "rail:ndov:material:1",
      region: "UTRECHT_PILOT",
      status: "UNMATCHED_AMBIGUOUS",
      confidenceClass: "UNKNOWN",
      rawPosition: { longitude: 5.1, latitude: 52.1 },
      snappedPosition: null,
      edgeId: null,
      edgeProgress: null,
      distanceMeters: 2,
      candidateCount: 2,
      internalScore: 0.8,
      runnerUpGap: 0.01,
      searchRadiusMeters: 75,
      candidates: [],
      components: {
        distance: "USED", heading: "USED", continuity: "UNAVAILABLE", topology: "UNAVAILABLE",
        gpsQuality: "USED", routeAlignment: "UNAVAILABLE", directionality: "UNAVAILABLE",
      },
      method: {
        id: "utrecht-track-matcher", version: "1.0.0", graphPayloadSha256: "a".repeat(64),
        origin: "DERIVED", scoreIsProbability: false,
      },
      sourceMeasuredAt: "2026-08-21T12:00:00.000Z",
      matchedAt: "2026-08-21T12:00:01.000Z",
    });
    await store.write([match]);
    expect((await store.restore())[0]).toEqual(match);
    expect(await readFile(path, "utf8")).toContain("raw-observation-id");
  });
});
