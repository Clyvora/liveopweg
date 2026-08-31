import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeRoadPublication } from "./decode.js";

function publication(records: string, publicationTime = "2026-08-21T14:27:00.123456789Z"): Buffer {
  return gzipSync(`<?xml version="1.0" encoding="UTF-8"?>
    <mc:messageContainer xmlns:mc="http://datex2.eu/schema/3/messageContainer" xmlns:sit="http://datex2.eu/schema/3/situation" xmlns:com="http://datex2.eu/schema/3/common" xmlns:loc="http://datex2.eu/schema/3/locationReferencing" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <mc:payload xsi:type="sit:SituationPublication">
        <com:publicationTime>${publicationTime}</com:publicationTime>
        <sit:situation id="S1"><sit:overallSeverity>high</sit:overallSeverity>${records}</sit:situation>
      </mc:payload>
    </mc:messageContainer>`);
}

function record(id: string, type: string, location: string, extra = ""): string {
  return `<sit:situationRecord xsi:type="sit:${type}" id="${id}" version="2">
    <sit:situationRecordCreationTime>2026-08-21T14:00:00Z</sit:situationRecordCreationTime>
    <sit:situationRecordVersionTime>2026-08-21T14:20:00Z</sit:situationRecordVersionTime>
    <sit:source><com:sourceName><com:values><com:value lang="nl">NLRWS</com:value></com:values></com:sourceName></sit:source>
    <sit:validity><com:validityTimeSpecification><com:overallStartTime>2026-08-21T15:00:00Z</com:overallStartTime><com:overallEndTime>2026-08-21T16:00:00Z</com:overallEndTime></com:validityTimeSpecification></sit:validity>
    ${location}${extra}
  </sit:situationRecord>`;
}

describe("decodeRoadPublication", () => {
  it("normaliseert punten, bronvelden en geplande status zonder waarden te verzinnen", () => {
    const location = `<sit:locationReference xsi:type="loc:PointLocation"><loc:pointByCoordinates><loc:pointCoordinates><loc:latitude>52.10</loc:latitude><loc:longitude>5.12</loc:longitude></loc:pointCoordinates></loc:pointByCoordinates></sit:locationReference>`;
    const result = decodeRoadPublication(publication(record("R1", "Accident", location, "<sit:accidentType>collision</sit:accidentType>")), {
      receivedAt: "2026-08-21T14:27:01Z",
      now: new Date("2026-08-21T14:27:01Z"),
    });

    expect(result.publicationTime).toBe("2026-08-21T14:27:00.123Z");
    expect(result.events[0]).toMatchObject({
      id: "S1:R1",
      type: "accident",
      detailType: "collision",
      source: "NLRWS",
      roadName: null,
      description: null,
      status: "PLANNED",
      geometry: { type: "Point", coordinates: [5.12, 52.1] },
    });
  });

  it("behoudt meerdere bronsegmenten als MultiLineString", () => {
    const location = `<sit:locationReference xsi:type="loc:ItineraryByIndexedLocations">
      <loc:locationContainedInItinerary index="0"><loc:location><loc:gmlLineString><loc:posList>52.0 5.0 52.1 5.1</loc:posList></loc:gmlLineString></loc:location></loc:locationContainedInItinerary>
      <loc:locationContainedInItinerary index="1"><loc:location><loc:gmlLineString><loc:posList>52.2 5.2 52.3 5.3</loc:posList></loc:gmlLineString></loc:location></loc:locationContainedInItinerary>
    </sit:locationReference>`;
    const result = decodeRoadPublication(publication(record("R2", "AbnormalTraffic", location, "<sit:abnormalTrafficType>queuingTraffic</sit:abnormalTrafficType><sit:queueLength>1200</sit:queueLength>")), {
      receivedAt: "2026-08-21T14:27:01Z",
    });
    expect(result.events[0]).toMatchObject({
      type: "congestion",
      queueLengthMeters: 1200,
      geometry: { type: "MultiLineString", coordinates: [[[5, 52], [5.1, 52.1]], [[5.2, 52.2], [5.3, 52.3]]] },
    });
  });

  it("quarantaint records zonder brongeometrie", () => {
    const result = decodeRoadPublication(publication(record("R3", "Accident", "")), { receivedAt: "2026-08-21T14:27:01Z" });
    expect(result.events).toHaveLength(0);
    expect(result.rejected).toEqual([{ situationId: "S1", sourceId: "R3", reason: "MISSING_GEOMETRY" }]);
  });

  it("weigert malafide en ongeldige DATEX II", () => {
    expect(() => decodeRoadPublication(gzipSync(`<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x>&y;</x>`), {
      receivedAt: "2026-08-21T14:27:01Z",
    })).toThrow(/DTD\/entity/);
    expect(() => decodeRoadPublication(gzipSync("<notDatex />"), {
      receivedAt: "2026-08-21T14:27:01Z",
    })).toThrow(/SituationPublication/);
  });
});
