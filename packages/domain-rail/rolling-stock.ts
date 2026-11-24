export type RollingStockFamily = "virm" | "icng" | "icm" | "sng" | "slt" | "unknown";
export type RollingStockModel = Exclude<RollingStockFamily, "unknown"> | "flirt" | "ddz";

export type RollingStockIdentity = {
  family: RollingStockFamily;
  label: string;
  confidence: "NUMBER_RANGE" | "UNKNOWN";
};

type NumberRange = readonly [minimum: number, maximum: number];
type TrainSetDimensions = Readonly<{ cars: number; metres: number }>;

// Nominal dimensions from the fleet specifications of NS, Stadler and NVBS.
// ICNG lengths are approximate, based on Staatscourant 2023, 35239, table 4.1.
const definitions: ReadonlyArray<{
  model: RollingStockModel;
  label: string;
  variants: readonly { ranges: readonly NumberRange[]; dimensions: TrainSetDimensions | null }[];
}> = [
  {
    model: "virm",
    label: "VIRM dubbeldekker",
    // Renumbered formations 8726, 9528 and 9544 are listed in the NVBS fleet inventory.
    variants: [
      { ranges: [[8601, 8681], [8701, 8723], [8726, 8746]], dimensions: { cars: 6, metres: 162 } },
      { ranges: [[9401, 9481], [9502, 9526], [9528, 9528], [9544, 9544], [9547, 9597]], dimensions: { cars: 4, metres: 108 } },
    ],
  },
  {
    model: "icng",
    label: "ICNG",
    variants: [
      { ranges: [[3101, 3149]], dimensions: { cars: 5, metres: 110 } },
      { ranges: [[3201, 3230], [3301, 3321]], dimensions: { cars: 8, metres: 165 } },
      { ranges: [[3351, 3362]], dimensions: null },
    ],
  },
  {
    model: "icm",
    label: "ICM Koploper",
    variants: [
      { ranges: [[4001, 4007]], dimensions: null },
      { ranges: [[4011, 4097]], dimensions: { cars: 3, metres: 80.6 } },
      { ranges: [[4201, 4250]], dimensions: { cars: 4, metres: 107.1 } },
    ],
  },
  {
    model: "sng",
    label: "SNG Sprinter",
    variants: [
      { ranges: [[2301, 2368], [3001, 3050]], dimensions: { cars: 3, metres: 59.56 } },
      { ranges: [[2701, 2788]], dimensions: { cars: 4, metres: 75.76 } },
    ],
  },
  {
    model: "slt",
    label: "SLT Sprinter",
    variants: [
      { ranges: [[2401, 2469]], dimensions: { cars: 4, metres: 69.4 } },
      { ranges: [[2601, 2662]], dimensions: { cars: 6, metres: 100.5 } },
    ],
  },
  {
    model: "flirt",
    label: "FLIRT",
    variants: [
      { ranges: [[2010, 2015]], dimensions: { cars: 2, metres: 45.7 } },
      { ranges: [[2201, 2233]], dimensions: { cars: 3, metres: 63.2 } },
      { ranges: [[2501, 2525]], dimensions: { cars: 4, metres: 80.7 } },
    ],
  },
  {
    model: "ddz",
    label: "DDZ dubbeldekker",
    variants: [
      { ranges: [[7501, 7550]], dimensions: { cars: 4, metres: 101.08 } },
      { ranges: [[7601, 7650]], dimensions: { cars: 6, metres: 153.88 } },
    ],
  },
];

function numericMaterialNumber(materialNumber: string | null | undefined): number | null {
  const normalized = materialNumber?.trim() ?? "";
  if (!/^0*\d{4}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function trainSetDetails(materialNumber: string | null | undefined) {
  const number = numericMaterialNumber(materialNumber);
  if (number === null) return null;
  for (const { model, label, variants } of definitions) {
    const variant = variants.find(({ ranges }) => ranges.some(([min, max]) => number >= min && number <= max));
    if (variant) return { model, label, dimensions: variant.dimensions };
  }
  return null;
}

export function identifyRollingStock(materialNumber: string | null | undefined): RollingStockIdentity {
  const match = trainSetDetails(materialNumber);
  if (match) {
    const family = match.model === "flirt" || match.model === "ddz" ? "unknown" : match.model;
    return { family, label: match.label, confidence: "NUMBER_RANGE" };
  }

  return {
    family: "unknown",
    label: "Treintype onbekend",
    confidence: "UNKNOWN",
  };
}

export function rollingStockLabel(identity:RollingStockIdentity, language="nl") {
  if (language!=="en") return identity.label;
  if (identity.confidence==="UNKNOWN") return "Train type unknown";
  return identity.label.replace("dubbeldekker","double-decker");
}
