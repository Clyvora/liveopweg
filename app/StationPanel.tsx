"use client";
import { Fragment, useEffect, useState } from "react";
import type { RailStation } from "../packages/domain-rail/stations";
import { stationBoardSchema, type StationBoard, type StationBoardEntry } from "../packages/protocol/station";
import { realtimeHttpUrl } from "./realtime-url";
import { useLanguage } from "./LanguageContext";
import { useFavoriteStations } from "./useFavoriteStations";
import { AppIcon } from "./Icons";
import { TrainImage } from "./TrainImage";
import { StationServiceIcon } from "./StationServiceIcon";
import { regionalTrainBrand } from "./train-livery";
import { StationGuideContent, StationPhoto } from "./StationGuideContent";
import { stationGuides } from "./station-guide";
import { departurePlatforms, movedFromPlatform, showsOnPlatform } from "./station-platform";

export function boardEntryStatus(entry: StationBoardEntry, en = false): string {
  if (entry.cancelled) return en ? "Cancelled" : "Vervalt";
  if (entry.delaySeconds !== null && entry.delaySeconds >= 60) return `+${Math.floor(entry.delaySeconds / 60)} min`;
  if (entry.trackChanged) return en ? "Platform changed" : "Spoor gewijzigd";
  if (entry.delaySeconds === null) return entry.timeBasis === "UPDATED"
    ? (en ? "Updated time" : "Bijgewerkte tijd")
    : (en ? "Scheduled" : "Gepland");
  return entry.delaySeconds < 0 ? (en ? "Early" : "Eerder") : (en ? "On time" : "Op tijd");
}
type StationSection = "board" | "facilities" | "onward";
const stationSections = ["board", "facilities", "onward"] as const;
const blauwnetOperators = new Map([
  ["blauwnet a", "Blauwnet (Arriva)"],
  ["blauwnet k", "Blauwnet (Keolis)"],
]);

function operatorGroup(name: string | null) {
  return regionalTrainBrand(name) === "blauwnet" ? "Blauwnet" : name?.trim() ?? "";
}
export type StationPanelMemory = Map<string, {
  board: StationBoard | null;
  tab: "departures" | "arrivals";
  selected: string | null;
  operator?: string;
  platform?: string;
  section?: StationSection;
}>;
export function StationPanel({ station, now, availableVehicleIds, onClose, onSelectVehicle, memory }: {
  station: RailStation; now: number; availableVehicleIds: Set<string>; catalogFetchedAt?: string | null; onClose: () => void; onSelectVehicle: (vehicleId: string) => void; memory: StationPanelMemory;
}) {
  const { language } = useLanguage(); const en = language === "en";
  const guide = stationGuides[station.code.toUpperCase()];
  const { favorites, toggle, error: favoriteError, retry: retryFavorites } = useFavoriteStations();
  const [board, setBoard] = useState<StationBoard | null>(memory.get(station.code)?.board ?? null); const [error, setError] = useState(false);
  const [tab, setTab] = useState<"departures" | "arrivals">(memory.get(station.code)?.tab ?? "departures");
  const [selected, setSelected] = useState<string | null>(memory.get(station.code)?.selected ?? null); const [revision, setRevision] = useState(0);
  const [operator, setOperator] = useState(memory.get(station.code)?.operator ?? "");
  const [platform, setPlatform] = useState(memory.get(station.code)?.platform ?? "");
  const [section, setSection] = useState<StationSection>(guide ? memory.get(station.code)?.section ?? "board" : "board");
  useEffect(() => { memory.set(station.code, { board, tab, selected, operator, platform, section }); },
    [memory, station.code, board, tab, selected, operator, platform, section]);
  const [shareMessage, setShareMessage] = useState("");
  const clock = (value: string) => new Date(value).toLocaleTimeString(en ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
  useEffect(() => {
    if (section !== "board") return;
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
      } catch { if (!disposed && !controller.signal.aborted) setError(true); }
      finally { if (active === controller) active = null; }
    };
    void refresh(); const interval = setInterval(() => void refresh(), 15_000);
    const onVisible = () => { if (document.visibilityState === "hidden") { active?.abort(); active = null; } else void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; active?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [station.code, revision, section]);
  const stale = error || !board?.sourceHealthy || now - Date.parse(board?.generatedAt ?? "") > 45_000;
  const arrivalWindow = board?.arrivalWindow;
  const entries = (board?.[tab] ?? []).filter(entry => {
    const at = Date.parse(entry.expectedAt);
    return at >= now || (tab === "arrivals" && !entry.cancelled && entry.timeBasis === "UPDATED"
      && at >= now - (arrivalWindow?.pastMinutes ?? 0) * 60_000);
  });
  const operators = [...new Set([...(board?.departures ?? []), ...(board?.arrivals ?? [])]
    .map(entry => operatorGroup(entry.operator)).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const savedOperator = operatorGroup(operator);
  const selectedOperator = operators.includes(savedOperator) ? savedOperator : "";
  const activePlatform = tab === "departures" ? platform : "";
  const platforms = tab === "departures" ? departurePlatforms(entries) : [];
  if (activePlatform && !platforms.includes(activePlatform)) platforms.push(activePlatform);
  const visibleEntries = entries.filter(entry =>
    (!selectedOperator || operatorGroup(entry.operator) === selectedOperator) && showsOnPlatform(entry, activePlatform));
  const upcoming = visibleEntries.filter(entry => Date.parse(entry.expectedAt) >= now);
  const recent = visibleEntries.filter(entry => Date.parse(entry.expectedAt) < now).reverse();
  const sectionLabel = en
    ? { board: "Trains", facilities: "Facilities", onward: "Onward travel" }
    : { board: "Treinen", facilities: "Voorzieningen", onward: "Verder reizen" };
  const stationInfo = `https://www.ns.nl/${en ? "en/station-information" : "stationsinformatie"}/${encodeURIComponent(station.code.toLowerCase())}`;
  const share = async () => {
    const url = new URL(window.location.href); url.search = `?station=${station.code}`;
    try {
      if (navigator.share) await navigator.share({ title: `${station.name} · Liveopweg`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setShareMessage(en ? "Link copied" : "Link gekopieerd"); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setShareMessage(en ? "Sharing is unavailable in this browser." : "Delen is niet beschikbaar in deze browser."); }
  };
  return <aside className="stationPanel uiPanel" aria-label={`Station ${station.name}`}>
    <header className="uiPanelHeader"><div><span className="radarEyebrow">STATION · {station.code}</span><h2>{station.name}</h2></div><button className="radarClose" onClick={onClose} aria-label={en ? "Close station" : "Sluit stationinformatie"}><AppIcon name="close" /></button></header>
    <div className="uiActions"><button onClick={() => toggle(station.code)} aria-pressed={favorites.includes(station.code)}>{favorites.includes(station.code) ? "★" : "☆"} {en ? "Favorite" : "Favoriet"}</button><button onClick={() => void share()}><AppIcon name="share" /> {en ? "Share" : "Delen"}</button></div>
    {shareMessage && <p role="status">{shareMessage}</p>}{favoriteError && <div className="uiNotice" role="status"><p>{en ? "Favorites are kept for this session. Your browser could not save them." : "Je favorieten blijven deze sessie bewaard. Je browser kon ze niet opslaan."}</p><button onClick={retryFavorites}>{en ? "Try saving again" : "Opnieuw opslaan"}</button></div>}
    {guide && <>
      <div className="uiTabs stationSections" role="tablist" aria-label={en ? "Station information" : "Stationsinformatie"}>
        {stationSections.map((kind, index) => <button key={kind} type="button" id={`station-section-${kind}`}
          role="tab" tabIndex={section === kind ? 0 : -1} aria-selected={section === kind} aria-controls="station-section-body"
          onClick={() => setSection(kind)}
          onKeyDown={event => {
            const target = event.key === "ArrowRight" ? (index + 1) % stationSections.length
              : event.key === "ArrowLeft" ? (index + stationSections.length - 1) % stationSections.length
                : event.key === "Home" ? 0 : event.key === "End" ? stationSections.length - 1 : null;
            if (target === null) return;
            event.preventDefault();
            const next = stationSections[target];
            setSection(next);
            document.getElementById(`station-section-${next}`)?.focus();
          }}>{sectionLabel[kind]}</button>)}
      </div>
    </>}
    <div id="station-section-body" role={guide ? "tabpanel" : undefined} aria-labelledby={guide ? `station-section-${section}` : undefined} tabIndex={section === "board" ? undefined : 0}>
    {guide && section !== "board" ? <>
      <StationPhoto key={station.code} photo={guide.photo} en={en} />
      <StationGuideContent en={en} items={guide[section]} />
    </> : <>
    <div className="uiTabs" role="tablist" aria-label={en ? "Station board" : "Stationbord"}>{(["departures", "arrivals"] as const).map(kind => <button key={kind} id={`station-${kind}-tab`} role="tab" aria-selected={tab === kind} aria-controls="station-board" tabIndex={tab === kind ? 0 : -1} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const next = kind === "departures" ? "arrivals" : "departures"; setTab(next); document.getElementById(`station-${next}-tab`)?.focus(); } }} onClick={() => { setTab(kind); setSelected(null); }}>{kind === "departures" ? (en ? "Departures" : "Vertrek") : (en ? "Arrivals" : "Aankomst")}</button>)}</div>
    {stale && board && <p className="uiNotice" role="status">{en ? "These times may be out of date." : "Deze tijden kunnen verouderd zijn."}</p>}
    {error && <div className="uiNotice" role="alert"><p>{en ? "The station board is temporarily unavailable." : "Het stationbord is tijdelijk niet beschikbaar."}</p><button onClick={() => setRevision(value => value + 1)}>{en ? "Try again" : "Opnieuw proberen"}</button></div>}
    {!board && !error && <p role="status">{en ? "Loading departures…" : "Ritten ophalen…"}</p>}
    <div id="station-board" role="tabpanel" aria-labelledby={`station-${tab}-tab`}>
      {(platforms.length > 0 || operators.length > 1) && <div className="stationBoardFilters">
      {platforms.length > 0 && <label className="stationOperatorFilter stationPlatformFilter">
        <span><AppIcon name="stations" />{en ? "Platform mode" : "Perronmodus"}</span>
        <select value={activePlatform} onChange={event => { setPlatform(event.target.value); setSelected(null); }}>
          <option value="">{en ? "All platforms" : "Alle sporen"}</option>
          {platforms.map(track => <option key={track} value={track}>{en ? "Platform" : "Spoor"} {track}</option>)}
        </select>
      </label>}
      {operators.length > 1 && <label className="stationOperatorFilter">
        <span>{en ? "Operator" : "Vervoerder"}</span>
        <select value={selectedOperator} onChange={event => { setOperator(event.target.value); setSelected(null); }}>
          <option value="">{en ? "All operators" : "Alle vervoerders"}</option>
          {operators.map(name => <option key={name}>{name}</option>)}
        </select>
      </label>}
      </div>}
      {board && !visibleEntries.length && <p>{activePlatform
        ? (en ? "No upcoming departures match this platform filter." : "Geen komende vertrekken voor dit perronfilter.")
        : selectedOperator
        ? (en ? "No upcoming services from this operator." : "Geen komende ritten van deze vervoerder.")
        : (en ? "No journey times were received for this period." : "Geen ritinformatie ontvangen voor deze periode.")}</p>}
      <ul className="uiResultList">{[...upcoming, ...recent].map((entry, index) => {
        const canFollow = !stale && !entry.cancelled && entry.vehicleId !== null && availableVehicleIds.has(entry.vehicleId);
        const operatorName = blauwnetOperators.get(entry.operator?.trim().toLowerCase() ?? "") ?? entry.operator;
        const moved = !entry.cancelled && movedFromPlatform(entry, activePlatform);
        const planned = entry.plannedAt;
        const previousTime = planned && !entry.cancelled && entry.timeBasis === "UPDATED" && clock(planned) !== clock(entry.expectedAt) ? planned : null;
        const delay = entry.delaySeconds ?? 0;
        let statusClass = "";
        if (!entry.cancelled) {
          if (delay >= 300) statusClass = "tpSevereDelay";
          else if (moved || delay >= 60) statusClass = "tpLate";
          else if (entry.delaySeconds === 0 && !entry.trackChanged) statusClass = "stationOnTime";
        }
        return <Fragment key={entry.id}>
          {index === upcoming.length && <li className="stationRecentHeading">{en ? "Recent arrival times" : "Recente aankomsttijden"}</li>}
          <li>
          <button className={`uiResultButton stationResult${entry.cancelled ? " stationResultCancelled" : ""}`} aria-expanded={selected === entry.id} onClick={() => setSelected(selected === entry.id ? null : entry.id)}>
            <span className="stationTimes">
              <time dateTime={entry.expectedAt}>{clock(entry.expectedAt)}</time>
              {previousTime && <s><time dateTime={previousTime} aria-label={`${en ? "Scheduled" : "Gepland"} ${clock(previousTime)}`}>{clock(previousTime)}</time></s>}
            </span>
            <span><strong>{entry.direction}</strong><small className="stationServiceIdentity"><StationServiceIcon operator={operatorName} serviceType={entry.serviceType} rollingStock={entry.rollingStock} materialNumber={entry.materialNumber} /><span>{[operatorName, `${entry.serviceType} ${entry.trainNumber}`].filter(Boolean).join(" · ")}</span></small></span>
            <span className={`stationTrack${entry.trackChanged ? " changed" : entry.track ? " known" : ""}`}>{entry.track ? `${en ? "Platform" : "Spoor"} ${entry.track}` : (en ? "No platform" : "Spoor onbekend")}</span>
            <small className={statusClass}>
              {moved ? (en ? `Moved to platform ${entry.track}` : `Verplaatst naar spoor ${entry.track}`) : boardEntryStatus(entry, en)}
            </small>
          </button>
          {selected === entry.id && <div className="uiResultDetail">
            <div className="stationTrainArt">
              <TrainImage model={entry.rollingStock} operator={operatorName} material={entry.materialNumber} trainNumber={entry.trainNumber} />
            </div>
            {entry.trackChanged && <p>{en ? "Platform changed" : "Spoor gewijzigd"}: {entry.plannedTrack ?? "—"} → {entry.track ?? "—"}</p>}
            <button disabled={!canFollow} onClick={() => { if (entry.vehicleId && canFollow) onSelectVehicle(entry.vehicleId); }}>{en ? "View on radar" : "Bekijk op radar"}</button>
            {!canFollow && <p>{entry.cancelled ? (en ? "This service is cancelled." : "Deze rit vervalt.") : stale ? (en ? "The current position cannot be confirmed while the board is out of date." : "De actuele positie kan niet worden bevestigd zolang het stationbord verouderd is.") : (en ? "No current live position available for this train." : "Voor deze trein is geen actuele livepositie beschikbaar.")}</p>}
          </div>}
        </li></Fragment>;
      })}</ul>
    </div>
    <small className="uiSourceNote">{en ? "Received journey information" : "Ontvangen ritinformatie"} · {en ? "next" : "komende"} {tab === "arrivals" ? arrivalWindow?.upcomingMinutes ?? 60 : 60} {en ? "minutes" : "minuten"}</small>
    </>}
    </div>
    <a className="stationSourceLink" href={stationInfo} target="_blank" rel="noreferrer"><AppIcon name="external" />{en ? "Station information at NS" : "Stationsinformatie bij NS"}</a>
  </aside>;
}
