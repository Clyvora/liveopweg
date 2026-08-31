import { createClient, type RedisClientType } from "redis";
import type { RailJourney } from "../../packages/protocol/journey.js";

export class RedisJourneyLiveState {
  private constructor(private readonly client: RedisClientType) {}

  static async connect(url: string): Promise<RedisJourneyLiveState> {
    const client = createClient({ url });
    client.on("error", (error) => {
      console.error(JSON.stringify({ event: "redis.journey.error", reason: error.message }));
    });
    await client.connect();
    return new RedisJourneyLiveState(client);
  }

  async write(journey: RailJourney): Promise<void> {
    const value = JSON.stringify(journey);
    const key = `rail:journey:${journey.serviceDate}:${journey.trainNumber}`;
    await this.client.multi()
      .set(key, value, { EX: 172_800 })
      .publish("rail:journey:updates", JSON.stringify({
        journeyId: journey.journeyId,
        trainNumber: journey.trainNumber,
        serviceDate: journey.serviceDate,
      }))
      .exec();
  }

  async close(): Promise<void> {
    if (this.client.isOpen) await this.client.quit();
  }
}
