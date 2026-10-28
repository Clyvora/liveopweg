"use client";
import { useId, useState } from "react";
import { searchStations, type RailStation } from "../packages/domain-rail/stations";
import { useLanguage } from "./LanguageContext";

export function StationPicker({ stations, value, onChange, label }: { stations: RailStation[]; value: string; onChange: (value: string) => void; label: string }) {
  const id = useId(); const [open, setOpen] = useState(false); const [active, setActive] = useState(0);
  const { language } = useLanguage();
  const results = value.trim() ? searchStations(value, stations).slice(0, 12) : stations.slice(0, 12);
  const commit = (station: RailStation) => { onChange(station.name); setOpen(false); };
  return <div className="stationPicker"><label htmlFor={id}>{label}</label><input id={id} value={value} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && results.length ? `${id}-${Math.min(active, results.length - 1)}` : undefined} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={event => { onChange(event.target.value); setActive(0); setOpen(true); }} onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
    if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setOpen(true); setActive((active + 1) % results.length); }
    if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setOpen(true); setActive((active + results.length - 1) % results.length); }
    if (event.key === "Enter" && open && results.length) { event.preventDefault(); commit(results[Math.min(active, results.length - 1)]!); }
  }} />{open && <div id={`${id}-list`} role="listbox" className="stationPickerResults" aria-label={label}>{results.map((station, index) => <button type="button" role="option" aria-selected={active === index} id={`${id}-${index}`} key={station.code} onMouseDown={event => event.preventDefault()} onClick={() => commit(station)}><strong>{station.name}</strong><small>{station.code}</small></button>)}{!results.length && <p role="status">{language === "en" ? "No stations found." : "Geen stations gevonden."}</p>}</div>}</div>;
}
