import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeTrainPositions } from "./decode.js";
import { trainPositionPayload } from "./fixtures.js";
import { RailLiveState } from "./live-state.js";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function state(): Promise<RailLiveState> {
  const directory = await mkdtemp(join(tmpdir(), "mobilityradar-state-"));
  temporaryDirectories.push(directory);
  return new RailLiveState(join(directory, "latest.json"));
}

function observation(gpsTime: string, receivedAt: string) {
  return decodeTrainPositions(trainPositionPayload({ gpsTime }), { receivedAt })[0];
}

describe("RailLiveState", () => {
  it("laat duplicate en out-of-order data de live toestand niet terugzetten", async () => {
    const live = await state();
    const newest = observation("2026-08-20T18:51:06Z", "2026-08-20T18:51:12Z");
    const older = observation("2026-08-20T18:50:56Z", "2026-08-20T18:51:13Z");

    expect(await live.apply(newest)).toBe("accepted");
    expect(await live.apply(newest)).toBe("duplicate");
    expect(await live.apply(older)).toBe("out-of-order");
    expect(live.current()?.time.sourceMeasuredAt).toBe("2026-08-20T18:51:06.000Z");
  });

  it("markeert een bewaarde observatie stale op basis van brontijd", async () => {
    const live = await state();
    await live.apply(observation("2026-08-20T18:51:06Z", "2026-08-20T18:51:12Z"));
    expect(live.current(new Date("2026-08-20T18:52:00Z"))?.quality.state).toBe("STALE");
  });
});
