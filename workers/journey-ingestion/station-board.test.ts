import { describe, expect, it } from "vitest";
import { buildStationBoard } from "./station-board.js";
import { decodeJourney } from "./decode.js";
import { journeyPayload } from "./fixtures.js";
import { decodeTrainPositions } from "../rail-ingestion/decode.js";
import { trainPositionPayload } from "../rail-ingestion/fixtures.js";
import { stationBoardSchema } from "../../packages/protocol/station.js";
import { railStations, searchStations, stationMinZoom, stationsByCode } from "../../packages/domain-rail/stations.js";

const now = new Date("2026-08-20T18:49:00Z");
const fixture = () => decodeJourney(journeyPayload(), { receivedAt: now.toISOString() });
const fleetFixture = () => decodeTrainPositions(trainPositionPayload({ gpsTime: now.toISOString(), materialNumber: "9586" }), { receivedAt: now.toISOString() });

describe("stationbord", () => {
  it("geeft actuele tijden, vertraging en spoorwijziging met exacte livekoppeling", () => {
    const board = buildStationBoard("gda", [fixture()], fleetFixture(), now, { healthy: true, lastReceivedAt: now.toISOString() });
    expect(stationBoardSchema.safeParse(board).success).toBe(true);
    expect(board.departures).toHaveLength(1);
    expect(board.arrivals).toHaveLength(0);
    expect(board.departures[0]).toMatchObject({ trainNumber: "8667", direction: "Rotterdam Centraal", track: "8", plannedTrack: "5", trackChanged: true, delaySeconds: 120, vehicleId: "rail:ndov:material:9586", timeBasis: "UPDATED", rollingStock: "VIRM dubbeldekker" });
    expect(board.sourceHealthy).toBe(true);
  });
  it("toont aankomsten vanuit de oorsprong en geen vertrek op het eindstation", () => {
    const board = buildStationBoard("RTD", [fixture()], [], now);
    expect(board.arrivals[0]).toMatchObject({ direction: "Gouda", track: "4", vehicleId: null });
    expect(board.departures).toHaveLength(0);
  });
  it("laat een vervallen stop zichtbaar, maar niet volgbaar", () => {
    const journey = fixture();
    journey.stops[0].calls.actual = false;
    const entry = buildStationBoard("GDA", [journey], fleetFixture(), now).departures[0];
    expect(entry).toMatchObject({ cancelled: true, vehicleId: null, track: null, trackChanged: false, expectedAt: "2026-08-20T18:50:00.000Z" });
  });
  it("neemt geen doorrijdende treinen zonder geplande of actuele stop op", () => {
    const journey = fixture();
    journey.stops[0].calls = { planned: false, actual: false };
    expect(buildStationBoard("GDA", [journey], [], now).departures).toEqual([]);
  });
  it("behoudt onbekende vertraging en labelt geplande tijden eerlijk", () => {
    const journey = fixture();
    Object.assign(journey.stops[0].departure, { actualAt: null, actualTrack: null, exactDelaySeconds: null });
    expect(buildStationBoard("GDA", [journey], [], now).departures[0]).toMatchObject({ delaySeconds: null, timeBasis: "PLANNED", track: "5", trackChanged: false });
  });
  it("kan vertraging uit de actuele en geplande tijd afleiden", () => {
    const journey = fixture();
    journey.stops[0].departure.exactDelaySeconds = null;
    expect(buildStationBoard("GDA", [journey], [], now).departures[0].delaySeconds).toBe(120);
  });
  it("filtert verstreken, verlopen en verre toekomstige ritten", () => {
    expect(buildStationBoard("GDA", [fixture()], [], new Date("2026-08-20T18:53:00Z")).departures).toEqual([]);
    expect(buildStationBoard("GDA", [fixture()], [], new Date("2026-08-20T17:00:00Z")).departures).toEqual([]);
    const journey = fixture();
    journey.product.validUntil = "2026-08-20T18:40:00Z";
    expect(buildStationBoard("GDA", [journey], [], now).departures).toEqual([]);
  });
  it("koppelt geen oud materieel of gelijk treinnummer van een andere dienstdatum", () => {
    const fleet = fleetFixture();
    fleet[0].time.sourceMeasuredAt = "2026-08-20T18:40:00Z";
    expect(buildStationBoard("GDA", [fixture()], fleet, now).departures[0].vehicleId).toBeNull();
    const journey = fixture();
    journey.serviceDate = "2026-08-19";
    expect(buildStationBoard("GDA", [journey], fleetFixture(), now).departures[0].vehicleId).toBeNull();
  });
  it("sorteert op verwachte tijd en verwijdert dubbele logische ritdelen", () => {
    const journey = fixture();
    journey.stops.push(structuredClone(journey.stops[0]));
    const earlier = fixture();
    earlier.journeyId += ":earlier";
    earlier.stops[0].departure.actualAt = "2026-08-20T18:51:00Z";
    const entries = buildStationBoard("GDA", [journey, earlier], [], now).departures;
    expect(entries).toHaveLength(2);
    expect(entries[0].expectedAt).toBe("2026-08-20T18:51:00Z");
  });
  it("presenteert een gestopte bron niet als live", () => {
    const board = buildStationBoard("GDA", [fixture()], [], now, { healthy: true, lastReceivedAt: "2026-08-20T18:40:00Z" });
    expect(board.sourceHealthy).toBe(false);
    expect(board.coverage).toBe("RECEIVED_JOURNEYS");
  });
});

describe("stationscatalogus", () => {
  it("heeft unieke codes en geldige Nederlandse locaties", () => {
    expect(railStations.length).toBeGreaterThan(390);
    expect(stationsByCode.size).toBe(railStations.length);
    for (const station of railStations) {
      expect(station.latitude).toBeGreaterThan(50);
      expect(station.latitude).toBeLessThan(54);
      expect(station.longitude).toBeGreaterThan(3);
      expect(station.longitude).toBeLessThan(8);
    }
  });
  it("zoekt op naam en code en toont kleine stations pas bij inzoomen", () => {
    expect(searchStations("Utrecht Centraal")[0].code).toBe("UT");
    expect(searchStations(" ut ")[0].code).toBe("UT");
    expect(searchStations(" ")).toEqual([]);
    expect(stationMinZoom(stationsByCode.get("UT")!)).toBeLessThan(stationMinZoom(stationsByCode.get("HTO")!));
  });
});
