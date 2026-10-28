"use client";

import { useMemo, useState } from "react";
import type { RailStation } from "../packages/domain-rail/stations";
import { searchStations } from "../packages/domain-rail/stations";
import { useFavoriteStations } from "./useFavoriteStations";
import { useLanguage } from "./LanguageContext";

export function RadarDirectory({ stations, favoritesOnly, onSelect, onClose, initialQuery = "", onQueryChange }: {
  stations: RailStation[]; favoritesOnly: boolean; onSelect: (station: RailStation) => void; onClose: () => void;
  initialQuery?: string; onQueryChange?: (value: string) => void;
}) {
  const { language } = useLanguage();
  const en = language === "en";
  const [query, setQuery] = useState(initialQuery);
  const { favorites, toggle, error: storageError, retry } = useFavoriteStations();
  const visible = useMemo(() => {
    const list = query.trim() ? searchStations(query, stations) : [...stations].sort((a, b) => a.name.localeCompare(b.name, "nl"));
    return favoritesOnly ? list.filter(station => favorites.includes(station.code)) : list;
  }, [stations, query, favoritesOnly, favorites]);
  const title = favoritesOnly ? (en ? "Favorites" : "Favorieten") : (en ? "Stations" : "Stations");
  return <aside className="radarDirectory radarCard" aria-label={title}>
    <header><div><span className="radarEyebrow">LIVEOPWEG</span><h2>{title}</h2></div><button className="radarClose" type="button" onClick={onClose} aria-label={en ? "Close stations" : "Sluit stations"}>×</button></header>
    <p>{favoritesOnly ? (en ? "Your saved stations, always close by." : "Je vaste stations, altijd dichtbij.") : (en ? "Find your station and view departures." : "Vind je station en bekijk de vertrektijden.")}</p>
    <input className="radarDirectorySearch" aria-label={en ? "Search stations" : "Zoek stations"} placeholder={en ? "Station name or code" : "Stationsnaam of code"} value={query} onChange={event => { setQuery(event.target.value); onQueryChange?.(event.target.value); }} />
    {storageError && <div className="uiNotice" role="status"><p>{en ? "Favorites are kept for this session. Your browser could not save them." : "Je favorieten blijven deze sessie bewaard. Je browser kon ze niet opslaan."}</p><button onClick={retry}>{en ? "Try saving again" : "Opnieuw opslaan"}</button></div>}
    <ul>{visible.map(station => <li key={station.code}>
      <button type="button" onClick={() => onSelect(station)}><strong>{station.name}</strong><small>{station.code}</small></button>
      <button type="button" className="radarFavorite" aria-pressed={favorites.includes(station.code)} aria-label={`${favorites.includes(station.code) ? (en ? "Remove favorite" : "Verwijder favoriet") : (en ? "Save favorite" : "Bewaar favoriet")}: ${station.name}`} onClick={() => toggle(station.code)}>{favorites.includes(station.code) ? "★" : "☆"}</button>
    </li>)}</ul>
    {!visible.length && <p>{favoritesOnly && !query ? (en ? "Save a station using the star in Stations." : "Bewaar een station via het sterretje bij Stations.") : (en ? "No stations found." : "Geen stations gevonden.")}</p>}
  </aside>;
}
