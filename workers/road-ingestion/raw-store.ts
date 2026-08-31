import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface RawRoadRecord {
  recordId: string;
  sourceId: "ndw.datex3.actueel-beeld";
  transport: "https-poll";
  endpoint: string;
  receivedAt: string;
  contentEncoding: "gzip";
  payloadBytes: number;
  payloadSha256: string;
  payloadPath: string;
  schemaVersion: "DATEX-II-v3-NL-actueel-beeld@2025-06-27";
}

export class RawRoadStore {
  constructor(private readonly rootDirectory: string) {}

  async append(endpoint: string, receivedAt: string, payload: Buffer): Promise<RawRoadRecord> {
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
    const record: RawRoadRecord = {
      recordId: randomUUID(),
      sourceId: "ndw.datex3.actueel-beeld",
      transport: "https-poll",
      endpoint,
      receivedAt,
      contentEncoding: "gzip",
      payloadBytes: payload.length,
      payloadSha256,
      payloadPath,
      schemaVersion: "DATEX-II-v3-NL-actueel-beeld@2025-06-27",
    };
    await appendFile(join(journalDirectory, `${receivedAt.slice(0, 10)}.ndjson`), `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }
}
