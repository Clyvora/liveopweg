import catalog from "./stations.json";

export type RailStation = (typeof catalog.stations)[number];
export const railStations: RailStation[] = catalog.stations;
export const stationCatalogSource = { url: catalog.source, version: catalog.version, license: catalog.license };
export const stationsByCode = new Map(railStations.map((station) => [station.code.toUpperCase(), station]));

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
export function stationsForZoom(zoom: number): RailStation[] {
  const level = Math.min(maximumMapZoomLevel, Math.max(5, Math.floor(zoom)));
  return railStationsByZoomLevel.get(level) ?? railStations;
}

export function searchStations(query: string): RailStation[] {
  const needle = query.trim().toLocaleLowerCase("nl");
  if (!needle) return [];
  return railStations.filter((station) => station.code.toLowerCase().includes(needle)
    || station.name.toLocaleLowerCase("nl").includes(needle))
    .sort((a, b) => Number(b.code.toLowerCase() === needle) - Number(a.code.toLowerCase() === needle)
      || a.name.localeCompare(b.name, "nl"))
    .slice(0, 6);
}
