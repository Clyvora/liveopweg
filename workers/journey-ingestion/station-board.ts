import type { RailJourney } from "../../packages/protocol/journey.js";
import type { RailObservation } from "../../packages/protocol/rail.js";
import type { StationBoard, StationBoardEntry } from "../../packages/protocol/station.js";
import { identifyRollingStock } from "../../packages/domain-rail/rolling-stock.js";
import { localServiceDate } from "./live-state.js";

export function buildStationBoard(
  stationCode: string,
  journeys: Iterable<RailJourney>,
  fleet: RailObservation[],
  now = new Date(),
  source: { healthy: boolean; lastReceivedAt: string | null } = { healthy: false, lastReceivedAt: null },
): StationBoard {
  const time = now.valueOf();
  const code = stationCode.toUpperCase();
  const vehicles = new Map<string, RailObservation>();
  for (const vehicle of fleet) {
    const measuredAt = vehicle.time.sourceMeasuredAt;
    if (!measuredAt || time - Date.parse(measuredAt) > 120_000 || Date.parse(measuredAt) > time + 30_000) continue;
    const key = `${localServiceDate(measuredAt)}:${vehicle.trainNumber}`;
    const previous = vehicles.get(key);
    if (!previous || measuredAt > previous.time.sourceMeasuredAt!) vehicles.set(key, vehicle);
  }
  const departures = new Map<string, StationBoardEntry>();
  const arrivals = new Map<string, StationBoardEntry>();
  for (const journey of journeys) {
    if (Date.parse(journey.product.validUntil) < time) continue;
    const vehicle = vehicles.get(`${journey.serviceDate}:${journey.trainNumber}`);
    for (const stop of journey.stops) {
      if (stop.station.code.toUpperCase() !== code || (stop.calls.actual !== true && stop.calls.planned !== true)) continue;
      const cancelled = stop.calls.actual === false && stop.calls.planned === true;
      for (const kind of ["departure", "arrival"] as const) {
        const event = stop[kind];
        const expectedAt = cancelled ? event.plannedAt : event.actualAt ?? event.plannedAt;
        if (!expectedAt || Date.parse(expectedAt) < time || Date.parse(expectedAt) > time + 60 * 60_000) continue;
        const delaySeconds = event.exactDelaySeconds ?? (event.actualAt && event.plannedAt
          ? Math.round((Date.parse(event.actualAt) - Date.parse(event.plannedAt)) / 1_000) : null);
        const id = `${journey.journeyId}:${kind}:${event.plannedAt ?? expectedAt}`;
        const entry: StationBoardEntry = {
          id,
          trainNumber: journey.trainNumber,
          serviceDate: journey.serviceDate,
          direction: kind === "arrival" ? journey.stops[0].station.longName
            : stop.destination.actual ?? stop.destination.planned ?? journey.destination.actual ?? journey.destination.planned ?? "Onbekend",
          operator: journey.operator,
          serviceType: journey.trainCategory.name ?? journey.trainCategory.code ?? "Trein",
          plannedAt: event.plannedAt,
          expectedAt,
          timeBasis: event.actualAt && !cancelled ? "UPDATED" : "PLANNED",
          delaySeconds: cancelled ? null : delaySeconds,
          track: cancelled ? null : event.actualTrack ?? event.plannedTrack,
          plannedTrack: event.plannedTrack,
          trackChanged: !cancelled && Boolean(event.actualTrack && event.plannedTrack && event.actualTrack !== event.plannedTrack),
          cancelled,
          vehicleId: !cancelled && vehicle ? vehicle.vehicleId : null,
          rollingStock: vehicle ? identifyRollingStock(vehicle.materialNumber).label : null,
        };
        (kind === "departure" ? departures : arrivals).set(id, entry);
      }
    }
  }
  const sort = (entries: Map<string, StationBoardEntry>) => [...entries.values()]
    .sort((a, b) => Date.parse(a.expectedAt) - Date.parse(b.expectedAt) || a.trainNumber.localeCompare(b.trainNumber, "nl", { numeric: true }));
  const lastReceived = source.lastReceivedAt ? Date.parse(source.lastReceivedAt) : 0;
  return {
    stationCode: code,
    generatedAt: now.toISOString(),
    lastReceivedAt: source.lastReceivedAt,
    sourceHealthy: source.healthy && time - lastReceived < 120_000,
    coverage: "RECEIVED_JOURNEYS",
    windowMinutes: 60,
    departures: sort(departures),
    arrivals: sort(arrivals),
  };
}
