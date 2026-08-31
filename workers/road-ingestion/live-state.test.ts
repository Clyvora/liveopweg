import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { roadEventSchema, type RoadEvent } from "../../packages/protocol/road.js";
import { RoadLiveState } from "./live-state.js";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

function event(overrides: Partial<RoadEvent> = {}): RoadEvent {
  return roadEventSchema.parse({
    id: "S1:R1", situationId: "S1", sourceId: "R1", version: 1,
    type: "roadworks", detailType: "roadworks", source: "NLRWS",
    roadName: null, direction: null, description: null,
    geometry: { type: "LineString", coordinates: [[5, 52], [5.1, 52.1]] },
    delaySeconds: null, queueLengthMeters: null, temporarySpeedLimitKmh: null,
    severity: "medium", safetyRelated: false, status: "ACTIVE",
    time: {
      publicationTime: "2026-08-21T14:27:00Z", sourceCreatedAt: "2026-08-21T13:00:00Z",
      sourceUpdatedAt: "2026-08-21T14:20:00Z", validFrom: "2026-08-21T13:00:00Z",
      validUntil: "2026-08-21T16:00:00Z", receivedAt: "2026-08-21T14:27:01Z", normalizedAt: "2026-08-21T14:27:01Z",
    },
    provenance: {
      sourceId: "ndw.datex3.actueel-beeld", sourceUrl: "https://opendata.ndw.nu/actueel_beeld.xml.gz",
      schemaVersion: "DATEX-II-v3-NL-actueel-beeld@2025-06-27", payloadSha256: "a".repeat(64),
      origin: "SOURCE", geometryOrigin: "GML_LINE_STRING",
    },
    qualityFlags: [],
    ...overrides,
  });
}

async function state(): Promise<RoadLiveState> {
  const directory = await mkdtemp(join(tmpdir(), "mobilityradar-road-"));
  temporaryDirectories.push(directory);
  return new RoadLiveState(join(directory, "road.json"));
}

describe("RoadLiveState", () => {
  it("dedupliceert ids en kiest de nieuwste recordversie", async () => {
    const live = await state();
    const result = await live.applySnapshot([event(), event({ version: 2, description: "Nieuw" })], "2026-08-21T14:27:00Z", new Date("2026-08-21T14:27:02Z"));
    expect(result.duplicates).toBe(1);
    expect(live.snapshot(new Date("2026-08-21T14:27:02Z"))).toMatchObject([{ version: 2, description: "Nieuw" }]);
  });

  it("publiceert geometriewijzigingen als upsert", async () => {
    const live = await state();
    await live.applySnapshot([event()], "2026-08-21T14:27:00Z", new Date("2026-08-21T14:27:02Z"));
    const changed = event({ version: 2, geometry: { type: "LineString", coordinates: [[5.2, 52.2], [5.3, 52.3]] } });
    const result = await live.applySnapshot([changed], "2026-08-21T14:28:00Z", new Date("2026-08-21T14:28:02Z"));
    expect(result.upserts).toHaveLength(1);
    expect(result.upserts[0].geometry).toEqual(changed.geometry);
  });

  it("maakt geplande werkzaamheden actief na start en verwijdert ze na einde", async () => {
    const live = await state();
    const planned = event({ status: "PLANNED", time: { ...event().time, validFrom: "2026-08-21T15:00:00Z", validUntil: "2026-08-21T16:00:00Z" } });
    await live.applySnapshot([planned], "2026-08-21T14:27:00Z", new Date("2026-08-21T14:27:02Z"));
    expect(live.snapshot(new Date("2026-08-21T14:30:00Z"))[0].status).toBe("PLANNED");
    const started = event({ status: "ACTIVE", time: { ...planned.time, publicationTime: "2026-08-21T15:05:00Z" } });
    await live.applySnapshot([started], "2026-08-21T15:05:00Z", new Date("2026-08-21T15:05:01Z"));
    expect(live.snapshot(new Date("2026-08-21T15:05:01Z"))[0].status).toBe("ACTIVE");
    expect(await live.prune(new Date("2026-08-21T16:00:01Z"))).toEqual(["S1:R1"]);
    expect(live.snapshot(new Date("2026-08-21T16:00:01Z"))).toHaveLength(0);
  });

  it("verwijdert ids die niet meer in de volledige NDW-snapshot staan", async () => {
    const live = await state();
    await live.applySnapshot([event()], "2026-08-21T14:27:00Z", new Date("2026-08-21T14:27:02Z"));
    const result = await live.applySnapshot([], "2026-08-21T14:28:00Z", new Date("2026-08-21T14:28:02Z"));
    expect(result.removedEventIds).toEqual(["S1:R1"]);
  });
});
