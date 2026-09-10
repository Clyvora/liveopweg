"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Language = "nl" | "en";

interface Translations {
  [key: string]: { nl: string; en: string };
}

const translations: Translations = {
  // Header & Navigation
  "search.placeholder": { nl: "Zoek trein, station of materieel", en: "Search train, station or rolling stock" },
  "search.label": { nl: "Zoek trein, station of materieel", en: "Search train, station or rolling stock" },
  
  // Map controls
  "map.zoomIn": { nl: "Inzoomen op kaart", en: "Zoom in on map" },
  "map.zoomOut": { nl: "Uitzoomen op kaart", en: "Zoom out on map" },
  "map.style": { nl: "Kaartstijl", en: "Map style" },
  "map.standard": { nl: "Standaard", en: "Standard" },
  "map.light": { nl: "Donker", en: "Dark" },
  "map.satellite": { nl: "Satelliet", en: "Satellite" },
  "map.close": { nl: "Sluit kaartlagen", en: "Close map layers" },
  "map.layers": { nl: "Kaartbediening", en: "Map controls" },
  
  // Train panel
  "train.speed": { nl: "Snelheid", en: "Speed" },
  "train.delay": { nl: "Vertraging", en: "Delay" },
  "train.nextStop": { nl: "Volgende halte", en: "Next stop" },
  "train.arrival": { nl: "Aankomst (verwacht)", en: "Arrival (expected)" },
  "train.route": { nl: "Ritdetails", en: "Route details" },
  "train.close": { nl: "Sluit treininformatie", en: "Close train info" },
  "train.unknown_operator": { nl: "Vervoerder onbekend", en: "Operator unknown" },
  "train.unknown_origin": { nl: "Vertrekstation onbekend", en: "Origin station unknown" },
  "train.unknown_destination": { nl: "Eindbestemming onbekend", en: "Destination unknown" },
  "train.no_route": { nl: "Ritdetails zijn nog niet beschikbaar.", en: "Route details are not yet available." },
  "train.cancelled": { nl: "Vervalt", en: "Cancelled" },
  "train.track_changed": { nl: "Spoor gewijzigd:", en: "Track changed:" },
  "train.follow": { nl: "Volg trein", en: "Follow train" },
  "train.no_live_position": { nl: "geen livepositie beschikbaar", en: "no live position available" },
  "train.occupancy": { nl: "Bezetting", en: "Occupancy" },
  "train.occupancy.low": { nl: "Laag", en: "Low" },
  "train.occupancy.medium": { nl: "Gemiddeld", en: "Medium" },
  "train.occupancy.high": { nl: "Hoog", en: "High" },
  "train.eta": { nl: "Geschat", en: "Estimated" },
  
  // Station panel
  "station.departures": { nl: "Vertrekken", en: "Departures" },
  "station.arrivals": { nl: "Aankomsten", en: "Arrivals" },
  "station.activity": { nl: "Treinactiviteit", en: "Train activity" },
  "station.many_movements": { nl: "Veel treinbewegingen", en: "Many train movements" },
  "station.regular": { nl: "Regelmatig treinverkeer", en: "Regular train traffic" },
  "station.quiet": { nl: "Rustig treinverkeer", en: "Quiet train traffic" },
  "station.delayed": { nl: "vertraagd", en: "delayed" },
  "station.received": { nl: "ontvangen ritten", en: "received journeys" },
  "station.connecting": { nl: "Verbinding maken", en: "Connecting" },
  "station.unavailable": { nl: "Het stationbord is tijdelijk niet bereikbaar. We proberen het automatisch opnieuw.", en: "The station board is temporarily unavailable. We will try again automatically." },
  "station.no_trains": { nl: "Nog geen meldingen ontvangen voor het komende uur. Dit betekent niet dat er geen treinen rijden.", en: "No notifications received for the coming hour. This does not mean no trains are running." },
  "station.on_time": { nl: "Op tijd", en: "On time" },
  "station.earlier": { nl: "Eerder", en: "Earlier" },
  "station.track_changed_short": { nl: "spoor gewijzigd", en: "track changed" },
  "station.last_received": { nl: "Laatst ontvangen bord:", en: "Last received board:" },
  
  // Theme
  "theme.toggle": { nl: "Donker thema", en: "Dark theme" },
  "theme.light": { nl: "Licht", en: "Light" },
  "theme.dark": { nl: "Donker", en: "Dark" },
  
  // Connection status
  "status.connecting": { nl: "verbinden", en: "connecting" },
  "status.live": { nl: "live", en: "live" },
  "status.reconnecting": { nl: "herstellen", en: "reconnecting" },
  "status.offline": { nl: "offline", en: "offline" },
  
  // Time
  "time.minutes": { nl: "min", en: "min" },
  "time.seconds": { nl: "sec", en: "sec" },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("nl");
  
  const t = useCallback((key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] || entry.nl || key;
  }, [language]);
  
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}