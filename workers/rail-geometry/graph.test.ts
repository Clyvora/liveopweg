import { describe, expect, it } from "vitest";
import { buildTrackGraph, type PdokFeature } from "./graph.js";

function line(id: string, coordinates: number[][], properties: Record<string, unknown> = {}): PdokFeature {
  return { type: "Feature", id, geometry: { type: "LineString", coordinates }, properties };
}

const meta = {
  importedAt: "2026-08-21T12:00:00Z",
  sourceUpdatedAt: "2026-07-08T11:47:24Z",
  payloadSha256: "a".repeat(64),
  sourceUrl: "https://api.pdok.nl/prorail/spoorwegen/ogc/v1",
};

describe("PDOK track graph", () => {
  it("verbindt gedeelde lijn-eindpunten tot een routeerbare junction", () => {
    const graph = buildTrackGraph([
      line("a", [[5, 52], [5.001, 52]]),
      line("b", [[5.001, 52], [5.002, 52]]),
      line("c", [[5.001, 52], [5.001, 52.001]]),
    ], [], meta);
    expect(graph.edges).toHaveLength(3);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.find((node) => node.degree === 3)?.kind).toBe("JUNCTION");
  });

  it("verbindt geometrische middenkruisingen niet automatisch", () => {
    const graph = buildTrackGraph([
      line("horizontal", [[4.999, 52], [5.001, 52]]),
      line("vertical", [[5, 51.999], [5, 52.001]]),
    ], [], meta);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.some((node) => node.degree > 1)).toBe(false);
  });

  it("markeert een officieel wisselpunt alleen na nabije endpoint-snap", () => {
    const switchFeature = line("switch-1", [[5.001, 52], [5.0011, 52]], { longitude: 5.001, latitude: 52 });
    const graph = buildTrackGraph([line("a", [[5, 52], [5.001, 52]])], [switchFeature], meta);
    expect(graph.stats.switchNodes).toBeGreaterThanOrEqual(1);
    expect(graph.edges.some((edge) => edge.sourceCollection === "wissel")).toBe(true);
    expect(graph.nodes.find((node) => node.kind === "SWITCH")?.sourceSwitchIds).toContain("switch-1");
  });

  it("bouwt een lokale bbox-gridindex voor candidate lookup", () => {
    const graph = buildTrackGraph([line("a", [[5, 52], [5.03, 52.01]])], [], meta);
    expect(Object.keys(graph.spatialIndex.cells).length).toBeGreaterThan(1);
    expect(Object.values(graph.spatialIndex.cells).flat()).toContain(graph.edges[0].id);
  });
});
