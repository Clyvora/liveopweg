export type RollingStockFamily = "virm" | "icng" | "icm" | "sng" | "slt" | "unknown";

export type RollingStockIdentity = {
  family: RollingStockFamily;
  label: string;
  confidence: "NUMBER_RANGE" | "UNKNOWN";
};

type NumberRange = readonly [minimum: number, maximum: number];

const definitions: ReadonlyArray<{
  family: Exclude<RollingStockFamily, "unknown">;
  label: string;
  ranges: readonly NumberRange[];
}> = [
  {
    family: "virm",
    label: "VIRM dubbeldekker",
    ranges: [[8601, 8681], [8701, 8723], [8727, 8746], [9401, 9481], [9502, 9526], [9547, 9597]],
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
];

function numericMaterialNumber(materialNumber: string | null | undefined): number | null {
  const normalized = materialNumber?.trim() ?? "";
  if (!/^\d{4}$/.test(normalized)) return null;
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

