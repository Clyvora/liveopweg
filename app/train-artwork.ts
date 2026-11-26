import { trainSetDetails } from "../packages/domain-rail/rolling-stock";
import { photographs } from "./train-photo-catalog";

// Only include set numbers identified by the individual Commons file.
const picturedSets: Readonly<Record<string, string>> = {
  virm: "8741", "virm-2": "8740", "virm-5": "9402", "virm-8": "8655", "virm-10": "8615",
  "icm-5": "4203", "icng-4": "3106", "icng-7": "3138", "icng-9": "3222", "icng-10": "3224",
  "sng-2": "2364", "sng-3": "2776", "sng-6": "2748", "sng-9": "2324",
  slt: "2430", "slt-4": "2643", flirt: "2230", "flirt-2": "2501", "flirt-11": "2210",
  "ddz-3": "7505", rnet: "2015", "rnet-11": "2010",
  "blauwnet-flirt": "7403", "blauwnet-flirt-2": "7308", "blauwnet-flirt-5": "7404",
  "blauwnet-flirt-7": "7308", "blauwnet-flirt-8": "7403",
  "arriva-wink": "615", "blauwnet-gtw": "10517", "blauwnet-gtw-2": "10519",
};

export function trainPhotos(model: string | null, operator?: string | null, material?: string | null) {
  let key = model?.trim().match(/^(?:Stadler\s+)?(VIRMM?|ICNG|ICMM?|SNG|SLT|FLIRT\d*|DDZ|GTW|WINK)\b/i)?.[1].toUpperCase();
  if (key === "VIRMM") key = "VIRM";
  if (key === "ICMM") key = "ICM";
  if (key?.startsWith("FLIRT")) key = "FLIRT";
  const name = operator?.trim() ?? "";
  const ns = !name || /^NS(?:\s+Reizigers|\s+Int)?$/i.test(name);
  const knownSet = ns ? trainSetDetails(material) : null;
  if (knownSet && key && key !== knownSet.model.toUpperCase()) return [];
  if (/^Blauwnet\b.*(?:\bKeolis\b|\bK$)/i.test(name) && key === "FLIRT") key = "BLAUWNET";
  else if (/^Blauwnet\b.*(?:\bArriva\b|\bA$)/i.test(name) && key === "GTW") key = "BLAUWNET_GTW";
  else if (/^Arriva\b/i.test(name) && key === "GTW") key = "ARRIVA_GTW";
  else if (/^Arriva\b/i.test(name) && key === "WINK") key = "ARRIVA_WINK";
  else if (key === "FLIRT" && (/^R[ -]?net(?:\s+NS)?$/i.test(name) || knownSet?.dimensions?.cars === 2)) key = "RNET";
  else if (key === "FLIRT" && !knownSet) return [];
  else if (name && !/^NS(?:\s+Reizigers|\s+Int)?$/i.test(name)) return [];
  if (!key || !Object.hasOwn(photographs, key)) return [];
  const family = key as keyof typeof photographs;
  const set = material?.trim();
  return photographs[family].map(source => ({
    ...photoCredit(source),
    exactSet: set && picturedSets[source[0]] === set ? set : null,
  }));
}

function photoCredit([file, commons, author, license]: readonly [string, string, string, string]) {
  const [kind, version] = license.toLowerCase().split(" ");
  return {
    src: `/trains/photos/${file}.webp`,
    origin: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(commons)}`,
    author,
    license: kind === "cc0" ? license : `CC ${license}`,
    licenseUrl: kind === "cc0" ? "https://creativecommons.org/publicdomain/zero/1.0/" : `https://creativecommons.org/licenses/${kind}/${version}/`,
  };
}
