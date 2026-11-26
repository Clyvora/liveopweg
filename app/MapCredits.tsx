"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { BaseMapKey } from "./radar-basemaps";
import { guidePath } from "./site";

export function MapCredits({ baseMap, roadMap, language, mapReady }: {
  baseMap: BaseMapKey; roadMap: boolean; language: string; mapReady: boolean;
}) {
  const en = language === "en";
  const [choice, setChoice] = useState<boolean | null>(null);
  const [expired, setExpired] = useState(false);
  const popover = useRef<HTMLDivElement>(null);
  const open = choice ?? (mapReady && !expired);
  useEffect(() => {
    if (!mapReady) return;
    const timeout = window.setTimeout(() => {
      if (popover.current?.contains(document.activeElement)) setChoice(true);
      setExpired(true);
    }, 5_000);
    return () => window.clearTimeout(timeout);
  }, [mapReady]);
  return <>
    <button type="button" aria-label={en ? "Map credits" : "Kaartbronnen"} aria-expanded={open} aria-controls="map-credits" onClick={() => setChoice(!open)}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
      </svg>
    </button>
    <div className="mapCreditsPopover" id="map-credits" hidden={!open} ref={popover}>
      {baseMap === "satellite" ? <>
        <a href="https://www.pdok.nl/introductie/-/article/pdok-luchtfoto-rgb-open-">PDOK / Kadaster</a>
      </> : <>
        <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>
        {baseMap === "light" && <> · <a href="https://openfreemap.org/">OpenFreeMap</a> · OpenMapTiles</>}
      </>}
      <span>{roadMap ? (en ? "Road alerts: NDW and data providers" : "Wegmeldingen: NDW en leveranciers") : "ProRail / PDOK (CC0)"}</span>
      {!roadMap && <Link href={guidePath}>{en ? "About the train radar (Dutch)" : "Over de treinradar"}</Link>}
    </div>
  </>;
}
