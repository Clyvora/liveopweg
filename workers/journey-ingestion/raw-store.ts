import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class RawJourneyStore {
  constructor(private readonly rootDirectory: string) {}

  async append(topic: string, endpoint: string, receivedAt: string, payload: Buffer) {
    const payloadSha256 = createHash("sha256").update(payload).digest("hex");
    const messageDirectory = join(this.rootDirectory, "messages");
    const journalDirectory = join(this.rootDirectory, "journal");
    await Promise.all([mkdir(messageDirectory, { recursive: true }), mkdir(journalDirectory, { recursive: true })]);
    const payloadPath = join(messageDirectory, `${payloadSha256}.xml.gz`);
    try {
      await writeFile(payloadPath, payload, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    }
    const record = {
      recordId: randomUUID(), sourceId: "ndov.infoplus.rit.interface-5", topic,
      transport: "zeromq-subscriber", endpoint, receivedAt, contentEncoding: "gzip",
      payloadBytes: payload.length, payloadSha256, payloadPath, schemaVersion: "RIT-v5@2024-06-27",
    } as const;
    await appendFile(join(journalDirectory, `${receivedAt.slice(0, 10)}.ndjson`), `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }
}
