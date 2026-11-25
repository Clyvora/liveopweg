"use client";

import { useRef, useState } from "react";
import type { RailJourney } from "../packages/protocol/journey";
import type { RailObservation } from "../packages/protocol/rail";
import { identifyRollingStock, rollingStockLabel } from "../packages/domain-rail/rolling-stock";
import { useLanguage } from "./LanguageContext";
import { AppIcon } from "./Icons";
import { TrainFormation } from "./TrainFormation";
import { TrainImage } from "./TrainImage";
import { measurementTime, observationIsStale } from "../packages/domain-rail/position-quality";
import { usePanelNow } from "./usePanelNow";

type Stop = RailJourney["stops"][number];
export function trainDelay(seconds: number | null | undefined, language = "nl") {
  if (seconds == null) return "—";
  if (seconds === 0) return language === "en" ? "On time" : "Op tijd";
  if (Math.abs(seconds) < 60) return seconds > 0 ? "+<1 min" : "−<1 min";
  return `${seconds > 0 ? "+" : "−"}${Math.round(Math.abs(seconds) / 60)} min`;
}
export { nextTrainStop, trainClock } from "./next-train-stop";
import { nextTrainStop, stopEvent, minutesUntilStop, trainClock } from "./next-train-stop";

// Calculate ETA in minutes
function getETA(stop: Stop, now: number): number | null {
  return minutesUntilStop(stop, now);
}

function Delay({ seconds }: { seconds: number | null | undefined }) {
  const { language } = useLanguage();
  return <span className={seconds != null && seconds > 0 ? "tpLate" : "tpDelay"}>{trainDelay(seconds, language)}</span>;
}

export function TrainPanel({ observation, journey, now:initialNow, onClose, isFollowing, canFollow:canFollowFromMap, onToggleFollow, units, positionMatched, showExpectedRoute, showRecentTrail }: { observation: RailObservation; journey: RailJourney | null; now: number; positionMatched?: boolean; units?: RailObservation[]; showExpectedRoute?: boolean; showRecentTrail?: boolean; onClose: () => void; isFollowing: boolean; canFollow: boolean; onToggleFollow: () => void }) {
  const now = usePanelNow(initialNow);
  const [expanded, setExpanded] = useState(true);
  const [shareMessage, setShareMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const routeSection = useRef<HTMLElement>(null);
  const { t, language } = useLanguage();
  const en = language === "en";
  const measuredAt = measurementTime(observation);
  const positionStale = observationIsStale(observation,now);
  const canFollow = canFollowFromMap && !positionStale;
  const age = measuredAt === null ? null : Math.max(0,Math.floor((now-measuredAt)/1000));
  const stock = identifyRollingStock(observation.materialNumber);
  const stockLabel = rollingStockLabel(stock,language);
  // Include added stops as well as planned ones; cancelled stops remain visible in the timeline.
  const stops = journey?.stops
    .filter(stop => stop.calls.planned || stop.calls.actual)
    .sort((a, b) => a.order - b.order) ?? [];
  const next = nextTrainStop(stops, now);
  const last = stops.at(-1);
  const event = next ? stopEvent(next, now) : null;
  const arrival = event?.at;
  const delay = event?.delay;
  const track = event?.track;
  const journeyStale = journey?.product?.validUntil ? Date.parse(journey.product.validUntil) < now : false;
  const category = journey?.trainCategory.name ?? journey?.trainCategory.code ?? (language === "en" ? "Train" : "Trein");
  const categoryCode = journey?.trainCategory.code;
  const destination = journey?.destination.actual ?? journey?.destination.planned ?? last?.station.longName;
  const share = async () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("train", observation.trainNumber);
    try {
      if (navigator.share) await navigator.share({ title: `${category} ${observation.trainNumber}`, url: url.href });
      else { await navigator.clipboard.writeText(url.href); setShareMessage(en ? "Link copied" : "Link gekopieerd"); }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareUrl(url.href);
      setShareMessage(en ? "Copy this link to share the train." : "Kopieer deze link om de trein te delen.");
    }
  };
  return <aside className="observationPanel trainPanel" aria-label={`${category} ${observation.trainNumber}`}>
    <header className="tpHeader"><h2>{categoryCode ? `${categoryCode} ` : `${t("train.number")} `}{observation.trainNumber}</h2><span>{category}</span><button className="tpCloseButton" type="button" onClick={onClose} aria-label={t("train.close")}><AppIcon name="close" /></button></header>
    <div className="tpScroll">
      <div className="tpDestination"><h3>{destination ?? t("train.unknown_destination")}</h3>{next && next.station.longName !== destination && <p>via {next.station.longName}</p>}</div>
      {!canFollow && <p className="uiNotice" role="status">{language === "en" ? "No current live position is available. Previously received train details remain accessible." : "Er is geen actuele livepositie beschikbaar. Eerder ontvangen treininformatie blijft beschikbaar."}</p>}
      {journeyStale && <p className="uiNotice" role="status">{language === "en" ? "These stop times may be out of date." : "Deze haltetijden kunnen verouderd zijn."}</p>}
      <div className="tpStock">
        <div className="tpIllustration" key={observation.vehicleId}>
          <TrainImage model={stock.confidence === "UNKNOWN" ? null : stockLabel} operator={journey?.operator} material={observation.materialNumber} trainNumber={observation.trainNumber} />
        </div>
        <div className="tpStockCaption">{stockLabel}{observation.materialNumber ? ` · ${observation.materialNumber}` : ""}{units && units.length>1 ? ` · ${units.length} ${en?"coupled units":"gekoppelde stellen"}` : ""}{journey?.operator ? ` · ${journey.operator}` : ""}</div>
        <TrainFormation units={units?.length ? units : [observation]} now={now} />
      </div>
      <section className="tpFacts" aria-label={t("train.route")}>
        <div aria-label={t("train.speed")}><strong>{observation.speed && !positionStale ? `${Math.round(observation.speed.valueKmh)} ${en ? "km/h" : "km/u"}` : "—"}</strong></div>
        <div aria-label={t("train.delay")}><strong><Delay seconds={delay} /></strong></div>
        <div><strong>{en ? "Platform" : "Spoor"} {track ?? "—"}</strong></div>
      </section>
      <p className="tpPositionNote">{positionStale ? (en ? "Position out of date" : "Positie verouderd") : (positionMatched === false ? (en ? "Position may be imprecise" : "Positie kan afwijken") : (en ? "Last measured position" : "Laatst gemeten positie"))}{age===null ? (en ? " · time unknown" : " · tijdstip onbekend") : ` · ${age<60 ? `${age} s` : `${Math.floor(age/60)} min`} ${en?"ago":"geleden"}`}</p>
      <section className="tpNext" aria-label={t("train.nextStop")}>
        <span>{t("train.nextStop")}</span>
        <div><strong>{next?.station.longName ?? (language === "en" ? "Not yet known" : "Nog niet bekend")}</strong><b aria-label={`${en ? "Platform" : "Spoor"} ${track ?? "—"}`}>{track ?? "—"}</b></div>
        <footer>
          {event?.departing && <span>{en ? "Departure" : "Vertrek"}</span>}
          <time>{trainClock(arrival)}</time>
          {next && (() => { const e = getETA(next, now); return e === null ? null : e <= 0 ? <span className="tpETA">· {event?.departing ? (en ? "at station" : "op het station") : t("train.arrived")}</span> : <span className="tpETA">· {en ? "in" : "over"} {e} min</span>; })()}
        </footer>
      </section>
      {(showExpectedRoute || showRecentTrail) && <ul className="tpRouteLegend" aria-label={en ? "Route on the map" : "Route op de kaart"}>
        {showExpectedRoute && <li className="tpExpectedKey">{en ? "Expected route" : "Verwachte route"}</li>}
        {showRecentTrail && <li className="tpRecentKey">{en ? "Recent live positions" : "Recente liveposities"}</li>}
      </ul>}
      <section className="tpJourney" ref={routeSection} tabIndex={-1}><button className="tpJourneyToggle" type="button" aria-expanded={expanded} aria-controls="train-stop-list" onClick={() => setExpanded(value => !value)}>Route<span aria-hidden="true">{expanded ? "⌄" : "›"}</span></button>
        {expanded && <ol id="train-stop-list">{stops.map(stop => {
          const cancelled = stop.calls.actual === false && stop.calls.planned === true;
          const active = stop === next;
          const time = stop.arrival.actualAt ?? stop.departure.actualAt ?? stop.arrival.plannedAt ?? stop.departure.plannedAt;
          const stopDelay = stop.arrival.exactDelaySeconds ?? stop.departure.exactDelaySeconds;
          const changedTrack = stop.arrival.actualTrack ?? stop.departure.actualTrack;
          const plannedTrack = stop.arrival.plannedTrack ?? stop.departure.plannedTrack;
          const passed = next ? stop.order < next.order : true;
          return <li key={`${stop.order}-${stop.station.code}`} className={`${active ? "next" : ""} ${cancelled ? "cancelled" : ""} ${passed ? "passed" : ""}`} aria-current={active ? "step" : undefined}><i aria-hidden="true" /><time>{trainClock(time)}</time><div><strong>{stop.station.longName}</strong>{cancelled ? <small>{t("train.cancelled")}</small> : changedTrack && plannedTrack && changedTrack !== plannedTrack ? <small>{t("train.track_changed")} {changedTrack}</small> : null}{!cancelled && !passed && stopDelay != null && stopDelay > 0 && <small><Delay seconds={stopDelay} /></small>}</div><span className="tpStopTrack">{en ? "Platform" : "Spoor"} {changedTrack ?? plannedTrack ?? "—"}</span></li>;
        })}{!stops.length && <li className="tpEmpty">{t("train.no_route")}</li>}</ol>}
      </section>

    </div>
      <footer className="tpFooter"><button className={`tpFollowButton ${isFollowing ? "active" : ""}`} type="button" aria-pressed={isFollowing} aria-label={!canFollow ? (en ? "Live position unavailable" : "Live treinpositie niet beschikbaar") : isFollowing ? (en ? "Stop following train" : "Stop met trein volgen") : (en ? "Follow train on map" : "Volg trein op de kaart")} disabled={!canFollow} onClick={onToggleFollow}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" /></svg>{!canFollow ? (en ? "No live position" : "Geen live positie") : isFollowing ? (en ? "Following" : "Volgen actief") : (en ? "Follow train" : "Trein volgen")}</button>
        <div className="tpSecondaryActions">
          <button type="button" aria-label={en ? "Share" : "Delen"} onClick={share}><AppIcon name="share" /><span>{en ? "Share" : "Delen"}</span></button>
          <button type="button" aria-label={en ? "Timetable" : "Dienstregeling"} onClick={() => { setExpanded(true); routeSection.current?.scrollIntoView({ block:"start", behavior:"smooth" }); routeSection.current?.focus({ preventScroll:true }); }}><AppIcon name="calendar" /><span>{en ? "Timetable" : "Dienstregeling"}</span></button>
        </div>
        {shareMessage && <p role="status">{shareMessage}</p>}{shareUrl && <input className="tpShareUrl" aria-label={en ? "Train link" : "Treinlink"} value={shareUrl} readOnly onFocus={event => event.target.select()} />}
      </footer>
  </aside>;
}
