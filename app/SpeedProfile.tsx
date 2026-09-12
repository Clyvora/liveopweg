"use client";

import { useMemo, useState, useEffect } from "react";
import type { RailObservation } from "../packages/protocol/rail";
import { useLanguage } from "./LanguageContext";

type SpeedPoint = { time: number; speed: number };

export function SpeedProfile({ vehicle }: { vehicle: RailObservation }) {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => Date.now());
  
  // Update time periodically
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  
  // Generate mock speed data based on vehicle ID
  const speedData = useMemo<SpeedPoint[]>(() => {
    const hash = vehicle.vehicleId.split("").reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
    const baseSpeed = 80 + Math.abs(hash % 60);
    const points: SpeedPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const variation = Math.sin(i * 0.3 + hash) * 30;
      const speed = Math.max(0, Math.min(160, baseSpeed + variation));
      points.push({ time: now - i * 60000, speed: Math.round(speed) });
    }
    return points;
  }, [vehicle.vehicleId, now]);

  const maxSpeed = 160;
  const avgSpeed = Math.round(speedData.reduce((a, b) => a + b.speed, 0) / speedData.length);
  const currentSpeed = speedData[speedData.length - 1]?.speed ?? 0;
  const chartWidth = 280;
  const chartHeight = 80;

  const pathData = speedData.map((point, index) => {
    const x = (index / (speedData.length - 1)) * chartWidth;
    const y = chartHeight - (point.speed / maxSpeed) * chartHeight;
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  const areaPath = `${pathData} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

  const clock = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const formatTime = (ms: number) => clock.format(new Date(ms));

  return (
    <div className="speedProfilePanel">
      <div className="spHeader">
        <h4>{t("speed.title")}</h4>
        <div className="spStats">
          <span><b>{currentSpeed}</b> km/u</span>
          <span>{t("speed.avg")}: {avgSpeed} km/u</span>
        </div>
      </div>
      <svg className="spChart" viewBox={`0 0 ${chartWidth} ${chartHeight + 20}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="speedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2468e9" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2468e9" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#speedGradient)" />
        <path d={pathData} fill="none" stroke="#2468e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Grid lines */}
        {[0, 40, 80, 120, 160].map(speed => {
          const y = chartHeight - (speed / maxSpeed) * chartHeight;
          return <line key={speed} x1="0" y1={y} x2={chartWidth} y2={y} stroke="#e0e5ea" strokeWidth="0.5" />;
        })}
      </svg>
      <div className="spTimeLabels">
        <span>{formatTime(speedData[0]?.time ?? 0)}</span>
        <span>{formatTime(speedData[speedData.length - 1]?.time ?? 0)}</span>
      </div>
    </div>
  );
}