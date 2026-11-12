"use client";
import { useMemo } from "react";
import type { RailObservation } from "../packages/protocol/rail";
import { observationIsStale } from "../packages/domain-rail/display-position";
import { useLanguage } from "./LanguageContext";
import { AppIcon } from "./Icons";

export function fleetStats(vehicles: RailObservation[], now = Date.now()) {
  let measured = 0, moving = 0, fresh = 0, maxSpeed: number | null = null;
  for (const vehicle of vehicles) {
    if (vehicle.quality.state !== "FRESH_SOURCE" || observationIsStale(vehicle, now)) continue;
    fresh++;
    if (vehicle.speed === null) continue;
    measured++;
    if (vehicle.speed.valueKmh >= 5) moving++;
    maxSpeed = Math.max(maxSpeed ?? 0, Math.round(vehicle.speed.valueKmh));
  }
  return { total: vehicles.length, measured, moving, fresh, maxSpeed };
}

export function DelayStats({ vehicles, now, onClose }: { vehicles: RailObservation[]; now: number; onClose: () => void }) {
  const { language } = useLanguage();
  const en = language === "en";
  const stats = useMemo(() => fleetStats(vehicles, now), [vehicles, now]);
  const labels = en
    ? { title: "Fleet overview", total: "Trains in view", moving: "Moving", fresh: "Current positions", max: "Highest recent speed", note: "Based on received positions. Outdated readings are excluded from movement and speed figures. National delay statistics are not available." }
    : { title: "Vlootoverzicht", total: "Treinen in beeld", moving: "In beweging", fresh: "Actuele posities", max: "Hoogste recente snelheid", note: "Gebaseerd op ontvangen posities. Oude metingen tellen niet mee voor beweging en snelheid. Landelijke vertragingscijfers zijn niet beschikbaar." };
  return <section className="delayStatsPanel uiPanel" aria-label={labels.title}>
    <header className="uiPanelHeader"><div><span className="radarEyebrow">{en ? "ON THE RADAR" : "OP DE RADAR"}</span><h2>{labels.title}</h2></div><button className="radarClose" type="button" aria-label={en ? "Close statistics" : "Sluit statistieken"} onClick={onClose}><AppIcon name="close" /></button></header>
    <div className="dsGrid">
      <div className="dsCard"><span>{labels.total}</span><strong>{stats.total}</strong></div>
      <div className="dsCard"><span>{labels.fresh}</span><strong>{stats.fresh}</strong></div>
      <div className="dsCard"><span>{labels.moving}</span><strong>{stats.moving}</strong></div>
      <div className="dsCard"><span>{labels.max}</span><strong>{stats.maxSpeed === null ? "—" : `${stats.maxSpeed} ${en ? "km/h" : "km/u"}`}</strong></div>
    </div>
    <p className="dsDataNote">{stats.measured} {en ? "current speed readings." : "actuele snelheidsmetingen."} {labels.note}</p>
  </section>;
}
