import { identifyRollingStock, rollingStockLabel, trainSetDetails } from "../packages/domain-rail/rolling-stock";
import type { trainBadgeShapes } from "./radar-marker-layers";
import { genericTrainImage, trainArtwork } from "./train-artwork";
import type { TrainLivery } from "./train-livery";

const modelShapes: Partial<Record<NonNullable<ReturnType<typeof trainSetDetails>>["model"], keyof typeof trainBadgeShapes>> = {
  virm: "doubleDeck",
  ddz: "doubleDeck",
  icng: "icng",
  slt: "slt",
};

export function trainMarkerIdentity(trainNumber: string, materialNumber: string | null) {
  const stock = trainSetDetails(materialNumber);
  const code = stock?.label.split(" ")[0];
  let livery: TrainLivery = "generic";
  if (stock && ["virm", "icng", "icm", "ddz"].includes(stock.model)) livery = "nsIntercity";
  if (stock && ["slt", "sng", "flirt"].includes(stock.model)) livery = "nsSprinter";
  if (stock?.model === "flirt" && stock.dimensions?.cars === 2) livery = "rnet";
  return {
    trainNumber,
    materialNumber,
    identityLabel: code ? `${code} · ${trainNumber}` : trainNumber,
    shape: stock ? modelShapes[stock.model] ?? "generic" : "generic",
    livery,
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

  const illustration = document.createElement("img");
  const setIllustrationSource = (src: string) => {
    illustration.classList.toggle("trainArtGeneric", src === genericTrainImage);
    illustration.src = src;
  };
  illustration.alt = "";
  illustration.decoding = "async";
  illustration.width = 164;
  illustration.height = 41;
  illustration.addEventListener("error", () => {
    if (illustration.getAttribute("src") === genericTrainImage) illustration.remove();
    else setIllustrationSource(genericTrainImage);
  });
  setIllustrationSource(trainArtwork(model).src);
  element.append(illustration);
  return element;
}
