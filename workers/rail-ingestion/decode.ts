import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { railObservationSchema, type RailObservation } from "../../packages/protocol/rail.js";

const SOURCE_ID = "ndov.ns.train-positions.interface-5" as const;
const SOURCE_TOPIC = "/RIG/NStreinpositiesInterface5" as const;
const SCHEMA_VERSION = "TreinLocatie.xsd@2016-10-10" as const;
const NAMESPACE = "http://schemas.datacontract.org/2004/07/Cognos.Infrastructure.Models";
const MAX_COMPRESSED_BYTES = 1_000_000;
const MAX_EXPANDED_BYTES = 12_000_000;
const PART_FIELDS = new Set([
  "MaterieelDeelNummer", "Materieelvolgnummer", "GeneratieTijd", "GpsDatumTijd",
  "Orientatie", "BronId", "Bron", "Fix", "Berichttype", "Longitude", "Latitude",
  "Elevation", "Snelheid", "Richting", "Rijrichting", "Hdop", "AantalSatelieten",
]);

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  isArray: (name) => name === "TreinLocation" || name === "TreinMaterieelDelen",
});

function asRecord(value: unknown, label: string): XmlRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} ontbreekt of is ongeldig`);
  return value as XmlRecord;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function decimal(value: unknown, label: string): number | null {
  const source = text(value);
  if (source === null) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(source)) throw new Error(`${label} is geen xs:decimal`);
  const parsed = Number(source);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is niet eindig`);
  return parsed;
}

function isoTime(value: unknown, label: string): string | null {
  const source = text(value);
  if (source === null) return null;
  const time = new Date(source);
  if (Number.isNaN(time.valueOf())) throw new Error(`${label} is geen geldige datum/tijd`);
  return time.toISOString();
}

function freshness(sourceMeasuredAt: string | null, receivedAt: string, thresholdSeconds: number) {
  const flags: string[] = [];
  if (sourceMeasuredAt === null) return { state: "UNKNOWN" as const, flags: ["SOURCE_MEASURED_AT_MISSING"] };
  const ageMs = Date.parse(receivedAt) - Date.parse(sourceMeasuredAt);
  if (ageMs < -5_000) return { state: "UNKNOWN" as const, flags: ["SOURCE_TIME_IN_FUTURE"] };
  if (ageMs > thresholdSeconds * 1_000) return { state: "STALE" as const, flags: ["SOURCE_OLDER_THAN_FRESH_THRESHOLD"] };
  return { state: "FRESH_SOURCE" as const, flags };
}

export interface DecodeContext {
  receivedAt: string;
  payloadSha256?: string;
  freshnessThresholdSeconds?: number;
}

export function decodeTrainPositions(payloadGzip: Buffer, context: DecodeContext): RailObservation[] {
  if (payloadGzip.length > MAX_COMPRESSED_BYTES) throw new Error("Gecomprimeerd bericht is te groot");
  const payloadSha256 = context.payloadSha256 ?? createHash("sha256").update(payloadGzip).digest("hex");
  const xml = gunzipSync(payloadGzip, { maxOutputLength: MAX_EXPANDED_BYTES }).toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DTD/entity-declaraties zijn niet toegestaan");
  if (!xml.includes(`xmlns:tns3="${NAMESPACE}"`) && !xml.includes(`xmlns="${NAMESPACE}"`)) {
    throw new Error("Onverwachte TreinLocatie-namespace");
  }

  const document = asRecord(parser.parse(xml), "XML-document");
  const root = asRecord(document.ArrayOfTreinLocation, "ArrayOfTreinLocation");
  const trains = asArray(root.TreinLocation);
  if (trains.length === 0) throw new Error("XSD-validatie: minimaal één TreinLocation verwacht");

  const normalizedAt = new Date().toISOString();
  const threshold = context.freshnessThresholdSeconds ?? 30;
  const observations: RailObservation[] = [];

  trains.forEach((trainValue, trainIndex) => {
    const train = asRecord(trainValue, `TreinLocation[${trainIndex}]`);
    const unexpectedTrainFields = Object.keys(train).filter((key) => key !== "TreinNummer" && key !== "TreinMaterieelDelen");
    if (unexpectedTrainFields.length) throw new Error(`XSD-schema drift bij TreinLocation: ${unexpectedTrainFields.join(", ")}`);
    const trainNumber = text(train.TreinNummer);
    if (trainNumber === null) throw new Error("XSD-validatie: TreinNummer is verplicht");
    const parts = asArray(train.TreinMaterieelDelen);
    if (parts.length === 0) throw new Error("XSD-validatie: minimaal één TreinMaterieelDelen verwacht");

    parts.forEach((partValue, partIndex) => {
      const part = asRecord(partValue, `TreinMaterieelDelen[${partIndex}]`);
      const unexpectedFields = Object.keys(part).filter((key) => !PART_FIELDS.has(key));
      if (unexpectedFields.length) throw new Error(`XSD-schema drift bij TreinMaterieelDelen: ${unexpectedFields.join(", ")}`);

      const longitude = decimal(part.Longitude, "Longitude");
      const latitude = decimal(part.Latitude, "Latitude");
      if (longitude === null || latitude === null) return;
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        throw new Error("WGS84-coördinaat valt buiten geldig bereik");
      }

      const materialNumber = text(part.MaterieelDeelNummer);
      const materialSequence = text(part.Materieelvolgnummer);
      const vehicleId = materialNumber
        ? `rail:ndov:material:${materialNumber}`
        : `rail:ndov:train:${trainNumber}:part:${materialSequence ?? partIndex + 1}`;
      const sourceMeasuredAt = isoTime(part.GpsDatumTijd, "GpsDatumTijd");
      const sourceGeneratedAt = isoTime(part.GeneratieTijd, "GeneratieTijd");
      const sourceFreshness = freshness(sourceMeasuredAt, context.receivedAt, threshold);
      if (!materialNumber) sourceFreshness.flags.push("MATERIAL_NUMBER_MISSING");
      if (longitude < 3 || longitude > 7.5 || latitude < 50.5 || latitude > 54) {
        sourceFreshness.flags.push("POSITION_OUTSIDE_NL_BOUNDS");
      }

      const speed = decimal(part.Snelheid, "Snelheid");
      const heading = decimal(part.Richting, "Richting");
      const observation = railObservationSchema.parse({
        observationId: `${payloadSha256}:${trainIndex}:${partIndex}`,
        vehicleId,
        trainNumber,
        materialNumber,
        materialSequence,
        position: {
          longitude,
          latitude,
          elevationMeters: decimal(part.Elevation, "Elevation"),
          reference: "GPS_SOURCE",
          mapMatching: "NOT_APPLIED",
        },
        speed: speed === null || speed < 0 ? null : { valueKmh: speed, origin: "MEASURED_GPS" },
        headingDegrees: heading === null || heading < 0 || heading > 360 ? null : heading,
        gpsQuality: {
          hdop: decimal(part.Hdop, "Hdop"),
          satellites: decimal(part.AantalSatelieten, "AantalSatelieten"),
          fix: text(part.Fix),
        },
        time: {
          sourceMeasuredAt,
          sourceGeneratedAt,
          sourcePublishedAt: null,
          receivedAt: context.receivedAt,
          normalizedAt,
        },
        provenance: {
          sourceId: SOURCE_ID,
          sourceTopic: SOURCE_TOPIC,
          schemaVersion: SCHEMA_VERSION,
          payloadSha256,
          origin: "SOURCE",
        },
        quality: {
          ...sourceFreshness,
          freshnessThresholdSeconds: threshold,
        },
      });
      observations.push(observation);
    });
  });

  return observations;
}
