"use client";
import { useId, useState } from "react";
import { searchStations, type RailStation } from "../packages/domain-rail/stations";
import { useLanguage } from "./LanguageContext";

export function StationPicker({ stations, value, onChange, label }: { stations: RailStation[]; value: string; onChange: (value: string) => void; label: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { language } = useLanguage();
  const results = value.trim() ? searchStations(value, stations) : stations.slice(0, 12);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  const commit = (station: RailStation) => { onChange(station.name); setOpen(false); };
  return <div className="stationPicker">
    <label htmlFor={id}>{label}</label>
    <input id={id} value={value} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && results.length ? `${id}-${activeIndex}` : undefined}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onChange={event => { onChange(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); }
        else if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setOpen(true); setActive(open ? (activeIndex + 1) % results.length : 0); }
        else if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setOpen(true); setActive(open ? (activeIndex + results.length - 1) % results.length : results.length - 1); }
        else if (event.key === "Enter" && open && results.length) { event.preventDefault(); commit(results[activeIndex]!); }
      }}
    />
    {open && <div id={`${id}-list`} role="listbox" className="stationPickerResults" aria-label={label}>
      {results.map((station, index) => <button type="button" role="option" tabIndex={-1} aria-selected={activeIndex === index} id={`${id}-${index}`} key={station.code} onPointerDown={event => event.preventDefault()} onClick={() => commit(station)}><strong>{station.name}</strong><small>{station.code}</small></button>)}
      {!results.length && <p role="status">{language === "en" ? "No stations found." : "Geen stations gevonden."}</p>}
    </div>}
  </div>;
}
