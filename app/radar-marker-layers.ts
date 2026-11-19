import type { Map as RadarMap } from "maplibre-gl";

const stationZooms = [5, 7, 8, 10];
export const stationLayers = stationZooms.map(zoom => `radar-stations-${zoom}`);
export const trainLayers = ["rail-fleet-selected", "rail-fleet-heading", "rail-fleet-points"];

function addBadge(map: RadarMap, name: string, fill: string, glyph: string, rim = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(2, 2);

  // One compact front-facing train glyph, reused across the whole fleet.
  context.beginPath();
  context.roundRect(2, 2, 20, 20, 7);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = rim;
  context.lineWidth = 1.5;
  context.stroke();
  context.beginPath();
  context.roundRect(7.75, 6, 8.5, 10.5, 2);
  context.moveTo(8.5, 19);
  context.lineTo(10.25, 16.5);
  context.moveTo(15.5, 19);
  context.lineTo(13.75, 16.5);
  context.strokeStyle = glyph;
  context.lineWidth = 1.25;
  context.lineCap = "round";
  context.stroke();
  context.fillStyle = glyph;
  context.fillRect(8.5, 10.5, 7, 1);
  context.fillRect(9.5, 13.25, 1.25, 1.25);
  context.fillRect(13.25, 13.25, 1.25, 1.25);
  map.addImage(name, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
}

function addOverviewDot(map: RadarMap, name: string, fill: string, rim: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.beginPath();
  context.arc(24, 24, 10, 0, 2 * Math.PI);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = rim;
  context.lineWidth = 3;
  context.stroke();
  map.addImage(`${name}-dot`, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
}

export function addRadarMarkerLayers(map: RadarMap) {
  addBadge(map, "train-matched", "#214bb8", "#ffffff");
  addBadge(map, "train-gps", "#f2f6ff", "#204484", "#6286c3");
  addBadge(map, "train-stale", "#e8ebef", "#526173", "#95a3b4");
  addBadge(map, "train-selected", "#103a9f", "#ffffff", "#ffffff");
  addOverviewDot(map, "train-matched", "#214bb8", "#ffffff");
  addOverviewDot(map, "train-gps", "#f2f6ff", "#426fae");
  addOverviewDot(map, "train-stale", "#e8ebef", "#95a3b4");

  const heading = document.createElement("canvas");
  heading.width = heading.height = 84;
  const arrow = heading.getContext("2d");
  if (arrow) {
    arrow.scale(2, 2);
    arrow.beginPath();
    arrow.moveTo(21, 3);
    arrow.lineTo(25, 9);
    arrow.lineTo(17, 9);
    arrow.closePath();
    arrow.fillStyle = "#173c91";
    arrow.fill();
    arrow.strokeStyle = "#ffffff";
    arrow.stroke();
    map.addImage("train-heading", arrow.getImageData(0, 0, 84, 84), { pixelRatio: 2 });
  }

  map.addSource("radar-stations", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  for (const [index, id] of stationLayers.entries()) {
    map.addLayer({
      id, type: "circle", source: "radar-stations", minzoom: stationZooms[index],
      filter: ["==", ["get", "minZoom"], stationZooms[index]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "selected"], true], 7, 4],
        "circle-color": "#ffffff",
        "circle-stroke-color": "#386197",
        "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 2.75, 1.5],
      },
    });
  }

  map.addSource("rail-fleet", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "rail-fleet-selected", type: "circle", source: "rail-fleet",
    filter: ["==", ["get", "selected"], true],
    paint: { "circle-radius": 18, "circle-color": "#4f87ee", "circle-opacity": 0.3, "circle-stroke-width": 2, "circle-stroke-color": "#3b74da" },
  });
  map.addLayer({
    id: "rail-fleet-heading", type: "symbol", source: "rail-fleet", minzoom: 9,
    filter: ["all", ["==", ["get", "hasHeading"], true], ["!=", ["get", "badge"], "train-stale"]],
    layout: {
      "icon-image": "train-heading", "icon-rotate": ["get", "heading"],
      "icon-rotation-alignment": "map", "icon-pitch-alignment": "viewport",
      "icon-allow-overlap": true, "icon-ignore-placement": true,
    },
  });
  map.addLayer({
    id: "rail-fleet-points", type: "symbol", source: "rail-fleet",
    layout: {
      "icon-image": ["step", ["zoom"], ["case", ["get", "selected"], ["get", "badge"], ["concat", ["get", "badge"], "-dot"]], 8, ["get", "badge"]],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.64, 8, 0.82, 11, 1],
      "icon-allow-overlap": true, "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "priority"],
    },
  });
}
