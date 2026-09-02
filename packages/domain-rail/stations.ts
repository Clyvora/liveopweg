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

export function searchStations(query: string): RailStation[] {
  const needle = query.trim().toLocaleLowerCase("nl");
  if (!needle) return [];
  return railStations.filter((station) => station.code.toLowerCase().includes(needle)
    || station.name.toLocaleLowerCase("nl").includes(needle))
    .sort((a, b) => Number(b.code.toLowerCase() === needle) - Number(a.code.toLowerCase() === needle)
      || a.name.localeCompare(b.name, "nl"))
    .slice(0, 6);
}
