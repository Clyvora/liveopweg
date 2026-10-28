"use client";
import { useEffect, useRef, useState } from "react";
import type { RailStation } from "../packages/domain-rail/stations";
import type { AdviceResponse, AdviceLeg } from "../packages/protocol/ns-travel";
import { useLanguage } from "./LanguageContext";
import { requestAdvice } from "./travel-api";
import { StationPicker } from "./StationPicker";
import { useFavoriteStations } from "./useFavoriteStations";
export type FollowedRoute = { originCode: string; originName: string; destinationCode: string; destinationName: string };
const routeKey = "liveopweg-followed-route";
export type PlannerMemory = Map<string, { from: string; to: string; when: string; results: AdviceResponse | null; expanded: string | null }>;
export function JourneyPlanner({ stations, route, onRouteChange, onClose, liveTrainNumbers, onSelectTrain, memory }: { stations: RailStation[]; route: FollowedRoute | null; onRouteChange: (route: FollowedRoute | null) => void; onClose: () => void; liveTrainNumbers: ReadonlySet<string>; onSelectTrain: (trainNumber: string) => void; memory: PlannerMemory }) {
  const { language } = useLanguage(); const en = language === "en";
  const draft = memory.get("planner");
  const [from, setFrom] = useState(draft?.from ?? route?.originName ?? ""); const [to, setTo] = useState(draft?.to ?? route?.destinationName ?? "");
  const [when, setWhen] = useState(draft?.when ?? ""); const [results, setResults] = useState<AdviceResponse | null>(draft?.results ?? null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(false); const [storageError, setStorageError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(draft?.expanded ?? null);
  const [hasDraft] = useState(draft?.from !== undefined);
  useEffect(() => { memory.set("planner", { from, to, when, results, expanded }); }, [memory, from, to, when, results, expanded]);
  const { favorites } = useFavoriteStations();
  const request = useRef<AbortController | null>(null); const sequence = useRef(0);
  const origin = stations.find(s => s.name.toLocaleLowerCase() === from.trim().toLocaleLowerCase() || s.code === from.trim().toUpperCase());
  const destination = stations.find(s => s.name.toLocaleLowerCase() === to.trim().toLocaleLowerCase() || s.code === to.trim().toUpperCase());
  const valid = origin && destination && origin.code !== destination.code;
  const clock = (value: string | null) => value ? new Date(value).toLocaleTimeString(en ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "—";
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (route || hasDraft) return;
      try {
        const value: unknown = JSON.parse(localStorage.getItem(routeKey) ?? "null");
        if (value && typeof value === "object" && "originCode" in value && "destinationCode" in value) {
          const a = stations.find(s => s.code === value.originCode), b = stations.find(s => s.code === value.destinationCode);
          if (a && b && a.code !== b.code) { setFrom(a.name); setTo(b.name); onRouteChange({ originCode: a.code, originName: a.name, destinationCode: b.code, destinationName: b.name }); }
        }
      } catch { /* Ignore invalid saved routes. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [route, stations, onRouteChange, hasDraft]);
  useEffect(() => () => { sequence.current++; request.current?.abort(); }, []);
  const invalidate = () => { sequence.current++; request.current?.abort(); setLoading(false); setError(false); setResults(null); };
  const search = async () => {
    if (!valid) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const version = ++sequence.current; setLoading(true); setError(false); setResults(null);
    try {
      const value = await requestAdvice(origin.code, destination.code, when ? new Date(when).toISOString() : null, language, controller.signal);
      if (!controller.signal.aborted && version === sequence.current) { setResults(value); setExpanded(value.journeys[0]?.id ?? null); }
    } catch { if (!controller.signal.aborted && version === sequence.current) setError(true); }
    finally { if (version === sequence.current) setLoading(false); }
  };
  const platform = (point: AdviceLeg["origin"]) => point.track ? ` · ${en ? "Platform" : "Spoor"} ${point.plannedTrack && point.plannedTrack !== point.track ? `${point.plannedTrack} → ` : ""}${point.track}` : "";
  const transfer = (previous: AdviceLeg, next: AdviceLeg) => {
    const arrival = previous.destination.actualAt ?? previous.destination.plannedAt;
    const departure = next.origin.actualAt ?? next.origin.plannedAt;
    const minutes = arrival && departure ? Math.round((Date.parse(departure) - Date.parse(arrival)) / 60_000) : null;
    return `${en ? "Change at" : "Overstappen in"} ${next.origin.name}${minutes !== null && minutes >= 0 ? ` · ${minutes} min` : ""}`;
  };
  const save = () => {
    if (!valid) return;
    const value = { originCode: origin.code, originName: origin.name, destinationCode: destination.code, destinationName: destination.name };
    try { localStorage.setItem(routeKey, JSON.stringify(value)); setStorageError(false); } catch { setStorageError(true); }
    onRouteChange(value);
  };
  return <aside className="journeyPlannerPanel uiPanel" aria-label={en ? "Journey planner" : "Reisplanner"}>
    <header className="uiPanelHeader"><div><span className="radarEyebrow">LIVEOPWEG</span><h2>{en ? "Plan your journey" : "Plan je reis"}</h2></div><button className="radarClose" onClick={onClose} aria-label={en ? "Close journey planner" : "Sluit reisplanner"}>×</button></header>
    <p>{en ? "Train journeys and official replacement transport, advised by NS." : "Treinreizen en officieel vervangend vervoer, geadviseerd door NS."}</p>
    <form onSubmit={event => { event.preventDefault(); void search(); }}>
      <StationPicker stations={stations} value={from} label={en ? "From" : "Van"} onChange={value => { invalidate(); setFrom(value); }} />
      <button className="uiSwap" type="button" onClick={() => { invalidate(); setFrom(to); setTo(from); }} aria-label={en ? "Swap stations" : "Stations omwisselen"}>⇅</button>
      <StationPicker stations={stations} value={to} label={en ? "To" : "Naar"} onChange={value => { invalidate(); setTo(value); }} />
      <label className="uiField">{en ? "Departure" : "Vertrek"}<input type="datetime-local" value={when} onChange={event => { invalidate(); setWhen(event.target.value); }} /></label><small>{when ? (en ? "Time in your device’s timezone." : "Tijd in de tijdzone van je apparaat.") : (en ? "Leave now. Set a time to plan ahead." : "Vertrek nu. Kies een tijd om vooruit te plannen.")}</small>
      <div className="uiActions"><button className="radarPrimary" disabled={!valid || loading}>{loading ? (en ? "Searching…" : "Zoeken…") : (en ? "Find journeys" : "Zoek reizen")}</button><button type="button" disabled={!valid} onClick={save}>{en ? "Save route" : "Route bewaren"}</button></div>
    </form>
    {route && <div className="uiSavedRoute"><span>{route.originName} → {route.destinationName}</span><button onClick={() => { try { localStorage.removeItem(routeKey); setStorageError(false); } catch { setStorageError(true); } onRouteChange(null); }}>{en ? "Remove" : "Verwijderen"}</button></div>}
    {storageError && <p role="status">{en ? "Your browser could not save this route." : "Je browser kon deze route niet bewaren."}</p>}
    {favorites.length > 0 && <div className="uiFavoriteChips">{stations.filter(s => favorites.includes(s.code)).map(s => <button key={s.code} onClick={() => { invalidate(); if (!origin) setFrom(s.name); else setTo(s.name); }}>{s.name} ★</button>)}</div>}
    {error && <div className="uiNotice" role="alert"><p>{en ? "Journey advice is temporarily unavailable. Please try again." : "Reisadviezen zijn tijdelijk niet beschikbaar. Probeer het opnieuw."}</p><button onClick={() => void search()}>{en ? "Try again" : "Opnieuw proberen"}</button></div>}
    {results && !results.journeys.length && <p role="status">{en ? "No journeys found for this time and route." : "Geen reizen gevonden voor deze route en dit tijdstip."}</p>}
    <div className="uiAdviceResults">{results?.journeys.map(journey => <article key={journey.id} className={`uiAdvice ${journey.cancelled ? "cancelled" : ""}`}>
      <button className="uiResultButton" aria-expanded={expanded === journey.id} onClick={() => setExpanded(expanded === journey.id ? null : journey.id)}><strong>{clock(journey.legs[0]!.origin.actualAt ?? journey.legs[0]!.origin.plannedAt)} → {clock(journey.legs.at(-1)!.destination.actualAt ?? journey.legs.at(-1)!.destination.plannedAt)}</strong><span>{journey.durationMinutes !== null ? `${journey.durationMinutes} min · ` : ""}{journey.transfers} {en ? "changes" : "overstappen"}{journey.cancelled ? (en ? " · Cancelled" : " · Vervalt") : ""}</span></button>
      {expanded === journey.id && <div className="uiResultDetail">{journey.messages.map((message, i) => <p key={i} className="uiNotice">{message}</p>)}{journey.legs.map((leg, index) => <section key={leg.id} className="uiAdviceLeg">{index > 0 && <p className="uiTransfer">{transfer(journey.legs[index - 1]!, leg)}</p>}<strong>{leg.mode === "WALK" ? (en ? "Walk" : "Lopen") : leg.service} {leg.trainNumber}</strong>{leg.cancelled && <span className="tpLate">{en ? "Cancelled" : "Vervalt"}</span>}<p>{clock(leg.origin.actualAt ?? leg.origin.plannedAt)} · {leg.origin.name}{platform(leg.origin)}</p><p>{clock(leg.destination.actualAt ?? leg.destination.plannedAt)} · {leg.destination.name}{platform(leg.destination)}</p>{leg.messages.map((message, i) => <p key={i}>{message}</p>)}{leg.mode === "TRAIN" && leg.trainNumber && liveTrainNumbers.has(leg.trainNumber) && !leg.cancelled && <button onClick={() => onSelectTrain(leg.trainNumber!)}>{en ? "View train on radar" : "Bekijk trein op radar"}</button>}</section>)}</div>}
    </article>)}</div>
    <small className="uiSourceNote">{results ? `${en ? "Journey advice" : "Reisadvies"}: NS · ${clock(results.fetchedAt)}` : (en ? "Travel information may change. Check your journey before departure." : "Reisinformatie kan wijzigen. Controleer je reis voor vertrek.")}</small>
  </aside>;
}
