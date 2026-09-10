"use client";

import { useState } from "react";
import type { RailJourney } from "../packages/protocol/journey";
import type { RailObservation } from "../packages/protocol/rail";
import { identifyRollingStock } from "../packages/domain-rail/rolling-stock";

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
function Delay({ seconds }: { seconds: number | null | undefined }) {
  return <span className={seconds != null && seconds > 0 ? "tpLate" : "tpDelay"}>{trainDelay(seconds)}</span>;
}
function FactIcon({ kind }: { kind: "speed" | "clock" | "stop" }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{kind === "clock" ? <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></> : kind === "stop" ? <path d="M5 19V13M10 19V9M15 19V5M20 19V2" /> : <><path d="M4 19a9 9 0 1 1 16 0M12 13l4-5M5 12h2M7 6l1 2M12 4v2M19 12h-2" /><circle cx="12" cy="14" r="1.5" /></>}</svg>;
}

export function TrainPanel({ observation, journey, now, onClose }: { observation: RailObservation; journey: RailJourney | null; now: number; onClose: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const stock = identifyRollingStock(observation.materialNumber);
  const stops = journey?.stops.slice().sort((a, b) => a.order - b.order) ?? [];
  const next = nextTrainStop(stops, now);
  const first = stops[0]; const last = stops.at(-1);
  const arrival = next?.arrival.actualAt ?? next?.departure.actualAt ?? next?.arrival.plannedAt ?? next?.departure.plannedAt;
  const delay = next?.arrival.exactDelaySeconds ?? next?.departure.exactDelaySeconds;
  const track = next?.arrival.actualTrack ?? next?.departure.actualTrack ?? next?.arrival.plannedTrack ?? next?.departure.plannedTrack;
  const category = journey?.trainCategory.name ?? journey?.trainCategory.code ?? "Trein";
  return <aside className="observationPanel trainPanel" aria-label="Treininformatie">
    <header className="tpHeader"><div><h2>{category} {observation.trainNumber}</h2><p>{journey?.operator ?? "Vervoerder onbekend"}<span>·</span>{category}<span>·</span>Trein {observation.trainNumber}</p></div><button type="button" onClick={onClose} aria-label="Sluit treininformatie">×</button></header>
    <div className="tpScroll">
      <div className="tpIllustration"><img src={`/trains/side-${stock.family}.png`} alt={stock.family === "unknown" ? "Illustratief treinzijaanzicht; materieeltype onbekend" : `Zijaanzicht ${stock.label}`} /></div>
      <section className="tpRoute" aria-label="Vertrek en bestemming">
        <div><i /><strong>{first?.station.longName ?? "Vertrekstation onbekend"}</strong><time>{trainClock(first?.departure.actualAt ?? first?.departure.plannedAt)}</time></div>
        <div><i /><strong>{last?.station.longName ?? journey?.destination.actual ?? journey?.destination.planned ?? "Eindbestemming onbekend"}</strong><time>{trainClock(last?.arrival.actualAt ?? last?.arrival.plannedAt)}</time>{last?.arrival.exactDelaySeconds != null && last.arrival.exactDelaySeconds > 0 && <Delay seconds={last.arrival.exactDelaySeconds} />}</div>
      </section>
      <section className="tpFacts" aria-label="Actuele treingegevens">
        <div><FactIcon kind="speed" /><span>Snelheid</span><strong>{observation.speed ? `${Math.round(observation.speed.valueKmh)} km/u` : "—"}</strong></div>
        <div><FactIcon kind="clock" /><span>Vertraging</span><strong><Delay seconds={delay} /></strong></div>
        <div><FactIcon kind="stop" /><span>Volgende halte</span><strong>{next?.station.shortName ?? next?.station.longName ?? "—"}</strong></div>
      </section>
      <section className="tpNext" aria-label="Volgende halte"><span>Volgende halte</span><div><strong>{next?.station.longName ?? "Nog niet bekend"}</strong><b>Spoor {track ?? "—"}</b></div><footer><span>Aankomst (verwacht)</span><time>{trainClock(arrival)}</time><Delay seconds={delay} /></footer></section>
      <section className="tpJourney"><button className="tpJourneyToggle" type="button" aria-expanded={expanded} aria-controls="train-stop-list" onClick={() => setExpanded(value => !value)}>Ritdetails<span aria-hidden="true">{expanded ? "⌄" : "›"}</span></button>
        {expanded && <ol id="train-stop-list">{stops.map(stop => {
          const cancelled = stop.calls.actual === false && stop.calls.planned === true;
          const active = stop === next;
          const time = stop.arrival.actualAt ?? stop.departure.actualAt ?? stop.arrival.plannedAt ?? stop.departure.plannedAt;
          const stopDelay = stop.arrival.exactDelaySeconds ?? stop.departure.exactDelaySeconds;
          const changedTrack = stop.arrival.actualTrack ?? stop.departure.actualTrack;
          const plannedTrack = stop.arrival.plannedTrack ?? stop.departure.plannedTrack;
          return <li key={`${stop.order}-${stop.station.code}`} className={`${active ? "next" : ""} ${cancelled ? "cancelled" : ""}`} aria-current={active ? "step" : undefined}><i /><div><strong>{stop.station.longName}</strong>{cancelled ? <small>Vervalt</small> : changedTrack && plannedTrack && changedTrack !== plannedTrack ? <small>Spoor gewijzigd: {changedTrack}</small> : null}</div><time>{trainClock(time)}</time>{!cancelled && stopDelay != null && stopDelay > 0 && <Delay seconds={stopDelay} />}</li>;
        })}{!stops.length && <li className="tpEmpty">Ritdetails zijn nog niet beschikbaar.</li>}</ol>}
      </section>
    </div>
  </aside>;
}
