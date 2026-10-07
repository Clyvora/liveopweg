"use client";

import { useEffect, useMemo, useState } from "react";
import type { RailStation } from "../packages/domain-rail/stations";
import { useLanguage } from "./LanguageContext";

export type FollowedRoute = {
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
};

const routeStorageKey = "liveopweg-followed-route";
const favoriteStationsStorageKey = "liveopweg-favorite-stations";

export function JourneyPlanner({ stations, route, onRouteChange, onClose }: { stations: RailStation[]; route: FollowedRoute | null; onRouteChange: (route: FollowedRoute | null) => void; onClose: () => void }) {
  const { language } = useLanguage();
  const [originCode, setOriginCode] = useState(route?.originCode ?? "");
  const [destinationCode, setDestinationCode] = useState(route?.destinationCode ?? "");
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(favoriteStationsStorageKey);
      return saved ? JSON.parse(saved) as string[] : [];
    } catch {
      return [];
    }
  });
  const copy = language === "en"
    ? { title: "Volg een route", close: "Close route panel", lead: "See live trains between two stations.", detail: "Liveopweg highlights the selected route and keeps it ready for your next visit.", save: "Route opslaan", clear: "Route wissen", origin: "Van station", destination: "Naar station" }
    : { title: "Volg een route", close: "Sluit routepaneel", lead: "Volg treinen tussen twee stations.", detail: "Liveopweg onthoudt je route lokaal op dit apparaat en toont hem snel opnieuw.", save: "Route opslaan", clear: "Route wissen", origin: "Vanaf station", destination: "Naar station" };
  const stationOptions = useMemo(() => [...stations].sort((left, right) => left.name.localeCompare(right.name, "nl")), [stations]);
  useEffect(() => {
    if (!route) {
      try {
        const saved = window.localStorage.getItem(routeStorageKey);
        if (saved) onRouteChange(JSON.parse(saved) as FollowedRoute);
      } catch {
        // Invalid local data is ignored; a new route can still be saved.
      }
    }
  }, [onRouteChange, route]);
  const toggleFavorite = (code: string) => {
    setFavoriteCodes(current => {
      const next = current.includes(code) ? current.filter(value => value !== code) : [...current, code].slice(-6);
      window.localStorage.setItem(favoriteStationsStorageKey, JSON.stringify(next));
      return next;
    });
  };
  const saveRoute = () => {
    const origin = stationOptions.find(station => station.code === originCode);
    const destination = stationOptions.find(station => station.code === destinationCode);
    if (!origin || !destination || origin.code === destination.code) return;
    const nextRoute = { originCode: origin.code, originName: origin.name, destinationCode: destination.code, destinationName: destination.name };
    window.localStorage.setItem(routeStorageKey, JSON.stringify(nextRoute));
    onRouteChange(nextRoute);
  };
  const clearRoute = () => {
    window.localStorage.removeItem(routeStorageKey);
    setOriginCode("");
    setDestinationCode("");
    onRouteChange(null);
  };
  return <aside className="journeyPlannerPanel" aria-label={copy.title}>
    <header className="jpHeader"><h2>{copy.title}</h2><button type="button" onClick={onClose} aria-label={copy.close}>×</button></header>
    <div className="jpBody"><div className="jpSourceNotice"><strong>{copy.lead}</strong><p>{copy.detail}</p>
      <label className="routeField">{copy.origin}<select value={originCode} onChange={event => setOriginCode(event.target.value)}><option value="">Kies een station</option>{stationOptions.map(station => <option value={station.code} key={station.code}>{station.name}</option>)}</select></label>
      <label className="routeField">{copy.destination}<select value={destinationCode} onChange={event => setDestinationCode(event.target.value)}><option value="">Kies een station</option>{stationOptions.map(station => <option value={station.code} key={station.code}>{station.name}</option>)}</select></label>
      <div className="routeActions"><button type="button" onClick={saveRoute} disabled={!originCode || !destinationCode || originCode === destinationCode}>{copy.save}</button>{route && <button className="routeClear" type="button" onClick={clearRoute}>{copy.clear}</button>}</div>
      {route && <p className="savedRoute"><strong>Actieve route</strong><br />{route.originName} → {route.destinationName}</p>}
      <div className="favoriteStations"><strong>Favoriete stations</strong><p>Kies stations die je vaak bekijkt.</p><div>{stationOptions.filter(station => favoriteCodes.includes(station.code)).map(station => <button type="button" key={station.code} onClick={() => toggleFavorite(station.code)}>{station.name} ★</button>)}</div><select aria-label="Voeg favoriet station toe" value="" onChange={event => event.target.value && toggleFavorite(event.target.value)}><option value="">+ Station toevoegen</option>{stationOptions.filter(station => !favoriteCodes.includes(station.code)).map(station => <option value={station.code} key={station.code}>{station.name}</option>)}</select></div>
    </div></div>
  </aside>;
}
