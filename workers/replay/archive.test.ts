import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { trainPositionPayload } from "../rail-ingestion/fixtures.js";
import { RawRailStore } from "../rail-ingestion/raw-store.js";
import { ReplayArchive } from "./archive.js";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("ReplayArchive", () => {
  it("reconstrueert bronpunten deterministisch op GPS-tijd en labelt ontbrekende graph", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mobilityradar-replay-"));
    temporaryDirectories.push(directory);
    const store = new RawRailStore(directory);
    await store.append("/RIG/NStreinpositiesInterface5", "tcp://example", "2026-08-20T18:50:41Z", trainPositionPayload({ gpsTime: "2026-08-20T18:50:40Z" }));
    await store.append("/RIG/NStreinpositiesInterface5", "tcp://example", "2026-08-20T18:50:51Z", trainPositionPayload({ gpsTime: "2026-08-20T18:50:50Z" }));
    const archive = new ReplayArchive(directory, null, null);

    const catalog = await archive.catalog();
    const result = await archive.sequence("rail:ndov:material:2015", new Date("2026-08-20T18:50:35Z"), new Date("2026-08-20T18:50:55Z"));
    expect(catalog.capturedMessages).toBe(2);
    expect(result.frames.map((frame) => frame.eventTime)).toEqual(["2026-08-20T18:50:40.000Z", "2026-08-20T18:50:50.000Z"]);
    expect(result.frames[0].source.time).not.toHaveProperty("normalizedAt");
    expect(result.reconstruction).toMatchObject({ matchOrigin: "GRAPH_UNAVAILABLE", renderStateStored: false });
  });

  it("weigert onbegrensde replayvensters", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mobilityradar-replay-"));
    temporaryDirectories.push(directory);
    const archive = new ReplayArchive(directory, null, null);
    await expect(archive.sequence("rail:ndov:material:2015", new Date("2026-08-20T00:00:00Z"), new Date("2026-08-20T03:00:00Z")))
      .rejects.toThrow(/Replayvenster/);
  });
});
