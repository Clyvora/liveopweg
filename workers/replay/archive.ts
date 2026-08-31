import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import type { RailReplayFrame, RailReplayResponse } from "../../packages/protocol/replay.js";
import type { RailObservation, RailTrackMatch } from "../../packages/protocol/rail.js";
import type { GraphAudit } from "../rail-geometry/audit.js";
import type { TrackGraph } from "../rail-geometry/graph.js";
import { NationalTrackMatcher } from "../rail-matching/matcher.js";
import { decodeTrainPositions } from "../rail-ingestion/decode.js";

export const REPLAY_MAXIMUM_WINDOW_SECONDS = 7_200;

const rawRecordSchema = z.object({
  sourceId: z.literal("ndov.ns.train-positions.interface-5"),
  receivedAt: z.string().datetime(),
  payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
  payloadPath: z.string().min(1),
});

type RawRecord = z.infer<typeof rawRecordSchema>;

function sourceWithoutProcessingTime(observation: RailObservation): RailReplayFrame["source"] {
  return {
    ...observation,
    time: {
      sourceMeasuredAt: observation.time.sourceMeasuredAt,
      sourceGeneratedAt: observation.time.sourceGeneratedAt,
      sourcePublishedAt: observation.time.sourcePublishedAt,
      receivedAt: observation.time.receivedAt,
    },
  };
}

function matchWithoutProcessingTime(match: RailTrackMatch): NonNullable<RailReplayFrame["match"]> {
  const historical = { ...match } as Partial<RailTrackMatch>;
  delete historical.matchedAt;
  return historical as NonNullable<RailReplayFrame["match"]>;
}

export class ReplayArchive {
  private readonly journalDirectory: string;
  private readonly messageDirectory: string;

  constructor(
    rawRoot: string,
    private readonly graph: TrackGraph | null,
    private readonly graphAudit: GraphAudit | null,
  ) {
    this.journalDirectory = resolve(rawRoot, "journal");
    this.messageDirectory = resolve(rawRoot, "messages");
  }

  private async records(): Promise<RawRecord[]> {
    let names: string[];
    try {
      names = (await readdir(this.journalDirectory)).filter((name) => name.endsWith(".ndjson")).sort();
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
    const records: RawRecord[] = [];
    for (const name of names) {
      const body = await readFile(resolve(this.journalDirectory, name), "utf8");
      for (const line of body.split("\n")) {
        if (!line.trim()) continue;
        const parsed = rawRecordSchema.safeParse(JSON.parse(line));
        if (parsed.success) records.push(parsed.data);
      }
    }
    return records.sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
  }

  async catalog() {
    const records = await this.records();
    return {
      protocolVersion: 1 as const,
      type: "rail.replay.catalog" as const,
      availableFrom: records[0]?.receivedAt ?? null,
      availableUntil: records.at(-1)?.receivedAt ?? null,
      capturedMessages: records.length,
      maximumWindowSeconds: REPLAY_MAXIMUM_WINDOW_SECONDS,
      source: "ndov.ns.train-positions.interface-5" as const,
    };
  }

  async sequence(vehicleId: string, from: Date, until: Date): Promise<RailReplayResponse> {
    const duration = (until.valueOf() - from.valueOf()) / 1_000;
    if (!Number.isFinite(duration) || duration <= 0 || duration > REPLAY_MAXIMUM_WINDOW_SECONDS) {
      throw new Error(`Replayvenster moet tussen 1 en ${REPLAY_MAXIMUM_WINDOW_SECONDS} seconden liggen`);
    }
    const records = (await this.records()).filter((record) => {
      const received = Date.parse(record.receivedAt);
      return received >= from.valueOf() - 120_000 && received <= until.valueOf() + 120_000;
    });
    if (records.length > 900) throw new Error("Replayvenster bevat te veel bronberichten");

    const observations = new Map<string, RailObservation>();
    for (const [index, record] of records.entries()) {
      if (index > 0 && index % 8 === 0) await new Promise<void>((resolveYield) => setImmediate(resolveYield));
      const payloadPath = resolve(record.payloadPath);
      const pathFromRoot = relative(this.messageDirectory, payloadPath);
      if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) throw new Error("Replayjournal verwijst buiten de raw-opslag");
      const payload = await readFile(payloadPath);
      const decoded = decodeTrainPositions(payload, {
        receivedAt: record.receivedAt,
        payloadSha256: record.payloadSha256,
      });
      for (const observation of decoded) {
        if (observation.vehicleId !== vehicleId) continue;
        const eventTime = Date.parse(observation.time.sourceMeasuredAt ?? observation.time.receivedAt);
        if (eventTime < from.valueOf() || eventTime > until.valueOf()) continue;
        observations.set(observation.observationId, observation);
      }
    }
    const ordered = Array.from(observations.values()).sort((left, right) => (
      Date.parse(left.time.sourceMeasuredAt ?? left.time.receivedAt)
      - Date.parse(right.time.sourceMeasuredAt ?? right.time.receivedAt)
    ));
    const matcher = this.graph ? new NationalTrackMatcher(this.graph, this.graphAudit) : null;
    const frames: RailReplayFrame[] = ordered.slice(0, 2_000).map((observation) => {
      const match = matcher?.match(observation) ?? null;
      return {
        eventTime: observation.time.sourceMeasuredAt ?? observation.time.receivedAt,
        source: sourceWithoutProcessingTime(observation),
        match: match ? matchWithoutProcessingTime(match) : null,
      };
    });
    return {
      protocolVersion: 1,
      type: "rail.replay.sequence",
      vehicleId,
      requestedFrom: from.toISOString(),
      requestedUntil: until.toISOString(),
      frames,
      reconstruction: {
        sourceOrigin: "STORED_RAW_PAYLOAD",
        matchOrigin: this.graph ? "RECOMPUTED_WITH_PINNED_GRAPH" : "GRAPH_UNAVAILABLE",
        graphPayloadSha256: this.graph?.source.payloadSha256 ?? null,
        matcherMethod: this.graph ? "national-track-matcher@2.0.0" : null,
        renderStateStored: false,
      },
    };
  }
}
