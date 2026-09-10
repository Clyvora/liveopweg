"use client";

import { useEffect, useState } from "react";
import { stationCatalogSource, type RailStation } from "../packages/domain-rail/stations";
import { stationBoardSchema, type StationBoard, type StationBoardEntry } from "../packages/protocol/station";
import { realtimeHttpUrl } from "./realtime-url";

const clock = (value: string) => new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
}).format(new Date(value));

export function boardEntryStatus(entry: StationBoardEntry): string {
  if (entry.cancelled) return "Vervalt";
  if (entry.delaySeconds !== null && entry.delaySeconds >= 60) return `+${Math.floor(entry.delaySeconds / 60)} min`;
  if (entry.trackChanged) return "Spoor gewijzigd";
  if (entry.delaySeconds === null) return "Volgens planning";
  return entry.delaySeconds < 0 ? "Eerder" : "Op tijd";
}

export function StationPanel({ station, now, availableVehicleIds, onClose, onSelectVehicle }: {
  station: RailStation;
  now: number;
  availableVehicleIds: Set<string>;
  onClose: () => void;
  onSelectVehicle: (vehicleId: string) => void;
}) {
  const [board, setBoard] = useState<StationBoard | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"departures" | "arrivals">("departures");
  const [expanded, setExpanded] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let disposed = false;
    let activeRequest: AbortController | null = null;
    async function refresh() {
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(realtimeHttpUrl(`/v1/stations/${encodeURIComponent(station.code)}/board`), { signal: controller.signal });
        if (!response.ok) throw new Error("Stationbord niet beschikbaar");
        const result = stationBoardSchema.parse(await response.json());
        if (result.stationCode !== station.code) throw new Error("Onverwacht station");
        if (!disposed) { setBoard(result); setError(false); }
      } catch (error) {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) setError(true);
      } finally { window.clearTimeout(timeout); }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => { disposed = true; activeRequest?.abort(); window.clearInterval(timer); };
  }, [station.code]);

  const stale = !board?.sourceHealthy || error || now - Date.parse(board.generatedAt) > 45_000;
  const entries = (board?.[tab] ?? []).filter((entry) => Date.parse(entry.expectedAt) >= now);
  const delayed = entries.filter((entry) => !entry.cancelled && (entry.delaySeconds ?? 0) >= 60).length;
  const activity = Array.from({ length: 4 }, (_, index) => {
    const from = now + index * 15 * 60_000;
    const until = from + 15 * 60_000;
    const events = [...(board?.arrivals ?? []), ...(board?.departures ?? [])];
    return new Set(events.filter((entry) => {
      const time = Date.parse(entry.expectedAt);
      return !entry.cancelled && time >= from && time < until;
    }).map((entry) => `${entry.trainNumber}:${entry.expectedAt}`)).size;
  });
  const maxActivity = Math.max(1, ...activity);
  const totalActivity = activity.reduce((sum, value) => sum + value, 0);
  const activityLabel = totalActivity >= 24 ? "Veel treinbewegingen" : totalActivity >= 10 ? "Regelmatig treinverkeer" : "Rustig treinverkeer";
  async function shareStation() {
    const url = new URL(window.location.href);
    url.search = `?station=${encodeURIComponent(station.code)}`;
    const data = { title: `${station.name} · Liveopweg`, text: `Bekijk ${station.name} live op Liveopweg`, url: url.toString() };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(data.url);
      setShared(true); window.setTimeout(() => setShared(false), 1800);
    } catch { /* Delen geannuleerd. */ }
  }

  return <aside className={`stationPanel ${expanded ? "expanded" : ""}`} aria-label={`Station ${station.name}`}>
    <header className="stationPanelHeader">
      <div>
        <p className="stationEyebrow"><span aria-hidden="true">▣</span> Station · {station.code}</p>
        <h2>{station.name}</h2>
        <p className={`stationFeedState ${stale ? "stale" : ""}`} role="status">
          <i />{error ? "Verbinding onderbroken · opnieuw proberen…" : !board ? "Ritten ophalen…" : stale ? "Ritbron nog niet actueel" : "Live ritinformatie"}
        </p>
      </div>
      <div className="panelHeaderActions"><button className="panelShare" onClick={() => void shareStation()} aria-label={`Deel ${station.name}`}>{shared ? "Gekopieerd" : "Delen"}</button><button className="stationClose" onClick={onClose} aria-label="Sluit stationinformatie">×</button></div>
    </header>
    <div className="stationTabs" role="tablist" aria-label="Stationbord">
      <button id="station-departures-tab" role="tab" aria-selected={tab === "departures"} aria-controls="station-board" onClick={() => { setTab("departures"); setExpanded(false); }}>Vertrek</button>
      <button id="station-arrivals-tab" role="tab" aria-selected={tab === "arrivals"} aria-controls="station-board" onClick={() => { setTab("arrivals"); setExpanded(false); }}>Aankomst</button>
      <span>Komende 60 min</span>
    </div>
    <div className="stationBoardSummary">
      <span>{board ? `${entries.length} ontvangen ritten` : "Verbinding maken"}</span>
      {delayed > 0 && <span className="stationDelayCount">{delayed} vertraagd</span>}
    </div>
    {board && <section className="stationActivity" aria-label={`Stationsactiviteit: ${activityLabel}`}>
      <div><strong>Treinactiviteit</strong><span>{activityLabel} · komende uur</span></div>
      <div className="activityBars" aria-hidden="true">{activity.map((value, index) => <i key={index} style={{ height: `${Math.max(12, value / maxActivity * 100)}%` }} />)}</div>
      <b>{totalActivity}</b>
    </section>}
    <div className="stationBoardColumns" aria-hidden="true"><span>Tijd</span><span>{tab === "departures" ? "Richting" : "Vanuit"}</span><span>Spoor</span></div>
    <div id="station-board" role="tabpanel" aria-labelledby={`station-${tab}-tab`} className="stationBoardList" tabIndex={0}>
      {!board && !error && <p className="stationBoardEmpty">Actuele {tab === "departures" ? "vertrekken" : "aankomsten"} worden opgehaald.</p>}
      {error && !board && <p className="stationBoardEmpty">Het stationbord is tijdelijk niet bereikbaar. We proberen het automatisch opnieuw.</p>}
      {board && entries.length === 0 && <p className="stationBoardEmpty">Nog geen {tab === "departures" ? "vertrekken" : "aankomsten"} ontvangen voor het komende uur. Dit betekent niet dat er geen treinen rijden.</p>}
      {entries.map((entry) => {
        const canFollow = !stale && entry.vehicleId !== null && availableVehicleIds.has(entry.vehicleId);
        return <button key={entry.id} className={`stationBoardRow ${entry.cancelled ? "cancelled" : ""}`} disabled={!canFollow}
          onClick={() => { if (canFollow && entry.vehicleId) onSelectVehicle(entry.vehicleId); }}
          aria-label={`${entry.serviceType} ${entry.trainNumber}, ${entry.direction}, ${clock(entry.expectedAt)}, spoor ${entry.track ?? "onbekend"}, ${boardEntryStatus(entry)}${canFollow ? ", volg trein op de kaart" : ", geen livepositie beschikbaar"}`}>
          <span className="stationTime"><time dateTime={entry.expectedAt}>{clock(entry.expectedAt)}</time>
            {entry.plannedAt && (entry.delaySeconds ?? 0) >= 60 && <del>{clock(entry.plannedAt)}</del>}
          </span>
          <span className="stationTrip"><strong title={entry.direction}>{entry.direction}</strong><span>{entry.serviceType} {entry.trainNumber} · {entry.operator ?? "Vervoerder onbekend"}</span>
            <small className={entry.cancelled || (entry.delaySeconds ?? 0) >= 60 ? "warning" : entry.trackChanged ? "changed" : ""}>{boardEntryStatus(entry)}{entry.trackChanged && (entry.delaySeconds ?? 0) >= 60 ? " · spoor gewijzigd" : ""}{canFollow ? " · Volg trein ↗" : ""}</small>
          </span>
          <span className={`stationTrack ${entry.trackChanged ? "changed" : ""}`} title={entry.trackChanged ? `Gepland spoor ${entry.plannedTrack}` : undefined}>{entry.track ?? "—"}{entry.trackChanged && <small>gewijzigd</small>}</span>
        </button>;
      })}
    </div>
    {entries.length > 3 && <button className={`stationExpand ${entries.length === 4 ? "smallOnly" : ""}`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Minder ritten" : "Meer ritten"}<span>{expanded ? "−" : "+"}</span></button>}
    <footer className="stationPanelFooter">
      <p>Op basis van ontvangen ritberichten; mogelijk niet alle ritten beschikbaar.{stale && board ? " Laatst ontvangen bord: " + clock(board.generatedAt) + "." : ""}</p>
      <a href={stationCatalogSource.url} target="_blank" rel="noreferrer" title={`Stationslijst ${stationCatalogSource.version} · ${stationCatalogSource.license}`}>Stationdata: Rijden de Treinen / NS</a>
    </footer>
  </aside>;
}
