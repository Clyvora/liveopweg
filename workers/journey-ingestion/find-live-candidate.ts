import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { RailJourney } from "../../packages/protocol/journey.js";
import { decodeTrainPositions } from "../rail-ingestion/decode.js";
import type { RawRailRecord } from "../rail-ingestion/raw-store.js";
import { localServiceDate } from "./live-state.js";

const dataRoot = resolve(process.env.MOBILITYRADAR_DATA_DIR ?? "var");
const journalDirectory = resolve(dataRoot, "raw", "rail", "journal");
const journalFiles = (await readdir(journalDirectory)).filter((file) => file.endsWith(".ndjson")).sort();
const journal = await readFile(resolve(journalDirectory, journalFiles.at(-1)!), "utf8");
const rawRecord = JSON.parse(journal.trim().split("\n").at(-1)!) as RawRailRecord;
const observations = decodeTrainPositions(await readFile(rawRecord.payloadPath), {
  receivedAt: rawRecord.receivedAt,
  payloadSha256: rawRecord.payloadSha256,
});
const journeyDirectory = resolve(dataRoot, "live", "journeys");
const journeyFiles = await readdir(journeyDirectory);
const journeys = new Map<string, RailJourney>();
for (const file of journeyFiles) {
  if (!file.endsWith(".json")) continue;
  const journey = JSON.parse(await readFile(resolve(journeyDirectory, file), "utf8")) as RailJourney;
  journeys.set(`${journey.serviceDate}:${journey.trainNumber}`, journey);
}

const candidates = observations.flatMap((observation) => {
  if (!observation.time.sourceMeasuredAt) return [];
  const key = `${localServiceDate(observation.time.sourceMeasuredAt)}:${observation.trainNumber}`;
  const journey = journeys.get(key);
  if (!journey) return [];
  return [{
    vehicleId: observation.vehicleId,
    materialNumber: observation.materialNumber,
    trainNumber: observation.trainNumber,
    measuredAt: observation.time.sourceMeasuredAt,
    destination: journey.destination.actual ?? journey.destination.planned,
    stops: journey.stops.length,
    journeyGeneratedAt: journey.product.generatedAt,
  }];
});

console.log(JSON.stringify({ rawReceivedAt: rawRecord.receivedAt, candidates: candidates.slice(0, 20) }, null, 2));
