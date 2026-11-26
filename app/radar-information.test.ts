import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { crossingDetails } from "./rail-crossing";
import { trainPhotos, trainPhotoStart } from "./train-artwork";
import { photographs } from "./train-photo-catalog";
import { roadPlace } from "./road-presentation";
import { noticeCategory } from "./RailNotices";

it("selects type photos using known material and operator evidence", () => {
  for (const [photos, prefix] of [[trainPhotos("FLIRT", "NS", "2015"), "rnet"], [trainPhotos("FLIRT", "Blauwnet (Keolis)"), "blauwnet-flirt"]] as const) {
    expect(photos.length).toBeGreaterThanOrEqual(8);
    expect(photos.every(({ src }) => src.startsWith(`/trains/photos/${prefix}`))).toBe(true);
  }
  expect(trainPhotos("FLIRT", "Arriva")).toEqual([]);
  expect(trainPhotos(null, "Blauwnet A")).toEqual([]);
  expect(trainPhotos("VIRM dubbeldekker", "NS")[0]?.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
});

it("ships every credited photograph in the collection once", () => {
  const files = new Set<string>();
  const sources = new Set<string>();
  for (const gallery of Object.values(photographs)) {
    expect(gallery.length).toBeGreaterThanOrEqual(8);
    for (const [file, source, author, license] of gallery) {
      expect(files.has(file)).toBe(false);
      expect(sources.has(source)).toBe(false);
      expect(author.trim()).not.toBe("");
      expect(license).toMatch(/^(?:CC0|BY|BY-SA) \d\.\d$/);
      expect(existsSync(`public/trains/photos/${file}.webp`)).toBe(true);
      files.add(file);
      sources.add(source);
    }
  }
});

it("starts different rides with different photos", () => {
  expect(trainPhotoStart("1234", 2)).toBe(0);
  expect(trainPhotoStart("1235", 2)).toBe(1);
  expect(trainPhotoStart(null, 2)).toBe(0);
});

it("describes a crossing without interpreting the equipment as a live status", () => {
  expect(crossingDetails({ locatieaanduiding: "Dorpsstraat", gemeente: "Voorbeeld", overweg_type: "AHOB", aantal_sporen: 2 }, "nl"))
    .toMatchObject({ title: "Dorpsstraat", location: "Voorbeeld", protection: "Automatische halve overwegbomen", tracks: "2 sporen" });
  expect(crossingDetails({}, "en")).toMatchObject({ title: "Railway crossing", protection: "Protection details unavailable", tracks: "" });
});

it("uses a road number from the source and hides Alert-C direction codes", () => {
  expect(roadPlace({ roadName: null, direction: "negative", description: "A12 tussen Gouda en Utrecht" }))
    .toEqual({ name: "A12", direction: null, description: "A12 tussen Gouda en Utrecht" });
  expect(roadPlace({ roadName: "A2", direction: "richting Den Bosch", description: null }))
    .toMatchObject({ name: "A2", direction: "richting Den Bosch" });
});

it("groups explicitly named engineering works with other works", () => {
  const base = { id: "sample", type: "DISRUPTION", description: "", stations: [], geometry: null, start: null, end: null } as const;
  expect(noticeCategory({ ...base, stations: [], title: "Werkzaamheden Sittard–Heerlen" })).toBe("MAINTENANCE");
  expect(noticeCategory({ ...base, stations: [], title: "Utrecht–Amsterdam" })).toBe("DISRUPTION");
});
