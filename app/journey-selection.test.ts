import { describe, expect, it } from "vitest";
import type { JourneyRealtimeMessage } from "../packages/protocol/journey";
import { journeyMatchesSelection } from "./journey-selection";

const snapshot = { data: { trainNumber: "2735", serviceDate: "2026-11-12" }, link: { trainNumber: "2735", serviceDate: "2026-11-12" } } as Extract<JourneyRealtimeMessage, { type: "rail.journey.snapshot" }>;
describe("selected train timetables", () => {
  it("clears a missing timetable only when its link identifies the selected train",()=>{
    expect(journeyMatchesSelection({...snapshot,data:null},'2735')).toBe(true);
    expect(journeyMatchesSelection({...snapshot,data:null},'1735')).toBe(false);
  });
  it("accepts matching train identity and service date", () => { expect(journeyMatchesSelection(snapshot, "2735")).toBe(true); });
  it("rejects a delayed update from a previously selected train", () => { expect(journeyMatchesSelection(snapshot, "1735")).toBe(false); });
  it("rejects inconsistent journey links", () => { expect(journeyMatchesSelection({ ...snapshot, link: { ...snapshot.link!, serviceDate: "2026-11-11" } }, "2735")).toBe(false); });
  it("does not erase a selected timetable for an anonymous empty update", () => { expect(journeyMatchesSelection({ ...snapshot, data: null, link: null }, "2735")).toBe(false); expect(journeyMatchesSelection(snapshot, null)).toBe(false); });
});
