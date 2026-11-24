import type { RailJourney } from "../packages/protocol/journey";
import { parseTimestamp } from "./realtime-url";

const clock = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
export function trainClock(value: string | null | undefined) {
  const parsed = parseTimestamp(value);
  return parsed !== null ? clock.format(new Date(parsed)) : "—";
}

export function nextTrainStop(stops: RailJourney["stops"], now: number) {
  return stops.find(stop => {
    if (stop.calls.actual === false && stop.calls.planned === true) return false;
    if (!(stop.calls.actual ?? stop.calls.planned)) return false;
    const actualDeparture = parseTimestamp(stop.departure.actualAt);
    const expectedDeparture = parseTimestamp(stop.departure.plannedAt);
    const arrival = parseTimestamp(stop.arrival.actualAt ?? stop.arrival.plannedAt);
    // A delayed arrival can move beyond the still-unmodified planned departure.
    const latest = actualDeparture ?? Math.max(expectedDeparture ?? -Infinity, arrival ?? -Infinity);
    return latest >= now;
  }) ?? null;
}

export function stopEvent(stop: RailJourney["stops"][number], now: number) {
  const arrival = parseTimestamp(stop.arrival.actualAt ?? stop.arrival.plannedAt);
  const departure = parseTimestamp(stop.departure.actualAt ?? stop.departure.plannedAt);
  const departing = arrival !== null && arrival < now && departure !== null && departure >= now;
  const event = departing ? stop.departure : stop.arrival;
  const fallback = departing ? stop.arrival : stop.departure;
  return { at: event.actualAt ?? fallback.actualAt ?? event.plannedAt ?? fallback.plannedAt, delay: event.exactDelaySeconds ?? fallback.exactDelaySeconds, track: event.actualTrack ?? fallback.actualTrack ?? event.plannedTrack ?? fallback.plannedTrack, departing };
}

export function minutesUntilStop(stop: RailJourney["stops"][number], now: number): number | null {
  const at = parseTimestamp(stopEvent(stop, now).at);
  return at !== null && at >= now ? Math.ceil((at - now) / 60_000) : null;
}
