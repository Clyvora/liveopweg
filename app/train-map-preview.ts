import { identifyRollingStock, rollingStockLabel, trainSetDetails } from "../packages/domain-rail/rolling-stock";
import type { trainBadgeShapes } from "./radar-marker-layers";
import type { TrainLivery } from "./train-livery";
import { nsTrainFront } from "./train-fronts";

const modelShapes: Partial<Record<NonNullable<ReturnType<typeof trainSetDetails>>["model"], keyof typeof trainBadgeShapes>> = {
  virm: "doubleDeck",
  ddz: "doubleDeck",
  icng: "icng",
  slt: "slt",
};

export function trainMarkerIdentity(trainNumber: string, materialNumber: string | null) {
  const stock = trainSetDetails(materialNumber);
  let livery: TrainLivery = "generic";
  if (stock && ["virm", "icng", "icm", "ddz"].includes(stock.model)) livery = "nsIntercity";
  if (stock && ["slt", "sng", "flirt"].includes(stock.model)) livery = "nsSprinter";
  if (stock?.model === "flirt" && stock.dimensions?.cars === 2) livery = "rnet";
  return {
    trainNumber,
    materialNumber,
    shape: stock ? modelShapes[stock.model] ?? "generic" : "generic",
    livery,
    front: nsTrainFront(stock),
  };
}

export function trainMapPreview(trainNumber: string, materialNumber: string | null, language: string) {
  const stock = identifyRollingStock(materialNumber);
  const element = document.createElement("div");
  element.className = "trainMapPreview";
  element.setAttribute("aria-hidden", "true");

  const title = document.createElement("strong");
  title.textContent = `${language === "en" ? "Train" : "Trein"} ${trainNumber}`;
  const subtitle = document.createElement("span");
  const model = rollingStockLabel(stock, language);
  subtitle.textContent = materialNumber ? `${model} · ${materialNumber}` : model;
  element.append(title, subtitle);

  return element;
}
