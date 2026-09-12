"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import {
  DEFAULT_RENDER_DELAY_MS,
  renderMotion,
  type MotionSample,
} from "../packages/domain-rail/client-motion";
import { identifyRollingStock } from "../packages/domain-rail/rolling-stock";
import {
  journeySnapshotMessageSchema,
  type RailJourney,
} from "../packages/protocol/journey";
import {
  railEdgeResponseSchema,
  railFleetBatchMessageSchema,
  railFleetSnapshotMessageSchema,
  railMatchBatchMessageSchema,
  railMatchSnapshotMessageSchema,
  railSelectionSnapshotMessageSchema,
  type RailObservation,
  type RailTrackMatch,
} from "../packages/protocol/rail";
import {
  roadBatchMessageSchema,
  roadSnapshotMessageSchema,
  type RoadEvent,
} from "../packages/protocol/road";
import { parseTimestamp, realtimeHttpUrl, realtimeWebSocketUrl } from "./realtime-url";
import { railStations, searchStations, stationMinZoom, stationsByCode, type RailStation } from "../packages/domain-rail/stations";
import { StationPanel } from "./StationPanel";
import { TrainPanel, nextTrainStop } from "./TrainPanel";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { JourneyPlanner } from "./JourneyPlanner";
import { DelayStats } from "./DelayStats";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

type ConnectionState = "verbinden" | "live" | "herstellen" | "offline";
type RoadLayerKey = "congestion" | "incidents" | "roadworks" | "closures" | "safety";
type MapLayerKey = "trains" | "stations" | "railways";
type BaseMapKey = "standard" | "light" | "satellite";
type UiIconName = "map" | "train" | "car" | "bell" | "sliders" | "clock" | "settings" | "queue" | "warning" | "works" | "closure" | "shield" | "chevron";
type ExpectedRoute = {
  method: "EXPECTED_SHORTEST_TRACK_PATH";
  exactSwitchPathKnown: false;
  geometry: { type: "MultiLineString"; coordinates: [number, number][][] };
  stops: Array<{ code: string; name: string; arrivalAt: string | null; departureAt: string | null; delaySeconds: number | null }>;
  routedStops: number;
};
const configuredRenderDelayMs = Number(process.env.NEXT_PUBLIC_RENDER_DELAY_MS ?? DEFAULT_RENDER_DELAY_MS);
const renderDelayMs = Number.isFinite(configuredRenderDelayMs) && configuredRenderDelayMs >= 0 && configuredRenderDelayMs <= 30_000
  ? configuredRenderDelayMs
  : DEFAULT_RENDER_DELAY_MS;

const fallbackMapStyle: StyleSpecification = {
  version: 8,
  sources: {
    "base-standard": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap-bijdragers",
    },
    "base-light": {
      type: "raster",
      tiles: ["https://{s}.basemaps.cartocdn.com/a/dark_matter/{z}/{x}/{y}{r}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap-bijdragers © CARTO",
    },
    "base-satellite": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Tiles © Esri",
    },
  },
  layers: [
    { id: "base-standard", type: "raster", source: "base-standard", paint: { "raster-saturation": -0.72, "raster-contrast": 0.12 } },
    { id: "base-light", type: "raster", source: "base-light", layout: { visibility: "none" }, paint: { "raster-saturation": -0.5, "raster-contrast": 0, "raster-brightness-min": 0.2, "raster-brightness-max": 0.85 } },
    { id: "base-satellite", type: "raster", source: "base-satellite", layout: { visibility: "none" }, paint: { "raster-saturation": -0.12, "raster-brightness-max": 0.92 } },
  ],
};

const baseMapDefinitions: { key: BaseMapKey; label: string }[] = [
  { key: "standard", label: "Standaard" },
  { key: "light", label: "Licht" },
  { key: "satellite", label: "Satelliet" },
];

function UiIcon({ name }: { name: UiIconName }) {
  const paths: Record<UiIconName, React.ReactNode> = {
    map: <><path d="m3.5 6 5-2.5 7 3 5-2.5v14l-5 2.5-7-3-5 2.5V6Z" /><path d="M8.5 3.5v14M15.5 6.5v14" /></>,
    train: <><rect x="6" y="3" width="12" height="15" rx="4" /><path d="M8 21l2-3m6 0 2 3M9 7h6M8 13h8" /><circle cx="9" cy="16" r=".7" /><circle cx="15" cy="16" r=".7" /></>,
    car: <><path d="m5 11 1.6-4h10.8l1.6 4 1.5 1.5V18h-2v-2H5v2H3v-5.5L5 11Z" /><path d="M5 11h14" /><circle cx="7" cy="14" r="1" /><circle cx="17" cy="14" r="1" /></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z" /><path d="M10 20h4" /></>,
    sliders: <><path d="M4 7h10M18 7h2M4 17h3M11 17h9" /><circle cx="16" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7a7 7 0 0 0-.7-1.7l.9-1.9-2.1-2.1-1.9.9a7 7 0 0 0-1.7-.7L10.5 2h-3l-.7 2a7 7 0 0 0-1.7.7l-1.9-.9-2.1 2.1.9 1.9a7 7 0 0 0-.7 1.7L0 10.5v3l2 .7a7 7 0 0 0 .7 1.7l-.9 1.9 2.1 2.1 1.9-.9a7 7 0 0 0 1.7.7l.7 2h3l.7-2a7 7 0 0 0 1.7-.7l1.9.9 2.1-2.1-.9-1.9a7 7 0 0 0 .7-1.7l1.5-.7Z" transform="translate(2 0) scale(.83)" /></>,
    queue: <><path d="M5 7h14M5 12h14M5 17h14" /><circle cx="3" cy="7" r=".6" /><circle cx="3" cy="12" r=".6" /><circle cx="3" cy="17" r=".6" /></>,
    warning: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
    works: <><path d="M4 20h16M7 20l2-9h6l2 9M8 11l4-7 4 7M9 15h6" /></>,
    closure: <><circle cx="12" cy="12" r="9" /><path d="M7.5 12h9" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 7.5 7 10 4.2-2.5 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-5" /></>,
    chevron: <path d="m9 7 5 5-5 5" />,
  };
  return <svg className="uiIcon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function loadPublicMapStyle(): StyleSpecification {
  // Een kleine rasterstijl start betrouwbaar in alle browsers en houdt de
  // interactieve trein-, spoor- en weglaag onafhankelijk van een vectorkaart.
  return fallbackMapStyle;
}

const roadLayerDefinitions: { key: RoadLayerKey; label: string; color: string }[] = [
  { key: "congestion", label: "Files", color: "#c94f3d" },
  { key: "incidents", label: "Ongevallen & incidenten", color: "#792f43" },
  { key: "roadworks", label: "Werkzaamheden", color: "#e28a35" },
  { key: "closures", label: "Afsluitingen", color: "#242d32" },
  { key: "safety", label: "Veiligheidsmeldingen", color: "#2c7292" },
];

const mapLayerDefinitions: { key: MapLayerKey; label: string; color: string }[] = [
  { key: "trains", label: "Live treinen", color: "#1467d8" },
  { key: "stations", label: "Stations", color: "#ffffff" },
  { key: "railways", label: "Spoorlijnen", color: "#66516f" },
];

const nationalStrikeAlert = {
  title: "Landelijke ov-staking",
  body: "Vandaag rijden er in heel Nederland geen reguliere NS-treinen. Alleen de Airportsprinter rijdt vier keer per uur tussen Amsterdam Centraal, Schiphol en Hoofddorp.",
  updatedAt: "2026-09-09T07:00:00+02:00",
  validUntil: "2026-09-10T04:00:00+02:00",
  url: "https://www.ns.nl/reisinformatie/calamiteiten/ov-staking-vandaag-de-hele-dag-geen-treinen.html",
};

function roadLayerFor(event: RoadEvent): RoadLayerKey {
  if (event.type === "congestion") return "congestion";
  if (event.type === "accident" || event.type === "incident") return "incidents";
  if (event.type === "roadworks" || event.type === "speedRestriction") return "roadworks";
  if (event.type === "closure") return "closures";
  return "safety";
}

function roadLayerIcon(layer: RoadLayerKey): UiIconName {
  if (layer === "congestion") return "queue";
  if (layer === "roadworks") return "works";
  if (layer === "closures") return "closure";
  if (layer === "safety") return "shield";
  return "warning";
}

function roadEventLabel(event: RoadEvent): string {
  const labels: Record<RoadEvent["type"], string> = {
    congestion: "File", accident: "Ongeval", incident: "Incident", roadworks: "Werkzaamheden",
    closure: "Afsluiting", speedRestriction: "Tijdelijke snelheid", safety: "Veiligheidsmelding",
    weather: "Weerhinder", obstacle: "Obstakel", other: "Wegmelding",
  };
  return labels[event.type];
}

function roadEventTitle(event: RoadEvent): string {
  const label = roadEventLabel(event);
  return event.roadName ? `${label} ${event.roadName}` : label;
}

function roadEventBadge(event: RoadEvent): string {
  if (event.delaySeconds !== null) return `+${Math.max(1, Math.round(event.delaySeconds / 60))} min`;
  if (event.queueLengthMeters !== null) return `${(event.queueLengthMeters / 1_000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`;
  if (event.temporarySpeedLimitKmh !== null) return `${event.temporarySpeedLimitKmh} km/h`;
  return event.status === "PLANNED" ? "Gepland" : "Actief";
}


function formatJourneyClock(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}



function replaceSelectionUrl(selection: { train?: string; station?: string } = {}) {
  const url = new URL(window.location.href);
  url.search = "";
  if (selection.train) url.searchParams.set("train", selection.train);
  if (selection.station) url.searchParams.set("station", selection.station);
  window.history.replaceState(null, "", url);
}

function toRecord(observations: RailObservation[]): Record<string, RailObservation> {
  return Object.fromEntries(observations.map((observation) => [observation.vehicleId, observation]));
}

type TrackMotionSample = {
  previous: RailTrackMatch | null;
  current: RailTrackMatch;
};

type TrackCoordinates = [number, number][];
type TrackGeometry = {
  coordinates: TrackCoordinates;
  fromNode: string;
  toNode: string;
  lengthMeters: number;
};

// Smooth easing function for more natural motion
// Uses ease-in-out cubic bezier-like curve
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function coordinateDistanceMeters(left: [number, number], right: [number, number]): number {
  const latitudeRadians = ((left[1] + right[1]) / 2) * Math.PI / 180;
  const longitudeMeters = (right[0] - left[0]) * 111_320 * Math.max(0.2, Math.cos(latitudeRadians));
  const latitudeMeters = (right[1] - left[1]) * 111_320;
  return Math.hypot(longitudeMeters, latitudeMeters);
}

function pointAlongTrack(coordinates: TrackCoordinates, progress: number): { longitude: number; latitude: number } | null {
  if (coordinates.length < 2) return null;
  const lengths = coordinates.slice(1).map((point, index) => coordinateDistanceMeters(coordinates[index], point));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength <= 0) return { longitude: coordinates[0][0], latitude: coordinates[0][1] };
  let distance = Math.min(1, Math.max(0, progress)) * totalLength;
  for (let index = 1; index < coordinates.length; index += 1) {
    const segmentLength = lengths[index - 1];
    if (distance <= segmentLength || index === coordinates.length - 1) {
      const ratio = segmentLength > 0 ? distance / segmentLength : 0;
      const from = coordinates[index - 1];
      const to = coordinates[index];
      return {
        longitude: from[0] + (to[0] - from[0]) * ratio,
        latitude: from[1] + (to[1] - from[1]) * ratio,
      };
    }
    distance -= segmentLength;
  }
  const last = coordinates.at(-1)!;
  return { longitude: last[0], latitude: last[1] };
}

function sharedTrackNode(left: TrackGeometry, right: TrackGeometry): string | null {
  if (left.fromNode === right.fromNode || left.fromNode === right.toNode) return left.fromNode;
  if (left.toNode === right.fromNode || left.toNode === right.toNode) return left.toNode;
  return null;
}

function pointAlongConnectedTracks(
  previousGeometry: TrackGeometry,
  previousProgress: number,
  currentGeometry: TrackGeometry,
  currentProgress: number,
  progress: number,
): { longitude: number; latitude: number } | null {
  const sharedNode = sharedTrackNode(previousGeometry, currentGeometry);
  if (!sharedNode) return null;
  const previousNodeProgress = sharedNode === previousGeometry.fromNode ? 0 : 1;
  const currentNodeProgress = sharedNode === currentGeometry.fromNode ? 0 : 1;
  const previousDistance = Math.abs(previousNodeProgress - previousProgress) * previousGeometry.lengthMeters;
  const currentDistance = Math.abs(currentProgress - currentNodeProgress) * currentGeometry.lengthMeters;
  const totalDistance = previousDistance + currentDistance;
  if (totalDistance <= 0) return pointAlongTrack(currentGeometry.coordinates, currentProgress);
  const targetDistance = Math.min(1, Math.max(0, progress)) * totalDistance;
  if (targetDistance <= previousDistance && previousDistance > 0) {
    const edgeProgress = previousProgress
      + (previousNodeProgress - previousProgress) * (targetDistance / previousDistance);
    return pointAlongTrack(previousGeometry.coordinates, edgeProgress);
  }
  if (currentDistance <= 0) return pointAlongTrack(currentGeometry.coordinates, currentProgress);
  const edgeProgress = currentNodeProgress
    + (currentProgress - currentNodeProgress) * ((targetDistance - previousDistance) / currentDistance);
  return pointAlongTrack(currentGeometry.coordinates, edgeProgress);
}

function matchedPosition(match: RailTrackMatch | null | undefined): { longitude: number; latitude: number } | null {
  return match?.snappedPosition && match.status.startsWith("MATCHED") ? match.snappedPosition : null;
}

function trackMotionPosition(
  sample: TrackMotionSample | null,
  nowMs: number,
  renderDelayMs: number,
  geometries: Map<string, TrackGeometry>,
): { longitude: number; latitude: number } | null {
  const currentPosition = matchedPosition(sample?.current);
  if (!sample || !currentPosition) return null;
  const previousPosition = matchedPosition(sample.previous);
  const currentGeometry = sample.current.edgeId ? geometries.get(sample.current.edgeId) : undefined;
  const currentTrackPosition = currentGeometry && sample.current.edgeProgress !== null
    ? pointAlongTrack(currentGeometry.coordinates, sample.current.edgeProgress)
    : null;
  const previousGeometry = sample.previous?.edgeId ? geometries.get(sample.previous.edgeId) : undefined;
  const previousTrackPosition = previousGeometry && sample.previous?.edgeProgress !== null && sample.previous?.edgeProgress !== undefined
    ? pointAlongTrack(previousGeometry.coordinates, sample.previous.edgeProgress)
    : null;
  if (!previousPosition) return currentTrackPosition ?? currentPosition;

  const previousTime = parseTimestamp(sample.previous?.sourceMeasuredAt ?? sample.previous?.matchedAt);
  const currentTime = parseTimestamp(sample.current.sourceMeasuredAt ?? sample.current.matchedAt);
  const targetTime = nowMs - renderDelayMs;
  if (previousTime === null || currentTime === null || currentTime <= previousTime) return currentTrackPosition ?? currentPosition;
  if (targetTime <= previousTime) return previousTrackPosition ?? previousPosition;
  if (targetTime >= currentTime) {
    const extrapolationSeconds = Math.min(30, (targetTime - currentTime) / 1_000);
    const elapsedSeconds = (currentTime - previousTime) / 1_000;
    if (
      extrapolationSeconds > 0
      && elapsedSeconds > 0
      && currentGeometry
      && sample.current.edgeProgress !== null
    ) {
      let signedDistanceMeters: number | null = null;
      if (
        previousGeometry
        && sample.previous?.edgeId === sample.current.edgeId
        && sample.previous.edgeProgress !== null
      ) {
        signedDistanceMeters = (sample.current.edgeProgress - sample.previous.edgeProgress) * currentGeometry.lengthMeters;
      } else if (previousGeometry && sample.previous?.edgeProgress !== null && sample.previous?.edgeProgress !== undefined) {
        const sharedNode = sharedTrackNode(previousGeometry, currentGeometry);
        if (sharedNode) {
          const currentNodeProgress = sharedNode === currentGeometry.fromNode ? 0 : 1;
          const direction = Math.sign(sample.current.edgeProgress - currentNodeProgress);
          const connectedDistance = Math.abs(
            (sharedNode === previousGeometry.fromNode ? 0 : 1) - sample.previous.edgeProgress,
          ) * previousGeometry.lengthMeters
            + Math.abs(sample.current.edgeProgress - currentNodeProgress) * currentGeometry.lengthMeters;
          signedDistanceMeters = connectedDistance * direction;
        }
      }
      if (signedDistanceMeters !== null) {
        const extrapolatedProgress = sample.current.edgeProgress
          + (signedDistanceMeters / elapsedSeconds * extrapolationSeconds) / currentGeometry.lengthMeters;
        return pointAlongTrack(currentGeometry.coordinates, extrapolatedProgress) ?? currentTrackPosition ?? currentPosition;
      }
    }
    return currentTrackPosition ?? currentPosition;
  }
  const progress = (targetTime - previousTime) / (currentTime - previousTime);
  // Apply easing for smoother motion
  const easedProgress = easeInOutCubic(progress);
  if (
    currentGeometry
    && sample.current.edgeId === sample.previous?.edgeId
    && sample.previous.edgeProgress !== null
    && sample.current.edgeProgress !== null
  ) {
    const edgeProgress = sample.previous.edgeProgress
      + (sample.current.edgeProgress - sample.previous.edgeProgress) * easedProgress;
    return pointAlongTrack(currentGeometry.coordinates, edgeProgress) ?? currentPosition;
  }
  if (
    previousGeometry
    && currentGeometry
    && sample.previous?.edgeProgress !== null
    && sample.previous?.edgeProgress !== undefined
    && sample.current.edgeProgress !== null
  ) {
    const connectedPosition = pointAlongConnectedTracks(
      previousGeometry,
      sample.previous.edgeProgress,
      currentGeometry,
      sample.current.edgeProgress,
      easedProgress,
    );
    if (connectedPosition) return connectedPosition;
  }
  // Zonder bewezen topologische verbinding houden we de laatste betrouwbare
  // spoorpositie vast; een rechte lijn zou zichtbaar door weiland of gebouwen
  // kunnen snijden.
  return progress < 0.5 ? previousTrackPosition ?? previousPosition : currentTrackPosition ?? currentPosition;
}

function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

type TrainSprites = {
  virm: HTMLImageElement | null;
  icng: HTMLImageElement | null;
  icm: HTMLImageElement | null;
  sng: HTMLImageElement | null;
  slt: HTMLImageElement | null;
  intercity: HTMLImageElement | null;
  sprinter: HTMLImageElement | null;
};

function spriteForVehicle(
  vehicleId: string,
  materialNumber: string | null,
  sprites: TrainSprites,
): HTMLImageElement | null {
  const identity = identifyRollingStock(materialNumber);
  if (identity.family !== "unknown") return sprites[identity.family];

  let hash = 0;
  for (let index = 0; index < vehicleId.length; index += 1) {
    hash = ((hash << 5) - hash + vehicleId.charCodeAt(index)) | 0;
  }
  return (hash & 1) === 0 ? sprites.intercity : sprites.sprinter;
}

function drawTrainIcon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotation: number,
  sprite: HTMLImageElement | null,
  selected: boolean,
  matched: boolean,
  scale: number,
): void {
  const selectedScale = selected ? Math.max(1.2, scale) : scale;
  const hasSprite = Boolean(sprite?.complete && sprite.naturalWidth > 0);
  const width = (hasSprite ? (selected ? 28 : 22) : (selected ? 20 : 16)) * selectedScale;
  const height = (hasSprite ? (selected ? 60 : 48) : (selected ? 32 : 24)) * selectedScale;
  context.save();
  context.translate(x, y);
  context.rotate(rotation);

  // Alleen de geselecteerde trein krijgt een rustige witte contour. De echte
  // bovenaanzicht-sprite blijft zo ook boven een druk emplacement herkenbaar.
  if (selected) {
    roundRectPath(context, -width / 2 - 2, -height / 2 - 2, width + 4, height + 4, width / 2);
    context.lineWidth = 2;
    context.strokeStyle = "rgba(255,255,255,.96)";
    context.stroke();
  }

  if (hasSprite && sprite) {
    context.imageSmoothingEnabled = true;
    context.globalAlpha = matched ? 1 : 0.82;
    context.shadowColor = selected ? "rgba(15,28,36,.32)" : "transparent";
    context.shadowBlur = selected ? 4 : 0;
    context.shadowOffsetY = selected ? 1 : 0;
    context.drawImage(sprite, -width / 2, -height / 2, width, height);
    context.restore();
    return;
  }

  // Compacte fallback voor de paar frames waarin de PNG-sprites nog laden.
  context.shadowColor = "rgba(22,37,40,.36)";
  context.shadowBlur = selected ? 7 : 3;
  context.shadowOffsetY = 1;
  roundRectPath(context, -width / 2, -height / 2, width, height, 3.5);
  context.fillStyle = "#f2c928";
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = selected ? 1.8 : Math.max(0.8, 1.15 * selectedScale);
  context.strokeStyle = matched ? "#172b55" : "#9a4d35";
  context.stroke();

  // Blauwe kap, doorlopende donkere ramen en een rood frontlicht geven de
  // marker een herkenbare bovenaanzicht-trein in plaats van een stip.
  roundRectPath(context, -width * 0.43, -height * 0.42, width * 0.86, height * 0.27, 2);
  context.fillStyle = "#1e4f9c";
  context.fill();
  roundRectPath(context, -width * 0.31, -height * 0.25, width * 0.62, height * 0.27, 1.2);
  context.fillStyle = "#213044";
  context.fill();
  context.fillStyle = "#9bc2d8";
  context.fillRect(-width * 0.24, -height * 0.19, width * 0.18, height * 0.13);
  context.fillRect(width * 0.06, -height * 0.19, width * 0.18, height * 0.13);
  context.fillStyle = "#173a74";
  context.fillRect(-width * 0.34, height * 0.08, width * 0.68, height * 0.12);
  context.fillStyle = "#d74a3d";
  context.beginPath();
  context.arc(0, -height * 0.42, Math.max(0.9, width * 0.09), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function MobilityDashboard() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const mapElement = useRef<HTMLDivElement>(null);
  const trainOverlayElement = useRef<HTMLCanvasElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const trainSpritesRef = useRef<TrainSprites>({
    virm: null,
    icng: null,
    icm: null,
    sng: null,
    slt: null,
    intercity: null,
    sprinter: null,
  });
  const map = useRef<MapLibreMap | null>(null);
  const initialZoomRef = useRef<number | null>(null);
  const initialCenterRef = useRef<[number, number] | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selectFromMapRef = useRef<(vehicleId: string) => void>(() => undefined);
  const motionSamplesRef = useRef(new Map<string, MotionSample>());
  const trackMatchesRef = useRef(new Map<string, RailTrackMatch>());
  const trackMotionSamplesRef = useRef(new Map<string, TrackMotionSample>());
  const trackGeometriesRef = useRef(new Map<string, TrackGeometry>());
  const trackGeometryRequestsRef = useRef(new Set<string>());
  const selectedVehicleIdRef = useRef<string | null>(null);
  const previousVehicleIdRef = useRef<string | null>(null);
  const trainSwitchAnimationRef = useRef<{ startTime: number; duration: number } | null>(null);
  const pendingTrainNumberRef = useRef<string | null>(null);
  const deepLinkHandledRef = useRef(false);
  const selectRoadFromMapRef = useRef<(eventId: string) => void>(() => undefined);
  const selectStationFromMapRef = useRef<(stationCode: string) => void>(() => undefined);
  const [selectedStation, setSelectedStation] = useState<RailStation | null>(null);
  const selectedStationRef = useRef<RailStation | null>(null);
  const [vehiclesById, setVehiclesById] = useState<Record<string, RailObservation>>({});
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [observation, setObservation] = useState<RailObservation | null>(null);
  const [journey, setJourney] = useState<RailJourney | null>(null);
  const [expectedRoute, setExpectedRoute] = useState<ExpectedRoute | null>(null);
  const [trackMatchesByVehicle, setTrackMatchesByVehicle] = useState<Record<string, RailTrackMatch>>({});
  const [connection, setConnection] = useState<ConnectionState>("verbinden");
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const debugMatching = false;
  const [roadEventsById, setRoadEventsById] = useState<Record<string, RoadEvent>>({});
  const [selectedRoadEventId, setSelectedRoadEventId] = useState<string | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showJourneyPlanner, setShowJourneyPlanner] = useState(false);
  const [showDelayStats, setShowDelayStats] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [baseMap, setBaseMap] = useState<BaseMapKey>("standard");
  const [showMapStyles, setShowMapStyles] = useState(false);
  const [mapLayers, setMapLayers] = useState<Record<MapLayerKey, boolean>>({
    trains: true, stations: true, railways: true,
  });
  const [roadLayers, setRoadLayers] = useState<Record<RoadLayerKey, boolean>>({
    congestion: true, incidents: true, roadworks: true, closures: true, safety: true,
  });

  useEffect(() => {
    const virm = new Image();
    const icng = new Image();
    const icm = new Image();
    const sng = new Image();
    const slt = new Image();
    const intercity = new Image();
    const sprinter = new Image();
    const sprites = { virm, icng, icm, sng, slt, intercity, sprinter };
    Object.values(sprites).forEach((sprite) => { sprite.decoding = "async"; });
    virm.src = "/train-virm-v1.png";
    icng.src = "/train-icng-v1.png";
    icm.src = "/train-icm-v1.png";
    sng.src = "/train-sng-v1.png";
    slt.src = "/train-slt-v1.png";
    intercity.src = "/train-intercity-real.png";
    sprinter.src = "/train-sprinter-real.png";
    trainSpritesRef.current = sprites;

    return () => {
      trainSpritesRef.current = {
        virm: null,
        icng: null,
        icm: null,
        sng: null,
        slt: null,
        intercity: null,
        sprinter: null,
      };
    };
  }, []);
  const requestTrackGeometries = useCallback(async (edgeIds: string[]) => {
    const missing = [...new Set(edgeIds)].filter((edgeId) => (
      !trackGeometriesRef.current.has(edgeId) && !trackGeometryRequestsRef.current.has(edgeId)
    ));
    if (!missing.length) return;
    missing.forEach((edgeId) => trackGeometryRequestsRef.current.add(edgeId));
    try {
      const url = new URL(realtimeHttpUrl("/v1/geometry/rail/edges"));
      url.searchParams.set("ids", missing.slice(0, 500).join(","));
      const response = await fetch(url.toString());
      if (!response.ok) {
        console.warn("[MobilityDashboard:GeometryFetch]", {
          timestamp: new Date().toISOString(),
          error: `HTTP ${response.status}`,
          context: "requestTrackGeometries",
          missingEdges: missing.length,
        });
        return;
      }
      const payload = railEdgeResponseSchema.parse(await response.json());
      for (const feature of payload.features ?? []) {
        const edgeId = feature.properties?.edgeId;
        const fromNode = feature.properties?.fromNode;
        const toNode = feature.properties?.toNode;
        const lengthMeters = feature.properties?.lengthMeters;
        const coordinates = feature.geometry?.coordinates
          ?.map((point) => [point[0], point[1]] as [number, number]) ?? [];
        if (edgeId && fromNode && toNode && lengthMeters && coordinates.length >= 2) {
          trackGeometriesRef.current.set(edgeId, { coordinates, fromNode, toNode, lengthMeters });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn("[MobilityDashboard:GeometryFetch]", {
        timestamp: new Date().toISOString(),
        error: errorMessage,
        context: "requestTrackGeometries",
        missingEdges: missing.length,
      });
    } finally {
      missing.forEach((edgeId) => trackGeometryRequestsRef.current.delete(edgeId));
    }
  }, []);

  const vehicles = useMemo(() => Object.values(vehiclesById).sort((left, right) => (
    left.trainNumber.localeCompare(right.trainNumber, "nl", { numeric: true })
  )), [vehiclesById]);
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return vehicles.slice(0, 12);
    return vehicles.filter((vehicle) => [
      vehicle.trainNumber,
      vehicle.materialNumber,
      vehicle.vehicleId,
      identifyRollingStock(vehicle.materialNumber).label,
    ]
      .some((value) => value?.toLowerCase().includes(needle))).slice(0, 12);
  }, [query, vehicles]);
  const stationResults = useMemo(() => searchStations(query), [query]);
  const availableVehicleIds = useMemo(() => new Set(vehicles.map((vehicle) => vehicle.vehicleId)), [vehicles]);
  const roadEvents = useMemo(() => Object.values(roadEventsById), [roadEventsById]);
  const recentRoadEvents = useMemo(() => roadEvents.toSorted((left, right) => {
    const leftTime = parseTimestamp(left.time.sourceUpdatedAt ?? left.time.publicationTime) ?? 0;
    const rightTime = parseTimestamp(right.time.sourceUpdatedAt ?? right.time.publicationTime) ?? 0;
    return rightTime - leftTime;
  }).slice(0, 5), [roadEvents]);
  const selectedRoadEvent = selectedRoadEventId ? roadEventsById[selectedRoadEventId] ?? null : null;
  const roadCounts = useMemo(() => Object.fromEntries(roadLayerDefinitions.map(({ key }) => [
    key, roadEvents.filter((event) => roadLayerFor(event) === key).length,
  ])) as Record<RoadLayerKey, number>, [roadEvents]);

  const selectVehicle = useCallback((vehicleId: string, focusMap = true) => {
    const selected = vehiclesById[vehicleId];
    if (!selected) return;
    setSelectedStation(null);
    // Clear previous animation state before setting up new animation (prevents glitches from rapid selection)
    trainSwitchAnimationRef.current = null;
    previousVehicleIdRef.current = null;
    // Trigger train switch animation if selecting a different train
    if (selectedVehicleIdRef.current && selectedVehicleIdRef.current !== vehicleId) {
      previousVehicleIdRef.current = selectedVehicleIdRef.current;
      trainSwitchAnimationRef.current = { startTime: Date.now(), duration: 400 };
    }
    setSelectedVehicleId(vehicleId);
    selectedVehicleIdRef.current = vehicleId;
    setObservation(selected);
    setJourney(null);
    setExpectedRoute(null);
    setQuery("");
    setShowAlerts(false);
    setShowLayers(false);
    setShowJourneyPlanner(false);
    setShowDelayStats(false);
    setSelectedRoadEventId(null);
    replaceSelectionUrl({ train: selected.trainNumber });
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ protocolVersion: 2, type: "select", vehicleId }));
    if (focusMap && map.current) {
      map.current.easeTo({
        center: [selected.position.longitude, selected.position.latitude],
        offset: window.innerWidth <= 760
          ? [0, -Math.min(110, window.innerHeight * 0.14)]
          : [-190, 0],
        duration: 700,
      });
    }
  }, [vehiclesById]);

  const clearVehicleSelection = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ protocolVersion: 2, type: "deselect" }));
    setSelectedVehicleId(null);
    selectedVehicleIdRef.current = null;
    setObservation(null);
    setJourney(null);
    setExpectedRoute(null);
    setQuery("");
    replaceSelectionUrl();
  }, []);

  const selectStation = useCallback((station: RailStation) => {
    clearVehicleSelection();
    setSelectedStation(station);
    replaceSelectionUrl({ station: station.code });
    setShowLayers(false);
    setShowAlerts(false);
    setShowJourneyPlanner(false);
    setShowDelayStats(false);
    setSelectedRoadEventId(null);
    map.current?.easeTo({
      center: [station.longitude, station.latitude],
      offset: window.innerWidth <= 760 ? [0, -Math.min(140, window.innerHeight * 0.2)] : [-195, 0],
      duration: 700,
    });
  }, [clearVehicleSelection]);

  const resetMap = useCallback(() => {
    setShowLayers(false);
    setShowAlerts(false);
    setShowJourneyPlanner(false);
    setShowDelayStats(false);
    setShowMobileMenu(false);
    setSelectedRoadEventId(null);
    setSelectedStation(null);
    clearVehicleSelection();
    map.current?.easeTo({ center: initialCenterRef.current ?? [5.3, 52.2], zoom: initialZoomRef.current ?? undefined, duration: 500 });
  }, [clearVehicleSelection]);

  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    deepLinkHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const stationCode = params.get("station")?.toUpperCase();
    const trainNumber = params.get("train");
    if (stationCode && stationsByCode.has(stationCode)) queueMicrotask(() => selectStation(stationsByCode.get(stationCode)!));
    else if (trainNumber) pendingTrainNumberRef.current = trainNumber;
  }, [selectStation]);

  useEffect(() => {
    const trainNumber = pendingTrainNumberRef.current;
    if (!trainNumber) return;
    const vehicle = vehicles.find((candidate) => candidate.trainNumber === trainNumber);
    if (!vehicle) return;
    pendingTrainNumberRef.current = null;
    selectVehicle(vehicle.vehicleId);
  }, [selectVehicle, vehicles]);

  useEffect(() => {
    selectStationFromMapRef.current = (code) => {
      const station = stationsByCode.get(code);
      if (station) selectStation(station);
    };
  }, [selectStation]);

  useEffect(() => {
    selectedStationRef.current = selectedStation;
  }, [selectedStation]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedStation(null);
      setShowLayers(false);
      setShowAlerts(false);
      setShowJourneyPlanner(false);
      setShowDelayStats(false);
      setShowMobileMenu(false);
      setShowMapStyles(false);
      clearVehicleSelection();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [clearVehicleSelection]);

  useEffect(() => {
    selectFromMapRef.current = (vehicleId) => selectVehicle(vehicleId);
  }, [selectVehicle]);

  useEffect(() => {
    selectRoadFromMapRef.current = (eventId) => {
      setSelectedRoadEventId(eventId);
      setShowLayers(false);
      setShowAlerts(true);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // Cleanup stale motion samples to prevent unbounded map growth
  useEffect(() => {
    const CLEANUP_INTERVAL = 60_000; // 1 minute
    const MAX_SAMPLE_AGE = 300_000; // 5 minutes
    const timer = window.setInterval(() => {
      const nowMs = Date.now();
      const vehicleIds = Object.keys(vehiclesById);
      const activeIds = new Set(vehicleIds);
      
      // Remove entries for vehicles that no longer exist
      for (const [vehicleId] of motionSamplesRef.current) {
        if (!activeIds.has(vehicleId)) {
          motionSamplesRef.current.delete(vehicleId);
          trackMotionSamplesRef.current.delete(vehicleId);
        }
      }
      
      // Remove stale entries (older than MAX_SAMPLE_AGE)
      for (const [vehicleId, sample] of motionSamplesRef.current) {
        const sampleTime = parseTimestamp(sample.current?.time?.sourceMeasuredAt);
        if (sampleTime !== null && nowMs - sampleTime > MAX_SAMPLE_AGE) {
          motionSamplesRef.current.delete(vehicleId);
          trackMotionSamplesRef.current.delete(vehicleId);
        }
      }
    }, CLEANUP_INTERVAL);
    return () => window.clearInterval(timer);
  }, [vehiclesById]);

  // Monitor selected train for delay notifications
  const lastDelayRef = useRef<string | null>(null);
  useEffect(() => {
    if (!notificationsEnabled || !observation || !journey || !("Notification" in window)) return;
    const nextStop = nextTrainStop(journey.stops, Date.now());
    const currentDelay = nextStop?.arrival.exactDelaySeconds ?? nextStop?.departure.exactDelaySeconds;
    if (currentDelay != null && currentDelay >= 300 && Notification.permission === "granted") {
      const notificationKey = `${observation.vehicleId}:${nextStop?.station.code}:${currentDelay}`;
      if (lastDelayRef.current !== notificationKey) {
        lastDelayRef.current = notificationKey;
        new Notification("Vertraging", {
          body: `Trein ${observation.trainNumber} heeft bij ${nextStop?.station.longName ?? "de volgende halte"} ${Math.round(currentDelay / 60)} minuten vertraging`,
          icon: "/train-icon.png",
        });
      }
    }
  }, [notificationsEnabled, observation, journey]);

  // Multi-level zoom: platform details at high zoom
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const handleZoom = () => {
      const zoom = instance.getZoom();
      const platformLayer = instance.getLayer("station-platforms");
      if (platformLayer) {
        instance.setLayoutProperty("station-platforms", "visibility", zoom >= 15 ? "visible" : "none");
      }
    };
    instance.on("zoom", handleZoom);
    return () => { instance.off("zoom", handleZoom); };
  }, [mapReady]);

  const toggleNotifications = useCallback(async () => {
    if (notificationsEnabled) { setNotificationsEnabled(false); return; }
    if (!("Notification" in window)) return;
    const permission = Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
    setNotificationsEnabled(permission === "granted");
  }, [notificationsEnabled]);

  const openJourneyPlanner = useCallback(() => {
    clearVehicleSelection();
    setSelectedStation(null);
    setSelectedRoadEventId(null);
    setShowJourneyPlanner(true);
    setShowDelayStats(false);
    setShowAlerts(false);
    setShowLayers(false);
  }, [clearVehicleSelection]);

  const openDelayStats = useCallback(() => {
    clearVehicleSelection();
    setSelectedStation(null);
    setSelectedRoadEventId(null);
    setShowDelayStats(true);
    setShowJourneyPlanner(false);
    setShowAlerts(false);
    setShowLayers(false);
  }, [clearVehicleSelection]);
  useEffect(() => {
    let disposed = false;
    void Promise.all([import("maplibre-gl"), loadPublicMapStyle()]).then(([{ Map, Popup, setWorkerUrl }, mapStyle]) => {
      if (disposed || !mapElement.current || map.current) return;
      setWorkerUrl(mapWorkerUrl);
      const instance = new Map({
        container: mapElement.current,
        bounds: [[3.15, 50.7], [7.45, 53.7]] as [[number, number], [number, number]],
        fitBoundsOptions: {
          padding: window.innerWidth <= 900
            ? { top: 120, right: 22, bottom: 100, left: 22 }
            : { top: 108, right: window.innerWidth >= 2200 ? 520 : 64, bottom: 92, left: window.innerWidth >= 2200 ? 190 : 150 },
        },
        attributionControl: false,
        minZoom: 5,
        maxZoom: 16,
        scrollZoom: true,
        boxZoom: true,
        doubleClickZoom: true,
        touchZoomRotate: true,
        touchPitch: false,
        keyboard: true,
        dragRotate: false,
        style: mapStyle,
      });
      map.current = instance;
      instance.on("load", () => {
        if (disposed) return;
        initialZoomRef.current = instance.getZoom();
        const initialCenter = instance.getCenter();
        initialCenterRef.current = [initialCenter.lng, initialCenter.lat];
        instance.touchZoomRotate.disableRotation();
        const stationPopup = new Popup({ closeButton: false, closeOnClick: true, offset: 12, className: "stationTooltip" });
        const stationAtPoint = (point: { x: number; y: number }) => {
          let nearest: { station: RailStation; distance: number } | null = null;
          for (const station of railStations) {
            if (instance.getZoom() < stationMinZoom(station)) continue;
            const projected = instance.project([station.longitude, station.latitude]);
            const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
            if (distance <= 12 && (!nearest || distance < nearest.distance)) nearest = { station, distance };
          }
          return nearest?.station;
        };
        let hoveredStationCode: string | null = null;
        instance.on("mousemove", (event) => {
          const station = stationAtPoint(event.point);
          if ((station?.code ?? null) === hoveredStationCode) return;
          hoveredStationCode = station?.code ?? null;
          if (station) {
            instance.getCanvas().style.cursor = "pointer";
            stationPopup.setLngLat([station.longitude, station.latitude]).setText(station.name).addTo(instance);
          } else { instance.getCanvas().style.cursor = ""; stationPopup.remove(); }
        });
        instance.getCanvas().addEventListener("mouseleave", () => { hoveredStationCode = null; stationPopup.remove(); });
        instance.addSource("rail-fleet", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer({
          id: "rail-fleet-points",
          type: "circle",
          source: "rail-fleet",
          paint: {
            "circle-radius": 6,
            "circle-color": "#f17845",
            "circle-stroke-color": "#fffdf7",
            "circle-stroke-width": 2,
            "circle-opacity": 0.95,
          },
        });
        instance.addLayer({
          id: "rail-fleet-selected",
          type: "circle",
          source: "rail-fleet",
          filter: ["==", ["get", "selected"], true],
          paint: { "circle-radius": 11, "circle-color": "#fff1a8", "circle-stroke-color": "#162528", "circle-stroke-width": 4 },
        });
        instance.addSource("pdok-rail-geometry", {
          type: "geojson",
          data: realtimeHttpUrl("/v1/geometry/rail"),
        });
        instance.addLayer({
          id: "pdok-rail-geometry-lines",
          type: "line",
          source: "pdok-rail-geometry",
          minzoom: 5,
          paint: {
            "line-color": ["case", ["==", ["get", "sourceCollection"], "wissel"], "#d66d3e", "#493955"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.55, 8, 1.1, 12, 2.6],
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.45, 8, 0.68, 12, 0.9],
          },
        }, "rail-fleet-points");
        instance.addLayer({
          id: "match-candidate-lines",
          type: "line",
          source: "pdok-rail-geometry",
          filter: ["==", ["get", "edgeId"], ""],
          paint: {
            "line-color": "#f17845",
            "line-width": 5,
            "line-opacity": 0.72,
            "line-dasharray": [1.2, 1.2],
          },
        }, "rail-fleet-points");
        instance.addLayer({
          id: "selected-track-edge",
          type: "line",
          source: "pdok-rail-geometry",
          filter: ["==", ["get", "edgeId"], ""],
          paint: { "line-color": "#a7dfc5", "line-width": 6, "line-opacity": 0.9 },
        }, "rail-fleet-points");
        instance.addSource("selected-rail-source", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer({
          id: "selected-rail-source-point",
          type: "circle",
          source: "selected-rail-source",
          paint: {
            "circle-radius": 11,
            "circle-color": "rgba(255,253,247,0.16)",
            "circle-stroke-color": "#162528",
            "circle-stroke-width": 2,
          },
        });
        instance.addSource("selected-track-match", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addSource("expected-rail-route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer({
          id: "expected-rail-route-line",
          type: "line",
          source: "expected-rail-route",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-color": "#1672d4", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3, 12, 6], "line-opacity": 0.78 },
        }, "rail-fleet-points");
        instance.addLayer({
          id: "expected-rail-route-stops",
          type: "circle",
          source: "expected-rail-route",
          filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": "#1672d4", "circle-stroke-width": 2 },
        });
        instance.addLayer({
          id: "selected-track-match-link",
          type: "line",
          source: "selected-track-match",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-color": "#f17845", "line-width": 2, "line-dasharray": [2, 2] },
        });
        instance.addLayer({
          id: "selected-track-match-point",
          type: "circle",
          source: "selected-track-match",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 7,
            "circle-color": "#a7dfc5",
            "circle-stroke-color": "#163e35",
            "circle-stroke-width": 3,
          },
        });
        for (const layer of roadLayerDefinitions) {
          const pointSourceId = `road-${layer.key}-points-source`;
          const lineSourceId = `road-${layer.key}-lines-source`;
          instance.addSource(pointSourceId, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            cluster: true,
            clusterRadius: 46,
            clusterMaxZoom: 9,
          });
          instance.addSource(lineSourceId, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          instance.addLayer({
            id: `road-${layer.key}-lines`,
            type: "line",
            source: lineSourceId,
            paint: {
              "line-color": layer.color,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 2.2, 10, 5.2, 14, 8],
              "line-opacity": ["case", ["==", ["get", "status"], "PLANNED"], 0.45, 0.86],
              "line-dasharray": ["case", ["==", ["get", "status"], "PLANNED"], ["literal", [2, 2]], ["literal", [1, 0]]],
            },
          }, "rail-fleet-points");
          instance.addLayer({
            id: `road-${layer.key}-clusters`,
            type: "circle",
            source: pointSourceId,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": layer.color,
              "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 40, 23],
              "circle-opacity": 0.9,
              "circle-stroke-color": "#fffdf7",
              "circle-stroke-width": 2,
            },
          });
          instance.addLayer({
            id: `road-${layer.key}-cluster-count`,
            type: "symbol",
            source: pointSourceId,
            filter: ["has", "point_count"],
            layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 10 },
            paint: { "text-color": "#fffdf7" },
          });
          instance.addLayer({
            id: `road-${layer.key}-points`,
            type: "circle",
            source: pointSourceId,
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": layer.color,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 7],
              "circle-opacity": ["case", ["==", ["get", "status"], "PLANNED"], 0.5, 0.92],
              "circle-stroke-color": "#fffdf7",
              "circle-stroke-width": 1.5,
            },
          });
          for (const layerId of [`road-${layer.key}-lines`, `road-${layer.key}-points`]) {
            instance.on("click", layerId, (event) => {
              const eventId = event.features?.[0]?.properties?.eventId;
              if (typeof eventId === "string") selectRoadFromMapRef.current(eventId);
            });
            instance.on("mouseenter", layerId, () => { instance.getCanvas().style.cursor = "pointer"; });
            instance.on("mouseleave", layerId, () => { instance.getCanvas().style.cursor = ""; });
          }
          instance.on("click", `road-${layer.key}-clusters`, (event) => {
            const feature = event.features?.[0];
            const clusterId = Number(feature?.properties?.cluster_id);
            if (!feature || !Number.isFinite(clusterId) || feature.geometry.type !== "Point") return;
            instance.easeTo({ center: feature.geometry.coordinates as [number, number], duration: 500 });
          });
        }
        instance.addSource("selected-road-event", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        instance.addLayer({
          id: "selected-road-event-line",
          type: "line",
          source: "selected-road-event",
          filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
          paint: { "line-color": "#fffdf7", "line-width": 10, "line-opacity": 0.72 },
        }, "rail-fleet-points");
        instance.addLayer({
          id: "selected-road-event-point",
          type: "circle",
          source: "selected-road-event",
          filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-color": "#fffdf7", "circle-radius": 11, "circle-stroke-color": "#162528", "circle-stroke-width": 3 },
        });
        // Wegmeldingen worden na de vloot opgebouwd. Zet de treinlagen daarna
        // bewust terug bovenaan, zodat de primaire live-objecten zichtbaar en
        // aanklikbaar blijven op ieder zoomniveau.
        for (const layerId of [
          "rail-fleet-points",
          "rail-fleet-selected",
          "selected-rail-source-point",
          "selected-track-match-link",
          "selected-track-match-point",
          "selected-road-event-line",
          "selected-road-event-point",
        ]) instance.moveLayer(layerId);
        instance.on("click", "rail-fleet-points", (event) => {
          const vehicleId = event.features?.[0]?.properties?.vehicleId;
          if (typeof vehicleId === "string") selectFromMapRef.current(vehicleId);
        });
        instance.on("mouseenter", "rail-fleet-points", () => { instance.getCanvas().style.cursor = "pointer"; });
        instance.on("mouseleave", "rail-fleet-points", () => { instance.getCanvas().style.cursor = ""; });
        instance.on("click", (event) => {
          let nearest: { vehicleId: string; distance: number } | null = null;
          for (const [vehicleId, sample] of motionSamplesRef.current) {
            const motion = renderMotion(sample, Date.now(), renderDelayMs);
            const position = trackMotionPosition(
              trackMotionSamplesRef.current.get(vehicleId) ?? null,
              Date.now(),
              renderDelayMs,
              trackGeometriesRef.current,
            ) ?? motion;
            const projected = instance.project([position.longitude, position.latitude]);
            const distance = Math.hypot(projected.x - event.point.x, projected.y - event.point.y);
            if (distance <= 18 && (!nearest || distance < nearest.distance)) nearest = { vehicleId, distance };
          }
          if (nearest) { selectFromMapRef.current(nearest.vehicleId); return; }
          const stationHit = stationAtPoint(event.point);
          if (stationHit) { stationPopup.remove(); selectStationFromMapRef.current(stationHit.code); }
        });
        setMapReady(true);
      });
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !map.current) return;
    let animationFrame = 0;
    let lastMapFrame = 0;

    const renderFrame = (frameTime: number) => {
      const instance = map.current;
      if (!instance) return;
      // Teken de volledige vloot vloeiend tussen feed-updates door. De punten
      // blijven daardoor stabiel bewegen in plaats van per batch te springen.
      if (frameTime - lastMapFrame >= 16) {
        lastMapFrame = frameTime;
        const nowMs = Date.now();
        const selectedId = selectedVehicleIdRef.current;
        const selectedSample = selectedId ? motionSamplesRef.current.get(selectedId) ?? null : null;
        const overlay = trainOverlayElement.current;
        const mapContainer = mapElement.current;
        if (overlay && mapContainer) {
          const width = mapContainer.clientWidth;
          const height = mapContainer.clientHeight;
          const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
          if (overlay.width !== Math.round(width * pixelRatio) || overlay.height !== Math.round(height * pixelRatio)) {
            overlay.width = Math.round(width * pixelRatio);
            overlay.height = Math.round(height * pixelRatio);
            overlay.style.width = `${width}px`;
            overlay.style.height = `${height}px`;
          }
          const context = overlay.getContext("2d");
          if (context) {
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            context.clearRect(0, 0, width, height);
            const zoom = instance.getZoom();
            const markerScale = zoom < 7 ? 0.48 : zoom < 8.5 ? 0.68 : zoom < 10.5 ? 0.86 : 1;
            // Stationpunten gebruiken dezelfde lichte canvaslaag als de treinen.
            // Tekenen vóór de treinen houdt de vloot zichtbaar en aanklikbaar.
            context.save();
            for (const station of mapLayers.stations ? railStations : []) {
              if (zoom < stationMinZoom(station)) continue;
              const point = instance.project([station.longitude, station.latitude]);
              if (point.x < -15 || point.x > width + 15 || point.y < -15 || point.y > height + 15) continue;
              const active = station.code === selectedStationRef.current?.code;
              if (active) {
                context.beginPath(); context.arc(point.x, point.y, 12, 0, Math.PI * 2);
                context.fillStyle = "rgba(40,119,212,.2)"; context.fill();
                context.strokeStyle = "#2877d4"; context.lineWidth = 2; context.stroke();
              }
              context.beginPath(); context.arc(point.x, point.y, zoom < 8 ? 4 : 5, 0, Math.PI * 2);
              context.fillStyle = "#ffffff"; context.fill();
              context.strokeStyle = "#2877d4"; context.lineWidth = 2; context.stroke();
              if (active) {
                context.font = "bold 11px Arial"; context.textAlign = "left"; context.textBaseline = "middle";
                context.strokeStyle = "#ffffff"; context.lineWidth = 4;
                context.strokeText(station.name, point.x + 17, point.y - 12);
                context.fillStyle = "#1c5c9e"; context.fillText(station.name, point.x + 17, point.y - 12);
              }
            }
            context.restore();
            // Calculate train switch animation offset
            let trainAnimationOffsetX = 0;
            let trainAnimationOpacity = 1;
            const switchAnim = trainSwitchAnimationRef.current;
            if (switchAnim) {
              const elapsed = nowMs - switchAnim.startTime;
              const progress = Math.min(1, elapsed / switchAnim.duration);
              // Ease out cubic
              const eased = 1 - Math.pow(1 - progress, 3);
              if (progress >= 1) {
                trainSwitchAnimationRef.current = null;
                previousVehicleIdRef.current = null;
              } else {
                // New train slides in from left (negative x offset that decreases)
                // Old train slides out to right (positive x offset that increases)
                trainAnimationOffsetX = (1 - eased) * -width;
                trainAnimationOpacity = eased;
              }
            }
            for (const [vehicleId, sample] of mapLayers.trains ? motionSamplesRef.current : []) {
              const motion = renderMotion(sample, nowMs, renderDelayMs);
              const position = trackMotionPosition(
                trackMotionSamplesRef.current.get(vehicleId) ?? null,
                nowMs,
                renderDelayMs,
                trackGeometriesRef.current,
              );
              const matched = Boolean(position);
              const renderedPosition = position ?? motion;
              const projectedPos = instance.project([renderedPosition.longitude, renderedPosition.latitude]);
              const projX = projectedPos.x;
              const projY = projectedPos.y;
              // Apply animation offset to determine effective position
              const isSelected = vehicleId === selectedId;
              const isPreviousVehicle = vehicleId === previousVehicleIdRef.current;
              let offsetX = 0;
              let opacity = 1;
              if (switchAnim && isSelected) {
                offsetX = trainAnimationOffsetX;
                opacity = trainAnimationOpacity;
              } else if (switchAnim && isPreviousVehicle) {
                const elapsed = nowMs - switchAnim.startTime;
                const progress = Math.min(1, elapsed / switchAnim.duration);
                const eased = 1 - Math.pow(1 - progress, 3);
                offsetX = eased * (width + 100);
                opacity = 1 - eased;
              }
              // Check visibility with offset applied
              const effectiveX = projX + offsetX;
              if (effectiveX < -50 || effectiveX > width + 50 || projY < -50 || projY > height + 50) continue;
              const heading = sample.current.headingDegrees;
              const derivedHeading = heading ?? (sample.previous
                ? Math.atan2(
                    sample.current.position.longitude - sample.previous.position.longitude,
                    -(sample.current.position.latitude - sample.previous.position.latitude),
                  ) * 180 / Math.PI
                : 0);
              // Op landelijk niveau blijft de kaart rustig; vanaf regionaal
              // niveau verschijnt het volledige, realistische treinmodel.
              const sprite = zoom >= 9.3
                ? spriteForVehicle(vehicleId, sample.current.materialNumber, trainSpritesRef.current)
                : null;
              const responsiveMarkerScale = zoom < 7
                ? (window.innerWidth >= 2200 ? 1.05 : window.innerWidth >= 1400 ? 0.84 : 0.68)
                : markerScale;
              if (opacity > 0) {
                context.globalAlpha = opacity;
                drawTrainIcon(
                  context,
                  projX + offsetX,
                  projY,
                  derivedHeading * Math.PI / 180,
                  sprite,
                  isSelected,
                  matched,
                  responsiveMarkerScale,
                );
                context.globalAlpha = 1;
              }
            }
          }
        }
        const sourcePoint = instance.getSource("selected-rail-source") as GeoJSONSource | undefined;
        sourcePoint?.setData({
          type: "FeatureCollection",
          features: selectedSample ? [{
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [selectedSample.current.position.longitude, selectedSample.current.position.latitude],
            },
            properties: {},
          }] : [],
        });

      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    animationFrame = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [mapLayers, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    const applyMatchDebug = () => {
      if (!instance.isStyleLoaded()
        || !instance.getLayer("selected-track-edge")
        || !instance.getLayer("match-candidate-lines")) return;
      const selectedMatch = selectedVehicleId ? trackMatchesByVehicle[selectedVehicleId] : null;
      const matchSource = instance.getSource("selected-track-match") as GeoJSONSource | undefined;
      const features = selectedMatch?.snappedPosition ? [
        {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [selectedMatch.rawPosition.longitude, selectedMatch.rawPosition.latitude],
              [selectedMatch.snappedPosition.longitude, selectedMatch.snappedPosition.latitude],
            ],
          },
          properties: { status: selectedMatch.status },
        },
        {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [selectedMatch.snappedPosition.longitude, selectedMatch.snappedPosition.latitude],
          },
          properties: { status: selectedMatch.status },
        },
      ] : [];
      matchSource?.setData({ type: "FeatureCollection", features });
      instance.setFilter("selected-track-edge", selectedMatch?.edgeId
        ? ["==", ["get", "edgeId"], selectedMatch.edgeId]
        : ["==", ["get", "edgeId"], ""]);
      const candidateIds = debugMatching ? selectedMatch?.candidates.map((candidate) => candidate.edgeId) ?? [] : [];
      instance.setFilter("match-candidate-lines", candidateIds.length
        ? ["in", ["get", "edgeId"], ["literal", candidateIds]]
        : ["==", ["get", "edgeId"], ""]);
    };
    applyMatchDebug();
    instance.once("idle", applyMatchDebug);
    return () => { instance.off("idle", applyMatchDebug); };
  }, [debugMatching, mapReady, selectedVehicleId, trackMatchesByVehicle]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    const setVisibility = (layerIds: string[], visible: boolean) => {
      for (const layerId of layerIds) {
        if (instance.getLayer(layerId)) instance.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      }
    };
    setVisibility(["rail-fleet-points", "rail-fleet-selected"], mapLayers.trains);
    setVisibility(["pdok-rail-geometry-lines"], mapLayers.railways);
  }, [mapLayers, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    for (const definition of baseMapDefinitions) {
      const layerId = `base-${definition.key}`;
      if (instance.getLayer(layerId)) instance.setLayoutProperty(layerId, "visibility", definition.key === baseMap ? "visible" : "none");
    }
  }, [baseMap, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    for (const layer of roadLayerDefinitions) {
      const matching = roadEvents.filter((event) => roadLayerFor(event) === layer.key);
      const features = matching.map((event) => ({
        type: "Feature" as const,
        id: event.id,
        geometry: event.geometry,
        properties: {
          eventId: event.id,
          type: event.type,
          status: event.status,
          severity: event.severity,
          source: event.source,
          label: roadEventLabel(event),
        },
      }));
      const pointSource = instance.getSource(`road-${layer.key}-points-source`) as GeoJSONSource | undefined;
      const lineSource = instance.getSource(`road-${layer.key}-lines-source`) as GeoJSONSource | undefined;
      pointSource?.setData({ type: "FeatureCollection", features: features.filter((feature) => feature.geometry.type === "Point") });
      lineSource?.setData({ type: "FeatureCollection", features: features.filter((feature) => feature.geometry.type !== "Point") });
      const visibility = roadLayers[layer.key] ? "visible" : "none";
      for (const layerId of [`road-${layer.key}-lines`, `road-${layer.key}-clusters`, `road-${layer.key}-cluster-count`, `road-${layer.key}-points`]) {
        if (instance.getLayer(layerId)) instance.setLayoutProperty(layerId, "visibility", visibility);
      }
    }
    const selectedSource = instance.getSource("selected-road-event") as GeoJSONSource | undefined;
    selectedSource?.setData({
      type: "FeatureCollection",
      features: selectedRoadEvent ? [{
        type: "Feature",
        id: selectedRoadEvent.id,
        geometry: selectedRoadEvent.geometry,
        properties: { eventId: selectedRoadEvent.id },
      }] : [],
    });
  }, [mapReady, roadEvents, roadLayers, selectedRoadEvent]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;
    let latestSequence: number | null = null;
    let latestRoadSequence: number | null = null;

    const connect = () => {
      setConnection(latestSequence !== null || latestRoadSequence !== null ? "herstellen" : "verbinden");
      socket = new WebSocket(realtimeWebSocketUrl());
      socketRef.current = socket;
      socket.onopen = () => {
        setConnection("live");
        // The server sends fresh fleet, match and road snapshots on every connection.
      };
      socket.onmessage = (event) => {
        let decoded: unknown;
        try { decoded = JSON.parse(String(event.data)); } catch (error) {
          console.warn("[MobilityDashboard] Failed to parse WebSocket message:", error);
          return;
        }

        const fleetSnapshot = railFleetSnapshotMessageSchema.safeParse(decoded);
        if (fleetSnapshot.success) {
          latestSequence = fleetSnapshot.data.sequence;
          setVehiclesById(toRecord(fleetSnapshot.data.data));
          const previousSamples = motionSamplesRef.current;
          const restoredSamples = new Map<string, MotionSample>();
          for (const vehicle of fleetSnapshot.data.data) {
            const previous = previousSamples.get(vehicle.vehicleId)?.current ?? null;
            restoredSamples.set(vehicle.vehicleId, {
              previous: previous?.observationId === vehicle.observationId ? previousSamples.get(vehicle.vehicleId)?.previous ?? null : previous,
              current: vehicle,
            });
          }
          motionSamplesRef.current = restoredSamples;
          return;
        }
        const fleetBatch = railFleetBatchMessageSchema.safeParse(decoded);
        if (fleetBatch.success) {
          if (latestSequence !== null && fleetBatch.data.sequence !== latestSequence + 1) {
            socket?.send(JSON.stringify({ protocolVersion: 2, type: "resync" }));
            setConnection("herstellen");
            return;
          }
          latestSequence = fleetBatch.data.sequence;
          setVehiclesById((current) => {
            const next = { ...current };
            for (const vehicleId of fleetBatch.data.removedVehicleIds) delete next[vehicleId];
            for (const vehicle of fleetBatch.data.upserts) next[vehicle.vehicleId] = vehicle;
            return next;
          });
          for (const vehicleId of fleetBatch.data.removedVehicleIds) {
            motionSamplesRef.current.delete(vehicleId);
            trackMotionSamplesRef.current.delete(vehicleId);
          }
          for (const vehicle of fleetBatch.data.upserts) {
            const currentSample = motionSamplesRef.current.get(vehicle.vehicleId);
            if (currentSample?.current.observationId === vehicle.observationId) continue;
            // Use the current interpolated position as the new starting point
            // to avoid "jumping back" when a new position arrives
            const now = Date.now();
            const rendered = currentSample ? renderMotion(currentSample, now, renderDelayMs) : null;
            const effectivePrevious = rendered && currentSample
              ? {
                  ...currentSample.current,
                  position: {
                    ...currentSample.current.position,
                    longitude: rendered.longitude,
                    latitude: rendered.latitude,
                  },
                  time: {
                    ...currentSample.current.time,
                    sourceMeasuredAt: new Date(now - renderDelayMs).toISOString(),
                  },
                }
              : currentSample?.current ?? null;
            motionSamplesRef.current.set(vehicle.vehicleId, {
              previous: effectivePrevious,
              current: vehicle,
            });
          }
          setConnection("live");
          return;
        }
        const matchSnapshot = railMatchSnapshotMessageSchema.safeParse(decoded);
        if (matchSnapshot.success) {
          const matches = new Map(matchSnapshot.data.data.map((match) => [match.vehicleId, match]));
          const trackMotionSamples = new Map<string, TrackMotionSample>();
          const now = Date.now();
          for (const match of matchSnapshot.data.data) {
            const currentTrackSample = trackMotionSamplesRef.current.get(match.vehicleId);
            const previousMatch = currentTrackSample?.current ?? trackMatchesRef.current.get(match.vehicleId) ?? null;
            // Use the current interpolated position as the new starting point
            // to avoid "jumping back" when a new position arrives
            let effectivePrevious = previousMatch;
            if (currentTrackSample && previousMatch?.snappedPosition) {
              const interpolatedPos = trackMotionPosition(currentTrackSample, now, renderDelayMs, trackGeometriesRef.current);
              if (interpolatedPos) {
                effectivePrevious = {
                  ...previousMatch,
                  snappedPosition: interpolatedPos,
                };
              }
            }
            trackMotionSamples.set(match.vehicleId, { previous: effectivePrevious, current: match });
          }
          trackMotionSamplesRef.current = trackMotionSamples;
          trackMatchesRef.current = matches;
          void requestTrackGeometries(matchSnapshot.data.data.map((match) => match.edgeId).filter((edgeId): edgeId is string => Boolean(edgeId)));
          setTrackMatchesByVehicle(Object.fromEntries(matches));
          return;
        }
        const matchBatch = railMatchBatchMessageSchema.safeParse(decoded);
        if (matchBatch.success) {
          const matches = new Map(trackMatchesRef.current);
          const trackMotionSamples = new Map(trackMotionSamplesRef.current);
          for (const vehicleId of matchBatch.data.removedVehicleIds) {
            matches.delete(vehicleId);
            trackMotionSamples.delete(vehicleId);
          }
          const now = Date.now();
          for (const match of matchBatch.data.upserts) {
            const currentTrackSample = trackMotionSamples.get(match.vehicleId);
            const previousMatch = currentTrackSample?.current ?? matches.get(match.vehicleId) ?? null;
            matches.set(match.vehicleId, match);
            // Use the current interpolated position as the new starting point
            // to avoid "jumping back" when a new position arrives
            let effectivePrevious = previousMatch;
            if (currentTrackSample && previousMatch?.snappedPosition) {
              const interpolatedPos = trackMotionPosition(currentTrackSample, now, renderDelayMs, trackGeometriesRef.current);
              if (interpolatedPos) {
                effectivePrevious = {
                  ...previousMatch,
                  snappedPosition: interpolatedPos,
                };
              }
            }
            trackMotionSamples.set(match.vehicleId, { previous: effectivePrevious, current: match });
          }
          trackMotionSamplesRef.current = trackMotionSamples;
          trackMatchesRef.current = matches;
          void requestTrackGeometries(matchBatch.data.upserts.map((match) => match.edgeId).filter((edgeId): edgeId is string => Boolean(edgeId)));
          setTrackMatchesByVehicle(Object.fromEntries(matches));
          return;
        }
        const selection = railSelectionSnapshotMessageSchema.safeParse(decoded);
        if (selection.success) {
          if (selection.data.vehicleId !== selectedVehicleIdRef.current) return;
          setSelectedVehicleId(selection.data.vehicleId);
          selectedVehicleIdRef.current = selection.data.vehicleId;
          setObservation(selection.data.data);
          return;
        }
        const journeySnapshot = journeySnapshotMessageSchema.safeParse(decoded);
        if (journeySnapshot.success) {
          if (!selectedVehicleIdRef.current) return;
          setJourney(journeySnapshot.data.data);
          return;
        }
        const roadSnapshot = roadSnapshotMessageSchema.safeParse(decoded);
        if (roadSnapshot.success) {
          latestRoadSequence = roadSnapshot.data.sequence;
          setRoadEventsById(Object.fromEntries(roadSnapshot.data.data.map((roadEvent) => [roadEvent.id, roadEvent])));
          return;
        }
        const roadBatch = roadBatchMessageSchema.safeParse(decoded);
        if (roadBatch.success) {
          if (latestRoadSequence !== null && roadBatch.data.sequence !== latestRoadSequence + 1) {
            socket?.send(JSON.stringify({ protocolVersion: 2, type: "resync" }));
            return;
          }
          latestRoadSequence = roadBatch.data.sequence;
          setRoadEventsById((current) => {
            const next = { ...current };
            for (const eventId of roadBatch.data.removedEventIds) delete next[eventId];
            for (const roadEvent of roadBatch.data.upserts) next[roadEvent.id] = roadEvent;
            return next;
          });
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setConnection("offline");
        reconnectTimer = window.setTimeout(connect, 3_000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      socketRef.current = null;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [requestTrackGeometries]);

  useEffect(() => {
    const instance = map.current;
    const source = instance?.getSource("expected-rail-route") as GeoJSONSource | undefined;
    if (!source) return;
    const features: Array<Record<string, unknown>> = [];
    if (expectedRoute?.geometry.coordinates.length) features.push({ type: "Feature", properties: { kind: "route" }, geometry: expectedRoute.geometry });
    for (const stop of expectedRoute?.stops ?? []) {
      const station = stationsByCode.get(stop.code);
      if (station) features.push({ type: "Feature", properties: { kind: "stop", code: stop.code }, geometry: { type: "Point", coordinates: [station.longitude, station.latitude] } });
    }
    source.setData({ type: "FeatureCollection", features } as Parameters<GeoJSONSource["setData"]>[0]);
  }, [expectedRoute, mapReady]);

  useEffect(() => {
    if (!selectedVehicleId || !journey) return;
    const controller = new AbortController();
    fetch(realtimeHttpUrl(`/v1/trains/${encodeURIComponent(selectedVehicleId)}/route`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Route unavailable");
        const value = await response.json() as ExpectedRoute;
        if (value.method !== "EXPECTED_SHORTEST_TRACK_PATH" || value.geometry?.type !== "MultiLineString" || !Array.isArray(value.stops)) throw new Error("Invalid route");
        setExpectedRoute(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn("[MobilityDashboard:ExpectedRoute]", {
            timestamp: new Date().toISOString(),
            error: errorMessage,
            context: "fetch expected route",
          });
          setExpectedRoute(null);
        }
      });
    return () => controller.abort();
  }, [journey, selectedVehicleId]);

  const strikeValidUntil = parseTimestamp(nationalStrikeAlert.validUntil);
  const strikeIsActive = strikeValidUntil !== null && now <= strikeValidUntil;
  const staleRoadEvents = roadEvents.filter((event) => event.status === "STALE").length;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="railBrand" href="#map" aria-label="LiveOpWeg" onClick={resetMap}>
          <svg className="railBrandMark" viewBox="0 0 42 34" aria-hidden="true"><path d="M6 27h10V17h10V7h10" /><circle cx="6" cy="27" r="3.5" /><circle cx="16" cy="17" r="3.5" /><circle cx="26" cy="7" r="3.5" /><circle cx="36" cy="7" r="3.5" /></svg>
          <span className="railWordmark">Live<span>Op</span>Weg</span>
        </a>
        <nav className="sideNav" aria-label="Hoofdnavigatie">
          <button className={!showAlerts && !showLayers && !observation && !selectedStation ? "active" : ""} type="button" onClick={resetMap}><UiIcon name="map" /><span>Kaart</span></button>
          <button className={observation ? "active" : ""} type="button" onClick={() => { setShowMobileMenu(false); searchInputRef.current?.focus(); }}><UiIcon name="train" /><span>Treinen</span></button>
          <button className={selectedStation ? "active" : ""} type="button" onClick={() => { setShowMobileMenu(false); setMapLayers((current) => ({ ...current, stations: true })); searchInputRef.current?.focus(); }}><UiIcon name="clock" /><span>Stations</span></button>
          <button className={`secondaryNavItem ${showJourneyPlanner ? "active" : ""}`} type="button" onClick={openJourneyPlanner}><UiIcon name="queue" /><span>Reisplanner</span></button>
          <button className={`secondaryNavItem ${showDelayStats ? "active" : ""}`} type="button" onClick={openDelayStats}><UiIcon name="settings" /><span>Statistieken</span></button>
          <button className={showAlerts ? "active" : ""} type="button" onClick={() => { setShowMobileMenu(false); setSelectedStation(null); clearVehicleSelection(); setShowLayers(false); setShowJourneyPlanner(false); setShowDelayStats(false); setShowAlerts((current) => !current); }}><span className="navIconWrap"><UiIcon name="bell" />{roadCounts.incidents + roadCounts.closures > 0 && <b>{Math.min(99, roadCounts.incidents + roadCounts.closures)}</b>}</span><span>Meldingen</span></button>
          <button className={`secondaryNavItem ${showLayers ? "active" : ""}`} type="button" onClick={() => { setShowAlerts(false); setShowJourneyPlanner(false); setShowDelayStats(false); setShowLayers(true); }}><UiIcon name="sliders" /><span>Instellingen</span></button>
          <button className="mobileMoreButton" type="button" aria-expanded={showMobileMenu} aria-controls="mobileMoreMenu" onClick={() => setShowMobileMenu((current) => !current)}><UiIcon name="sliders" /><span>Meer</span></button>
          {showMobileMenu && <div className="mobileMoreMenu" id="mobileMoreMenu">
            <button type="button" onClick={() => { openJourneyPlanner(); setShowMobileMenu(false); }}>Reisplanner</button>
            <button type="button" onClick={() => { openDelayStats(); setShowMobileMenu(false); }}>Statistieken</button>
            <button type="button" onClick={() => { setShowAlerts(false); setShowJourneyPlanner(false); setShowDelayStats(false); setShowLayers(true); setShowMobileMenu(false); }}>Instellingen en lagen</button>
          </div>}
        </nav>
        <div className="sidebarLive"><div className={`sourcePill ${connection}`}><span /> {connection === "live" ? "Live" : connection}</div></div>
      </header>

      <aside className={`railAlertsPanel liveFeedPanel ${showAlerts || selectedRoadEvent ? "open" : ""} ${observation || selectedStation ? "contextOpen" : ""}`} aria-label="Actuele meldingen" aria-hidden={!showAlerts && !selectedRoadEvent}>
        <div className="railAlertsHeader liveFeedHeader">
          <div><span className="railAlertsKicker">Live overzicht</span><strong>Actuele meldingen</strong></div>
          <div className="liveFeedHeaderActions"><span className="railAlertCount">{roadEvents.length.toLocaleString("nl-NL")}</span><button type="button" onClick={() => { setShowAlerts(false); setSelectedRoadEventId(null); }} aria-label="Sluit meldingen">×</button></div>
        </div>
        <div className="networkSummary" aria-label="Landelijk live-overzicht">
          <div><strong>{vehicles.length}</strong><span>treinen live</span></div>
          <div><strong>{roadCounts.incidents + roadCounts.closures}</strong><span>ernstige meldingen</span></div>
          <div><strong className={connection === "live" ? "statusLive" : ""}>{connection === "live" ? "Live" : "Wachten"}</strong><span>gegevensfeed</span></div>
        </div>
        <div className="feedSectionTitle"><strong>Laatste updates</strong><span>Meest recent</span></div>
        <div className="liveFeedList">
          {strikeIsActive && <a className="liveFeedItem strike" href={nationalStrikeAlert.url} target="_blank" rel="noreferrer">
            <span className="feedIcon"><UiIcon name="warning" /></span><span className="feedCopy"><strong>{nationalStrikeAlert.title}</strong><small>NS · heel Nederland</small></span><b>Vandaag</b><span className="feedArrow"><UiIcon name="chevron" /></span>
          </a>}
          {recentRoadEvents.map((roadEvent) => <button className={`liveFeedItem ${roadLayerFor(roadEvent)} ${selectedRoadEventId === roadEvent.id ? "selected" : ""}`} type="button" key={roadEvent.id} onClick={() => setSelectedRoadEventId(roadEvent.id)}>
            <span className="feedIcon"><UiIcon name={roadLayerIcon(roadLayerFor(roadEvent))} /></span>
            <span className="feedCopy"><strong>{roadEventTitle(roadEvent)}</strong><small>{roadEvent.direction ?? roadEvent.description ?? roadEvent.detailType}</small></span>
            <b>{roadEventBadge(roadEvent)}</b><span className="feedArrow"><UiIcon name="chevron" /></span>
          </button>)}
        </div>
        {selectedRoadEvent && <article className="liveFeedDetail">
          <button className="feedDetailClose" type="button" onClick={() => setSelectedRoadEventId(null)} aria-label="Sluit melding">×</button>
          <span className="detailEyebrow">{roadEventLabel(selectedRoadEvent)} · live</span>
          <h2>{roadEventTitle(selectedRoadEvent)}</h2>
          <p>{selectedRoadEvent.description ?? `${selectedRoadEvent.detailType}. Geen extra publieksinformatie meegeleverd.`}</p>
          <div><span>{selectedRoadEvent.direction ?? "Richting onbekend"}</span><strong>{roadEventBadge(selectedRoadEvent)}</strong></div>
        </article>}
        {!selectedRoadEvent && strikeIsActive && <article className="liveFeedDetail strikeDetail">
          <span className="detailEyebrow">NS · landelijke impact</span>
          <h2>{nationalStrikeAlert.title}</h2>
          <p>{nationalStrikeAlert.body}</p>
          <div><span>Bijgewerkt {formatJourneyClock(nationalStrikeAlert.updatedAt)}</span><a href={nationalStrikeAlert.url} target="_blank" rel="noreferrer">Bekijk bij NS ↗</a></div>
        </article>}
        <div className="railFeedSummary"><span><i className={connection === "live" ? "live" : ""} /> Live bronnen</span><strong>{vehicles.length} treinen zichtbaar</strong></div>
      </aside>

      <section className={`roadOverview mapDrawer ${showLayers ? "open" : ""}`} aria-label="NDW-weglagen en geselecteerde wegmelding" aria-hidden={!showLayers}>
        <button className="drawerClose" type="button" onClick={() => setShowLayers(false)} aria-label="Sluit kaartlagen">×</button>
        <div className="roadLayerPanel">
          <div className="roadLayerHeading">
            <div>
              <p className="panelKicker">NDW · DATEX II v3</p>
              <h2>Actueel op de weg</h2>
            </div>
            <span>{roadEvents.length.toLocaleString("nl-NL")} zichtbaar{staleRoadEvents ? ` · ${staleRoadEvents} verouderd` : ""}</span>
          </div>
          <div className="layerToggleSection">
            <h3>Kaart</h3>
            <div className="roadToggles mapLayerToggles">
              {mapLayerDefinitions.map((layer) => (
                <label key={layer.key} style={{ "--road-color": layer.color } as React.CSSProperties}>
                  <input type="checkbox" checked={mapLayers[layer.key]} onChange={(event) => setMapLayers((current) => ({ ...current, [layer.key]: event.target.checked }))} />
                  <i aria-hidden="true" /><span>{layer.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="layerToggleSection">
            <h3>Wegverkeer</h3>
          <div className="roadToggles">
            {roadLayerDefinitions.map((layer) => (
              <label key={layer.key} style={{ "--road-color": layer.color } as React.CSSProperties}>
                <input
                  type="checkbox"
                  checked={roadLayers[layer.key]}
                  onChange={(event) => setRoadLayers((current) => ({ ...current, [layer.key]: event.target.checked }))}
                />
                <i aria-hidden="true" />
                <span>{layer.label}</span>
                <strong>{roadCounts[layer.key]}</strong>
              </label>
            ))}
          </div>
          </div>
          <p className="roadSourceNote">Bron: NDW Actueel Beeld · leveranciersinformatie kan ongevalideerd zijn · volledige snapshot iedere 60 seconden.</p>
        </div>
      </section>

      <section className="fleetTools" aria-label="Treinselectie">
        <label>
          <span>{t("search.placeholder")}</span>
          <input ref={searchInputRef} aria-label={t("search.label")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search.placeholder")} />
        </label>
        {query.trim() && <div className="trainResults">
          {stationResults.length > 0 && <p className="searchGroupLabel">Stations</p>}
          {stationResults.map((station) => <button type="button" className="stationSearchResult" key={station.code} onClick={() => selectStation(station)}>
            <strong>{station.name}</strong><span>Station · {station.code}</span>
          </button>)}
          {searchResults.length > 0 && <p className="searchGroupLabel">Treinen</p>}
          {searchResults.map((vehicle) => {
            const rollingStock = identifyRollingStock(vehicle.materialNumber);
            return (
              <button
                className={vehicle.vehicleId === selectedVehicleId ? "selected" : ""}
                key={vehicle.vehicleId}
                type="button"
                onClick={() => selectVehicle(vehicle.vehicleId)}
              >
                <strong>Trein {vehicle.trainNumber}</strong>
                <span>{rollingStock.label} · materieel {vehicle.materialNumber ?? "onbekend"}</span>
              </button>
            );
          })}
          {!stationResults.length && !searchResults.length && <p className="searchGroupLabel">Geen trein of station gevonden.</p>}
        </div>}
      </section>

      <section className="radarStatusBar" aria-label="Landelijke livestatus">
        <div><UiIcon name="train" /><strong>{vehicles.length.toLocaleString("nl-NL")}</strong><span>treinen live</span></div>
        <div><i className={connection === "live" ? "live" : ""} /><strong>{connection === "live" ? "Verbonden" : "Wachten"}</strong><span>gegevensfeed</span></div>
        <button type="button" onClick={() => { setShowLayers(false); setShowAlerts(true); }}><UiIcon name="warning" /><strong>{roadCounts.incidents + roadCounts.closures}</strong><span>verstoringen</span></button>
      </section>

      <section className="workspace" id="map" aria-label="Landelijk realtime treindashboard">
        <div className="mapWrap">
          <div ref={mapElement} className="liveMap" aria-label="Kaart van Nederland met actuele bronposities" />
          <canvas ref={trainOverlayElement} className="trainOverlay" aria-hidden="true" />
          {!vehicles.length && <div className="waitingMarker"><span /> Wachten op eerste vlootbatch</div>}
          <div className="mapActions" aria-label="Kaartbediening">
            <button type="button" onClick={() => setShowLayers(true)} aria-expanded={showLayers}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4-8 4-8-4 8-4Zm-8 9 8 4 8-4M4 17l8 4 8-4" /></svg>
              <span>Lagen</span>
            </button>
            <button type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Licht thema" : "Donker thema"}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{theme === "dark" ? <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.71-.71M6.34 6.34l-.71-.71m12.72 0l-.71.71M6.34 17.66l-.71.71M12 7a5 5 0 100 10 5 5 0 000-10z" /> : <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />}</svg>
              <span>{theme === "dark" ? "Licht" : "Donker"}</span>
            </button>
            <button type="button" onClick={() => setLanguage(language === "nl" ? "en" : "nl")} aria-label={language === "nl" ? "Switch to English" : "Schakel over naar Nederlands"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15 15 0 014 10 15 15 0 01-4 10 15 15 0 01-4-10 15 15 0 014-10z" /></svg>
              <span>{language === "nl" ? "EN" : "NL"}</span>
            </button>
          </div>
          <div className="mapZoomControls" aria-label="Kaartzoom">
            <button type="button" onClick={() => map.current?.zoomIn({ duration: 250 })} aria-label={t("map.zoomIn")}>+</button>
            <button type="button" onClick={() => map.current?.zoomOut({ duration: 250 })} aria-label={t("map.zoomOut")}>−</button>
          </div>
          <div className={`mapStylePicker ${showMapStyles ? "open" : ""}`}>
            <div className="mapStyleMenu" role="menu" aria-label={t("map.style")} aria-hidden={!showMapStyles}>
              {baseMapDefinitions.map((definition) => <button role="menuitemradio" aria-checked={baseMap === definition.key} type="button" key={definition.key} onClick={() => { setBaseMap(definition.key); setShowMapStyles(false); }}>
                <span className={`mapStylePreview ${definition.key}`} /><span>{definition.label}</span>{baseMap === definition.key && <b>✓</b>}
              </button>)}
            </div>
            <button className="mapStyleCurrent" type="button" aria-expanded={showMapStyles} aria-label="Kies kaartweergave" onClick={() => setShowMapStyles((current) => !current)}>
              <span className={`mapStylePreview ${baseMap}`} /><span>{baseMapDefinitions.find((definition) => definition.key === baseMap)?.label}</span><UiIcon name="chevron" />
            </button>
          </div>
          <div className="mapAttribution">{baseMap === "satellite" ? "Tiles © Esri" : "© OpenStreetMap-bijdragers"} · spoor: ProRail/PDOK (CC0) · wegmeldingen: NDW/leveranciers</div>
        </div>
        {selectedStation && <StationPanel key={selectedStation.code} station={selectedStation} now={now} availableVehicleIds={availableVehicleIds} onClose={() => { setSelectedStation(null); replaceSelectionUrl(); }} onSelectVehicle={selectVehicle} />}
        {observation && !selectedStation && <TrainPanel key={observation.vehicleId} observation={vehiclesById[observation.vehicleId] ?? observation} journey={journey} now={now} onClose={clearVehicleSelection} />}
        {showJourneyPlanner && <JourneyPlanner onClose={() => setShowJourneyPlanner(false)} />}
        {showDelayStats && <DelayStats vehicles={vehicles} onClose={() => setShowDelayStats(false)} />}
      </section>
      <div className="notificationToggle">
        <button type="button" onClick={toggleNotifications} aria-label={notificationsEnabled ? "Schakel meldingen uit" : t("notifications.enable")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7Z" /><path d="M10 20h4" /></svg>
          <span>{notificationsEnabled ? "Meldingen aan" : "Meldingen uit"}</span>
        </button>
      </div>
    </main>
  );
}
