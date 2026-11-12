"use client";
import { useState } from "react";
import type { DisruptionsResponse, RailDisruption } from "../packages/protocol/ns-travel";
import { useLanguage } from "./LanguageContext";
import { AppIcon } from "./Icons";

export function RailNotices({ data, error, retry, onSelect, onClose, selectedId, onSelected }: { data: DisruptionsResponse | null; error: boolean; retry: () => void; onSelect: (value: RailDisruption) => void; onClose: () => void; selectedId: string | null; onSelected: (id: string | null) => void }) {
  const { language } = useLanguage(); const en = language === "en";
  const [filter, setFilter] = useState("ALL");
  const selected = data?.disruptions.find(value => value.id === selectedId);
  const visibleFilter = selected && filter !== "ALL" && selected.type !== filter ? "ALL" : filter;
  const notices = data?.disruptions.filter(value => visibleFilter === "ALL" || value.type === visibleFilter) ?? [];
  return <aside className="radarCard radarNotices" aria-label={en ? "Rail disruptions" : "Spoormeldingen"}>
    <header><h2>{en ? "Rail disruptions" : "Spoormeldingen"}</h2><button className="radarClose" onClick={onClose} aria-label={en ? "Close disruptions" : "Sluit spoormeldingen"}><AppIcon name="close" /></button></header>
    <p>{en ? "Disruptions and engineering works affecting trains." : "Storingen en werkzaamheden die treinreizen raken."}</p>
    <div className="uiTabs" role="group" aria-label={en ? "Filter disruptions" : "Filter meldingen"}>{[["ALL", en ? "All" : "Alles"], ["DISRUPTION", en ? "Disruptions" : "Storingen"], ["MAINTENANCE", en ? "Works" : "Werkzaamheden"]].map(([key, title]) => <button key={key} aria-pressed={visibleFilter === key} onClick={() => { onSelected(null); setFilter(key!); }}>{title}</button>)}</div>
    {(error || data?.stale) && <div className="uiNotice" role="status"><p>{en ? "Current disruptions cannot be refreshed. Previously received information may be out of date." : "Actuele meldingen kunnen niet worden vernieuwd. Eerder ontvangen informatie kan verouderd zijn."}</p><button onClick={retry}>{en ? "Try again" : "Opnieuw proberen"}</button></div>}
    {!data && !error && <p role="status">{en ? "Loading disruptions…" : "Spoormeldingen ophalen…"}</p>}
    {data && !notices.length && !error && !data.stale && <p>{en ? "No active disruptions match this filter." : "Geen actieve meldingen binnen dit filter."}</p>}
    <ul className="uiResultList">{notices.map(notice => <li key={notice.id}>
      <button className="uiResultButton" aria-expanded={selectedId === notice.id} onClick={() => { const opening = selectedId !== notice.id; onSelected(opening ? notice.id : null); if (opening) onSelect(notice); }}><strong>{notice.title}</strong><span>{notice.type === "MAINTENANCE" ? (en ? "Engineering works" : "Werkzaamheden") : (en ? "Rail disruption" : "Spoorverstoring")}</span></button>
      {selectedId === notice.id && <div className="uiResultDetail"><p>{notice.description || (en ? "No further details supplied." : "Geen verdere toelichting ontvangen.")}</p><p>{notice.stations.map(s => s.name).join(" · ")}</p>{!notice.geometry && !notice.stations.some(s => s.latitude !== null && s.longitude !== null) && <small>{en ? "No map location supplied by the source." : "De bron levert geen kaartlocatie voor deze melding."}</small>}</div>}
    </li>)}</ul>
    {data?.fetchedAt && <small>{en ? "Updated" : "Bijgewerkt"} {new Date(data.fetchedAt).toLocaleTimeString(language === "en" ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })} · NS</small>}
  </aside>;
}
