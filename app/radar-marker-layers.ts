import type { Map as RadarMap } from "maplibre-gl";
import { trainLiveries } from "./train-livery";

const stationZooms = [5, 7, 8, 10];
export const stationLayers = stationZooms.map(zoom => `radar-stations-${zoom}`);
export const trainHitLayers = ["rail-fleet-points"];
export const trainLayers = ["rail-fleet-selected", "rail-fleet-matched-ring", "rail-fleet-heading", ...trainHitLayers];

export const trainBadgeShapes = {
  generic: {
    body: "M9 5.5h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
    glass: "M8.5 7.5h7v4h-7Z M9 13h1.5v1.5H9Z M13.5 13H15v1.5h-1.5Z",
    rails: "M8 19l2-3m6 3-2-3",
  },
  doubleDeck: {
    body: "M8.5 4.5h7l2.5 3v8l-2.5 2h-7L6 15.5v-8Z",
    glass: "M9 6.5h6l1.5 2.5h-9Z M8 11h3v3H8Z M13 11h3v3h-3Z",
    rails: "M8 19.5l2-2.5m6 2.5L14 17",
  },
  icng: {
    body: "M6.5 6.5h7.75l5.25 7.75v2.5l-3 1H5v-8Z",
    glass: "M8 8h5.5l3 4.5H8Z M6.75 14.5h2v1.5h-2Z M15.25 14.5h2v1.5h-2Z",
    rails: "M8 19.5l1.5-2m7 2-1.5-2",
  },
  slt: {
    body: "M12 5c4.25 0 7 2.5 7 6.75v2.75c0 2-2.75 3.5-7 3.5s-7-1.5-7-3.5v-2.75C5 7.5 7.75 5 12 5Z",
    glass: "M7.25 11c.5-2.5 2.25-4 4.75-4s4.25 1.5 4.75 4H7.25Z M7.75 13.5h2.25V15H7.75Z M14 13.5h2.25V15H14Z",
    rails: "M8 19.5l1.5-2m7 2-1.5-2",
  },
};

function addBadge(map: RadarMap, name: string, shape: keyof typeof trainBadgeShapes, bodyColor: string, detail: string, rim: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.scale(2, 2);

  context.beginPath();
  context.arc(12, 12, 10.5, 0, Math.PI * 2);
  context.fillStyle = "#142536";
  context.fill();
  context.strokeStyle = rim;
  context.lineWidth = 1.25;
  context.stroke();
  const { body, glass, rails } = trainBadgeShapes[shape];
  context.fillStyle = bodyColor;
  context.fill(new Path2D(body));
  context.fillStyle = detail;
  context.fill(new Path2D(glass));
  context.strokeStyle = bodyColor;
  context.lineWidth = 1.25;
  context.lineCap = "round";
  context.stroke(new Path2D(rails));
  map.addImage(name, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
}

function addOverviewDot(map: RadarMap, name: string, fill: string, rim: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.beginPath();
  context.arc(24, 24, 12, 0, 2 * Math.PI);
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = rim;
  context.lineWidth = 3;
  context.stroke();
  map.addImage(`${name}-dot`, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
}

export function addRadarMarkerLayers(map: RadarMap) {
  for (const shape of Object.keys(trainBadgeShapes) as Array<keyof typeof trainBadgeShapes>) {
    addBadge(map, `train-stale-${shape}`, shape, "#e8ebef", "#526173", "#95a3b4");
    for (const [livery, { body, detail }] of Object.entries(trainLiveries)) {
      addBadge(map, `train-${livery}-${shape}`, shape, body, detail, "#ffffff");
    }
  }
  for (const [livery, { body, detail }] of Object.entries(trainLiveries)) {
    addOverviewDot(map, `train-${livery}`, body, detail);
  }
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
    id: "rail-fleet-matched-ring", type: "circle", source: "rail-fleet",
    filter: ["==", ["get", "badge"], "train-matched"],
    paint: {
      "circle-radius": ["step", ["zoom"], 5.5, 8, 12],
      "circle-opacity": 0, "circle-stroke-color": "#3779db", "circle-stroke-width": 1.5,
    },
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
      "icon-image": ["step", ["zoom"], ["case", ["get", "selected"], ["get", "detailIcon"], ["get", "dotIcon"]], 8, ["get", "detailIcon"]],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.70, 8, 0.96, 11, 1.08],
      "icon-allow-overlap": true, "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "priority"],
    },
  });
}
