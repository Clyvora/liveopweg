import { describe, expect, it } from "vitest";
import { delayNotificationKey } from "./delay-notification";

describe("delay notification deduplication", () => {
  it("keeps the same key as a delay estimate changes for one stop", () => {
    expect(delayNotificationKey("vehicle-1", "UT", 300, true))
      .toBe(delayNotificationKey("vehicle-1", "UT", 720, true));
  });

  it("only notifies when a train is at least five minutes late and permission is granted", () => {
    expect(delayNotificationKey("vehicle-1", "UT", 299, true)).toBeNull();
    expect(delayNotificationKey("vehicle-1", "UT", 300, false)).toBeNull();
    expect(delayNotificationKey("vehicle-1", "UT", 300, true)).toBe("vehicle-1:UT");
  });

  it("sends a fresh alert for a different train or next stop", () => {
    expect(delayNotificationKey("vehicle-2", "UT", 300, true)).not.toBe("vehicle-1:UT");
    expect(delayNotificationKey("vehicle-1", "ASD", 300, true)).not.toBe("vehicle-1:UT");
  });
});
