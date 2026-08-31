import { createClient, type RedisClientType } from "redis";
import type { RailObservation } from "../../packages/protocol/rail.js";

export class RedisRailLiveState {
  private constructor(private readonly client: RedisClientType) {}

  static async connect(url: string): Promise<RedisRailLiveState> {
    const client = createClient({ url });
    client.on("error", (error) => {
      console.error(JSON.stringify({ event: "redis.error", reason: error.message }));
    });
    await client.connect();
    return new RedisRailLiveState(client);
  }

  async write(observation: RailObservation): Promise<void> {
    await this.writeBatch([observation], observation.vehicleId);
  }

  async writeBatch(observations: RailObservation[], trackedVehicleId?: string | null): Promise<void> {
    if (!observations.length) return;
    const transaction = this.client.multi();
    for (const observation of observations) {
      transaction.set(`rail:vehicle:${observation.vehicleId}:source`, JSON.stringify(observation), { EX: 600 });
      if (observation.vehicleId === trackedVehicleId) {
        transaction.set("rail:tracked:current", JSON.stringify(observation), { EX: 600 });
      }
    }
    transaction.publish("rail:fleet:updates", JSON.stringify({
      count: observations.length,
      vehicleIds: observations.map((observation) => observation.vehicleId),
    }));
    await transaction.exec();
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
