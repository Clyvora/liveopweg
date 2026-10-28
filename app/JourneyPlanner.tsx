"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RailStation } from "../packages/domain-rail/stations";
import { useLanguage } from "./LanguageContext";
import { searchJourneys, type JourneyConnection } from "./journey-search";

export type FollowedRoute = {
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
};

const routeStorageKey = "liveopweg-followed-route";
const favoriteStationsStorageKey = "liveopweg-favorite-stations";

function journeyTime(value: string, language: string): string {
  return new Intl.DateTimeFormat(language === "en" ? "en-GB" : "nl-NL", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

function journeyDelay(seconds: number | null, language: string): string {
  if (seconds === null) return language === "en" ? "No delay reported" : "Geen vertraging bekend";
  if (seconds === 0) return language === "en" ? "On time" : "Op tijd";
  const minutes = Math.round(Math.abs(seconds) / 60);
  return seconds > 0
    ? (language === "en" ? `+${minutes} min late` : `+${minutes} min vertraging`)
    : (language === "en" ? `${minutes} min early` : `${minutes} min eerder`);
}

export function JourneyPlanner({ stations, route, onRouteChange, onClose, liveTrainNumbers, onSelectTrain }: {
  stations: RailStation[];
  route: FollowedRoute | null;
  onRouteChange: (route: FollowedRoute | null) => void;
  onClose: () => void;
  liveTrainNumbers: ReadonlySet<string>;
  onSelectTrain: (trainNumber: string) => void;
}) {
  const { language } = useLanguage();
  const [originCode, setOriginCode] = useState(route?.originCode ?? "");
  const [destinationCode, setDestinationCode] = useState(route?.destinationCode ?? "");
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>([]);
  const favoritesHydrated = useRef(false);
  const [storageMessage, setStorageMessage] = useState("");
  const [searchResults, setSearchResults] = useState<JourneyConnection[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchController = useRef<AbortController | null>(null);
  const searchSequence = useRef(0);
  const routeHydrated = useRef(false);
  const copy = language === "en"
    ? { title: "Follow a route", close: "Close route panel", lead: "Find trains between two stations.", detail: "Liveopweg keeps your route ready for your next visit.", save: "Save route", clear: "Clear route", origin: "From station", destination: "To station", chooseStation: "Choose a station", activeRoute: "Saved route", favorites: "Favorite stations", favoriteHint: "Add stations you visit often.", addFavorite: "+ Add a favorite station", storageError: "Your browser could not save this on this device. The change is available until you close this page.", search: "Find trains", searching: "Searching live journeys…", searchError: "Could not load journeys. Check your connection and try again.", noResults: "No live journeys found for this route in the next hour.", coverage: "Results use received live InfoPlus journeys and may not include every scheduled train.", results: "Available journeys", transfer: "Change at", follow: "Show train on map" }
    : { title: "Volg een route", close: "Sluit routepaneel", lead: "Zoek treinen tussen twee stations.", detail: "Liveopweg onthoudt je route lokaal op dit apparaat en toont hem snel opnieuw.", save: "Route opslaan", clear: "Route wissen", origin: "Vanaf station", destination: "Naar station", chooseStation: "Kies een station", activeRoute: "Opgeslagen route", favorites: "Favoriete stations", favoriteHint: "Voeg stations toe die je vaak bekijkt.", addFavorite: "+ Favoriet station toevoegen", storageError: "Je browser kon dit niet op dit apparaat bewaren. De wijziging blijft actief zolang deze pagina open is.", search: "Zoek treinen", searching: "Live ritten zoeken…", searchError: "Ritten laden lukte niet. Controleer je verbinding en probeer het opnieuw.", noResults: "Geen live ritten gevonden voor deze route in het komende uur.", coverage: "Resultaten zijn gebaseerd op ontvangen InfoPlus-ritten en bevatten mogelijk niet alle geplande treinen.", results: "Beschikbare ritten", transfer: "Overstappen in", follow: "Toon trein op kaart" };
  const stationOptions = useMemo(() => [...stations].sort((left, right) => left.name.localeCompare(right.name, "nl")), [stations]);

  useEffect(() => () => {
    searchSequence.current += 1;
    searchController.current?.abort();
  }, []);

  const findJourneys = async () => {
    if (!originCode || !destinationCode || originCode === destinationCode) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const sequence = ++searchSequence.current;
    setSearchLoading(true);
    setSearchError("");
    setSearchResults(null);
    try {
      const result = await searchJourneys(originCode, destinationCode, controller.signal);
      if (!controller.signal.aborted && sequence === searchSequence.current) setSearchResults(result.connections);
    } catch {
      if (controller.signal.aborted || sequence !== searchSequence.current) return;
      setSearchError(copy.searchError);
    } finally {
      if (sequence === searchSequence.current) setSearchLoading(false);
    }
  };

  const closePlanner = () => {
    searchSequence.current += 1;
    searchController.current?.abort();
    onClose();
  };
  const resetSearch = () => {
    searchSequence.current += 1;
    searchController.current?.abort();
    setSearchLoading(false);
    setSearchError("");
    setSearchResults(null);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (favoritesHydrated.current) return;
      favoritesHydrated.current = true;
      try {
        const saved = window.localStorage.getItem(favoriteStationsStorageKey);
        const parsed: unknown = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(parsed)) return;
        const stationCodes = new Set(stationOptions.map(station => station.code));
        setFavoriteCodes(parsed.filter((code): code is string => typeof code === "string" && stationCodes.has(code)).slice(-6));
      } catch {
        setFavoriteCodes([]);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [stationOptions]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (routeHydrated.current) return;
      if (route) { routeHydrated.current = true; return; }
      try {
        const saved = window.localStorage.getItem(routeStorageKey);
        if (!saved) { routeHydrated.current = true; return; }
        const parsed: unknown = JSON.parse(saved);
        if (typeof parsed !== "object" || parsed === null || !("originCode" in parsed) || !("destinationCode" in parsed)
          || typeof parsed.originCode !== "string" || typeof parsed.destinationCode !== "string") {
          routeHydrated.current = true;
          return;
        }
        const origin = stationOptions.find(station => station.code === parsed.originCode);
        const destination = stationOptions.find(station => station.code === parsed.destinationCode);
        if (!origin || !destination) return;
        routeHydrated.current = true;
        if (origin.code === destination.code) return;
        setOriginCode(origin.code);
        setDestinationCode(destination.code);
        onRouteChange({ originCode: origin.code, originName: origin.name, destinationCode: destination.code, destinationName: destination.name });
      } catch {
        // Invalid or unavailable local data does not prevent a new route being used.
        routeHydrated.current = true;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onRouteChange, route, stationOptions]);
  const toggleFavorite = (code: string) => {
    const next = favoriteCodes.includes(code) ? favoriteCodes.filter(value => value !== code) : [...favoriteCodes, code].slice(-6);
    try {
      window.localStorage.setItem(favoriteStationsStorageKey, JSON.stringify(next));
      setStorageMessage("");
    } catch {
      setStorageMessage(copy.storageError);
    }
    setFavoriteCodes(next);
  };
  const saveRoute = () => {
    const origin = stationOptions.find(station => station.code === originCode);
    const destination = stationOptions.find(station => station.code === destinationCode);
    if (!origin || !destination || origin.code === destination.code) return;
    const nextRoute = { originCode: origin.code, originName: origin.name, destinationCode: destination.code, destinationName: destination.name };
    try {
      window.localStorage.setItem(routeStorageKey, JSON.stringify(nextRoute));
      setStorageMessage("");
    } catch {
      setStorageMessage(copy.storageError);
    }
    onRouteChange(nextRoute);
  };
  const clearRoute = () => {
    resetSearch();
    try {
      window.localStorage.removeItem(routeStorageKey);
      setStorageMessage("");
    } catch {
      setStorageMessage(copy.storageError);
    }
    setOriginCode("");
    setDestinationCode("");
    onRouteChange(null);
  };
  return <aside className="journeyPlannerPanel" aria-label={copy.title}>
    <header className="jpHeader"><h2>{copy.title}</h2><button type="button" onClick={closePlanner} aria-label={copy.close}>×</button></header>
    <div className="jpBody"><div className="jpSourceNotice"><strong>{copy.lead}</strong><p>{copy.detail}</p>
      <label className="routeField">{copy.origin}<select value={originCode} onChange={event => { resetSearch(); setOriginCode(event.target.value); }}><option value="">{copy.chooseStation}</option>{stationOptions.map(station => <option value={station.code} key={station.code}>{station.name}</option>)}</select></label>
      <label className="routeField">{copy.destination}<select value={destinationCode} onChange={event => { resetSearch(); setDestinationCode(event.target.value); }}><option value="">{copy.chooseStation}</option>{stationOptions.map(station => <option value={station.code} key={station.code}>{station.name}</option>)}</select></label>
      <div className="routeActions"><button type="button" onClick={findJourneys} disabled={!originCode || !destinationCode || originCode === destinationCode || searchLoading}>{searchLoading ? copy.searching : copy.search}</button><button type="button" onClick={saveRoute} disabled={!originCode || !destinationCode || originCode === destinationCode}>{copy.save}</button>{route && <button className="routeClear" type="button" onClick={clearRoute}>{copy.clear}</button>}</div>
      <p className="jpCoverageNotice">{copy.coverage}</p>
      {searchError && <p className="jpSearchMessage" role="alert">{searchError}</p>}
      {searchResults && searchResults.length === 0 && <p className="jpSearchMessage" role="status">{copy.noResults}</p>}
      {searchResults && searchResults.length > 0 && <section className="jpResults" aria-label={copy.results}>
        <h3>{copy.results}</h3>
        {searchResults.map((connection) => <article className="jpConnection" key={connection.id}>
          <div className="jpConnectionSummary"><strong>{journeyTime(connection.departureAt, language)} – {journeyTime(connection.arrivalAt, language)}</strong><span>{journeyDelay(connection.delaySeconds, language)}</span></div>
          {connection.transferStation && <p className="jpTransfer">{copy.transfer} {connection.transferStation.name}</p>}
          {connection.legs.map((leg, index) => <div className="jpJourneyLeg" key={`${leg.journeyId}-${leg.departureAt}-${index}`}>
            <span>{leg.serviceType} {leg.trainNumber}</span><strong>{leg.from.name} {journeyTime(leg.departureAt, language)}</strong><span>→ {leg.to.name} {journeyTime(leg.arrivalAt, language)}</span>
            {liveTrainNumbers.has(leg.trainNumber) && <button type="button" onClick={() => onSelectTrain(leg.trainNumber)}>{copy.follow}</button>}
          </div>)}
        </article>)}
      </section>}
      {storageMessage && <p className="settingsFeedback" role="status">{storageMessage}</p>}
      {route && <p className="savedRoute"><strong>{copy.activeRoute}</strong><br />{route.originName} → {route.destinationName}</p>}
      <div className="favoriteStations"><strong>{copy.favorites}</strong><p>{copy.favoriteHint}</p><div>{stationOptions.filter(station => favoriteCodes.includes(station.code)).map(station => <button type="button" key={station.code} onClick={() => toggleFavorite(station.code)}>{station.name} ★</button>)}</div><select aria-label={copy.addFavorite} value="" onChange={event => event.target.value && toggleFavorite(event.target.value)}><option value="">{copy.addFavorite}</option>{stationOptions.filter(station => !favoriteCodes.includes(station.code)).map(station => <option value={station.code} key={station.code}>{station.name}</option>)}</select></div>
    </div></div>
  </aside>;
}
