"use client";

import type { RailObservation } from "../packages/protocol/rail";
import { identifyRollingStock, type RollingStockFamily } from "../packages/domain-rail/rolling-stock";
import { useLanguage } from "./LanguageContext";

type Carriage = {
  id: string;
  type: "locomotive" | "first_class" | "second_class" | "dining" | "sleeping";
  label: string;
  occupied: number; // 0-100 percentage
};

const familyComposition: Record<RollingStockFamily, Carriage[]> = {
  virm: [
    { id: "loc", type: "locomotive", label: "Loc", occupied: 0 },
    { id: "2nd-1", type: "second_class", label: "2e klas", occupied: 65 },
    { id: "2nd-2", type: "second_class", label: "2e klas", occupied: 72 },
    { id: "1st-1", type: "first_class", label: "1e klas", occupied: 45 },
    { id: "2nd-3", type: "second_class", label: "2e klas", occupied: 58 },
    { id: "2nd-4", type: "second_class", label: "2e klas", occupied: 80 },
  ],
  icng: [
    { id: "loc", type: "locomotive", label: "Loc", occupied: 0 },
    { id: "2nd-1", type: "second_class", label: "2e klas", occupied: 55 },
    { id: "2nd-2", type: "second_class", label: "2e klas", occupied: 60 },
    { id: "1st-1", type: "first_class", label: "1e klas", occupied: 40 },
    { id: "2nd-3", type: "second_class", label: "2e klas", occupied: 70 },
    { id: "2nd-4", type: "second_class", label: "2e klas", occupied: 65 },
    { id: "2nd-5", type: "second_class", label: "2e klas", occupied: 75 },
  ],
  icm: [
    { id: "loc", type: "locomotive", label: "Loc", occupied: 0 },
    { id: "2nd-1", type: "second_class", label: "2e klas", occupied: 50 },
    { id: "1st-1", type: "first_class", label: "1e klas", occupied: 35 },
    { id: "2nd-2", type: "second_class", label: "2e klas", occupied: 60 },
    { id: "2nd-3", type: "second_class", label: "2e klas", occupied: 55 },
  ],
  sng: [
    { id: "loc", type: "locomotive", label: "Loc", occupied: 0 },
    { id: "2nd-1", type: "second_class", label: "2e klas", occupied: 70 },
    { id: "2nd-2", type: "second_class", label: "2e klas", occupied: 85 },
    { id: "2nd-3", type: "second_class", label: "2e klas", occupied: 75 },
  ],
  slt: [
    { id: "loc", type: "locomotive", label: "Loc", occupied: 0 },
    { id: "2nd-1", type: "second_class", label: "2e klas", occupied: 60 },
    { id: "2nd-2", type: "second_class", label: "2e klas", occupied: 65 },
    { id: "2nd-3", type: "second_class", label: "2e klas", occupied: 70 },
    { id: "2nd-4", type: "second_class", label: "2e klas", occupied: 55 },
  ],
  unknown: [
    { id: "loc", type: "locomotive", label: "Loc", occupied: 0 },
    { id: "2nd-1", type: "second_class", label: "2e klas", occupied: 50 },
    { id: "2nd-2", type: "second_class", label: "2e klas", occupied: 50 },
  ],
};

const carriageColors: Record<Carriage["type"], string> = {
  locomotive: "#4a5568",
  first_class: "#2468e9",
  second_class: "#48bb78",
  dining: "#ed8936",
  sleeping: "#9f7aea",
};

export function TrainComposition({ vehicle }: { vehicle: RailObservation }) {
  const { t } = useLanguage();
  const stock = identifyRollingStock(vehicle.materialNumber);
  const composition = familyComposition[stock.family] ?? familyComposition.unknown;

  return (
    <div className="trainComposition">
      <h4>{t("composition.title")}</h4>
      <div className="tcTrain">
        {composition.map((carriage, index) => (
          <div
            key={carriage.id}
            className={`tcCarriage tc-${carriage.type}`}
            style={{ backgroundColor: carriageColors[carriage.type] }}
            title={`${carriage.label}: ${carriage.occupied}% ${t("composition.occupied")}`}
          >
            <span className="tcCarriageLabel">{carriage.label}</span>
            {carriage.type !== "locomotive" && (
              <div className="tcOccupancyBar">
                <div className="tcOccupancyFill" style={{ width: `${carriage.occupied}%` }} />
              </div>
            )}
            {index < composition.length - 1 && <div className="tcCoupler" />}
          </div>
        ))}
      </div>
      <div className="tcLegend">
        <span><i style={{ backgroundColor: carriageColors.first_class }} />{t("composition.first_class")}</span>
        <span><i style={{ backgroundColor: carriageColors.second_class }} />{t("composition.second_class")}</span>
        <span><i style={{ backgroundColor: carriageColors.locomotive }} />{t("composition.locomotive")}</span>
      </div>
    </div>
  );
}