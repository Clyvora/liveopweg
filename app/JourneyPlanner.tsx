"use client";

import { useLanguage } from "./LanguageContext";

export function JourneyPlanner({ onClose }: { onClose: () => void }) {
  const { language } = useLanguage();
  const copy = language === "en"
    ? { title: "Plan a journey", close: "Close journey planner", lead: "Journey advice is not yet available in LiveOpWeg.", detail: "For connections, transfers and arrival times, use the official NS journey planner.", action: "Open NS journey planner ↗" }
    : { title: "Plan je reis", close: "Sluit reisplanner", lead: "Reisadviezen zijn nog niet beschikbaar in LiveOpWeg.", detail: "Gebruik voor verbindingen, overstappen en aankomsttijden de officiële NS Reisplanner.", action: "Open NS Reisplanner ↗" };
  return <aside className="journeyPlannerPanel" aria-label={copy.title}>
    <header className="jpHeader"><h2>{copy.title}</h2><button type="button" onClick={onClose} aria-label={copy.close}>×</button></header>
    <div className="jpBody"><div className="jpSourceNotice"><strong>{copy.lead}</strong><p>{copy.detail}</p><a href="https://www.ns.nl/reisplanner/" target="_blank" rel="noopener noreferrer">{copy.action}</a></div></div>
  </aside>;
}
