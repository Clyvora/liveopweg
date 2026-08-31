import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { railJourneySchema, type RailJourney } from "../../packages/protocol/journey.js";

const DATA_NAMESPACE = "urn:ns:cdm:reisinformatie:data:rit:5";
const MESSAGE_NAMESPACE = "urn:ns:cdm:reisinformatie:message:ritinfo:5";
const MAX_COMPRESSED_BYTES = 2_000_000;
const MAX_EXPANDED_BYTES = 20_000_000;

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  isArray: (name) => [
    "LogischeRit", "LogischeRitDeel", "LogischeRitDeelStation", "TreinEindBestemming",
    "AankomstTijd", "VertrekTijd", "TreinAankomstSpoor", "TreinVertrekSpoor", "Stopt", "Wijziging",
  ].includes(name),
});

function record(value: unknown, label: string): XmlRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} ontbreekt of is ongeldig`);
  return value as XmlRecord;
}

function array(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value).trim() || null;
  if (value && typeof value === "object" && !Array.isArray(value)) return text((value as XmlRecord)["#text"]);
  return null;
}

function attribute(value: unknown, name: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return text((value as XmlRecord)[`@${name}`]);
}

function requiredText(value: unknown, label: string): string {
  const result = text(value);
  if (!result) throw new Error(`${label} is verplicht`);
  return result;
}

function isoTime(value: unknown, label: string): string {
  const source = requiredText(value, label);
  const parsed = new Date(source);
  if (Number.isNaN(parsed.valueOf())) throw new Error(`${label} is geen geldige datum/tijd`);
  return parsed.toISOString();
}

function statusValue(values: unknown, status: "Gepland" | "Actueel"): unknown | null {
  return array(values).find((value) => attribute(value, "InfoStatus")?.toLowerCase() === status.toLowerCase()) ?? null;
}

function statusTime(values: unknown, status: "Gepland" | "Actueel", label: string): string | null {
  const value = statusValue(values, status);
  return value ? isoTime(value, `${label}.${status}`) : null;
}

function statusBoolean(values: unknown, status: "Gepland" | "Actueel"): boolean | null {
  const value = text(statusValue(values, status));
  if (value === null) return null;
  if (value === "J") return true;
  if (value === "N") return false;
  throw new Error(`Stopt.${status} heeft een onbekende waarde`);
}

function statusTrack(values: unknown, status: "Gepland" | "Actueel"): string | null {
  const value = statusValue(values, status);
  if (!value) return null;
  return text(record(value, `Spoor.${status}`).SpoorNummer);
}

function durationSeconds(value: unknown): number | null {
  const source = text(value);
  if (!source) return null;
  const match = source.match(/^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/);
  if (!match) throw new Error("Exacte vertraging is geen geldige xs:duration");
  const seconds = Number(match[2] ?? 0) * 86_400 + Number(match[3] ?? 0) * 3_600 + Number(match[4] ?? 0) * 60 + Number(match[5] ?? 0);
  return Math.round(seconds * (match[1] ? -1 : 1));
}

function station(value: unknown) {
  const source = record(value, "Station");
  const code = requiredText(source.StationCode, "StationCode");
  const shortName = text(source.KorteNaam);
  const mediumName = text(source.MiddelNaam);
  const longName = text(source.LangeNaam) ?? mediumName ?? shortName ?? code;
  return { code, uicCode: text(source.UICCode), shortName, mediumName, longName };
}

function destinationName(values: unknown, status: "Gepland" | "Actueel"): string | null {
  const value = statusValue(values, status);
  return value ? station(value).longName : null;
}

function changes(values: unknown) {
  return array(values).map((value) => {
    const source = record(value, "Wijziging");
    return {
      type: requiredText(source.WijzigingType, "WijzigingType"),
      causeCode: text(source.WijzigingOorzaakCode),
      causeShort: text(source.WijzigingOorzaakKort),
      causeLong: text(source.WijzigingOorzaakLang),
    };
  });
}

export interface JourneyDecodeContext {
  receivedAt: string;
  payloadSha256?: string;
}

export function decodeJourney(payloadGzip: Buffer, context: JourneyDecodeContext): RailJourney {
  if (payloadGzip.length > MAX_COMPRESSED_BYTES) throw new Error("Gecomprimeerd RIT-bericht is te groot");
  const payloadSha256 = context.payloadSha256 ?? createHash("sha256").update(payloadGzip).digest("hex");
  const xml = gunzipSync(payloadGzip, { maxOutputLength: MAX_EXPANDED_BYTES }).toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DTD/entity-declaraties zijn niet toegestaan");
  if (!xml.includes(DATA_NAMESPACE) || !xml.includes(MESSAGE_NAMESPACE)) throw new Error("Onverwachte RIT-v5 namespace");

  const document = record(parser.parse(xml), "XML-document");
  const envelope = record(document.PutReisInformatieBoodschapIn, "PutReisInformatieBoodschapIn");
  const product = record(envelope.ReisInformatieProductRitInfo, "ReisInformatieProductRitInfo");
  const administration = record(product.RIPAdministratie, "RIPAdministratie");
  const rit = record(product.RitInfo, "RitInfo");
  const trainNumber = requiredText(rit.TreinNummer, "TreinNummer");
  const serviceDate = requiredText(rit.TreinDatum, "TreinDatum");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) throw new Error("TreinDatum is geen geldige datum");

  const stopSources = array(rit.LogischeRit).flatMap((logicalJourney) => {
    const journey = record(logicalJourney, "LogischeRit");
    return array(journey.LogischeRitDeel).flatMap((part) => array(record(part, "LogischeRitDeel").LogischeRitDeelStation));
  });
  if (stopSources.length === 0) throw new Error("RIT-v5 bevat geen ritstations");

  const stops = stopSources.map((value, order) => {
    const source = record(value, `LogischeRitDeelStation[${order}]`);
    return {
      order,
      station: station(source.Station),
      calls: {
        planned: statusBoolean(source.Stopt, "Gepland"),
        actual: statusBoolean(source.Stopt, "Actueel"),
      },
      arrival: {
        plannedAt: statusTime(source.AankomstTijd, "Gepland", "AankomstTijd"),
        actualAt: statusTime(source.AankomstTijd, "Actueel", "AankomstTijd"),
        exactDelaySeconds: durationSeconds(source.ExacteAankomstVertraging),
        plannedTrack: statusTrack(source.TreinAankomstSpoor, "Gepland"),
        actualTrack: statusTrack(source.TreinAankomstSpoor, "Actueel"),
      },
      departure: {
        plannedAt: statusTime(source.VertrekTijd, "Gepland", "VertrekTijd"),
        actualAt: statusTime(source.VertrekTijd, "Actueel", "VertrekTijd"),
        exactDelaySeconds: durationSeconds(source.ExacteVertrekVertraging),
        plannedTrack: statusTrack(source.TreinVertrekSpoor, "Gepland"),
        actualTrack: statusTrack(source.TreinVertrekSpoor, "Actueel"),
      },
      destination: {
        planned: destinationName(source.TreinEindBestemming, "Gepland"),
        actual: destinationName(source.TreinEindBestemming, "Actueel"),
      },
      changes: changes(source.Wijziging),
    };
  });

  const trainCategory = rit.TreinSoort;
  const finalStop = stops.at(-1)!;
  return railJourneySchema.parse({
    journeyId: `rail:ndov:journey:${serviceDate}:${trainNumber}`,
    trainNumber,
    serviceDate,
    operator: text(rit.Vervoerder),
    trainCategory: { code: attribute(trainCategory, "Code"), name: text(trainCategory) },
    product: {
      id: requiredText(administration.ReisInformatieProductID, "ReisInformatieProductID"),
      version: attribute(product, "Versie"),
      applicationVersion: attribute(product, "ApplicatieVersie"),
      generatedAt: isoTime(attribute(product, "TimeStamp"), "ReisInformatieProductRitInfo.TimeStamp"),
      informationAt: isoTime(administration.ReisInformatieTijdstip, "ReisInformatieTijdstip"),
      validUntil: isoTime(administration.GeldigTot, "GeldigTot"),
    },
    destination: {
      planned: [...stops].reverse().find((stop) => stop.destination.planned)?.destination.planned ?? finalStop.station.longName,
      actual: [...stops].reverse().find((stop) => stop.destination.actual)?.destination.actual ?? null,
    },
    stops,
    provenance: {
      sourceId: "ndov.infoplus.rit.interface-5",
      sourceTopic: "/RIG/InfoPlusRITInterface5",
      schemaVersion: "RIT-v5@2024-06-27",
      payloadSha256,
      receivedAt: context.receivedAt,
      origin: "SOURCE",
    },
  });
}
