import { describe, expect, it } from "vitest";
import { trainMarkerIdentity } from "./train-map-preview";
import { regionalTrainBrand } from "./train-livery";

describe("train marker silhouettes", () => {
  it.each([
    ["8601", "doubleDeck"],
    ["7501", "doubleDeck"],
    ["3101", "icng"],
    ["2401", "slt"],
    ["2015", "generic"],
    [null, "generic"],
  ])("uses the correct silhouette for %s", (number, shape) => {
    expect(trainMarkerIdentity("1727", number)).toMatchObject({
      shape,
      trainNumber: "1727",
    });
  });
  it("uses the known fleet colors separately from the silhouette", () => {
    expect(trainMarkerIdentity("1727", "8601").livery).toBe("nsIntercity");
    expect(trainMarkerIdentity("1727", "2401").livery).toBe("nsSprinter");
    expect(trainMarkerIdentity("1727", "2015").livery).toBe("rnet");
    expect(trainMarkerIdentity("1727", null).livery).toBe("generic");
  });
  it("prefers an explicitly reported regional brand over the operator's default", () => {
    expect(regionalTrainBrand("Blauwnet (Arriva)")).toBe("blauwnet");
    expect(regionalTrainBrand("Keolis")).toBe("keolis");
    expect(regionalTrainBrand("Qbuzz")).toBe("qbuzz");
    expect(regionalTrainBrand("NS")).toBeNull();
  });
});
