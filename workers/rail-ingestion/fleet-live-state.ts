import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { railObservationSchema, type RailObservation } from "../../packages/protocol/rail.js";

function orderingTime(observation: RailObservation): number {
  return Date.parse(observation.time.sourceMeasuredAt ?? observation.time.receivedAt);
}

function withCurrentQuality(observation: RailObservation, now: Date): RailObservation {
  const measuredAt = observation.time.sourceMeasuredAt;
  if (!measuredAt) return observation;
  const ageSeconds = (now.valueOf() - Date.parse(measuredAt)) / 1_000;
  if (ageSeconds <= observation.quality.freshnessThresholdSeconds) return observation;
  return {
    ...observation,
    quality: {
      ...observation.quality,
      state: "STALE",
      flags: Array.from(new Set([...observation.quality.flags, "SOURCE_OLDER_THAN_FRESH_THRESHOLD"])),
    },
  };
}

export interface FleetApplyResult {
  accepted: RailObservation[];
  duplicates: number;
  outOfOrder: number;
  removedVehicleIds: string[];
}

export class RailFleetLiveState {
  private readonly latestByVehicle = new Map<string, RailObservation>();

  constructor(
    private readonly statePath: string,
    private readonly retentionSeconds = 300,
  ) {}

  async restore(): Promise<void> {
    try {
      const restored = z.array(railObservationSchema).parse(JSON.parse(await readFile(this.statePath, "utf8")));
      for (const observation of restored) this.latestByVehicle.set(observation.vehicleId, observation);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
  }

  get(vehicleId: string, now = new Date()): RailObservation | null {
    const observation = this.latestByVehicle.get(vehicleId);
    return observation ? withCurrentQuality(observation, now) : null;
  }

  snapshot(now = new Date()): RailObservation[] {
    return Array.from(this.latestByVehicle.values(), (observation) => withCurrentQuality(observation, now))
      .sort((left, right) => left.trainNumber.localeCompare(right.trainNumber, "nl", { numeric: true }));
  }

  async applyBatch(observations: RailObservation[], now = new Date()): Promise<FleetApplyResult> {
    const accepted: RailObservation[] = [];
    let duplicates = 0;
    let outOfOrder = 0;

    for (const observation of observations) {
      const current = this.latestByVehicle.get(observation.vehicleId);
      if (current?.observationId === observation.observationId) {
        duplicates += 1;
        continue;
      }
      if (current && orderingTime(observation) <= orderingTime(current)) {
        outOfOrder += 1;
        continue;
      }
      this.latestByVehicle.set(observation.vehicleId, observation);
      accepted.push(observation);
    }

    const cutoff = now.valueOf() - this.retentionSeconds * 1_000;
    const removedVehicleIds: string[] = [];
    for (const [vehicleId, observation] of this.latestByVehicle) {
      if (orderingTime(observation) >= cutoff) continue;
      this.latestByVehicle.delete(vehicleId);
      removedVehicleIds.push(vehicleId);
    }

    if (accepted.length || removedVehicleIds.length) await this.persist();
    return { accepted, duplicates, outOfOrder, removedVehicleIds };
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(Array.from(this.latestByVehicle.values()))}\n`, "utf8");
    await rename(temporaryPath, this.statePath);
  }
}
