export type RollingStockFamily = "virm" | "icng" | "icm" | "sng" | "slt" | "unknown";

export type RollingStockIdentity = {
  family: RollingStockFamily;
  label: string;
  confidence: "NUMBER_RANGE" | "UNKNOWN";
};

type NumberRange = readonly [minimum: number, maximum: number];

const definitions: ReadonlyArray<{
  family: RollingStockFamily;
  label: string;
  ranges: readonly NumberRange[];
}> = [
  {
    family: "virm",
    label: "VIRM dubbeldekker",
    // Renumbered formations 8726, 9528 and 9544 are listed in the NVBS fleet inventory.
    ranges: [[8601, 8681], [8701, 8723], [8726, 8746], [9401, 9481], [9502, 9526], [9528, 9528], [9544, 9544], [9547, 9597]],
  },
  {
    family: "icng",
    label: "ICNG",
    ranges: [[3101, 3149], [3201, 3230], [3301, 3321], [3351, 3362]],
  },
  {
    family: "icm",
    label: "ICM Koploper",
    ranges: [[4001, 4007], [4011, 4097], [4201, 4250]],
  },
  {
    family: "sng",
    label: "SNG Sprinter",
    ranges: [[2301, 2368], [2701, 2788], [3001, 3050]],
  },
  {
    family: "slt",
    label: "SLT Sprinter",
    ranges: [[2401, 2469], [2601, 2662]],
  },
  // The type is known, but there is no dedicated illustration in the existing asset set.
  { family:"unknown", label:"FLIRT", ranges:[[2010,2015],[2201,2233],[2501,2525]] },
  { family:"unknown", label:"DDZ dubbeldekker", ranges:[[7501,7550],[7601,7650]] },
];

function numericMaterialNumber(materialNumber: string | null | undefined): number | null {
  const normalized = materialNumber?.trim() ?? "";
  if (!/^0*\d{4}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function identifyRollingStock(materialNumber: string | null | undefined): RollingStockIdentity {
  const number = numericMaterialNumber(materialNumber);
  if (number !== null) {
    for (const definition of definitions) {
      if (definition.ranges.some(([minimum, maximum]) => number >= minimum && number <= maximum)) {
        return {
          family: definition.family,
          label: definition.label,
          confidence: "NUMBER_RANGE",
        };
      }
    }
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
