import type { Map as RadarMap } from "maplibre-gl";
import { expect, it, vi } from "vitest";
import { bindRailMapDetail } from "./rail-map-detail";

const overview = "rail-overview";
const detail = "pdok-rail-geometry-lines";

function railMapFixture() {
  const visibility = new Map<string, string>([[overview, "visible"], [detail, "none"]]);
  const mapEvents = new Map<string, () => void>();
  const sourceEvents = new Map<string, (data: { sourceDataType?: string }) => void>();
  let zoom = 6;
  let tilesReady = false;
  let response: "tracks" | "empty" | "error" = "tracks";
  const source = {
    on: (name: string, handler: (data: { sourceDataType?: string }) => void) => sourceEvents.set(name, handler),
    off: (name: string) => sourceEvents.delete(name),
    setData: vi.fn(async () => {
      if (response === "error") sourceEvents.get("error")?.({});
      else sourceEvents.get("data")?.({ sourceDataType: "content" });
    }),
    getData: vi.fn(async () => ({
      type: "FeatureCollection",
      features: response === "tracks" ? [{ geometry: { type: "LineString" } }] : [],
    })),
  };
  const map = {
    getSource: () => source,
    getZoom: () => zoom,
    isSourceLoaded: () => tilesReady,
    getLayer: (id: string) => visibility.has(id),
    getLayoutProperty: (id: string) => visibility.get(id),
    setLayoutProperty: (id: string, _property: string, value: string) => visibility.set(id, value),
    on: (name: string, handler: () => void) => mapEvents.set(name, handler),
    off: (name: string) => mapEvents.delete(name),
  };
  const control = bindRailMapDetail(map as unknown as RadarMap, "/v1/geometry/rail");
  control.setVisible(true);
  return {
    control, source, visibility,
    respond(value: typeof response) { response = value; },
    zoomTo(value: number) { zoom = value; mapEvents.get("zoom")?.(); },
    renderTiles() { tilesReady = true; mapEvents.get("idle")?.(); },
  };
}

it("keeps the overview until the detailed rails have been drawn", async () => {
  const fixture = railMapFixture();
  expect(fixture.source.setData).not.toHaveBeenCalled();
  fixture.zoomTo(9);
  expect(fixture.visibility.get(overview)).toBe("visible");
  await vi.waitFor(() => expect(fixture.visibility.get(detail)).toBe("visible"));
  expect(fixture.visibility.get(overview)).toBe("visible");
  fixture.renderTiles();
  expect(fixture.visibility.get(overview)).toBe("none");
  fixture.zoomTo(7);
  expect(fixture.visibility.get(overview)).toBe("visible");
  fixture.control.setVisible(false);
  expect(fixture.visibility.get(overview)).toBe("none");
});

it.each(["empty", "error"] as const)("retains the overview for %s detail and retries on re-entry", async response => {
  const fixture = railMapFixture();
  fixture.respond(response);
  fixture.zoomTo(9);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(fixture.visibility.get(overview)).toBe("visible");
  expect(fixture.visibility.get(detail)).toBe("none");
  fixture.respond("tracks");
  fixture.zoomTo(7);
  fixture.zoomTo(9);
  await vi.waitFor(() => expect(fixture.visibility.get(detail)).toBe("visible"));
  expect(fixture.source.setData).toHaveBeenCalledTimes(2);
});
