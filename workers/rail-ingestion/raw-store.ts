import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface RawRailRecord {
  recordId: string;
  sourceId: "ndov.ns.train-positions.interface-5";
  topic: string;
  transport: "zeromq-subscriber";
  endpoint: string;
  receivedAt: string;
  contentEncoding: "gzip";
  payloadBytes: number;
  payloadSha256: string;
  payloadPath: string;
  schemaVersion: "TreinLocatie.xsd@2016-10-10";
}

export class RawRailStore {
  constructor(private readonly rootDirectory: string) {}

  async append(topic: string, endpoint: string, receivedAt: string, payload: Buffer): Promise<RawRailRecord> {
    const payloadSha256 = createHash("sha256").update(payload).digest("hex");
    const date = receivedAt.slice(0, 10);
    const messageDirectory = join(this.rootDirectory, "messages");
    const journalDirectory = join(this.rootDirectory, "journal");
    await Promise.all([mkdir(messageDirectory, { recursive: true }), mkdir(journalDirectory, { recursive: true })]);

    const payloadPath = join(messageDirectory, `${payloadSha256}.xml.gz`);
    try {
      await writeFile(payloadPath, payload, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    }

    const record: RawRailRecord = {
      recordId: randomUUID(),
      sourceId: "ndov.ns.train-positions.interface-5",
      topic,
      transport: "zeromq-subscriber",
      endpoint,
      receivedAt,
      contentEncoding: "gzip",
      payloadBytes: payload.length,
      payloadSha256,
      payloadPath,
      schemaVersion: "TreinLocatie.xsd@2016-10-10",
    };
    await appendFile(join(journalDirectory, `${date}.ndjson`), `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }
}
