import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { roadEventSchema, type RoadEvent } from "../../packages/protocol/road.js";

const storedStateSchema = z.object({
  publicationTime: z.string().datetime().nullable(),
  events: z.array(roadEventSchema),
});

export interface RoadApplyResult {
  upserts: RoadEvent[];
  removedEventIds: string[];
  duplicates: number;
}

function currentStatus(event: RoadEvent, now: Date): RoadEvent {
  const status: RoadEvent["status"] = event.time.validUntil && Date.parse(event.time.validUntil) <= now.valueOf()
    ? "ENDED"
    : event.time.validFrom && Date.parse(event.time.validFrom) > now.valueOf()
      ? "PLANNED"
      : now.valueOf() - Date.parse(event.time.publicationTime) > 180_000
        ? "STALE"
        : "ACTIVE";
  return status === event.status ? event : { ...event, status };
}

function semanticFingerprint(event: RoadEvent): string {
  const sourceTimes = {
    sourceCreatedAt: event.time.sourceCreatedAt,
    sourceUpdatedAt: event.time.sourceUpdatedAt,
    validFrom: event.time.validFrom,
    validUntil: event.time.validUntil,
  };
  const provenance = {
    sourceId: event.provenance.sourceId,
    sourceUrl: event.provenance.sourceUrl,
    schemaVersion: event.provenance.schemaVersion,
    origin: event.provenance.origin,
    geometryOrigin: event.provenance.geometryOrigin,
  };
  return JSON.stringify({ ...event, time: sourceTimes, provenance });
}

export class RoadLiveState {
  private readonly events = new Map<string, RoadEvent>();
  private publicationTime: string | null = null;

  constructor(private readonly statePath: string) {}

  async restore(): Promise<void> {
    try {
      const restored = storedStateSchema.parse(JSON.parse(await readFile(this.statePath, "utf8")));
      this.publicationTime = restored.publicationTime;
      for (const event of restored.events) this.events.set(event.id, event);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }

  sourcePublicationTime(): string | null {
    return this.publicationTime;
  }

  snapshot(now = new Date()): RoadEvent[] {
    const visible: RoadEvent[] = [];
    for (const event of this.events.values()) {
      const current = currentStatus(event, now);
      if (current.status !== "ENDED") visible.push(current);
    }
    return visible.sort((left, right) => left.id.localeCompare(right.id));
  }

  async applySnapshot(incoming: RoadEvent[], publicationTime: string, now = new Date()): Promise<RoadApplyResult> {
    const next = new Map<string, RoadEvent>();
    let duplicates = 0;
    for (const candidate of incoming) {
      const event = currentStatus(candidate, now);
      if (event.status === "ENDED") continue;
      const current = next.get(event.id);
      if (!current) {
        next.set(event.id, event);
        continue;
      }
      duplicates += 1;
      const currentTime = Date.parse(current.time.sourceUpdatedAt ?? current.time.sourceCreatedAt ?? current.time.publicationTime);
      const candidateTime = Date.parse(event.time.sourceUpdatedAt ?? event.time.sourceCreatedAt ?? event.time.publicationTime);
      if (event.version > current.version || (event.version === current.version && candidateTime > currentTime)) next.set(event.id, event);
    }

    const removedEventIds = Array.from(this.events.keys()).filter((id) => !next.has(id));
    const upserts = Array.from(next.values()).filter((event) => {
      const previous = this.events.get(event.id);
      return !previous || semanticFingerprint(previous) !== semanticFingerprint(event);
    });
    this.events.clear();
    for (const [id, event] of next) this.events.set(id, event);
    this.publicationTime = publicationTime;
    await this.persist();
    return { upserts, removedEventIds, duplicates };
  }

  async prune(now = new Date()): Promise<string[]> {
    const removed: string[] = [];
    for (const [id, event] of this.events) {
      if (!event.time.validUntil || Date.parse(event.time.validUntil) > now.valueOf()) continue;
      this.events.delete(id);
      removed.push(id);
    }
    if (removed.length) await this.persist();
    return removed;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({ publicationTime: this.publicationTime, events: Array.from(this.events.values()) })}\n`, "utf8");
    await rename(temporaryPath, this.statePath);
  }
}
