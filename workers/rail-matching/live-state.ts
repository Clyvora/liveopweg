import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { railTrackMatchSchema, type RailTrackMatch } from "../../packages/protocol/rail.js";

const storedMatchesSchema = z.object({
  schemaVersion: z.literal(1),
  region: z.enum(["UTRECHT_PILOT", "NETHERLANDS"]),
  updatedAt: z.string().datetime(),
  matches: z.array(railTrackMatchSchema),
});

export class TrackMatchLiveStateStore {
  private writeQueue = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly region: "UTRECHT_PILOT" | "NETHERLANDS" = "UTRECHT_PILOT",
  ) {}

  async restore(): Promise<RailTrackMatch[]> {
    try {
      return storedMatchesSchema.parse(JSON.parse(await readFile(this.filePath, "utf8"))).matches;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }

  write(matches: RailTrackMatch[]): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify({
        schemaVersion: 1,
        region: this.region,
        updatedAt: new Date().toISOString(),
        matches,
      }), "utf8");
      await rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }
}
