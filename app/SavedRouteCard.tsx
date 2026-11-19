"use client";

import { useEffect, useState } from "react";
import type { AdviceResponse, DisruptionsResponse } from "../packages/protocol/ns-travel";
import { AppIcon } from "./Icons";
import { useLanguage } from "./LanguageContext";
import type { FollowedRoute } from "./saved-route";
import { summarizeRoute } from "./saved-route-summary";
import { requestAdvice } from "./travel-api";

const refreshMs = 60_000;
const departureClock = (value: string, en: boolean) => new Date(value).toLocaleTimeString(en ? "en-GB" : "nl-NL", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
});

export function SavedRouteCard({ route, disruptions, noticesUnavailable, liveTrainNumbers, now, onOpenPlanner, onTrain, onNotice }: {
  route: FollowedRoute; disruptions: DisruptionsResponse | null; noticesUnavailable: boolean;
  liveTrainNumbers: ReadonlySet<string>; now: number; onOpenPlanner: () => void;
  onTrain: (trainNumber: string) => void; onNotice: (id: string) => void;
}) {
  const { language } = useLanguage();
  const en = language === "en";
  const [advice, setAdvice] = useState<AdviceResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { originCode, destinationCode } = route;

  useEffect(() => {
    let current: AbortController | null = null;
    let lastStarted = 0;
    const refresh = () => {
      if (document.hidden || current || Date.now() - lastStarted < refreshMs) return;
      const controller = new AbortController();
      current = controller;
      lastStarted = Date.now();
      void requestAdvice(originCode, destinationCode, null, language, controller.signal)
        .then(value => { if (!controller.signal.aborted) { setAdvice(value); setFailed(false); } })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); })
        .finally(() => { if (current === controller) current = null; });
    };
    const onVisibility = () => {
      if (document.hidden && current) { current.abort(); current = null; lastStarted = 0; }
      else refresh();
    };
    refresh();
    const timer = window.setInterval(refresh, refreshMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { current?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [attempt, destinationCode, language, originCode]);

  const { departures, messages, stationNotices } = summarizeRoute(route, advice, disruptions?.disruptions ?? [], now);
  const latestAdvice = advice && !failed && now - Date.parse(advice.fetchedAt) < 2 * refreshMs;
  const notice = stationNotices[0];
  return <section className="savedCommute" aria-label={en ? "Saved route" : "Bewaarde route"}>
    <button type="button" className="savedCommuteHeader" onClick={onOpenPlanner} aria-label={en ? "Open saved route" : "Open gevolgde route"}>
      <AppIcon name="train" />
      <span><small>{en ? "Saved route" : "Bewaarde route"}</small><strong>{route.originName} → {route.destinationName}</strong></span>
      <span className="savedCommuteArrow" aria-hidden="true">›</span>
    </button>
    <div className="savedCommuteContent" aria-busy={!advice && !failed}>
      {!advice && !failed && <p role="status">{en ? "Loading departures…" : "Vertrektijden ophalen…"}</p>}
      {failed && <p role="status">{advice ? (en ? "Showing earlier advice." : "Eerder reisadvies wordt getoond.") : (en ? "Departures unavailable." : "Vertrektijden niet beschikbaar.")} <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{en ? "Retry" : "Opnieuw"}</button></p>}
      {advice && !failed && !departures.length && <p>{en ? "No upcoming departures found." : "Geen volgende vertrekken gevonden."}</p>}
      {departures.length > 0 && <ul className="savedCommuteDepartures">{departures.map(departure => {
        const changed = departure.track && departure.plannedTrack && departure.track !== departure.plannedTrack;
        const onRadar = latestAdvice && !departure.cancelled && departure.trainNumber && liveTrainNumbers.has(departure.trainNumber);
        const info = <><time dateTime={departure.at}>{departureClock(departure.at, en)}</time><span>{departure.service}{departure.station !== route.originName && <small>{departure.station}</small>}</span><small className={changed || departure.cancelled ? "savedCommuteChange" : undefined}>{departure.cancelled ? (en ? "Cancelled" : "Vervalt") : departure.track ? `${en ? "Platform" : "Spoor"} ${changed ? `${departure.plannedTrack} → ` : ""}${departure.track}` : (en ? "No platform yet" : "Spoor onbekend")}</small></>;
        return <li key={departure.key}>{onRadar ? <button type="button" onClick={() => onTrain(departure.trainNumber!)} title={en ? "View train on radar" : "Bekijk trein op radar"}>{info}<span aria-hidden="true">›</span></button> : <div>{info}</div>}</li>;
      })}</ul>}
      {messages[0] && <p className="savedCommuteAdvice"><AppIcon name="alert" />{messages[0]}</p>}
      {notice && <button className="savedCommuteNotice" type="button" onClick={() => onNotice(notice.id)}><AppIcon name="alert" /><span><small>{noticesUnavailable || disruptions?.stale ? (en ? "Earlier station alert" : "Eerdere stationsmelding") : (en ? "Alert at a station on this route" : "Melding bij een station op je route")}</small>{notice.title}</span><span aria-hidden="true">›</span></button>}
    </div>
  </section>;
}
