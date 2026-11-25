import { trainSetDetails } from "../packages/domain-rail/rolling-stock";
import { photographs } from "./train-photo-catalog";

export function trainPhotos(model: string | null, operator?: string | null, material?: string | null) {
  let key = model?.trim().match(/^(VIRMM?|ICNG|ICMM?|SNG|SLT|FLIRT\d*|DDZ)\b/i)?.[1].toUpperCase();
  if (key === "VIRMM") key = "VIRM";
  if (key === "ICMM") key = "ICM";
  if (key?.startsWith("FLIRT")) key = "FLIRT";
  const name = operator?.trim() ?? "";
  if (/^Blauwnet\b.*(?:\bKeolis\b|\bK$)/i.test(name) && key === "FLIRT") key = "BLAUWNET";
  else if (key === "FLIRT" && (/^R[ -]?net(?:\s+NS)?$/i.test(name) || ((!name || /^NS$/i.test(name)) && trainSetDetails(material)?.dimensions?.cars === 2))) key = "RNET";
  else if (name && !/^NS(?:\s+Reizigers|\s+Int)?$/i.test(name)) return [];
  if (!key || !Object.hasOwn(photographs, key)) return [];
  const family = key as keyof typeof photographs;
  return photographs[family].map(photoCredit);
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

export function trainPhotoStart(trainNumber: string | null | undefined, total: number) {
  let index = 0;
  if (!trainNumber || total < 2) return index;
  for (const character of trainNumber) index = (index * 31 + character.charCodeAt(0)) % total;
  return index;
}
