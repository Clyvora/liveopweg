"use client";

import { useState, useCallback } from "react";
import { railStations, type RailStation } from "../packages/domain-rail/stations";
import { useLanguage } from "./LanguageContext";

type JourneyPlan = {
  id: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  transfers: number;
  duration: string;
  status: "on_time" | "delayed" | "cancelled";
  delayMinutes?: number;
};

export function JourneyPlanner({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [plans, setPlans] = useState<JourneyPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [originSuggestions, setOriginSuggestions] = useState<RailStation[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<RailStation[]>([]);
  const [selectedOrigin, setSelectedOrigin] = useState<RailStation | null>(null);
  const [selectedDest, setSelectedDest] = useState<RailStation | null>(null);

  const searchStations = useCallback((query: string, setter: (stations: RailStation[]) => void) => {
    if (!query.trim()) { setter([]); return; }
    const needle = query.toLowerCase();
    const matches = railStations.filter(s => 
      s.code.toLowerCase().includes(needle) || 
      s.name.toLowerCase().includes(needle)
    ).slice(0, 5);
    setter(matches);
  }, []);

  const planJourney = useCallback(async () => {
    if (!selectedOrigin || !selectedDest) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    const mockPlans: JourneyPlan[] = [
      {
        id: "1",
        origin: selectedOrigin.code,
        destination: selectedDest.code,
        departureTime: new Date(Date.now() + 15 * 60000).toISOString(),
        arrivalTime: new Date(Date.now() + 75 * 60000).toISOString(),
        transfers: 0,
        duration: "1:00",
        status: "on_time",
      },
      {
        id: "2",
        origin: selectedOrigin.code,
        destination: selectedDest.code,
        departureTime: new Date(Date.now() + 30 * 60000).toISOString(),
        arrivalTime: new Date(Date.now() + 105 * 60000).toISOString(),
        transfers: 1,
        duration: "1:15",
        status: "delayed",
        delayMinutes: 5,
      },
      {
        id: "3",
        origin: selectedOrigin.code,
        destination: selectedDest.code,
        departureTime: new Date(Date.now() + 45 * 60000).toISOString(),
        arrivalTime: new Date(Date.now() + 95 * 60000).toISOString(),
        transfers: 0,
        duration: "0:50",
        status: "on_time",
      },
    ];
    setPlans(mockPlans);
    setLoading(false);
  }, [selectedOrigin, selectedDest]);

  const clock = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const formatTime = (iso: string) => clock.format(new Date(iso));

  return (
    <aside className="journeyPlannerPanel">
      <header className="jpHeader">
        <h2>{t("planner.title")}</h2>
        <button type="button" onClick={onClose} aria-label={t("planner.close")}>×</button>
      </header>
      <div className="jpBody">
        <div className="jpSearch">
          <div className="jpField">
            <label>{t("planner.from")}</label>
            <div className="jpInputWrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /></svg>
              <input type="text" value={origin} placeholder={t("planner.from_placeholder")} onChange={(e) => { setOrigin(e.target.value); searchStations(e.target.value, setOriginSuggestions); }} />
            </div>
            {originSuggestions.length > 0 && (
              <div className="jpSuggestions">
                {originSuggestions.map(s => (
                  <button key={s.code} type="button" onClick={() => { setSelectedOrigin(s); setOrigin(s.name); setOriginSuggestions([]); }}>
                    <strong>{s.name}</strong><span>{s.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="jpField">
            <label>{t("planner.to")}</label>
            <div className="jpInputWrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M2 12h20" /></svg>
              <input type="text" value={destination} placeholder={t("planner.to_placeholder")} onChange={(e) => { setDestination(e.target.value); searchStations(e.target.value, setDestSuggestions); }} />
            </div>
            {destSuggestions.length > 0 && (
              <div className="jpSuggestions">
                {destSuggestions.map(s => (
                  <button key={s.code} type="button" onClick={() => { setSelectedDest(s); setDestination(s.name); setDestSuggestions([]); }}>
                    <strong>{s.name}</strong><span>{s.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="jpSearchBtn" onClick={planJourney} disabled={!selectedOrigin || !selectedDest || loading}>
            {loading ? t("planner.searching") : t("planner.search")}
          </button>
        </div>
        {plans.length > 0 && (
          <div className="jpResults">
            <h3>{t("planner.results")}</h3>
            {plans.map(plan => (
              <div key={plan.id} className={`jpResult ${plan.status}`}>
                <div className="jpTimes">
                  <span>{formatTime(plan.departureTime)}</span>
                  <span className="jpArrow">→</span>
                  <span>{formatTime(plan.arrivalTime)}</span>
                </div>
                <div className="jpMeta">
                  <span className="jpDuration">{plan.duration}</span>
                  {plan.transfers > 0 && <span className="jpTransfers">{plan.transfers}x overstappen</span>}
                  {plan.status === "delayed" && plan.delayMinutes && (<span className="jpDelay">+{plan.delayMinutes} min</span>)}
                  {plan.status === "cancelled" && <span className="jpCancelled">{t("train.cancelled")}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}