import { createClient, type RedisClientType } from "redis";
import type { RoadEvent } from "../../packages/protocol/road.js";

export class RedisRoadLiveState {
  private constructor(private readonly client: RedisClientType) {}

  static async connect(url: string): Promise<RedisRoadLiveState> {
    const client = createClient({ url });
    client.on("error", (error) => {
      console.error(JSON.stringify({ event: "redis.road.error", reason: error.message }));
    });
    await client.connect();
    return new RedisRoadLiveState(client);
  }

  async writeSnapshot(events: RoadEvent[], removedEventIds: string[], publicationTime: string): Promise<void> {
    const transaction = this.client.multi();
    for (const eventId of removedEventIds) transaction.del(`road:event:${eventId}:current`);
    for (const event of events) {
      const ttlSeconds = event.time.validUntil
        ? Math.max(60, Math.ceil((Date.parse(event.time.validUntil) - Date.now()) / 1_000) + 300)
        : 900;
      transaction.set(`road:event:${event.id}:current`, JSON.stringify(event), { EX: ttlSeconds });
    }
    transaction.set("road:events:publication-time", publicationTime, { EX: 900 });
    transaction.publish("road:event:updates", JSON.stringify({
      publicationTime,
      upsertIds: events.map((event) => event.id),
      removedEventIds,
    }));
    await transaction.exec();
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
