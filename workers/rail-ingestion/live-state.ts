import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RailObservation } from "../../packages/protocol/rail.js";

function orderingTime(observation: RailObservation): number {
  return Date.parse(observation.time.sourceMeasuredAt ?? observation.time.receivedAt);
}

export type ApplyResult = "accepted" | "duplicate" | "out-of-order" | "not-tracked";

export class RailLiveState {
  private trackedVehicleId: string | null = null;
  private latest: RailObservation | null = null;

  constructor(
    private readonly statePath: string,
    trackedVehicleId?: string,
  ) {
    this.trackedVehicleId = trackedVehicleId ?? null;
  }

  async restore(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as RailObservation;
      this.latest = parsed;
      this.trackedVehicleId ??= parsed.vehicleId;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }

  tracked(): string | null {
    return this.trackedVehicleId;
  }

  follow(vehicleId: string): void {
    if (vehicleId === this.trackedVehicleId) return;
    this.trackedVehicleId = vehicleId;
    this.latest = null;
  }

  current(now = new Date()): RailObservation | null {
    if (!this.latest) return null;
    const measuredAt = this.latest.time.sourceMeasuredAt;
    if (!measuredAt) return this.latest;
    const ageSeconds = (now.valueOf() - Date.parse(measuredAt)) / 1_000;
    if (ageSeconds <= this.latest.quality.freshnessThresholdSeconds) return this.latest;
    return {
      ...this.latest,
      quality: {
        ...this.latest.quality,
        state: "STALE",
        flags: Array.from(new Set([...this.latest.quality.flags, "SOURCE_OLDER_THAN_FRESH_THRESHOLD"])),
      },
    };
  }

  async apply(observation: RailObservation): Promise<ApplyResult> {
    this.trackedVehicleId ??= observation.vehicleId;
    if (observation.vehicleId !== this.trackedVehicleId) return "not-tracked";
    if (this.latest?.observationId === observation.observationId) return "duplicate";
    if (this.latest && orderingTime(observation) <= orderingTime(this.latest)) return "out-of-order";

    this.latest = observation;
    await mkdir(dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(observation, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.statePath);
    return "accepted";
  }
}
