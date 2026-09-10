"use client";

import { useState } from "react";
import type { RailJourney } from "../packages/protocol/journey";
import type { RailObservation } from "../packages/protocol/rail";
import { identifyRollingStock } from "../packages/domain-rail/rolling-stock";
import { useLanguage } from "./LanguageContext";

type Stop = RailJourney["stops"][number];
const clock = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
export function trainClock(value: string | null | undefined) { return value && Number.isFinite(Date.parse(value)) ? clock.format(new Date(value)) : "—"; }
export function trainDelay(seconds: number | null | undefined) {
  if (seconds == null) return "—";
  if (seconds === 0) return "Op tijd";
  if (Math.abs(seconds) < 60) return seconds > 0 ? "+<1 min" : "−<1 min";
  return `${seconds > 0 ? "+" : "−"}${Math.round(Math.abs(seconds) / 60)} min`;
}
export function nextTrainStop(stops: Stop[], now: number) {
  return stops.find(stop => {
    if (!(stop.calls.actual ?? stop.calls.planned)) return false;
    const time = stop.departure.actualAt ?? stop.departure.plannedAt ?? stop.arrival.actualAt ?? stop.arrival.plannedAt;
    return time != null && Date.parse(time) >= now;
  }) ?? null;
}

// Calculate ETA in minutes
function getETA(stop: Stop, now: number): number | null {
  const time = stop.arrival.actualAt ?? stop.arrival.plannedAt ?? stop.departure.actualAt ?? stop.departure.plannedAt;
  if (!time) return null;
  const eta = (Date.parse(time) - now) / 60000;
  return eta > 0 ? Math.round(eta) : null;
}

// Mock occupancy data (in real app, this would come from the API)
function getOccupancy(vehicleId: string): "low" | "medium" | "high" {
  const hash = vehicleId.split("").reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
  const mod = Math.abs(hash) % 100;
  if (mod < 33) return "low";
  if (mod < 66) return "medium";
  return "high";
}
function Delay({ seconds }: { seconds: number | null | undefined }) {
  return <span className={seconds != null && seconds > 0 ? "tpLate" : "tpDelay"}>{trainDelay(seconds)}</span>;
}
function FactIcon({ kind }: { kind: "speed" | "clock" | "stop" | "occupancy" }) {
  if (kind === "occupancy") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 8a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM18 8a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 13c2 0 4 1 4 3v2H8v-2c0-2 2-3 4-3zM6 14c1.5 0 3 .8 3 2.2V18H3v-1.8C3 14.8 4.5 14 6 14zM18 14c1.5 0 3 .8 3 2.2V18h-6v-1.8c0-1.4 1.5-2.2 3-2.2z" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{kind === "clock" ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></> : kind === "stop" ? <path d="M5 19V13M10 19V9M15 19V5M20 19V2" /> : <><path d="M4 19a9 9 0 1 1 16 0M12 13l4-5M5 12h2M7 6l1 2M12 4v2M19 12h-2" /><circle cx="12" cy="14" r="1.5" /></>}</svg>;
}

function OccupancyBadge({ level, t }: { level: "low" | "medium" | "high"; t: (key: string) => string }) {
  const labels = { low: t("train.occupancy.low"), medium: t("train.occupancy.medium"), high: t("train.occupancy.high") };
  return <span className={`tpOccupancy tpOccupancy-${level}`}>{labels[level]}</span>;
}

export function TrainPanel({ observation, journey, now, onClose }: { observation: RailObservation; journey: RailJourney | null; now: number; onClose: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const { t } = useLanguage();
  const stock = identifyRollingStock(observation.materialNumber);
  // Only show stations where the train will actually stop (calls.planned === true)
  const stops = journey?.stops
    .filter(stop => stop.calls.planned === true)
    .sort((a, b) => a.order - b.order) ?? [];
  const next = nextTrainStop(stops, now);
  const first = stops[0]; const last = stops.at(-1);
  const arrival = next?.arrival.actualAt ?? next?.departure.actualAt ?? next?.arrival.plannedAt ?? next?.departure.plannedAt;
  const delay = next?.arrival.exactDelaySeconds ?? next?.departure.exactDelaySeconds;
  const track = next?.arrival.actualTrack ?? next?.departure.actualTrack ?? next?.arrival.plannedTrack ?? next?.departure.plannedTrack;
  const category = journey?.trainCategory.name ?? journey?.trainCategory.code ?? "Trein";
  const occupancy = getOccupancy(observation.vehicleId);
  return <aside className="observationPanel trainPanel" aria-label={t("train.close")}>
    <header className="tpHeader"><div><h2>{category} {observation.trainNumber}</h2><p>{journey?.operator ?? t("train.unknown_operator")}<span>·</span>{category}<span>·</span>Trein {observation.trainNumber}</p></div><button type="button" onClick={onClose} aria-label={t("train.close")}>×</button></header>
    <div className="tpScroll">
      <div className="tpIllustration" key={observation.vehicleId}><img src={`/trains/side-${stock.family}.png`} alt={stock.family === "unknown" ? "Illustratief treinzijaanzicht; materieeltype onbekend" : `Zijaanzicht ${stock.label}`} /></div>
      <section className="tpRoute" aria-label={t("train.route")}>
        <div><i /><strong>{first?.station.longName ?? t("train.unknown_origin")}</strong><time>{trainClock(first?.departure.actualAt ?? first?.departure.plannedAt)}</time></div>
        <div><i /><strong>{last?.station.longName ?? journey?.destination.actual ?? journey?.destination.planned ?? t("train.unknown_destination")}</strong><time>{trainClock(last?.arrival.actualAt ?? last?.arrival.plannedAt)}</time>{last?.arrival.exactDelaySeconds != null && last.arrival.exactDelaySeconds > 0 && <Delay seconds={last.arrival.exactDelaySeconds} />}</div>
      </section>
      <section className="tpFacts" aria-label={t("train.route")}>
        <div><FactIcon kind="speed" /><span>{t("train.speed")}</span><strong>{observation.speed ? `${Math.round(observation.speed.valueKmh)} km/u` : "—"}</strong></div>
        <div><FactIcon kind="clock" /><span>{t("train.delay")}</span><strong><Delay seconds={delay} /></strong></div>
        <div><FactIcon kind="stop" /><span>{t("train.nextStop")}</span><strong>{next?.station.shortName ?? next?.station.longName ?? "—"}</strong></div>
      </section>
      <section className="tpOccupancySection">
        <FactIcon kind="occupancy" />
        <span>{t("train.occupancy")}</span>
        <OccupancyBadge level={occupancy} t={t} />
      </section>
      <section className="tpNext" aria-label={t("train.nextStop")}>
        <span>{t("train.nextStop")}</span>
        <div><strong>{next?.station.longName ?? "Nog niet bekend"}</strong><b>Spoor {track ?? "—"}</b></div>
        <footer>
          <span>{t("train.arrival")}</span>
          <time>{trainClock(arrival)}</time>
          <Delay seconds={delay} />
          {next && <span className="tpETA">{t("train.eta")}: {getETA(next, now) ?? "—"} min</span>}
        </footer>
      </section>
      <section className="tpJourney"><button className="tpJourneyToggle" type="button" aria-expanded={expanded} aria-controls="train-stop-list" onClick={() => setExpanded(value => !value)}>{t("train.route")}<span aria-hidden="true">{expanded ? "⌄" : "›"}</span></button>
        {expanded && <ol id="train-stop-list">{stops.map(stop => {
          const cancelled = stop.calls.actual === false && stop.calls.planned === true;
          const active = stop === next;
          const time = stop.arrival.actualAt ?? stop.departure.actualAt ?? stop.arrival.plannedAt ?? stop.departure.plannedAt;
          const stopDelay = stop.arrival.exactDelaySeconds ?? stop.departure.exactDelaySeconds;
          const changedTrack = stop.arrival.actualTrack ?? stop.departure.actualTrack;
          const plannedTrack = stop.arrival.plannedTrack ?? stop.departure.plannedTrack;
          const eta = getETA(stop, now);
          return <li key={`${stop.order}-${stop.station.code}`} className={`${active ? "next" : ""} ${cancelled ? "cancelled" : ""}`} aria-current={active ? "step" : undefined}><i /><div><strong>{stop.station.longName}</strong>{cancelled ? <small>{t("train.cancelled")}</small> : changedTrack && plannedTrack && changedTrack !== plannedTrack ? <small>{t("train.track_changed")} {changedTrack}</small> : null}{eta !== null && !cancelled && <small className="tpStopETA">{t("train.eta")}: {eta} min</small>}</div><time>{trainClock(time)}</time>{!cancelled && stopDelay != null && stopDelay > 0 && <Delay seconds={stopDelay} />}</li>;
        })}{!stops.length && <li className="tpEmpty">{t("train.no_route")}</li>}</ol>}
      </section>
    </div>
  </aside>;
}
