"use client";
import Link from "next/link";
import { useLanguage } from "./LanguageContext";
import type { Panel } from "./panel-navigation";

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    radar: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z" /><path d="M8 3v15M16 6v15" /></>,
    stations: <><path d="M3 20h18M5 17V8l7-5 7 5v9M3 8h18M9 12h6M9 16h6" /></>,
    notices: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
    favorites: <path d="m12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.1-5.6-3-5.6 3 1.1-6.1L3 9.5l6.2-.9L12 3Z" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" /></>,
    planner: <><path d="M5 5h14M5 12h14M5 19h14" /><circle cx="3" cy="5" r=".5" /><circle cx="3" cy="12" r=".5" /><circle cx="3" cy="19" r=".5" /></>,
  };
  return <svg viewBox="0 0 24 24" className="uiIcon" aria-hidden="true">{paths[name]}</svg>;
}
export function AppNavigation({ active, onOpen, onHome }: { active: string; onOpen?: (kind: Panel["kind"]) => void; onHome?: () => void }) {
  const { language } = useLanguage(); const en = language === "en";
  const item = (kind: Panel["kind"], title: string, extra = "") => onOpen
    ? <button key={kind} type="button" className={`${active === kind ? "active" : ""} ${extra}`} onClick={() => onOpen(kind)} aria-pressed={active === kind}><NavIcon name={kind} /><span>{title}</span></button>
    : <Link key={kind} className={extra} href={`/?panel=${kind}`}><NavIcon name={kind} /><span>{title}</span></Link>;
  return <header className="topbar appNavigation">
    <Link className="railBrand radarBrand" href="/" aria-label={en ? "Liveopweg home" : "LiveOpWeg startpagina"} onClick={onHome}><span className="radarWordmark">live<span>op</span>weg</span><span className="radarBrandCaption">TREINRADAR</span></Link>
    <nav className="sideNav" aria-label={en ? "Main navigation" : "Hoofdnavigatie"}>
      <Link className={active === "radar" || active === "train" || active === "station" ? "active" : ""} href="/" onClick={onHome} aria-current={active === "radar" ? "page" : undefined}><NavIcon name="radar" /><span>{en ? "Train radar" : "Treinradar"}</span></Link>
      {item("stations", "Stations")}{item("notices", en ? "Disruptions" : "Spoormeldingen")}{item("favorites", en ? "Favorites" : "Favorieten")}
      {item("planner", en ? "Journey planner" : "Reisplanner", "radarSecondary")}{item("more", en ? "More" : "Meer", "radarMoreButton")}
      <Link className={`radarSettingsLink ${active === "settings" ? "active" : ""}`} href="/instellingen" aria-current={active === "settings" ? "page" : undefined}><NavIcon name="settings" /><span>{en ? "Settings" : "Instellingen"}</span></Link>
    </nav>
    <div className="radarSidebarFoot"><span>{en ? "Trains in view." : "Treinen in beeld."}</span><small>{en ? "The Netherlands on the move." : "Een overzicht van Nederland onderweg."}</small></div>
  </header>;
}
