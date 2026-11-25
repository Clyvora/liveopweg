import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export type BaseMapKey = "standard" | "light" | "satellite";

export const nightFallbackLayer = "night-fallback";
export const nightMapBackground = "#0d1623";
const labels = "https://service.pdok.nl/kadaster/brt-achtergrondkaart/wmts/v2_0/labels/EPSG:3857/{z}/{x}/{y}.png";
const aerial = "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg";
const aerialBounds: [number, number, number, number] = [3.2, 50.73, 7.23, 53.71];
const nightLayers: LayerSpecification[] = [
  { id: "night-water", type: "fill", source: "base-light", "source-layer": "water", paint: { "fill-color": "#08121d" } },
  { id: "night-wood", type: "fill", source: "base-light", "source-layer": "landcover", filter: ["==", ["get", "class"], "wood"], paint: { "fill-color": "#172728" } },
  { id: "night-parks", type: "fill", source: "base-light", "source-layer": "park", minzoom: 8, paint: { "fill-color": "#192c2c", "fill-opacity": 0.7 } },
  { id: "night-buildings", type: "fill", source: "base-light", "source-layer": "building", minzoom: 13, paint: { "fill-color": "#293441" } },
  {
    id: "night-roads", type: "line", source: "base-light", "source-layer": "transportation", minzoom: 6,
    filter: ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false],
    paint: { "line-color": "#3d495b", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 11, 1.2, 17, 5] },
  },
  {
    id: "night-places", type: "symbol", source: "base-light", "source-layer": "place",
    filter: ["match", ["get", "class"], ["country", "city", "town", "village"], true, false],
    layout: {
      "text-field": ["coalesce", ["get", "name:nl"], ["get", "name"]],
      "text-font": ["Arial Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 12, 13],
    },
    paint: { "text-color": "#bcc8d6", "text-halo-color": "#151e2a", "text-halo-width": 1.3 },
  },
];

export const baseMapLayers: Record<BaseMapKey, string[]> = {
  standard: ["base-standard"],
  light: nightLayers.map(layer => layer.id),
  satellite: ["base-satellite", "base-aerial-labels"],
};

export const baseMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "base-standard": { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 },
    "base-light": { type: "vector", url: "https://tiles.openfreemap.org/planet" },
    "base-satellite": { type: "raster", tiles: [aerial], bounds: aerialBounds, tileSize: 256, maxzoom: 19 },
    "base-aerial-labels": { type: "raster", tiles: [labels], bounds: aerialBounds, tileSize: 256, minzoom: 8, maxzoom: 19 },
  },
  layers: [
    { id: "atlas-paper", type: "background", paint: { "background-opacity": 0 } },
    { id: "base-standard", type: "raster", source: "base-standard", layout: { visibility: "none" }, paint: { "raster-saturation": -0.35, "raster-opacity": 0.88 } },
    {
      id: nightFallbackLayer, type: "raster", source: "base-standard", layout: { visibility: "none" },
      paint: { "raster-saturation": -1, "raster-brightness-min": 0.04, "raster-brightness-max": 0.24, "raster-opacity": 0.84 },
    },
    ...nightLayers.map(layer => ({ ...layer, layout: { ...layer.layout, visibility: "none" as const } }) as LayerSpecification),
    { id: "base-satellite", type: "raster", source: "base-satellite", layout: { visibility: "none" }, paint: { "raster-saturation": -0.05 } },
    { id: "base-aerial-labels", type: "raster", source: "base-aerial-labels", layout: { visibility: "none" } },
  ],
};
