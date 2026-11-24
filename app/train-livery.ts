export const trainLiveries = {
  nsIntercity: { body: "#ffd044", detail: "#173665" },
  nsSprinter: { body: "#fbfdff", detail: "#174b9c" },
  rnet: { body: "#df343c", detail: "#fffdfd" },
  blauwnet: { body: "#2075bd", detail: "#f4faff" },
  rrreis: { body: "#7354ba", detail: "#e3f7d6" },
  arriva: { body: "#087e85", detail: "#f3ffff" },
  keolis: { body: "#26394d", detail: "#f5f7ff" },
  qbuzz: { body: "#f49335", detail: "#252f3c" },
  generic: { body: "#e5ebf1", detail: "#43536a" },
};

export type TrainLivery = keyof typeof trainLiveries;

export function regionalTrainBrand(operator: string | null | undefined): TrainLivery | null {
  const name = operator?.trim().toLowerCase() ?? "";
  if (/\bblauwnet\b/.test(name)) return "blauwnet";
  if (/\brrreis\b/.test(name)) return "rrreis";
  if (/\br[ -]?net\b/.test(name)) return "rnet";
  if (/\barriva\b/.test(name)) return "arriva";
  if (/\bkeolis\b/.test(name)) return "keolis";
  if (/\bqbuzz\b/.test(name)) return "qbuzz";
  return null;
}
