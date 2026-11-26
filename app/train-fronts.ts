import { trainSetDetails, type RollingStockModel } from "../packages/domain-rail/rolling-stock";

// Generated model portraits. The files depict a type and livery, never an individual unit.
const nsFronts = {
  virm: "virm", ddz: "ddz", icm: "icm", icng: "icng", slt: "slt", sng: "sng", flirt: "ns-flirt",
} as const satisfies Record<RollingStockModel, string>;

const explicitFronts = {
  ns: { ...nsFronts, "icng-b": "icng-belgium" },
  arriva: { wink: "arriva-wink", gtw: "arriva-gtw", flirt: "arriva-flirt", lint: "arriva-lint" },
  blauwnetArriva: { gtw: "blauwnet-gtw" },
  blauwnetKeolis: { flirt: "blauwnet-flirt" },
  rrreis: { flirt: "rrreis-flirt", protos: "rrreis-protos" },
  rnet: { flirt: "rnet-flirt" },
  qbuzz: { gtw: "qbuzz-gtw" },
  eurostar: { e320: "eurostar-e320", pbka: "eurostar-pbka" },
  db: { "ice 3neo": "ice-3neo", vectron: "db-vectron" },
  dbCargo: { "6400": "db-6400", de6400: "db-6400", "189": "db-189", "193": "db-193", vectron: "db-193" },
  vias: { flirt: "vias-flirt" },
  eurobahn: { flirt: "eurobahn-flirt" },
  sncb: { traxx: "sncb-traxx", desiro: "sncb-desiro" },
  nightjet: { vectron: "nightjet-vectron" },
  sleeper: { traxx: "sleeper-traxx" },
  freight: { vectron: "freight-vectron", "186": "freight-186" },
} as const;

const frontIds = new Set<string>(Object.values(explicitFronts).flatMap(fronts => Object.values(fronts)));

export function trainFrontUrl(id: string | null): string | null {
  return id && frontIds.has(id) ? `/trains/fronts/${id}.webp` : null;
}

export function nsTrainFront(stock: ReturnType<typeof trainSetDetails>) {
  if (!stock) return null;
  return stock.model === "flirt" && stock.dimensions?.cars === 2 ? "rnet-flirt" : nsFronts[stock.model];
}

function operatorKey(operator: string): keyof typeof explicitFronts | null {
  if (/^ns(?:\s+(?:reizigers|int(?:ernational)?))?$/.test(operator)) return "ns";
  if (/^blauwnet\s+(?:a|\(arriva\))$/.test(operator)) return "blauwnetArriva";
  if (/^blauwnet\s+(?:k|\(keolis\))$/.test(operator)) return "blauwnetKeolis";
  if (/^r[ -]?net(?:\s+ns)?$/.test(operator)) return "rnet";
  if (/^european sleeper$/.test(operator)) return "sleeper";
  if (/^(?:öbb|oebb|nightjet)$/.test(operator)) return "nightjet";
  if (/^(?:db(?: regio| fernverkehr)?|deutsche bahn)$/.test(operator)) return "db";
  if (operator === "db cargo") return "dbCargo";
  if (/^vias(?: rail)?$/.test(operator)) return "vias";
  if (operator === "eurobahn") return "eurobahn";
  if (/^(?:sncb|nmbs)$/.test(operator)) return "sncb";
  if (operator === "arriva" || operator === "rrreis" || operator === "qbuzz" || operator === "eurostar" || operator === "freight") return operator;
  return null;
}

export function serviceTrainFront(operator: string | null, rollingStock: string | null, material?: string | null) {
  const key = operatorKey(operator?.trim().toLowerCase() ?? "");
  if (!key) return null;
  const model = rollingStock?.trim().toLowerCase()
    .replace(/^(?:stadler|siemens|bombardier|alstom|class|br)\s+/, "")
    .replace(/^de\s+(?=6400\b)/, "de") ?? "";
  const name = model.match(/^(?:icng-b|ice 3neo|[a-z0-9]+)\b/)?.[0];
  if (key === "ns") {
    const known = trainSetDetails(material);
    if (known && name && name !== known.model && !(name === "icng-b" && known.model === "icng")) return null;
    if (name === "icng-b") return explicitFronts.ns[name];
    const front = nsTrainFront(known);
    if (front) return front;
    // NS and R-net use different FLIRT liveries. Wait for a set number.
    if (name === "flirt") return null;
  }
  const candidates: Readonly<Record<string, string>> = explicitFronts[key];
  return name && Object.hasOwn(candidates, name) ? candidates[name] : null;
}

export function keolisBlauwnetFront(operator: string) {
  return operatorKey(operator.trim().toLowerCase()) === "blauwnetKeolis" ? "blauwnet-flirt" : null;
}
