import type { RollingStockModel } from "./rolling-stock";

type Area = "endA" | "middle" | "endB";

// Fietsersbond's on-board survey identifies these positions within a trainset:
// https://files.fietsersbond.nl/wp-content/uploads/2023/04/13114513/Fietsersbond-rapport-Hoe-kunnen-meer-fietsen-in-treinen-van-NS-2023.pdf
// The positions never indicate the direction of travel or a place on the platform.
const bothEnds: readonly Area[] = ["endA", "endB"];
const endsAndMiddle: readonly Area[] = ["endA", "middle", "endB"];
const middle: readonly Area[] = ["middle"];
const unlocated: readonly Area[] = [];

export function bicycleAreas(model: RollingStockModel, cars: number | undefined): readonly Area[] {
  if (model === "virm" && cars === 4) return bothEnds;
  if (model === "virm" && cars === 6) return endsAndMiddle;
  if (model === "sng" || (model === "flirt" && (cars === 3 || cars === 4))) return middle;
  return unlocated;
}

// NS publishes door markings and Intercity quiet-zone signs in its passenger guides.
export const nsBoardingSources = {
  bicycle: "https://www.ns.nl/reizen/in-de-trein/fiets-in-de-trein",
  wheelchair: "https://www.ns.nl/reizen/reizen-met-een-beperking/motorische-beperking",
  quiet: "https://www.ns.nl/reizen/in-de-trein/voorzieningen-in-de-trein",
};

export const intercityModels: ReadonlySet<RollingStockModel> = new Set(["virm", "icm", "icng", "ddz"]);
