import type { RailJourney } from "../packages/protocol/journey";
import { parseTimestamp } from "./realtime-url";

export function nextTrainStop(stops: RailJourney["stops"], now: number) {
  return stops.find(stop => {
    if (stop.calls.actual === false && stop.calls.planned === true) return false;
    if (!(stop.calls.actual ?? stop.calls.planned)) return false;
    const time = stop.departure.actualAt ?? stop.departure.plannedAt ?? stop.arrival.actualAt ?? stop.arrival.plannedAt;
    const parsed = parseTimestamp(time);
    return parsed !== null && parsed >= now;
  }) ?? null;
}
