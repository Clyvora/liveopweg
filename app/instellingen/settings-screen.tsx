"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "../LanguageContext";
import { useTheme } from "../ThemeContext";

type IconName = "map" | "bell" | "settings" | "sun" | "globe" | "train";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    map: <><path d="m3.5 6 5-2.5 7 3 5-2.5v14l-5 2.5-7-3-5 2.5V6Z" /><path d="M8.5 3.5v14M15.5 6.5v14" /></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z" /><path d="M10 20h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
    train: <><rect x="6" y="3" width="12" height="15" rx="4" /><path d="M8 21l2-3m6 0 2 3M9 7h6M8 13h8" /></>,
  };
  return <svg className="uiIcon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function SettingsScreen() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("liveopweg-notifications") === "on");
  const [notificationMessage, setNotificationMessage] = useState("");

  async function updateNotifications() {
    if (notificationsEnabled) {
      window.localStorage.setItem("liveopweg-notifications", "off");
      setNotificationsEnabled(false);
      setNotificationMessage("Browsermeldingen voor geselecteerde treinen staan uit.");
      return;
    }
    if (!("Notification" in window)) {
      setNotificationMessage("Deze browser ondersteunt geen meldingen.");
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      setNotificationMessage("Geef LiveOpWeg toestemming in je browserinstellingen om meldingen te ontvangen.");
      return;
    }
    window.localStorage.setItem("liveopweg-notifications", "on");
    setNotificationsEnabled(true);
    setNotificationMessage("Meldingen over vertraging bij je geselecteerde trein staan aan.");
  }

  return <main className="settingsPage">
    <aside className="settingsSidebar" aria-label="Hoofdnavigatie">
      <Link className="settingsBrand" href="/"><span className="settingsBrandMark"><Icon name="train" /></span><strong>Live<span>Op</span>Weg</strong></Link>
      <nav className="settingsNav">
        <Link href="/"><Icon name="train" /><span>Treinen</span></Link>
        <Link href="/meldingen"><Icon name="bell" /><span>Meldingen</span></Link>
        <Link href="/instellingen" className="active" aria-current="page"><Icon name="settings" /><span>Instellingen</span></Link>
      </nav>
      <small>Altijd onderweg, altijd op de hoogte.</small>
    </aside>
    <div className="settingsMain">
      <header className="settingsIntro"><span>LiveOpWeg</span><h1>Instellingen</h1><p>Pas de site aan zoals jij hem graag gebruikt. Je kaartlagen kies je direct op de betreffende kaart.</p></header>
      <div className="settingsGrid">
        <section className="settingsCard"><div className="settingsCardHeading"><span className="settingsCardIcon"><Icon name="sun" /></span><div><h2>Weergave</h2><p>Pas het uiterlijk van de site aan.</p></div></div>
          <div className="settingsRow"><div><strong>Kleurthema</strong><small>De instelling wordt op dit apparaat bewaard.</small></div><div className="settingsChoices" role="group" aria-label="Kleurthema"><button type="button" className={theme === "light" ? "selected" : ""} aria-pressed={theme === "light"} onClick={() => { if (theme !== "light") toggleTheme(); }}>Licht</button><button type="button" className={theme === "dark" ? "selected" : ""} aria-pressed={theme === "dark"} onClick={() => { if (theme !== "dark") toggleTheme(); }}>Donker</button></div></div>
        </section>
        <section className="settingsCard"><div className="settingsCardHeading"><span className="settingsCardIcon"><Icon name="globe" /></span><div><h2>Taal</h2><p>Voor de beschikbare vertalingen in de app.</p></div></div>
          <div className="settingsRow"><div><strong>Interface</strong><small>Je keuze blijft bewaard op dit apparaat.</small></div><div className="settingsChoices" role="group" aria-label="Taal"><button type="button" className={language === "nl" ? "selected" : ""} aria-pressed={language === "nl"} onClick={() => setLanguage("nl")}>Nederlands</button><button type="button" className={language === "en" ? "selected" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button></div></div>
        </section>
        <section className="settingsCard"><div className="settingsCardHeading"><span className="settingsCardIcon"><Icon name="bell" /></span><div><h2>Browsermeldingen</h2><p>Alleen voor vertraging van de trein die je selecteert.</p></div></div>
          <div className="settingsRow"><div><strong>Vertragingsmeldingen</strong><small>Je browser vraagt mogelijk eerst om toestemming.</small></div><button className={`settingsSwitch ${notificationsEnabled ? "on" : ""}`} type="button" role="switch" aria-checked={notificationsEnabled} onClick={updateNotifications}><span /></button></div>
          {notificationMessage && <p className="settingsFeedback" role="status">{notificationMessage}</p>}
        </section>
        <section className="settingsCard settingsCardLinks"><div className="settingsCardHeading"><span className="settingsCardIcon"><Icon name="map" /></span><div><h2>Kaarten en filters</h2><p>Elke kaart heeft alleen de lagen die daar relevant zijn.</p></div></div><div className="settingsLinks"><Link href="/">Treinenkaart <span>Treinen, stations en sporen →</span></Link><Link href="/meldingen">Meldingenkaart <span>Files, incidenten en werkzaamheden →</span></Link></div></section>
      </div>
    </div>
  </main>;
}
