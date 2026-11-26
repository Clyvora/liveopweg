import { describe, expect, it } from "vitest";
import { trainMarkerIdentity } from "./train-map-preview";
import { regionalTrainBrand } from "./train-livery";
import { keolisBlauwnetFront, serviceTrainFront, trainFrontUrl } from "./train-fronts";

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

describe("generated train fronts", () => {
  it.each([
    ["8601", "virm"], ["7501", "ddz"], ["4011", "icm"], ["3101", "icng"],
    ["2301", "sng"], ["2401", "slt"], ["2201", "ns-flirt"], ["2015", "rnet-flirt"],
    [null, null],
  ])("matches set %s to its front", (number, front) => {
    expect(trainMarkerIdentity("1727", number).front).toBe(front);
  });

  it("uses explicit model and operator information for regional and international portraits", () => {
    expect(serviceTrainFront("Arriva", "Stadler WINK")).toBe("arriva-wink");
    expect(serviceTrainFront("Blauwnet (Arriva)", "GTW")).toBe("blauwnet-gtw");
    expect(serviceTrainFront("Keolis", "FLIRT")).toBeNull();
    expect(serviceTrainFront("RRReis", "Protos")).toBe("rrreis-protos");
    expect(serviceTrainFront("DB", "ICE 3neo")).toBe("ice-3neo");
    expect(serviceTrainFront("DB", "ICE")).toBeNull();
    expect(serviceTrainFront("DB Cargo", "Class 193")).toBe("db-193");
    expect(serviceTrainFront("VIAS Rail", "FLIRT")).toBe("vias-flirt");
    expect(serviceTrainFront("NS", "FLIRT", null)).toBeNull();
    expect(serviceTrainFront("NS", "ICM", "8601")).toBeNull();
    expect(keolisBlauwnetFront("Blauwnet K")).toBe("blauwnet-flirt");
    expect(keolisBlauwnetFront("Blauwnet A")).toBeNull();
    expect(trainFrontUrl("ice-3neo")).toBe("/trains/fronts/ice-3neo.webp");
    expect(trainFrontUrl("not-in-catalog")).toBeNull();
  });
});
