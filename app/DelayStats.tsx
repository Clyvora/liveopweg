"use client";

import { useMemo } from "react";
import type { RailObservation } from "../packages/protocol/rail";
import { useLanguage } from "./LanguageContext";

export function fleetStats(vehicles: RailObservation[]) {
  const measured = vehicles.filter((vehicle) => vehicle.speed !== null);
  const moving = measured.filter((vehicle) => vehicle.speed!.valueKmh >= 5).length;
  const fresh = vehicles.filter((vehicle) => vehicle.quality.state === "FRESH_SOURCE").length;
  const speeds = measured.map((vehicle) => vehicle.speed!.valueKmh);
  return {
    total: vehicles.length,
    measured: measured.length,
    moving,
    fresh,
    maxSpeed: speeds.length ? Math.round(Math.max(...speeds)) : null,
  };
}

export function DelayStats({ vehicles, onClose }: { vehicles: RailObservation[]; onClose: () => void }) {
  const { language } = useLanguage();
  const stats = useMemo(() => fleetStats(vehicles), [vehicles]);
  const labels = language === "en"
    ? { title: "Live fleet", total: "Trains visible", moving: "Moving", fresh: "Fresh positions", max: "Highest measured speed", coverage: "With speed reading", of: "of", note: "Calculated from current vehicle observations. National delay statistics are not available from this feed." }
    : { title: "Live vloot", total: "Treinen zichtbaar", moving: "In beweging", fresh: "Actuele posities", max: "Hoogste gemeten snelheid", coverage: "Met snelheidsmeting", of: "van", note: "Berekend uit actuele treinposities. Landelijke vertragingscijfers zijn niet beschikbaar in deze gegevensfeed." };

  return <section className="delayStatsPanel" aria-label={labels.title}>
    <header className="dsHeader"><h3>{labels.title}</h3><button type="button" aria-label={language === "en" ? "Close statistics" : "Sluit statistieken"} onClick={onClose}>×</button></header>
    <div className="dsGrid">
      <div className="dsCard dsOnTime"><span>{labels.total}</span><strong>{stats.total}</strong></div>
      <div className="dsCard dsDelayed"><span>{labels.moving}</span><strong>{stats.moving}</strong></div>
      <div className="dsCard dsAvg"><span>{labels.fresh}</span><strong>{stats.fresh}</strong></div>
      <div className="dsCard dsMax"><span>{labels.max}</span><strong>{stats.maxSpeed === null ? "—" : `${stats.maxSpeed} km/u`}</strong></div>
    </div>
    <p className="dsDataNote">{labels.coverage}: {stats.measured} {labels.of} {stats.total}. {labels.note}</p>
  </section>;
}
