import type { Feature, FeatureCollection } from "geojson";
import type { DisplayPosition } from "../packages/domain-rail/display-position";
import type { ExpectedRoute } from "../packages/protocol/expected-route";
import type { RailJourney } from "../packages/protocol/journey";
import { trainClock } from "./next-train-stop";

type Stop = RailJourney["stops"][number];
type TrailPoint = DisplayPosition & { at: number };

const trailLifetime = 5 * 60_000;

export function distanceBetweenMeters(first: DisplayPosition, second: DisplayPosition) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function updateTrainTrail(previous: TrailPoint[], point: TrailPoint | null, now: number): TrailPoint[] {
  const oldest = now - trailLifetime;
  const recent = previous[0]?.at < oldest ? previous.filter(sample => sample.at >= oldest) : previous;
  const last = recent.at(-1);
  if (!point || point.at < oldest || (last && point.at <= last.at)) return recent;
  return [...recent.slice(-59), point];
}

export function trainTrailFeatures(points: TrailPoint[]): FeatureCollection {
  const features: Feature[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const seconds = (to.at - from.at) / 1000;
    const metres = distanceBetweenMeters(from, to);
    // Keep gaps and GPS jumps visible as gaps, rather than drawing a shortcut.
    if (seconds > 45 || metres < 10 || metres > Math.min(2_000, 100 * seconds + 80)) continue;
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function trainRouteFeatures(
  route: ExpectedRoute | null, stops: Stop[], nextOrder: number | undefined,
  stations: ReadonlyMap<string, DisplayPosition>, language: string,
): FeatureCollection {
  const features: Feature[] = [];
  if (route?.geometry.coordinates.length && nextOrder !== undefined) {
    features.push({ type: "Feature", properties: { kind: "route" }, geometry: route.geometry });
  }
  for (const stop of stops) {
    if (!(stop.calls.actual ?? stop.calls.planned)) continue;
    const station = stations.get(stop.station.code.toUpperCase());
    if (!station) continue;
    const expectedAt = stop.arrival.actualAt ?? stop.arrival.plannedAt ?? stop.departure.actualAt ?? stop.departure.plannedAt;
    const kind = stop.order === nextOrder ? "next" : expectedAt && (nextOrder === undefined || stop.order < nextOrder) ? "passed" : "stop";
    const prefix = language === "en" ? "Next stop" : "Volgende halte";
    const label = kind === "next" ? `${prefix} · ${stop.station.longName}${expectedAt ? ` · ${trainClock(expectedAt)}` : ""}` : "";
    features.push({ type: "Feature", properties: { kind, label }, geometry: { type: "Point", coordinates: [station.longitude, station.latitude] } });
  }
  return { type: "FeatureCollection", features };
}
