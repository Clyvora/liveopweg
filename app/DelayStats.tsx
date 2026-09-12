"use client";

import { useMemo } from "react";
import type { RailObservation } from "../packages/protocol/rail";
import { useLanguage } from "./LanguageContext";

export function DelayStats({ vehicles }: { vehicles: RailObservation[] }) {
  const { t } = useLanguage();
  
  const stats = useMemo(() => {
    // Generate mock delay data based on vehicle IDs (in real app, this would come from journey data)
    const delays = vehicles.map(v => {
      const hash = v.vehicleId.split("").reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
      return Math.abs(hash) % 600; // 0-600 seconds delay
    });
    const onTime = delays.filter(d => d === 0).length;
    const delayed = delays.filter(d => d > 0).length;
    const severelyDelayed = delays.filter(d => d >= 300).length;
    const avgDelay = delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : 0;
    const maxDelay = delays.length ? Math.max(...delays) : 0;
    const onTimePercentage = vehicles.length ? Math.round((onTime / vehicles.length) * 100) : 0;
    
    // Distribution buckets
    const buckets = [
      { label: "0 min", count: delays.filter(d => d === 0).length, color: "#4caf50" },
      { label: "<5 min", count: delays.filter(d => d > 0 && d < 300).length, color: "#ff9800" },
      { label: "5-15 min", count: delays.filter(d => d >= 300 && d < 900).length, color: "#f44336" },
      { label: "15+ min", count: delays.filter(d => d >= 900).length, color: "#9c27b0" },
    ];
    const maxCount = Math.max(1, ...buckets.map(b => b.count));
    
    return { onTime, delayed, severelyDelayed, avgDelay, maxDelay, onTimePercentage, buckets, maxCount };
  }, [vehicles]);

  const formatDelay = (seconds: number) => {
    if (seconds === 0) return "0 min";
    if (seconds < 60) return `<1 min`;
    return `${Math.round(seconds / 60)} min`;
  };

  return (
    <div className="delayStatsPanel">
      <h3>{t("stats.title")}</h3>
      <div className="dsGrid">
        <div className="dsCard dsOnTime">
          <span>{t("stats.on_time")}</span>
          <strong>{stats.onTimePercentage}%</strong>
        </div>
        <div className="dsCard dsDelayed">
          <span>{t("stats.delayed")}</span>
          <strong>{stats.delayed}</strong>
        </div>
        <div className="dsCard dsAvg">
          <span>{t("stats.avg_delay")}</span>
          <strong>{formatDelay(stats.avgDelay)}</strong>
        </div>
        <div className="dsCard dsMax">
          <span>{t("stats.max_delay")}</span>
          <strong>{formatDelay(stats.maxDelay)}</strong>
        </div>
      </div>
      <div className="dsDistribution">
        <h4>{t("stats.distribution")}</h4>
        <div className="dsBars">
          {stats.buckets.map(bucket => (
            <div key={bucket.label} className="dsBarWrap">
              <div className="dsBar" style={{ height: `${(bucket.count / stats.maxCount) * 100}%`, backgroundColor: bucket.color }} />
              <span className="dsBarLabel">{bucket.label}</span>
              <span className="dsBarCount">{bucket.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}