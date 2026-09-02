import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { railJourneySchema, type RailJourney } from "../../packages/protocol/journey.js";

export type JourneyApplyResult = "accepted" | "duplicate" | "out-of-order";

export class JourneyLiveState {
  private readonly journeys = new Map<string, RailJourney>();
  private readonly stationIndex = new Map<string, Set<string>>();
  constructor(private readonly directory: string) {}

  private key(trainNumber: string, serviceDate: string) {
    return `${serviceDate}:${trainNumber}`;
  }

  async restore(): Promise<void> {
    try {
      const files = await readdir(this.directory, { withFileTypes: true });
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".json")) continue;
        const journey = railJourneySchema.parse(JSON.parse(await readFile(join(this.directory, file.name), "utf8")));
        this.indexJourney(journey);
      }
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }

  find(trainNumber: string, serviceDate: string): RailJourney | null {
    return this.journeys.get(this.key(trainNumber, serviceDate)) ?? null;
  }

  forStation(stationCode: string): RailJourney[] {
    return [...(this.stationIndex.get(stationCode.toUpperCase()) ?? [])]
      .map((key) => this.journeys.get(key)!);
  }

  private indexJourney(journey: RailJourney) {
    const key = this.key(journey.trainNumber, journey.serviceDate);
    for (const stop of this.journeys.get(key)?.stops ?? []) {
      this.stationIndex.get(stop.station.code.toUpperCase())?.delete(key);
    }
    this.journeys.set(key, journey);
    for (const stop of journey.stops) {
      const code = stop.station.code.toUpperCase();
      const keys = this.stationIndex.get(code) ?? new Set<string>();
      keys.add(key);
      this.stationIndex.set(code, keys);
    }
  }

  async apply(journey: RailJourney): Promise<JourneyApplyResult> {
    const key = this.key(journey.trainNumber, journey.serviceDate);
    const current = this.journeys.get(key);
    if (current?.provenance.payloadSha256 === journey.provenance.payloadSha256) return "duplicate";
    if (current && Date.parse(journey.product.generatedAt) <= Date.parse(current.product.generatedAt)) return "out-of-order";
    this.indexJourney(journey);
    await mkdir(this.directory, { recursive: true });
    const fileName = `${journey.serviceDate}-${journey.trainNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    const target = join(this.directory, fileName);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, `${JSON.stringify(journey, null, 2)}\n`, "utf8");
    await rename(temporary, target);
    return "accepted";
  }
}

export function localServiceDate(isoTime: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(isoTime));
}
