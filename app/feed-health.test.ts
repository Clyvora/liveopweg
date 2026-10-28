import { describe, expect, it } from "vitest";
import { describeFeedHealth, parseFeedHealth } from "./feed-health";

const now = Date.parse("2026-10-28T12:00:00Z");
const snapshot = () => parseFeedHealth({ sources: {
  positions: { status: "HEALTHY", lastEnvelopeReceivedAt: "2026-10-28T12:00:00Z" },
  journeys: { status: "HEALTHY", lastEnvelopeReceivedAt: "2026-10-28T11:50:00Z" },
  ndwActueelBeeld: { status: "HEALTHY", lastReceivedAt: "2026-10-28T10:00:00Z", lastCheckedAt: "2026-10-28T11:59:30Z", pollSeconds: 60 },
} });

describe("independent source health", () => {
  it("keeps stale journeys independent of fresh train positions", () => {
    expect(describeFeedHealth(snapshot(), false, now, "nl").map(item => item.state)).toEqual(["healthy", "stale", "healthy"]);
  });
  it("never shows cached green statuses after a failed health request", () => {
    expect(describeFeedHealth(snapshot(), true, now, "nl").every(item => item.state === "unknown")).toBe(true);
  });
  it("rejects malformed responses and preserves unknown sources", () => {
    expect(parseFeedHealth(null)).toBeNull();
    expect(parseFeedHealth({ sources: {} })?.positions.status).toBe("UNKNOWN");
  });
  it("shows loading before the first response", () => {
    expect(describeFeedHealth(null, false, now, "en").every(item => item.state === "waiting")).toBe(true);
  });
});
