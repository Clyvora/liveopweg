"use client";
import { useEffect, useRef, useState } from "react";
import type { RailStation } from "../packages/domain-rail/stations";
import type { AdviceResponse, AdviceLeg } from "../packages/protocol/ns-travel";
import { useLanguage } from "./LanguageContext";
import { requestAdvice } from "./travel-api";
import { StationPicker } from "./StationPicker";
import { useFavoriteStations } from "./useFavoriteStations";
import { AppIcon } from "./Icons";
import type { FollowedRoute } from "./saved-route";
import { usePanelNow } from "./usePanelNow";

export type { FollowedRoute } from "./saved-route";
export type PlannerMemory = Map<string, { from: string; to: string; when: string; results: AdviceResponse | null; expanded: string | null }>;

const clock = (value: string | null, en: boolean) => value ? new Date(value).toLocaleTimeString(en ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "—";
const platform = (point: AdviceLeg["origin"], en: boolean) => point.track ? ` · ${en ? "Platform" : "Spoor"} ${point.plannedTrack && point.plannedTrack !== point.track ? `${point.plannedTrack} → ` : ""}${point.track}` : "";
function localDeparture() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 5);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function transfer(previous: AdviceLeg, next: AdviceLeg, en: boolean) {
  const arrival = previous.destination.actualAt ?? previous.destination.plannedAt;
  const departure = next.origin.actualAt ?? next.origin.plannedAt;
  const minutes = arrival && departure ? Math.round((Date.parse(departure) - Date.parse(arrival)) / 60_000) : null;
  return `${en ? "Change at" : "Overstappen in"} ${next.origin.name}${minutes !== null && minutes >= 0 ? ` · ${minutes} min` : ""}`;
}
function AdviceTime({ point, en }: { point: AdviceLeg["origin"]; en: boolean }) {
  const changed = point.actualAt && point.plannedAt && clock(point.actualAt, en) !== clock(point.plannedAt, en);
  return <>{clock(point.actualAt ?? point.plannedAt, en)}{changed && <small className="advicePlanned"> ({en ? "planned" : "gepland"} {clock(point.plannedAt, en)})</small>}</>;
}

function adviceDeparture(journey: AdviceResponse["journeys"][number]) {
  const origin = journey.legs[0]!.origin;
  return Date.parse(origin.actualAt ?? origin.plannedAt ?? "");
}

function AdviceCard({ journey, expanded, onToggle, liveTrainNumbers, onSelectTrain, en, now }: { journey: AdviceResponse["journeys"][number]; expanded: boolean; onToggle: () => void; liveTrainNumbers: ReadonlySet<string>; onSelectTrain: (number: string) => void; en: boolean; now: number }) {
  const past = adviceDeparture(journey) <= now;
  return <article className={`uiAdvice ${journey.cancelled ? "cancelled" : ""}`}>
    <button className="uiResultButton" aria-expanded={expanded} onClick={onToggle}>
      <strong><AdviceTime point={journey.legs[0]!.origin} en={en} /> → <AdviceTime point={journey.legs.at(-1)!.destination} en={en} /></strong>
      <span>{journey.durationMinutes !== null ? `${journey.durationMinutes} min · ` : ""}{journey.transfers === 0 ? (en ? "Direct" : "Rechtstreeks") : `${journey.transfers} ${en ? (journey.transfers === 1 ? "change" : "changes") : (journey.transfers === 1 ? "overstap" : "overstappen")}`}{journey.cancelled ? (en ? " · Cancelled" : " · Vervalt") : ""}</span>
      {past && !journey.cancelled && <span className="tpLate">{en ? "Departure time has passed" : "Vertrektijd verstreken"}</span>}
    </button>
    {expanded && <div className="uiResultDetail">
      {journey.messages.map((message, i) => <p key={i} className="uiNotice">{message}</p>)}
      {journey.legs.map((leg, index) => <section key={leg.id} className="uiAdviceLeg">
        {index > 0 && <p className="uiTransfer">{transfer(journey.legs[index - 1]!, leg, en)}</p>}
        <strong>{leg.mode === "WALK" ? (en ? "Walk" : "Lopen") : leg.service} {leg.trainNumber}</strong>
        {leg.cancelled && <span className="tpLate"> · {en ? "Cancelled" : "Vervalt"}</span>}
        <p><AdviceTime point={leg.origin} en={en} /> · {leg.origin.name}{platform(leg.origin, en)}</p>
        <p><AdviceTime point={leg.destination} en={en} /> · {leg.destination.name}{platform(leg.destination, en)}</p>
        {leg.messages.map((message, i) => <p key={i}>{message}</p>)}
        {leg.mode === "TRAIN" && leg.trainNumber && liveTrainNumbers.has(leg.trainNumber) && !leg.cancelled && <button onClick={() => onSelectTrain(leg.trainNumber!)}>{en ? "View train on radar" : "Bekijk trein op radar"}</button>}
      </section>)}
    </div>}
  </article>;
}

export function JourneyPlanner({ stations, route, onRouteChange, onClose, liveTrainNumbers, onSelectTrain, memory, storageError, onRetryStorage }: {
  stations: RailStation[]; route: FollowedRoute | null; onRouteChange: (route: FollowedRoute | null) => void; onClose: () => void;
  liveTrainNumbers: ReadonlySet<string>; onSelectTrain: (trainNumber: string) => void; memory: PlannerMemory; storageError: boolean; onRetryStorage: () => void;
}) {
  const { language } = useLanguage();
  const en = language === "en";
  const draft = memory.get("planner");
  const [from, setFrom] = useState(draft?.from ?? route?.originName ?? "");
  const [to, setTo] = useState(draft?.to ?? route?.destinationName ?? "");
  const [when, setWhen] = useState(draft?.when ?? "");
  const [results, setResults] = useState<AdviceResponse | null>(draft?.results ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(draft?.expanded ?? null);
  const initialized = useRef(Boolean(draft || route));
  const now = usePanelNow(0);
  const journeys = results?.journeys.filter(journey => when || !Number.isFinite(adviceDeparture(journey)) || adviceDeparture(journey) > now) ?? [];
  const { favorites } = useFavoriteStations();
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(() => { memory.set("planner", { from, to, when, results, expanded }); }, [memory, from, to, when, results, expanded]);
  useEffect(() => {
    if (!route || initialized.current) return;
    const frame = requestAnimationFrame(() => {
      if (!initialized.current) { initialized.current = true; setFrom(route.originName); setTo(route.destinationName); }
    });
    return () => cancelAnimationFrame(frame);
  }, [route]);
  useEffect(() => () => { sequence.current++; request.current?.abort(); }, []);
  const origin = stations.find(station => station.name.toLocaleLowerCase() === from.trim().toLocaleLowerCase() || station.code === from.trim().toUpperCase());
  const destination = stations.find(station => station.name.toLocaleLowerCase() === to.trim().toLocaleLowerCase() || station.code === to.trim().toUpperCase());
  const valid = origin && destination && origin.code !== destination.code;
  const invalidate = () => { initialized.current = true; sequence.current++; request.current?.abort(); setLoading(false); setError(false); setResults(null); };
  const search = async () => {
    if (!valid) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const version = ++sequence.current; setLoading(true); setError(false); setResults(null);
    try {
      const value = await requestAdvice(origin.code, destination.code, when ? new Date(when).toISOString() : null, language, controller.signal);
      if (!controller.signal.aborted && version === sequence.current) {
        setResults(value);
        setExpanded(value.journeys.find(journey => !journey.cancelled && (when || adviceDeparture(journey) > Date.now()))?.id ?? null);
      }
    } catch { if (!controller.signal.aborted && version === sequence.current) setError(true); }
    finally { if (version === sequence.current) setLoading(false); }
  };
  const save = () => { if (valid) onRouteChange({ originCode: origin.code, originName: origin.name, destinationCode: destination.code, destinationName: destination.name }); };
  return <aside className="journeyPlannerPanel uiPanel" aria-label={en ? "Journey planner" : "Reisplanner"}>
    <header className="uiPanelHeader"><div><span className="radarEyebrow">{en ? "YOUR JOURNEY" : "JOUW REIS"}</span><h2>{en ? "Plan your journey" : "Plan je reis"}</h2></div><button className="radarClose" onClick={onClose} aria-label={en ? "Close journey planner" : "Sluit reisplanner"}><AppIcon name="close" /></button></header>
    <p>{en ? "Find a train journey, with changes and platform information." : "Vind je treinreis, inclusief overstappen en spoorinformatie."}</p>
    <form onSubmit={event => { event.preventDefault(); void search(); }}>
      <StationPicker stations={stations} value={from} label={en ? "From" : "Van"} onChange={value => { invalidate(); setFrom(value); }} />
      <button className="uiSwap" type="button" onClick={() => { invalidate(); setFrom(to); setTo(from); }} aria-label={en ? "Swap stations" : "Stations omwisselen"}><AppIcon name="swap" /></button>
      <StationPicker stations={stations} value={to} label={en ? "To" : "Naar"} onChange={value => { invalidate(); setTo(value); }} />
      <div className="uiTabs" role="group" aria-label={en ? "Departure time" : "Vertrektijd"}><button type="button" aria-pressed={!when} onClick={() => { invalidate(); setWhen(""); }}>{en ? "Leave now" : "Vertrek nu"}</button><button type="button" aria-pressed={Boolean(when)} onClick={() => { if (!when) { invalidate(); setWhen(localDeparture()); } }}>{en ? "Choose time" : "Kies tijd"}</button></div>
      {when && <label className="uiField">{en ? "Departure" : "Vertrek"}<input type="datetime-local" value={when} required onChange={event => { invalidate(); setWhen(event.target.value); }} /><small>{en ? "Time in your device’s timezone." : "Tijd in de tijdzone van je apparaat."}</small></label>}
      {origin && destination && !valid && <p className="uiNotice">{en ? "Choose different departure and arrival stations." : "Kies verschillende vertrek- en aankomststations."}</p>}
      <div className="uiActions"><button className="radarPrimary" disabled={!valid || loading}>{loading ? (en ? "Searching…" : "Zoeken…") : (en ? "Find journeys" : "Zoek reizen")}</button><button type="button" disabled={!valid} onClick={save}>{en ? "Save route" : "Route bewaren"}</button></div>
    </form>
    {route && <div className="uiSavedRoute"><span>{route.originName} → {route.destinationName}</span><button onClick={() => onRouteChange(null)}>{en ? "Remove" : "Verwijderen"}</button></div>}
    {storageError && <div className="uiNotice" role="status"><p>{en ? "Your change is kept for this session. Your browser could not save it on this device." : "Je wijziging blijft deze sessie bewaard. Opslaan op dit apparaat is niet gelukt."}</p><button onClick={onRetryStorage}>{en ? "Try saving again" : "Opnieuw opslaan"}</button></div>}
    {favorites.length > 0 && <div className="uiFavoriteChips">{stations.filter(station => favorites.includes(station.code)).map(station => <button key={station.code} onClick={() => { invalidate(); if (!origin) setFrom(station.name); else setTo(station.name); }}><AppIcon name="favorites" />{station.name}</button>)}</div>}
    {error && <div className="uiNotice" role="alert"><p>{en ? "Journey advice is temporarily unavailable. Please try again." : "Reisadviezen zijn tijdelijk niet beschikbaar. Probeer het opnieuw."}</p><button onClick={() => void search()}>{en ? "Try again" : "Opnieuw proberen"}</button></div>}
    {results && !results.journeys.length && <p role="status">{en ? "No journeys found for this time and route." : "Geen reizen gevonden voor deze route en dit tijdstip."}</p>}
    {results?.journeys.length && !journeys.length ? <p role="status">{en ? "The departure times in this advice have passed. Search again for current options." : "De vertrektijden in dit advies zijn verstreken. Zoek opnieuw voor actuele opties."}</p> : null}
    <div className="uiAdviceResults" aria-busy={loading}>{journeys.map(journey => <AdviceCard key={journey.id} journey={journey} expanded={expanded === journey.id} onToggle={() => setExpanded(expanded === journey.id ? null : journey.id)} liveTrainNumbers={liveTrainNumbers} onSelectTrain={onSelectTrain} en={en} now={now} />)}</div>
    <small className="uiSourceNote">{results ? `${en ? "Journey advice" : "Reisadvies"}: NS · ${clock(results.fetchedAt, en)}` : (en ? "Travel information can change. Check before departure." : "Reisinformatie kan wijzigen. Controleer je reis voor vertrek.")}</small>
  </aside>;
}
