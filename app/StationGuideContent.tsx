"use client";

import { useState } from "react";
import { AppIcon } from "./Icons";
import type { StationGuide, StationGuideItem } from "./station-guide";

export function StationPhoto({ photo, en }: { photo: StationGuide["photo"]; en: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const licenseUrl = `https://creativecommons.org/licenses/${photo.license.toLowerCase()}/4.0/`;
  return <figure className="stationPhoto">
    {/* eslint-disable-next-line @next/next/no-img-element -- These local WebP thumbnails are already sized for the panel. */}
    <img src={`/station-photos/${photo.file}`} alt={photo.alt[en ? 1 : 0]} width={900} height={300}
      style={{ objectPosition: photo.position }} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    <figcaption>
      <a href={photo.page} target="_blank" rel="noreferrer">{photo.author}</a>
      <span aria-hidden="true"> · </span>
      <a href={licenseUrl} target="_blank" rel="noreferrer">CC {photo.license} 4.0</a>
      <span> · {en ? "Resized preview" : "Verkleinde foto"}</span>
    </figcaption>
  </figure>;
}

export function StationGuideContent({ items, en }: { items: StationGuideItem[]; en: boolean }) {
  const index = en ? 1 : 0;
  return <ul className="stationGuideList">
    {items.map(item => <li key={item.title[0]}>
      <a href={item.url} target="_blank" rel="noreferrer">
        <span className="stationGuideIcon"><AppIcon name={item.icon} /></span>
        <span className="stationGuideText"><strong>{item.title[index]}</strong><small>{item.detail[index]}</small></span>
        <AppIcon name="external" />
      </a>
    </li>)}
  </ul>;
}
