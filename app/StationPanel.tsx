"use client";
import { useEffect, useState } from "react";
import type { RailStation } from "../packages/domain-rail/stations";
import { stationBoardSchema, type StationBoard, type StationBoardEntry } from "../packages/protocol/station";
import { realtimeHttpUrl } from "./realtime-url";
import { useLanguage } from "./LanguageContext";
import { useFavoriteStations } from "./useFavoriteStations";

export function boardEntryStatus(entry: StationBoardEntry, en = false): string {
  if (entry.cancelled) return en ? "Cancelled" : "Vervalt";
  if (entry.delaySeconds !== null && entry.delaySeconds >= 60) return `+${Math.floor(entry.delaySeconds / 60)} min`;
  if (entry.trackChanged) return en ? "Platform changed" : "Spoor gewijzigd";
  if (entry.delaySeconds === null) return en ? "Scheduled" : "Volgens planning";
  return entry.delaySeconds < 0 ? (en ? "Early" : "Eerder") : (en ? "On time" : "Op tijd");
}
export type StationPanelMemory = Map<string, { board: StationBoard | null; tab: "departures" | "arrivals"; selected: string | null }>;
export function StationPanel({ station, now, availableVehicleIds, onClose, onSelectVehicle, memory }: {
  station: RailStation; now: number; availableVehicleIds: Set<string>; catalogFetchedAt?: string | null; onClose: () => void; onSelectVehicle: (vehicleId: string) => void; memory: StationPanelMemory;
}) {
  const { language } = useLanguage(); const en = language === "en";
  const { favorites, toggle, error: favoriteError, retry: retryFavorites } = useFavoriteStations();
  const [board, setBoard] = useState<StationBoard | null>(memory.get(station.code)?.board ?? null); const [error, setError] = useState(false);
  const [tab, setTab] = useState<"departures" | "arrivals">(memory.get(station.code)?.tab ?? "departures");
  const [selected, setSelected] = useState<string | null>(memory.get(station.code)?.selected ?? null); const [revision, setRevision] = useState(0);
  useEffect(() => { memory.set(station.code, { board, tab, selected }); }, [memory, station.code, board, tab, selected]);
  const [shareMessage, setShareMessage] = useState("");
  const clock = (value: string) => new Date(value).toLocaleTimeString(en ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  useEffect(() => {
    let disposed = false; let active: AbortController | null = null;
    const refresh = async () => {
      if (active || document.visibilityState === "hidden") return;
      const controller = new AbortController(); active = controller;
      try {
        const response = await fetch(realtimeHttpUrl(`/v1/stations/${encodeURIComponent(station.code)}/board`), { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]), cache: "no-store" });
        if (!response.ok) throw new Error("station_unavailable");
        const value = stationBoardSchema.parse(await response.json());
        if (value.stationCode.toUpperCase() !== station.code.toUpperCase()) throw new Error("station_mismatch");
        if (!disposed) { setBoard(value); setError(false); }
      } catch { if (!disposed) setError(true); }
      finally { active = null; }
    };
    void refresh(); const interval = setInterval(() => void refresh(), 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; active?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [station.code, revision]);
  const stale = error || !board?.sourceHealthy || now - Date.parse(board?.generatedAt ?? "") > 45_000;
  const entries = (board?.[tab] ?? []).filter(entry => Date.parse(entry.expectedAt) >= now);
  const share = async () => {
    const url = new URL(window.location.href); url.search = `?station=${station.code}`;
    try {
      if (navigator.share) await navigator.share({ title: `${station.name} · Liveopweg`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setShareMessage(en ? "Link copied" : "Link gekopieerd"); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setShareMessage(en ? "Sharing is unavailable in this browser." : "Delen is niet beschikbaar in deze browser."); }
  };
  return <aside className="stationPanel uiPanel" aria-label={`Station ${station.name}`}>
    <header className="uiPanelHeader"><div><span className="radarEyebrow">STATION · {station.code}</span><h2>{station.name}</h2></div><button className="radarClose" onClick={onClose} aria-label={en ? "Close station" : "Sluit stationinformatie"}>×</button></header>
    <div className="uiActions"><button onClick={() => toggle(station.code)} aria-pressed={favorites.includes(station.code)}>{favorites.includes(station.code) ? "★" : "☆"} {en ? "Favorite" : "Favoriet"}</button><button onClick={() => void share()}>{en ? "Share" : "Delen"}</button></div>
    {shareMessage && <p role="status">{shareMessage}</p>}{favoriteError && <div className="uiNotice" role="status"><p>{en ? "Favorites are kept for this session. Your browser could not save them." : "Je favorieten blijven deze sessie bewaard. Je browser kon ze niet opslaan."}</p><button onClick={retryFavorites}>{en ? "Try saving again" : "Opnieuw opslaan"}</button></div>}
    <div className="uiTabs" role="tablist" aria-label={en ? "Station board" : "Stationbord"}>{(["departures", "arrivals"] as const).map(kind => <button key={kind} id={`station-${kind}-tab`} role="tab" aria-selected={tab === kind} aria-controls="station-board" tabIndex={tab === kind ? 0 : -1} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = kind === "departures" ? "arrivals" : "departures"; setTab(next); document.getElementById(`station-${next}-tab`)?.focus(); } }} onClick={() => { setTab(kind); setSelected(null); }}>{kind === "departures" ? (en ? "Departures" : "Vertrek") : (en ? "Arrivals" : "Aankomst")}</button>)}</div>
    {stale && board && <p className="uiNotice" role="status">{en ? "These times may be out of date." : "Deze tijden kunnen verouderd zijn."}</p>}
    {error && <div className="uiNotice" role="alert"><p>{en ? "The station board is temporarily unavailable." : "Het stationbord is tijdelijk niet beschikbaar."}</p><button onClick={() => setRevision(value => value + 1)}>{en ? "Try again" : "Opnieuw proberen"}</button></div>}
    {!board && !error && <p role="status">{en ? "Loading departures…" : "Ritten ophalen…"}</p>}
    <div id="station-board" role="tabpanel" aria-labelledby={`station-${tab}-tab`}>
      {board && !entries.length && <p>{en ? "No journeys received for the next hour. This does not mean no trains are running." : "Geen ritten ontvangen voor het komende uur. Dit betekent niet dat er geen treinen rijden."}</p>}
      <ul className="uiResultList">{entries.map(entry => {
        const canFollow = !stale && !entry.cancelled && entry.vehicleId !== null && availableVehicleIds.has(entry.vehicleId);
        return <li key={entry.id}><button className="uiResultButton stationResult" aria-expanded={selected === entry.id} onClick={() => setSelected(selected === entry.id ? null : entry.id)}><time dateTime={entry.expectedAt}>{clock(entry.expectedAt)}</time><span><strong>{entry.direction}</strong><small>{entry.serviceType} {entry.trainNumber}</small></span><span>{en ? "Platform" : "Spoor"} {entry.track ?? "—"}</span><small className={entry.cancelled || (entry.delaySeconds ?? 0) >= 60 ? "tpLate" : ""}>{boardEntryStatus(entry, en)}</small></button>
          {selected === entry.id && <div className="uiResultDetail"><p>{entry.serviceType} {entry.trainNumber} · {entry.operator ?? "—"}</p>{entry.trackChanged && <p>{en ? "Platform changed" : "Spoor gewijzigd"}: {entry.plannedTrack ?? "—"} → {entry.track ?? "—"}</p>}<button disabled={!canFollow} onClick={() => { if (entry.vehicleId && canFollow) onSelectVehicle(entry.vehicleId); }}>{en ? "View on radar" : "Bekijk op radar"}</button>{!canFollow && <p>{en ? "No current live position available for this train." : "Voor deze trein is geen actuele livepositie beschikbaar."}</p>}</div>}
        </li>;
      })}</ul>
    </div>
    <small className="uiSourceNote">{en ? "Received journey information · next 60 minutes" : "Ontvangen ritinformatie · komende 60 minuten"}</small>
  </aside>;
}
