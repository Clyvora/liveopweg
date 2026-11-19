import type { AdviceResponse, RailDisruption } from "../packages/protocol/ns-travel";
import type { FollowedRoute } from "./saved-route";

export function summarizeRoute(route: FollowedRoute, advice: AdviceResponse | null, notices: RailDisruption[], now: number) {
  const stations = new Set([route.originCode, route.destinationCode].map(code => code.toUpperCase()));
  const messages = new Set<string>();
  const departures = new Map<string, {
    key: string; trainNumber: string | null; service: string; station: string;
    plannedAt: string | null; at: string; track: string | null; plannedTrack: string | null; cancelled: boolean;
  }>();
  let latestArrival = now;

  for (const journey of advice?.journeys ?? []) {
    const train = journey.legs.find(leg => leg.mode === "TRAIN");
    const at = train?.origin.actualAt ?? train?.origin.plannedAt;
    if (!train || !at || Date.parse(at) < now) continue;
    const cancelled = journey.cancelled || train.cancelled;
    const key = [train.origin.code ?? train.origin.name, train.trainNumber ?? train.service, train.origin.plannedAt ?? at].join("|");
    const current = departures.get(key);
    if (!current || (current.cancelled && !cancelled)) departures.set(key, {
      key, trainNumber: train.trainNumber, service: train.service, station: train.origin.name,
      plannedAt: train.origin.plannedAt, at, track: train.origin.track, plannedTrack: train.origin.plannedTrack, cancelled,
    });
    for (const leg of journey.legs) {
      if (leg.origin.code) stations.add(leg.origin.code.toUpperCase());
      if (leg.destination.code) stations.add(leg.destination.code.toUpperCase());
      for (const message of leg.messages) messages.add(message);
    }
    for (const message of journey.messages) messages.add(message);
    const end = journey.legs.at(-1)?.destination;
    const arrival = Date.parse(end?.actualAt ?? end?.plannedAt ?? "");
    if (Number.isFinite(arrival)) latestArrival = Math.max(latestArrival, arrival);
  }
  const stationNotices = notices.filter(notice =>
    (!notice.end || Date.parse(notice.end) > now) &&
    (!notice.start || Date.parse(notice.start) <= latestArrival) &&
    notice.stations.some(station => station.code && stations.has(station.code.toUpperCase())),
  );
  return {
    departures: [...departures.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 2),
    messages: [...messages],
    stationNotices,
  };
}
