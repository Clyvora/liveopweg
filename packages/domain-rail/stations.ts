import catalog from "./stations.json";

export type RailStation = (typeof catalog.stations)[number];
export const railStations: RailStation[] = catalog.stations;
export const stationCatalogSource = { url: catalog.source, version: catalog.version, license: catalog.license };
export const stationsByCode = new Map(railStations.map((station) => [station.code.toUpperCase(), station]));

export function normalizeSearchText(value: string): string {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .toLocaleLowerCase("nl")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function stationMinZoom(station: RailStation): number {
  if (station.category === "megastation") return 5;
  if (station.category === "knooppuntIntercitystation") return 7;
  if (station.category === "intercitystation") return 8;
  return 10;
}

/** Hoogste zoomniveau waarop de kaart werkt; bepaalt de fijnste stationsbucket. */
export const maximumMapZoomLevel = 16;

/**
 * Stations gebundeld per geheel zoomniveau waarop ze voor het eerst zichtbaar
 * zijn. De kaartoverlay tekent zo alleen de stations die op het huidige
 * zoomniveau echt zichtbaar zijn, in plaats van de volledige catalogus per
 * frame door te lopen.
 */
export const railStationsByZoomLevel: ReadonlyMap<number, RailStation[]> = (() => {
  const levels = new Map<number, RailStation[]>();
  for (let level = 5; level <= maximumMapZoomLevel; level += 1) {
    levels.set(level, railStations.filter((station) => stationMinZoom(station) <= level));
  }
  return levels;
})();

/** Stations die op het gegeven (fractionele) zoomniveau zichtbaar zijn. */
export function stationsForZoom(zoom: number, stations: RailStation[] = railStations): RailStation[] {
  const level = Math.min(maximumMapZoomLevel, Math.max(5, Math.floor(zoom)));
  if (stations !== railStations) return stations.filter((station) => stationMinZoom(station) <= level);
  return railStationsByZoomLevel.get(level) ?? railStations;
}

export function searchStations(query: string, stations: RailStation[] = railStations): RailStation[] {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  return stations.filter((station) => normalizeSearchText(station.code).includes(needle)
    || normalizeSearchText(station.name).includes(needle))
    .sort((a, b) => Number(normalizeSearchText(b.code) === needle) - Number(normalizeSearchText(a.code) === needle)
      || a.name.localeCompare(b.name, "nl"))
    .slice(0, 6);
}
