import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { roadEventSchema, type RoadEvent } from "../../packages/protocol/road.js";

const MAX_COMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
const DEFAULT_SOURCE_URL = "https://opendata.ndw.nu/actueel_beeld.xml.gz";

type XmlValue = Record<string, unknown>;

export interface DecodeRoadOptions {
  receivedAt: string;
  payloadSha256?: string;
  sourceUrl?: string;
  now?: Date;
}

export interface RejectedRoadRecord {
  situationId: string;
  sourceId: string | null;
  reason: "MISSING_GEOMETRY" | "INVALID_RECORD";
}

export interface DecodedRoadPublication {
  publicationTime: string;
  events: RoadEvent[];
  rejected: RejectedRoadRecord[];
}

function asObject(value: unknown): XmlValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as XmlValue : null;
}

function asArray(value: unknown): unknown[] {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  const object = asObject(value);
  return object ? text(object["#text"]) : null;
}

function finiteNumber(value: unknown): number | null {
  const raw = text(value);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.replace(/\.(\d{3})\d+Z$/, ".$1Z");
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function nested(object: XmlValue | null, ...keys: string[]): unknown {
  let current: unknown = object;
  for (const key of keys) current = asObject(current)?.[key];
  return current;
}

function localizedValue(value: unknown): string | null {
  const values = asArray(nested(asObject(value), "values", "value"));
  const dutch = values.find((item) => asObject(item)?.["@_lang"] === "nl");
  return text(dutch ?? values[0]);
}

function comment(record: XmlValue): string | null {
  for (const item of asArray(record.generalPublicComment)) {
    const value = localizedValue(nested(asObject(item), "comment"));
    if (value) return value;
  }
  return null;
}

function parseLine(posList: unknown): [number, number][] | null {
  const values = (text(posList) ?? "").split(/\s+/).map(Number);
  if (values.length < 4 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) return null;
  const coordinates: [number, number][] = [];
  for (let index = 0; index < values.length; index += 2) {
    const latitude = values[index];
    const longitude = values[index + 1];
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    coordinates.push([longitude, latitude]);
  }
  return coordinates;
}

function locations(record: XmlValue): XmlValue[] {
  const reference = asObject(record.locationReference);
  if (!reference) return [];
  const itinerary = asArray(reference.locationContainedInItinerary)
    .map((item) => asObject(nested(asObject(item), "location")))
    .filter((item): item is XmlValue => Boolean(item));
  return itinerary.length ? itinerary : [reference];
}

function geometry(record: XmlValue): Pick<RoadEvent, "geometry" | "direction"> & { origin: "POINT_BY_COORDINATES" | "GML_LINE_STRING" } | null {
  const candidates = locations(record);
  const lines = candidates
    .map((location) => parseLine(nested(location, "gmlLineString", "posList")))
    .filter((line): line is [number, number][] => Boolean(line));
  const direction = candidates.map((location) => (
    text(nested(location, "alertCPoint", "alertCDirection", "alertCDirectionCoded"))
    ?? text(nested(location, "alertCLinear", "alertCDirection", "alertCDirectionCoded"))
  )).find(Boolean) ?? null;
  if (lines.length === 1) return { geometry: { type: "LineString", coordinates: lines[0] }, direction, origin: "GML_LINE_STRING" };
  if (lines.length > 1) return { geometry: { type: "MultiLineString", coordinates: lines }, direction, origin: "GML_LINE_STRING" };

  for (const location of candidates) {
    const latitude = finiteNumber(nested(location, "pointByCoordinates", "pointCoordinates", "latitude"));
    const longitude = finiteNumber(nested(location, "pointByCoordinates", "pointCoordinates", "longitude"));
    if (latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { geometry: { type: "Point", coordinates: [longitude, latitude] }, direction, origin: "POINT_BY_COORDINATES" };
    }
  }
  return null;
}

function detailType(record: XmlValue, wireType: string): string {
  const keys = [
    "abnormalTrafficType", "accidentType", "roadMaintenanceType", "roadOrCarriagewayOrLaneManagementType",
    "speedManagementType", "vehicleObstructionType", "obstructionType", "generalNetworkManagementType",
    "reroutingManagementType",
  ];
  return keys.map((key) => text(record[key])).find(Boolean) ?? wireType;
}

function eventType(record: XmlValue, wireType: string, detail: string): RoadEvent["type"] {
  const type = wireType.replace(/^.*:/, "");
  if (type === "AbnormalTraffic") return "congestion";
  if (type === "Accident") return "accident";
  if (type === "MaintenanceWorks") return "roadworks";
  if (type === "SpeedManagement") return "speedRestriction";
  if (type === "VehicleObstruction" || type === "GeneralObstruction") return "obstacle";
  if (type === "RoadOrCarriagewayOrLaneManagement") {
    return /clos|block/i.test(detail) ? "closure" : "roadworks";
  }
  if (type === "GeneralNetworkManagement" && /bridge|clos|block/i.test(detail)) return "closure";
  if (/Weather/i.test(type)) return "weather";
  if (text(record.safetyRelatedMessage) === "true") return "safety";
  return "other";
}

function status(validFrom: string | null, validUntil: string | null, publicationTime: string, now: Date): RoadEvent["status"] {
  if (validUntil && Date.parse(validUntil) <= now.valueOf()) return "ENDED";
  if (validFrom && Date.parse(validFrom) > now.valueOf()) return "PLANNED";
  if (now.valueOf() - Date.parse(publicationTime) > 180_000) return "STALE";
  return "ACTIVE";
}

export function decodeRoadPublication(payload: Buffer, options: DecodeRoadOptions): DecodedRoadPublication {
  if (payload.length > MAX_COMPRESSED_BYTES) throw new Error("NDW payload exceeds compressed size limit");
  const xml = gunzipSync(payload, { maxOutputLength: MAX_DECOMPRESSED_BYTES }).toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DTD/entity declarations are forbidden");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  }).parse(xml) as XmlValue;
  const payloadObject = asObject(nested(parsed, "messageContainer", "payload"));
  if (!payloadObject || !String(payloadObject["@_type"] ?? "").endsWith("SituationPublication")) {
    throw new Error("Malformed DATEX II: SituationPublication ontbreekt");
  }
  const publicationTime = iso(payloadObject.publicationTime);
  if (!publicationTime) throw new Error("Malformed DATEX II: publicationTime ontbreekt");

  const receivedAt = iso(options.receivedAt);
  if (!receivedAt) throw new Error("receivedAt is geen geldige ISO-tijd");
  const payloadSha256 = options.payloadSha256 ?? createHash("sha256").update(payload).digest("hex");
  const now = options.now ?? new Date(receivedAt);
  const events: RoadEvent[] = [];
  const rejected: RejectedRoadRecord[] = [];

  for (const situationValue of asArray(payloadObject.situation)) {
    const situation = asObject(situationValue);
    const situationId = text(situation?.["@_id"]);
    if (!situation || !situationId) continue;
    const severity = text(situation.overallSeverity) ?? "unknown";
    for (const recordValue of asArray(situation.situationRecord)) {
      const record = asObject(recordValue);
      const sourceId = text(record?.["@_id"]);
      if (!record || !sourceId) {
        rejected.push({ situationId, sourceId, reason: "INVALID_RECORD" });
        continue;
      }
      const located = geometry(record);
      if (!located) {
        rejected.push({ situationId, sourceId, reason: "MISSING_GEOMETRY" });
        continue;
      }
      const validity = asObject(nested(record, "validity", "validityTimeSpecification"));
      const validFrom = iso(validity?.overallStartTime ?? nested(validity, "validPeriod", "startOfPeriod"));
      const validUntil = iso(validity?.overallEndTime ?? nested(validity, "validPeriod", "endOfPeriod"));
      const wireType = text(record["@_type"]) ?? "UnknownSituationRecord";
      const detail = detailType(record, wireType.replace(/^.*:/, ""));
      const source = localizedValue(record.source && nested(record, "source", "sourceName")) ?? "NDW";
      const event = roadEventSchema.parse({
        id: `${situationId}:${sourceId}`,
        situationId,
        sourceId,
        version: Math.max(0, Math.trunc(finiteNumber(record["@_version"]) ?? 0)),
        type: eventType(record, wireType, detail),
        detailType: detail,
        source,
        roadName: null,
        direction: located.direction,
        description: comment(record),
        geometry: located.geometry,
        delaySeconds: finiteNumber(nested(record, "impact", "delays", "delayTimeValue")),
        queueLengthMeters: finiteNumber(record.queueLength),
        temporarySpeedLimitKmh: finiteNumber(record.temporarySpeedLimit),
        severity,
        safetyRelated: text(record.safetyRelatedMessage) === "true",
        status: status(validFrom, validUntil, publicationTime, now),
        time: {
          publicationTime,
          sourceCreatedAt: iso(record.situationRecordCreationTime),
          sourceUpdatedAt: iso(record.situationRecordVersionTime),
          validFrom,
          validUntil,
          receivedAt,
          normalizedAt: new Date(now).toISOString(),
        },
        provenance: {
          sourceId: "ndw.datex3.actueel-beeld",
          sourceUrl: options.sourceUrl ?? DEFAULT_SOURCE_URL,
          schemaVersion: "DATEX-II-v3-NL-actueel-beeld@2025-06-27",
          payloadSha256,
          origin: "SOURCE",
          geometryOrigin: located.origin,
        },
        qualityFlags: [
          ...(located.direction ? [] : ["DIRECTION_NOT_SUPPLIED"]),
          ...(comment(record) ? [] : ["DESCRIPTION_NOT_SUPPLIED"]),
          "ROAD_NAME_NOT_SUPPLIED",
        ],
      });
      events.push(event);
    }
  }
  return { publicationTime, events, rejected };
}
