import { describe, expect, it } from "vitest";
import { identifyRollingStock } from "./rolling-stock";

describe("identifyRollingStock", () => {
  it.each([
    ["8640", "virm"],
    ["8746", "virm"],
    ["9544", "virm"],
    ["9528", "virm"],
    ["8726", "virm"],
    ["9402", "virm"],
    ["9597", "virm"],
    ["3103", "icng"],
    ["3226", "icng"],
    ["3318", "icng"],
    ["4088", "icm"],
    ["4235", "icm"],
    ["2339", "sng"],
    ["2783", "sng"],
    ["3036", "sng"],
    ["2443", "slt"],
    ["2632", "slt"],
  ] as const)("herkent materieel %s als %s", (materialNumber, family) => {
    expect(identifyRollingStock(materialNumber)).toMatchObject({ family, confidence: "NUMBER_RANGE" });
  });

  it("labels supported types without inventing an illustration",()=>{
    expect(identifyRollingStock("2015")).toMatchObject({family:"unknown",label:"FLIRT",confidence:"NUMBER_RANGE"});
    expect(identifyRollingStock("7507")).toMatchObject({family:"unknown",label:"DDZ dubbeldekker",confidence:"NUMBER_RANGE"});
    expect(identifyRollingStock("009544")).toMatchObject({family:"virm"});
  });
  it.each([null, undefined, "", "abc", "9598", "2663", "2789"])(
    "houdt niet-ondersteund materieel %s op de veilige fallback",
    (materialNumber) => {
      expect(identifyRollingStock(materialNumber)).toEqual({
        family: "unknown",
        label: "Treintype onbekend",
        confidence: "UNKNOWN",
      });
    },
  );
});
