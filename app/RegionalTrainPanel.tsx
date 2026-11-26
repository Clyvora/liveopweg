"use client";

import { regionalOperator, type RegionalTrainPosition } from "./BlauwnetLayer";
import { useLanguage } from "./LanguageContext";
import { TrainPanelHeader } from "./TrainPanelHeader";

export function RegionalTrainPanel({ position, current, onClose, onShow }: {
  position: RegionalTrainPosition | null; current: boolean; onClose: () => void; onShow: () => void;
}) {
  const { language, t } = useLanguage();
  const en = language === "en";
  const number = position?.trainNumber ?? position?.line;
  const title = number ? `${t("train.number")} ${number}` : (en ? "Regional train" : "Regionale trein");
  const measured = position?.kind === "KV6_POSITION";
  const time = position?.measuredAt && new Date(position.measuredAt).toLocaleTimeString(en ? "en-GB" : "nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return <aside className="observationPanel trainPanel" aria-label={title}>
    <TrainPanelHeader title={title} subtitle={position?.service} closeLabel={t("train.close")} onClose={onClose} />
    <div className="tpScroll">
      <div className="tpDestination"><h3>{position?.destination ?? t("train.unknown_destination")}</h3>{position && <p>{regionalOperator(position.operator)}</p>}</div>
      {!current && <p className="uiNotice" role="status">{en ? "This position is no longer available." : "Deze positie is niet meer beschikbaar."}</p>}
      {position && <section className="tpNext">
        <span>{en ? "Position" : "Positie"}</span>
        <div><strong>{measured ? (en ? "Measured position" : "Gemeten positie") : (en ? "Estimated position" : "Geschatte positie")}</strong></div>
        <p className="tpPositionNote">{measured ? ["NDOV", time].filter(Boolean).join(" · ") : (en ? "Estimated from timetable updates" : "Geschat op basis van haltetijden")}</p>
        {position.from && position.to ? <p>{position.from} → {position.to}</p> : position.route && <p>{position.route}</p>}
      </section>}
    </div>
    <footer className="tpFooter"><button type="button" className="tpFollowButton" onClick={onShow} disabled={!current}>{en ? "Show position on map" : "Toon positie op de kaart"}</button></footer>
  </aside>;
}
