"use client";
import Link from "next/link";
import { useLanguage } from "./LanguageContext";
import { useTheme } from "./ThemeContext";
import { AppIcon, BrandMark } from "./Icons";
import type { Panel } from "./panel-navigation";

export function AppNavigation({ active, onOpen, onHome }: { active: string; onOpen?: (kind: Panel["kind"]) => void; onHome?: () => void }) {
  const { language } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const en = language === "en";
  const item = (kind: Panel["kind"], title: string, extra = "") => {
    const className = `${active === kind ? "active" : ""} ${extra}`;
    const content = <><AppIcon name={kind} /><span>{title}</span></>;
    return onOpen
      ? <button key={kind} type="button" className={className} onClick={() => onOpen(kind)} aria-label={kind === "notices" ? (en ? "Rail disruptions" : "Spoormeldingen") : title} aria-pressed={active === kind}>{content}</button>
      : <Link key={kind} className={className} aria-label={kind === "notices" ? (en ? "Rail disruptions" : "Spoormeldingen") : title} href={`/?panel=${kind}`}>{content}</Link>;
  };
  const home = (event: React.MouseEvent) => { if (onHome) { event.preventDefault(); onHome(); } };
  return <>
    <a className="skipLink" href="#main-content">{en ? "Skip to content" : "Ga naar inhoud"}</a>
    <header className="appNavigation topbar">
      <Link className="radarBrand" href="/" aria-label={en ? "Liveopweg home" : "LiveOpWeg startpagina"} onClick={home}><BrandMark /><span className="radarWordmark">liveopweg</span></Link>
      <nav className="sideNav" aria-label={en ? "Main navigation" : "Hoofdnavigatie"}>
        <Link className={["radar", "search", "train", "station"].includes(active) ? "active" : ""} href="/" onClick={home} aria-label={en ? "Train radar" : "Treinradar"} aria-current={active === "radar" ? "page" : undefined}><AppIcon name="radar" /><span>Radar</span></Link>
        {item("stations", "Stations")}
        {item("notices", en ? "Disruptions" : "Meldingen")}
        {item("favorites", en ? "Favorites" : "Favorieten")}
        {item("planner", en ? "Journey planner" : "Reisplanner", "radarSecondary")}
        {item("more", en ? "More" : "Meer", "radarMoreButton")}
      </nav>
      <div className="navigationUtilities">
        <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? (en ? "Light theme" : "Licht thema") : (en ? "Dark theme" : "Donker thema")}><AppIcon name={theme === "dark" ? "sun" : "moon"} /></button>
        <Link className={active === "settings" ? "active" : ""} href="/instellingen" aria-label={en ? "Settings" : "Instellingen"} aria-current={active === "settings" ? "page" : undefined}><AppIcon name="settings" /></Link>
      </div>
    </header>
  </>;
}
