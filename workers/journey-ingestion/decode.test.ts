import { describe, expect, it } from "vitest";
import { decodeJourney } from "./decode.js";
import { journeyPayload } from "./fixtures.js";

describe("decodeJourney", () => {
  it("houdt gepland en actueel gescheiden en bewaart bronvertraging", () => {
    const journey = decodeJourney(journeyPayload(), { receivedAt: "2026-08-20T18:50:52Z" });
    expect(journey).toMatchObject({
      trainNumber: "8667",
      serviceDate: "2026-08-20",
      operator: "NS",
      trainCategory: { code: "SPR", name: "Sprinter" },
      destination: { planned: "Rotterdam Centraal", actual: null },
    });
    expect(journey.stops).toHaveLength(2);
    expect(journey.stops[0]).toMatchObject({
      station: { code: "GDA", longName: "Gouda" },
      departure: {
        plannedAt: "2026-08-20T18:50:00.000Z",
        actualAt: "2026-08-20T18:52:00.000Z",
        exactDelaySeconds: 120,
        plannedTrack: "5",
        actualTrack: "8",
      },
    });
  });
});
