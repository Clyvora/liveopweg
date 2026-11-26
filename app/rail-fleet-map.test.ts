import { expect, it } from "vitest";
import type { RailObservation } from "../packages/protocol/rail";
import { fleetMapUpdate } from "./rail-fleet-map";

function train(id: string, longitude: number) {
  return {
    observation: { vehicleId: id, trainNumber: id, materialNumber: "8601", headingDegrees: null } as RailObservation,
    position: { longitude, latitude: 52 },
    stale: false,
  };
}

it("updates only changed, added and removed markers", () => {
  const initial = fleetMapUpdate(new Map(), [train("1", 5), train("2", 5), train("3", 5)], null);
  expect(initial.diff?.add).toHaveLength(3);
  const next = fleetMapUpdate(initial.features, [train("1", 5.1), train("2", 5), train("4", 5)], null);
  expect(next.diff?.update).toEqual([{ id: "1", newGeometry: { type: "Point", coordinates: [5.1, 52] } }]);
  expect(next.diff?.remove).toEqual(["3"]);
  expect(next.diff?.add?.map(feature => feature.id)).toEqual(["4"]);
  expect(fleetMapUpdate(next.features, [train("1", 5.1), train("2", 5), train("4", 5)], null).diff).toBeNull();
});

it("updates selection without replacing stationary geometry", () => {
  const before = fleetMapUpdate(new Map(), [train("1", 5)], null);
  const after = fleetMapUpdate(before.features, [train("1", 5)], "1");
  expect(after.diff?.update?.[0]).not.toHaveProperty("newGeometry");
  expect(after.diff?.update?.[0]?.addOrUpdateProperties).toContainEqual({ key: "selected", value: true });
});

it("keeps the ordinary train icon and hides its heading when the position ages", () => {
  const current = train("1", 5);
  current.observation.headingDegrees = 45;
  const before = fleetMapUpdate(new Map(), [current], null);
  const after = fleetMapUpdate(before.features, [{ ...current, stale: true }], null);
  expect(after.features.get("1")?.properties.icon).toBe(before.features.get("1")?.properties.icon);
  expect(after.features.get("1")?.properties.hasHeading).toBe(false);
  expect(after.diff?.remove).toEqual([]);
  expect(after.diff?.update?.[0]).not.toHaveProperty("newGeometry");
});
