"use client";

import { useEffect, useState } from "react";
import { stationCatalogSource, type RailStation } from "../packages/domain-rail/stations";
import { stationBoardSchema, type StationBoard, type StationBoardEntry } from "../packages/protocol/station";
import { parseTimestamp, realtimeHttpUrl } from "./realtime-url";
import { useLanguage } from "./LanguageContext";

const clock = (value: string) => new Intl.DateTimeFormat("nl-NL", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
}).format(new Date(value));

// Mock station facilities data
function getStationFacilities(station: RailStation) {
  const hash = station.code.split("").reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
  return {
    accessible: true,
    bikeParking: hash % 2 === 0,
    carParking: hash % 3 === 0,
    elevator: hash % 4 === 0,
    escalator: hash % 5 === 0,
    toilet: true,
    wifi: hash % 2 === 0,
    ticketMachine: true,
    openingHours: "06:00 - 01:00",
    platforms: station.category === "megastation" ? 8 : station.category === "knooppuntIntercitystation" ? 6 : station.category === "intercitystation" ? 4 : 2,
  };
}

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
  const { t } = useLanguage();
  const facilities = getStationFacilities(station);

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
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) {
          console.warn(`[StationPanel] Failed to fetch board for ${station.code}:`, error);
          setError(true);
        }
      } finally { window.clearTimeout(timeout); }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => { disposed = true; activeRequest?.abort(); window.clearInterval(timer); };
  }, [station.code]);

  const generatedAtTime = parseTimestamp(board?.generatedAt);
  const stale = !board?.sourceHealthy || error || generatedAtTime === null || now - generatedAtTime > 45_000;
  const entries = (board?.[tab] ?? []).filter((entry) => {
    const expectedTime = parseTimestamp(entry.expectedAt);
    return expectedTime !== null && expectedTime >= now;
  });
  const delayed = entries.filter((entry) => !entry.cancelled && (entry.delaySeconds ?? 0) >= 60).length;
  const activity = Array.from({ length: 4 }, (_, index) => {
    const from = now + index * 15 * 60_000;
    const until = from + 15 * 60_000;
    const events = [...(board?.arrivals ?? []), ...(board?.departures ?? [])];
    return new Set(events.filter((entry) => {
      const time = parseTimestamp(entry.expectedAt);
      return time !== null && !entry.cancelled && time >= from && time < until;
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
    <section className="stationFacilities">
      <h3>{t("station.facilities")}</h3>
      <div className="sfGrid">
        <div className="sfItem"><svg viewBox="0 0 24 24"><path d="M12 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 20v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /></svg><span>{t("station.accessible")}</span></div>
        {facilities.bikeParking && <div className="sfItem"><svg viewBox="0 0 24 24"><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17l4-8h6l4 8M9 9h4" /></svg><span>{t("station.bike_parking")}</span></div>}
        {facilities.carParking && <div className="sfItem"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 17v-4M17 17v-4M7 13h10" /></svg><span>{t("station.car_parking")}</span></div>}
        {facilities.elevator && <div className="sfItem"><svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="20" rx="1" /><path d="M11 5l2 2-2 2M11 17l2-2-2-2" /></svg><span>{t("station.elevator")}</span></div>}
        <div className="sfItem"><svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M9 6h6M9 10h6M9 14h6" /></svg><span>{t("station.toilet")}</span></div>
        {facilities.wifi && <div className="sfItem"><svg viewBox="0 0 24 24"><path d="M2 8a16 16 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /></svg><span>{t("station.wifi")}</span></div>}
        <div className="sfItem"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h10M7 14h6" /></svg><span>{t("station.ticket_machine")}</span></div>
      </div>
      <p className="sfHours">{t("station.opening_hours")}: {facilities.openingHours}</p>
    </section>
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
