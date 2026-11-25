"use client";

import { useEffect, type RefObject } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { z } from "zod";
import { realtimeHttpUrl } from "./realtime-url";

const positionsSchema = z.object({
  positions: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["KV6_POSITION", "TIMETABLE_TRACK_ESTIMATE"]),
    trainNumber: z.string().nullable(),
    line: z.string().nullable(),
    route: z.string().nullable(),
    operator: z.string(),
    service: z.string().nullable(),
    destination: z.string().nullable(),
    from: z.string().nullable(),
    to: z.string().nullable(),
    measuredAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime(),
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
  })).max(100),
});

export function BlauwnetLayer({ map, language, onUnavailable }: {
  map: RefObject<MapLibreMap | null>;
  language: string;
  onUnavailable: (unavailable: boolean) => void;
}) {
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const markers = new Map<string, { marker: Marker; expiresAt: number }>();
    let stopped = false;
    let request: AbortController | null = null;
    let refreshTimer: number | undefined;
    const english = language === "en";
    const clock = new Intl.DateTimeFormat(english ? "en-GB" : "nl-NL", { timeZone: "Europe/Amsterdam", timeStyle: "medium" });
    const clear = () => {
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
    };

    const load = async () => {
      if (stopped || document.hidden || request) return;
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch(realtimeHttpUrl("/v1/rail/blauwnet/positions"), { signal: controller.signal });
        if (!response.ok) throw new Error("Blauwnet positions unavailable");
        const { positions } = positionsSchema.parse(await response.json());
        const { Marker, Popup } = await import("maplibre-gl");
        if (stopped || document.hidden || controller.signal.aborted) return;
        const present = new Set<string>();
        for (const position of positions) {
          const expiresAt = Date.parse(position.expiresAt);
          if (expiresAt <= Date.now()) continue;
          present.add(position.id);
          const measured = position.kind === "KV6_POSITION";
          const label = measured ? (english ? "Measured position" : "Gemeten positie") : (english ? "Estimated position" : "Geschatte positie");
          const operator = position.operator === "Blauwnet A" ? "Blauwnet (Arriva)" : position.operator === "Blauwnet K" ? "Blauwnet (Keolis)" : position.operator;
          const title = [operator, position.service, position.trainNumber ?? position.line, position.destination].filter(Boolean).join(" · ");
          const detail = document.createElement("div");
          const heading = document.createElement("strong");
          heading.textContent = title;
          const section = document.createElement("div");
          section.textContent = measured ? position.route ?? "" : `${position.from} → ${position.to}`;
          const explanation = document.createElement("small");
          explanation.textContent = measured && position.measuredAt
            ? `${label} · NDOV · ${clock.format(new Date(position.measuredAt))}`
            : (english ? "Estimated from timetable updates" : "Geschat op basis van haltetijden");
          detail.append(heading, section, explanation);
          const coordinates: [number, number] = [position.longitude, position.latitude];
          const current = markers.get(position.id);
          if (current) {
            current.marker.setLngLat(coordinates).getPopup()?.setDOMContent(detail);
            const button = current.marker.getElement();
            button.classList.toggle("measured", measured);
            button.setAttribute("aria-label", `${label} · ${title}`);
            current.expiresAt = expiresAt;
            continue;
          }
          const button = document.createElement("button");
          button.type = "button";
          button.className = "blauwnetEstimateMarker";
          button.classList.toggle("measured", measured);
          button.setAttribute("aria-label", `${label} · ${title}`);
          const glyph = document.createElement("span");
          glyph.className = "blauwnetTrainGlyph";
          button.append(glyph);
          const popup = new Popup({ offset: 24, closeButton: false, className: "blauwnetPositionPopup" }).setDOMContent(detail);
          const marker = new Marker({ element: button }).setLngLat(coordinates).setPopup(popup).addTo(instance);
          markers.set(position.id, { marker, expiresAt });
        }
        for (const [id, { marker }] of markers) {
          if (present.has(id)) continue;
          marker.remove();
          markers.delete(id);
        }
        onUnavailable(false);
      } catch {
        if (!stopped && !document.hidden) {
          clear();
          onUnavailable(true);
        }
      } finally {
        window.clearTimeout(timeout);
        request = null;
        if (!stopped && !document.hidden) refreshTimer = window.setTimeout(load, 12_000);
      }
    };
    const visibility = () => {
      window.clearTimeout(refreshTimer);
      if (document.hidden) {
        request?.abort();
        clear();
      } else void load();
    };
    document.addEventListener("visibilitychange", visibility);
    const expiryTimer = window.setInterval(() => {
      for (const [id, { marker, expiresAt }] of markers) {
        if (expiresAt > Date.now()) continue;
        marker.remove();
        markers.delete(id);
      }
    }, 1_000);
    void load();
    return () => {
      stopped = true;
      request?.abort();
      window.clearTimeout(refreshTimer);
      window.clearInterval(expiryTimer);
      document.removeEventListener("visibilitychange", visibility);
      clear();
    };
  }, [language, map, onUnavailable]);

  return null;
}
