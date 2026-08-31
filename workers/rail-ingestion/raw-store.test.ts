import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { trainPositionPayload } from "./fixtures.js";
import { RawRailStore } from "./raw-store.js";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("RawRailStore", () => {
  it("bewaart exacte gzip-bytes content-addressed en journalt ontvangstmetadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mobilityradar-raw-"));
    temporaryDirectories.push(directory);
    const payload = trainPositionPayload();
    const store = new RawRailStore(directory);
    const record = await store.append(
      "/RIG/NStreinpositiesInterface5",
      "tcp://pubsub.besteffort.ndovloket.nl:7664",
      "2026-08-20T18:50:51.974Z",
      payload,
    );

    expect(await readFile(record.payloadPath)).toEqual(payload);
    const journal = await readFile(join(directory, "journal", "2026-08-20.ndjson"), "utf8");
    expect(JSON.parse(journal)).toMatchObject({
      payloadSha256: record.payloadSha256,
      receivedAt: "2026-08-20T18:50:51.974Z",
      schemaVersion: "TreinLocatie.xsd@2016-10-10",
    });
  });
});
