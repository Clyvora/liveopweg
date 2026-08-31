import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeJourney } from "./decode.js";
import { journeyPayload } from "./fixtures.js";
import { JourneyLiveState, localServiceDate } from "./live-state.js";

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("JourneyLiveState", () => {
  it("weigert oudere volledige ritupdates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mobilityradar-journey-"));
    directories.push(directory);
    const state = new JourneyLiveState(directory);
    const newest = decodeJourney(journeyPayload("2026-08-20T18:55:00Z"), { receivedAt: "2026-08-20T18:55:01Z" });
    const older = decodeJourney(journeyPayload("2026-08-20T18:54:00Z"), { receivedAt: "2026-08-20T18:56:01Z" });
    expect(await state.apply(newest)).toBe("accepted");
    expect(await state.apply(newest)).toBe("duplicate");
    expect(await state.apply(older)).toBe("out-of-order");
    expect(state.find("8667", "2026-08-20")?.product.generatedAt).toBe("2026-08-20T18:55:00.000Z");
  });

  it("bepaalt de Nederlandse dienstdatum rond UTC-middernacht", () => {
    expect(localServiceDate("2026-08-20T22:30:00Z")).toBe("2026-08-21");
  });
});
