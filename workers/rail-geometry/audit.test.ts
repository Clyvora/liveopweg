import { describe, expect, it } from "vitest";
import { auditTrackGraph, auditZoneId } from "./audit.js";
import { buildTrackGraph, type PdokFeature } from "./graph.js";

function line(id: string, coordinates: number[][]): PdokFeature {
  return { type: "Feature", id, geometry: { type: "LineString", coordinates }, properties: {} };
}

function graph(lines: PdokFeature[]) {
  return buildTrackGraph(lines, [], {
    importedAt: "2026-08-21T00:00:00.000Z",
    sourceUpdatedAt: null,
    payloadSha256: "a".repeat(64),
    sourceUrl: "https://api.pdok.nl/prorail/spoorwegen/ogc/v1",
  });
}

describe("rail graph audit", () => {
  it("markeert een zeer dunne regio als SPARSE en verbiedt fallback", () => {
    const report = auditTrackGraph(graph([line("single", [[5, 52], [5.01, 52]])]));
    const zone = report.zones[auditZoneId(5, 52)];
    expect(zone.quality).toBe("SPARSE");
    expect(zone.fallbackAllowed).toBe(false);
  });

  it("rapporteert korte edges en kleine componenten zonder de graph te wijzigen", () => {
    const source = graph([line("tiny", [[5, 52], [5.000001, 52]])]);
    const report = auditTrackGraph(source);
    expect(report.stats.shortEdges).toBe(1);
    expect(report.stats.smallComponents).toBe(1);
    expect(source.edges).toHaveLength(1);
  });

  it("geeft een dicht, verbonden gebied zonder anomalieën een veilige fallback", () => {
    const source = graph([
      line("a", [[5, 52], [5.01, 52]]),
      line("b", [[5.01, 52], [5.02, 52]]),
      line("c", [[5.02, 52], [5.03, 52]]),
      line("d", [[5.03, 52], [5.04, 52]]),
      line("e", [[5.04, 52], [5.05, 52]]),
      line("f", [[5.05, 52], [5.06, 52]]),
    ]);
    const zone = auditTrackGraph(source).zones[auditZoneId(5.02, 52)];
    expect(zone.quality).toBe("NORMAL");
    expect(zone.fallbackAllowed).toBe(true);
  });
});
