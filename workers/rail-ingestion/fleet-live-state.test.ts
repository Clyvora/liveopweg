import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RailObservation } from "../../packages/protocol/rail.js";
import { decodeTrainPositions } from "./decode.js";
import { RailFleetLiveState } from "./fleet-live-state.js";
import { trainPositionPayload } from "./fixtures.js";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function state(retentionSeconds = 300): Promise<RailFleetLiveState> {
  const directory = await mkdtemp(join(tmpdir(), "mobilityradar-fleet-"));
  temporaryDirectories.push(directory);
  return new RailFleetLiveState(join(directory, "fleet.json"), retentionSeconds);
}

function observation(gpsTime: string, vehicleId = "rail:ndov:material:2461", trainNumber = "8667") {
  const decoded = decodeTrainPositions(trainPositionPayload({ gpsTime }), { receivedAt: gpsTime })[0];
  return { ...decoded, vehicleId, trainNumber, observationId: `${decoded.observationId}:${vehicleId}` } satisfies RailObservation;
}

describe("RailFleetLiveState", () => {
  it("bewaart alle voertuigen en accepteert per voertuig alleen de nieuwste observatie", async () => {
    const fleet = await state();
    const first = observation("2026-08-20T18:51:06Z");
    const second = observation("2026-08-20T18:51:07Z", "rail:ndov:material:2462", "8668");
    const result = await fleet.applyBatch([first, second], new Date("2026-08-20T18:51:08Z"));

    expect(result.accepted).toHaveLength(2);
    expect(fleet.snapshot(new Date("2026-08-20T18:51:08Z"))).toHaveLength(2);
    expect((await fleet.applyBatch([first], new Date("2026-08-20T18:51:09Z"))).duplicates).toBe(1);
  });

  it("verwijdert voertuigen buiten het begrensde livevenster", async () => {
    const fleet = await state(60);
    await fleet.applyBatch([observation("2026-08-20T18:50:00Z")], new Date("2026-08-20T18:50:01Z"));
    const result = await fleet.applyBatch(
      [observation("2026-08-20T18:52:00Z", "rail:ndov:material:2462", "8668")],
      new Date("2026-08-20T18:52:01Z"),
    );

    expect(result.removedVehicleIds).toEqual(["rail:ndov:material:2461"]);
    expect(fleet.snapshot(new Date("2026-08-20T18:52:01Z"))).toHaveLength(1);
  });

  it("herstelt de vloot atomair uit opslag", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mobilityradar-fleet-restore-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "fleet.json");
    const first = new RailFleetLiveState(path);
    await first.applyBatch([observation("2026-08-20T18:51:06Z")], new Date("2026-08-20T18:51:07Z"));
    const restored = new RailFleetLiveState(path);
    await restored.restore();
    expect(restored.get("rail:ndov:material:2461", new Date("2026-08-20T18:51:07Z"))?.trainNumber).toBe("8667");
  });
});
