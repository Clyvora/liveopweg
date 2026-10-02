"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  const { language, setLanguage, t } = useLanguage();
  const copy = language === "en" ? {
    nav: "Main navigation", trains: "Trains", notifications: "Notifications", settings: "Settings",
    intro: "Adjust LiveOpWeg to suit you. Choose map layers directly on each map.",
    appearance: "Appearance", appearanceDetail: "Adjust how the site looks.", theme: "Color theme", savedDevice: "This choice is saved on this device.",
    light: "Light", dark: "Dark", languageTitle: "Language", languageDetail: "Choose the language used across the interface.", interface: "Interface",
    browserNotifications: "Browser notifications", browserNotificationsDetail: "Only for delays affecting the train you select.", delayNotifications: "Delay alerts", browserPermission: "Your browser may ask for permission first.",
    mapsFilters: "Maps and filters", mapsDetail: "Each map has the layers relevant to it.", trainMap: "Train map", trainMapDetail: "Trains, stations and tracks →", alertsMap: "Alerts map", alertsMapDetail: "Traffic, incidents and roadworks →",
    notificationsOff: "Browser alerts for selected trains are off.", unsupported: "This browser does not support notifications.", permission: "Allow LiveOpWeg in your browser settings to receive notifications.", notificationsOn: "Delay alerts for your selected train are on.", storageError: "The browser cannot save this setting right now. You can keep using LiveOpWeg without notifications.",
  } : {
    nav: "Hoofdnavigatie", trains: "Treinen", notifications: "Meldingen", settings: "Instellingen",
    intro: "Pas LiveOpWeg aan zoals jij het graag gebruikt. Kies kaartlagen direct op elke kaart.",
    appearance: "Weergave", appearanceDetail: "Pas het uiterlijk van de site aan.", theme: "Kleurthema", savedDevice: "Deze keuze wordt op dit apparaat bewaard.",
    light: "Licht", dark: "Donker", languageTitle: "Taal", languageDetail: "Kies de taal voor de interface.", interface: "Interface",
    browserNotifications: "Browsermeldingen", browserNotificationsDetail: "Alleen voor vertraging van de trein die je selecteert.", delayNotifications: "Vertragingsmeldingen", browserPermission: "Je browser vraagt mogelijk eerst om toestemming.",
    mapsFilters: "Kaarten en filters", mapsDetail: "Elke kaart heeft de lagen die daar relevant zijn.", trainMap: "Treinenkaart", trainMapDetail: "Treinen, stations en sporen →", alertsMap: "Meldingenkaart", alertsMapDetail: "Verkeer, incidenten en werkzaamheden →",
    notificationsOff: "Browsermeldingen voor geselecteerde treinen staan uit.", unsupported: "Deze browser ondersteunt geen meldingen.", permission: "Geef LiveOpWeg toestemming in je browserinstellingen om meldingen te ontvangen.", notificationsOn: "Meldingen over vertraging bij je geselecteerde trein staan aan.", storageError: "De browser kan deze meldingsinstelling nu niet opslaan. Je kunt LiveOpWeg blijven gebruiken zonder meldingen.",
  };
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setNotificationsEnabled(window.localStorage.getItem("liveopweg-notifications") === "on");
      } catch {
        setNotificationsEnabled(false);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function updateNotifications() {
    try {
      if (notificationsEnabled) {
        window.localStorage.setItem("liveopweg-notifications", "off");
        setNotificationsEnabled(false);
        setNotificationMessage(copy.notificationsOff);
        return;
      }
      if (!("Notification" in window)) {
        setNotificationMessage(copy.unsupported);
        return;
      }
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") {
        setNotificationMessage(copy.permission);
        return;
      }
      window.localStorage.setItem("liveopweg-notifications", "on");
      setNotificationsEnabled(true);
      setNotificationMessage(copy.notificationsOn);
    } catch {
      setNotificationMessage(copy.storageError);
    }
  }

  return <main className="settingsPage">
    <aside className="settingsSidebar" aria-label={copy.nav}>
      <Link className="settingsBrand" href="/" aria-label="LiveOpWeg startpagina"><Image src="/liveopweg-logo.png" alt="LiveOpWeg" width={925} height={195} priority /></Link>
      <nav className="settingsNav">
        <Link href="/"><Icon name="train" /><span>{copy.trains}</span></Link>
        <Link href="/meldingen"><Icon name="bell" /><span>{copy.notifications}</span></Link>
        <Link href="/instellingen" className="active" aria-current="page"><Icon name="settings" /><span>{copy.settings}</span></Link>
      </nav>
      <small>{t("settings.always_on_way")}</small>
    </aside>
    <div className="settingsMain">
      <header className="settingsIntro"><span>LiveOpWeg</span><h1>{copy.settings}</h1><p>{copy.intro}</p></header>
      <div className="settingsGrid">
        <section className="settingsCard"><div className="settingsCardHeading"><span className="settingsCardIcon"><Icon name="sun" /></span><div><h2>{copy.appearance}</h2><p>{copy.appearanceDetail}</p></div></div>
          <div className="settingsRow"><div><strong>{copy.theme}</strong><small>{copy.savedDevice}</small></div><div className="settingsChoices" role="group" aria-label={copy.theme}><button type="button" className={theme === "light" ? "selected" : ""} aria-pressed={theme === "light"} onClick={() => { if (theme !== "light") toggleTheme(); }}>{copy.light}</button><button type="button" className={theme === "dark" ? "selected" : ""} aria-pressed={theme === "dark"} onClick={() => { if (theme !== "dark") toggleTheme(); }}>{copy.dark}</button></div></div>
        </section>
        <section className="settingsCard"><div className="settingsCardHeading"><span className="settingsCardIcon"><Icon name="globe" /></span><div><h2>{copy.languageTitle}</h2><p>{copy.languageDetail}</p></div></div>
          <div className="settingsRow"><div><strong>{copy.interface}</strong><small>{copy.savedDevice}</small></div><div className="settingsChoices" role="group" aria-label={copy.languageTitle}><button type="button" className={language === "nl" ? "selected" : ""} aria-pressed={language === "nl"} onClick={() => setLanguage("nl")}>Nederlands</button><button type="button" className={language === "en" ? "selected" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button></div></div>
        </section>
        <section className="settingsCard"><div className="settingsCardHeading"><span className="settingsCardIcon"><Icon name="bell" /></span><div><h2>{copy.browserNotifications}</h2><p>{copy.browserNotificationsDetail}</p></div></div>
          <div className="settingsRow"><div><strong>{copy.delayNotifications}</strong><small>{copy.browserPermission}</small></div><button className={`settingsSwitch ${notificationsEnabled ? "on" : ""}`} type="button" role="switch" aria-checked={notificationsEnabled} onClick={updateNotifications}><span /></button></div>
          {notificationMessage && <p className="settingsFeedback" role="status">{notificationMessage}</p>}
        </section>
        <section className="settingsCard settingsCardLinks"><div className="settingsCardHeading"><span className="settingsCardIcon"><Icon name="map" /></span><div><h2>{copy.mapsFilters}</h2><p>{copy.mapsDetail}</p></div></div><div className="settingsLinks"><Link href="/">{copy.trainMap} <span>{copy.trainMapDetail}</span></Link><Link href="/meldingen">{copy.alertsMap} <span>{copy.alertsMapDetail}</span></Link></div></section>
      </div>
    </div>
  </main>;
}
