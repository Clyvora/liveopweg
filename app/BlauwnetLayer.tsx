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

export type RegionalTrainPosition = z.infer<typeof positionsSchema>["positions"][number];

export function regionalOperator(operator: string) {
  return operator === "Blauwnet A" ? "Blauwnet (Arriva)" : operator === "Blauwnet K" ? "Blauwnet (Keolis)" : operator;
}

export function BlauwnetLayer({ map, language, onUnavailable, onPositions, onSelect }: {
  map: RefObject<MapLibreMap | null>;
  language: string;
  onUnavailable: (unavailable: boolean) => void;
  onPositions: (positions: RegionalTrainPosition[]) => void;
  onSelect: (position: RegionalTrainPosition) => void;
}) {
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const markers = new Map<string, { marker: Marker; position: RegionalTrainPosition }>();
    let stopped = false;
    let request: AbortController | null = null;
    let refreshTimer: number | undefined;
    const english = language === "en";
    const clear = () => {
      for (const { marker } of markers.values()) marker.remove();
      markers.clear();
      onPositions([]);
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
        const { Marker } = await import("maplibre-gl");
        if (stopped || document.hidden || controller.signal.aborted) return;
        const present = new Set<string>();
        for (const position of positions) {
          const expiresAt = Date.parse(position.expiresAt);
          if (expiresAt <= Date.now()) continue;
          present.add(position.id);
          const measured = position.kind === "KV6_POSITION";
          const label = measured ? (english ? "Measured position" : "Gemeten positie") : (english ? "Estimated position" : "Geschatte positie");
          const operator = regionalOperator(position.operator);
          const title = [operator, position.service, position.trainNumber ?? position.line, position.destination].filter(Boolean).join(" · ");
          const coordinates: [number, number] = [position.longitude, position.latitude];
          const current = markers.get(position.id);
          if (current) {
            current.marker.setLngLat(coordinates);
            const button = current.marker.getElement();
            button.classList.toggle("measured", measured);
            button.setAttribute("aria-label", `${label} · ${title}`);
            current.position = position;
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
          button.addEventListener("click", event => {
            event.stopPropagation();
            const selected = markers.get(position.id);
            if (selected) onSelect(selected.position);
          });
          const marker = new Marker({ element: button }).setLngLat(coordinates).addTo(instance);
          markers.set(position.id, { marker, position });
        }
        for (const [id, { marker }] of markers) {
          if (present.has(id)) continue;
          marker.remove();
          markers.delete(id);
        }
        onPositions(positions.filter(position => present.has(position.id)));
        onUnavailable(false);
      } catch {
        if (!stopped && !document.hidden) {
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
      let changed = false;
      for (const [id, { marker, position }] of markers) {
        if (Date.parse(position.expiresAt) > Date.now()) continue;
        marker.remove();
        markers.delete(id);
        changed = true;
      }
      if (changed) onPositions([...markers.values()].map(({ position }) => position));
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
  }, [language, map, onUnavailable, onPositions, onSelect]);

  return null;
}
