"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  DEFAULT_RENDER_DELAY_MS,
  renderMotion,
  type MotionSample,
  type RenderedMotion,
} from "../packages/domain-rail/client-motion";
import { identifyRollingStock } from "../packages/domain-rail/rolling-stock";
import {
  journeySnapshotMessageSchema,
  type RailJourney,
} from "../packages/protocol/journey";
import {
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
import { realtimeHttpUrl, realtimeWebSocketUrl } from "./realtime-url";

type ConnectionState = "verbinden" | "live" | "herstellen" | "offline";
type RoadLayerKey = "congestion" | "incidents" | "roadworks" | "closures" | "safety";
const configuredRenderDelayMs = Number(process.env.NEXT_PUBLIC_RENDER_DELAY_MS ?? DEFAULT_RENDER_DELAY_MS);
const renderDelayMs = Number.isFinite(configuredRenderDelayMs) && configuredRenderDelayMs >= 0 && configuredRenderDelayMs <= 30_000
  ? configuredRenderDelayMs
  : DEFAULT_RENDER_DELAY_MS;

const roadLayerDefinitions: { key: RoadLayerKey; label: string; color: string }[] = [
  { key: "congestion", label: "Files", color: "#c94f3d" },
  { key: "incidents", label: "Ongevallen & incidenten", color: "#792f43" },
  { key: "roadworks", label: "Werkzaamheden", color: "#e28a35" },
  { key: "closures", label: "Afsluitingen", color: "#242d32" },
  { key: "safety", label: "Veiligheidsmeldingen", color: "#2c7292" },
];

function roadLayerFor(event: RoadEvent): RoadLayerKey {
  if (event.type === "congestion") return "congestion";
  if (event.type === "accident" || event.type === "incident") return "incidents";
  if (event.type === "roadworks" || event.type === "speedRestriction") return "roadworks";
  if (event.type === "closure") return "closures";
  return "safety";
}

function roadEventLabel(event: RoadEvent): string {
  const labels: Record<RoadEvent["type"], string> = {
    congestion: "File", accident: "Ongeval", incident: "Incident", roadworks: "Werkzaamheden",
    closure: "Afsluiting", speedRestriction: "Tijdelijke snelheid", safety: "Veiligheidsmelding",
    weather: "Weerhinder", obstacle: "Obstakel", other: "Wegmelding",
  };
  return labels[event.type];
}

function formatTime(value: string | null): string {
  if (!value) return "Onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
}

function formatAge(value: string | null, now: number): string {
  if (!value) return "Onbekend";
  const seconds = Math.max(0, Math.round((now - Date.parse(value)) / 1_000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function formatDelay(seconds: number | null): string {
  if (seconds === null) return "Onbekend";
  if (seconds === 0) return "Op tijd";
  const minutes = Math.round(Math.abs(seconds) / 60);
  return seconds > 0 ? `+${minutes} min` : `−${minutes} min`;
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

  const previousTime = Date.parse(sample.previous?.sourceMeasuredAt ?? sample.previous?.matchedAt ?? "");
  const currentTime = Date.parse(sample.current.sourceMeasuredAt ?? sample.current.matchedAt);
  const targetTime = nowMs - renderDelayMs;
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime) || currentTime <= previousTime) return currentTrackPosition ?? currentPosition;
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
  if (
    currentGeometry
    && sample.current.edgeId === sample.previous?.edgeId
    && sample.previous.edgeProgress !== null
    && sample.current.edgeProgress !== null
  ) {
    const edgeProgress = sample.previous.edgeProgress
      + (sample.current.edgeProgress - sample.previous.edgeProgress) * progress;
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
      progress,
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
  const selectedScale = selected ? Math.max(0.92, scale) : scale;
  const hasSprite = Boolean(sprite?.complete && sprite.naturalWidth > 0);
  const width = (hasSprite ? (selected ? 18 : 14) : (selected ? 14 : 11)) * selectedScale;
  const height = (hasSprite ? (selected ? 40 : 32) : (selected ? 22 : 17)) * selectedScale;
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
  const mapElement = useRef<HTMLDivElement>(null);
  const trainOverlayElement = useRef<HTMLCanvasElement>(null);
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
  const socketRef = useRef<WebSocket | null>(null);
  const selectFromMapRef = useRef<(vehicleId: string) => void>(() => undefined);
  const motionSamplesRef = useRef(new Map<string, MotionSample>());
  const trackMatchesRef = useRef(new Map<string, RailTrackMatch>());
  const trackMotionSamplesRef = useRef(new Map<string, TrackMotionSample>());
  const trackGeometriesRef = useRef(new Map<string, TrackGeometry>());
  const trackGeometryRequestsRef = useRef(new Set<string>());
  const selectedVehicleIdRef = useRef<string | null>(null);
  const selectRoadFromMapRef = useRef<(eventId: string) => void>(() => undefined);
  const [vehiclesById, setVehiclesById] = useState<Record<string, RailObservation>>({});
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [observation, setObservation] = useState<RailObservation | null>(null);
  const [journey, setJourney] = useState<RailJourney | null>(null);
  const [selectedMotion, setSelectedMotion] = useState<RenderedMotion | null>(null);
  const [trackMatchesByVehicle, setTrackMatchesByVehicle] = useState<Record<string, RailTrackMatch>>({});
  const [connection, setConnection] = useState<ConnectionState>("verbinden");
  const [sequence, setSequence] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [debugMatching, setDebugMatching] = useState(false);
  const [roadEventsById, setRoadEventsById] = useState<Record<string, RoadEvent>>({});
  const [selectedRoadEventId, setSelectedRoadEventId] = useState<string | null>(null);
  const [showLayers, setShowLayers] = useState(false);
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
      if (!response.ok) return;
      const payload = await response.json() as {
        features?: Array<{
          properties?: { edgeId?: unknown; fromNode?: unknown; toNode?: unknown; lengthMeters?: unknown };
          geometry?: { coordinates?: unknown };
        }>;
      };
      for (const feature of payload.features ?? []) {
        const edgeId = typeof feature.properties?.edgeId === "string" ? feature.properties.edgeId : null;
        const fromNode = typeof feature.properties?.fromNode === "string" ? feature.properties.fromNode : null;
        const toNode = typeof feature.properties?.toNode === "string" ? feature.properties.toNode : null;
        const lengthMeters = typeof feature.properties?.lengthMeters === "number" ? feature.properties.lengthMeters : null;
        const coordinates = Array.isArray(feature.geometry?.coordinates)
          ? feature.geometry.coordinates
            .filter((point): point is number[] => Array.isArray(point) && point.length >= 2 && point.every((value) => typeof value === "number"))
            .map((point) => [point[0], point[1]] as [number, number])
          : [];
        if (edgeId && fromNode && toNode && lengthMeters && coordinates.length >= 2) {
          trackGeometriesRef.current.set(edgeId, { coordinates, fromNode, toNode, lengthMeters });
        }
      }
    } catch {
      // Een tijdelijke geometry-fout mag de live vloot niet blokkeren.
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
  const selectedRollingStock = useMemo(
    () => identifyRollingStock(observation?.materialNumber),
    [observation?.materialNumber],
  );
  const roadEvents = useMemo(() => Object.values(roadEventsById), [roadEventsById]);
  const selectedRoadEvent = selectedRoadEventId ? roadEventsById[selectedRoadEventId] ?? null : null;
  const roadCounts = useMemo(() => Object.fromEntries(roadLayerDefinitions.map(({ key }) => [
    key, roadEvents.filter((event) => roadLayerFor(event) === key).length,
  ])) as Record<RoadLayerKey, number>, [roadEvents]);

  const selectVehicle = useCallback((vehicleId: string, focusMap = true) => {
    const selected = vehiclesById[vehicleId];
    if (!selected) return;
    setSelectedVehicleId(vehicleId);
    selectedVehicleIdRef.current = vehicleId;
    setObservation(selected);
    setJourney(null);
    setQuery("");
    socketRef.current?.send(JSON.stringify({ protocolVersion: 2, type: "select", vehicleId }));
    if (focusMap && map.current) {
      map.current.easeTo({
        center: [selected.position.longitude, selected.position.latitude],
        zoom: Math.max(map.current.getZoom(), 10),
        offset: window.innerWidth <= 760
          ? [0, -Math.min(110, window.innerHeight * 0.14)]
          : [-190, 0],
        duration: 700,
      });
    }
  }, [vehiclesById]);

  const clearVehicleSelection = useCallback(() => {
    setSelectedVehicleId(null);
    selectedVehicleIdRef.current = null;
    setObservation(null);
    setJourney(null);
    setQuery("");
  }, []);

  useEffect(() => {
    selectFromMapRef.current = (vehicleId) => selectVehicle(vehicleId);
  }, [selectVehicle]);

  useEffect(() => {
    selectRoadFromMapRef.current = (eventId) => {
      setSelectedRoadEventId(eventId);
      setShowLayers(true);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    void import("maplibre-gl").then(({ Map }) => {
      if (disposed || !mapElement.current || map.current) return;
      const instance = new Map({
        container: mapElement.current,
        bounds: [[3.15, 50.7], [7.45, 53.7]],
        fitBoundsOptions: {
          padding: window.innerWidth <= 760
            ? { top: 32, right: 22, bottom: 32, left: 22 }
            : { top: 60, right: 60, bottom: 60, left: 60 },
        },
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap-bijdragers",
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.72, "raster-contrast": 0.12 } }],
        },
      });
      map.current = instance;
      instance.on("load", () => {
        if (disposed) return;
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
            const source = instance.getSource(pointSourceId) as GeoJSONSource;
            void source.getClusterExpansionZoom(clusterId).then((zoom) => {
              instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom, duration: 500 });
            });
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
          if (nearest) selectFromMapRef.current(nearest.vehicleId);
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
    let lastUiFrame = 0;

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
        const selected = selectedSample ? renderMotion(selectedSample, nowMs, renderDelayMs) : null;
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
            for (const [vehicleId, sample] of motionSamplesRef.current) {
              const motion = renderMotion(sample, nowMs, renderDelayMs);
              const position = trackMotionPosition(
                trackMotionSamplesRef.current.get(vehicleId) ?? null,
                nowMs,
                renderDelayMs,
                trackGeometriesRef.current,
              );
              const matched = Boolean(position);
              const renderedPosition = position ?? motion;
              const projected = instance.project([renderedPosition.longitude, renderedPosition.latitude]);
              if (projected.x < -16 || projected.x > width + 16 || projected.y < -16 || projected.y > height + 16) continue;
              const isSelected = vehicleId === selectedId;
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
              drawTrainIcon(
                context,
                projected.x,
                projected.y,
                derivedHeading * Math.PI / 180,
                sprite,
                isSelected,
                matched,
                markerScale,
              );
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

        if (frameTime - lastUiFrame >= 250) {
          lastUiFrame = frameTime;
          setSelectedMotion(selected);
        }
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    animationFrame = window.requestAnimationFrame(renderFrame);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [mapReady]);

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
    let latestSequence = 0;
    let latestRoadSequence = 0;

    const connect = () => {
      setConnection(latestSequence ? "herstellen" : "verbinden");
      socket = new WebSocket(realtimeWebSocketUrl());
      socketRef.current = socket;
      socket.onopen = () => setConnection("live");
      socket.onmessage = (event) => {
        let decoded: unknown;
        try { decoded = JSON.parse(String(event.data)); } catch { return; }

        const fleetSnapshot = railFleetSnapshotMessageSchema.safeParse(decoded);
        if (fleetSnapshot.success) {
          latestSequence = fleetSnapshot.data.sequence;
          setSequence(latestSequence);
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
          if (latestSequence && fleetBatch.data.sequence !== latestSequence + 1) {
            socket?.send(JSON.stringify({ protocolVersion: 2, type: "resync" }));
            setConnection("herstellen");
            return;
          }
          latestSequence = fleetBatch.data.sequence;
          setSequence(latestSequence);
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
            motionSamplesRef.current.set(vehicle.vehicleId, {
              previous: currentSample?.current ?? null,
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
          for (const match of matchSnapshot.data.data) {
            const previous = trackMotionSamplesRef.current.get(match.vehicleId)?.current
              ?? trackMatchesRef.current.get(match.vehicleId)
              ?? null;
            trackMotionSamples.set(match.vehicleId, { previous, current: match });
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
          for (const match of matchBatch.data.upserts) {
            const previous = trackMotionSamples.get(match.vehicleId)?.current ?? matches.get(match.vehicleId) ?? null;
            matches.set(match.vehicleId, match);
            trackMotionSamples.set(match.vehicleId, { previous, current: match });
          }
          trackMotionSamplesRef.current = trackMotionSamples;
          trackMatchesRef.current = matches;
          void requestTrackGeometries(matchBatch.data.upserts.map((match) => match.edgeId).filter((edgeId): edgeId is string => Boolean(edgeId)));
          setTrackMatchesByVehicle(Object.fromEntries(matches));
          return;
        }
        const selection = railSelectionSnapshotMessageSchema.safeParse(decoded);
        if (selection.success) {
          setSelectedVehicleId(selection.data.vehicleId);
          selectedVehicleIdRef.current = selection.data.vehicleId;
          setObservation(selection.data.data);
          return;
        }
        const journeySnapshot = journeySnapshotMessageSchema.safeParse(decoded);
        if (journeySnapshot.success) {
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
          if (latestRoadSequence && roadBatch.data.sequence !== latestRoadSequence + 1) {
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

  const measuredAge = selectedMotion
    ? `${Math.round(selectedMotion.sourceAgeSeconds)} s`
    : formatAge(observation?.time.sourceMeasuredAt ?? null, now);
  const computedState = useMemo(() => {
    if (!observation?.time.sourceMeasuredAt) return "UNKNOWN";
    if (selectedMotion?.stale) return "STALE";
    const ageSeconds = (now - Date.parse(observation.time.sourceMeasuredAt)) / 1_000;
    return ageSeconds <= observation.quality.freshnessThresholdSeconds ? observation.quality.state : "STALE";
  }, [now, observation, selectedMotion]);
  const confidencePercent = selectedMotion ? Math.round(selectedMotion.confidence.final * 100) : null;
  const motionLabel = selectedMotion?.mode === "INTERPOLATED"
    ? "INTERPOLATED"
    : selectedMotion?.mode === "EXTRAPOLATED"
      ? "EXTRAPOLATED · vloeiend door"
    : selectedMotion?.mode === "STALE_HOLD"
      ? "STALE · beweging gestopt"
      : "SOURCE HOLD";
  const nextStop = useMemo(() => {
    if (!journey) return null;
    return journey.stops.find((stop) => {
      if (stop.calls.actual === false) return false;
      const relevantTime = stop.departure.actualAt ?? stop.arrival.actualAt ?? stop.departure.plannedAt ?? stop.arrival.plannedAt;
      return relevantTime ? Date.parse(relevantTime) >= now - 60_000 : false;
    }) ?? null;
  }, [journey, now]);
  const currentDelay = nextStop?.departure.exactDelaySeconds ?? nextStop?.arrival.exactDelaySeconds ?? null;
  const selectedTrackMatch = selectedVehicleId ? trackMatchesByVehicle[selectedVehicleId] ?? null : null;
  const acceptedSelectedMatch = selectedTrackMatch?.snappedPosition && selectedTrackMatch.status.startsWith("MATCHED")
    ? selectedTrackMatch
    : null;
  const displayedPosition = acceptedSelectedMatch?.snappedPosition ?? (selectedMotion
    ? { longitude: selectedMotion.longitude, latitude: selectedMotion.latitude }
    : null);
  const staleRoadEvents = roadEvents.filter((event) => event.status === "STALE").length;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#map" aria-label="Liveopweg">
          <img className="brandLogo" src="/liveopweg-logo.png?v=3" alt="Liveopweg" />
        </a>
        <div className={`sourcePill ${connection}`}><span /> {connection === "live" ? "Live" : connection}</div>
      </header>

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
          <p className="roadSourceNote">Bron: NDW Actueel Beeld · leveranciersinformatie kan ongevalideerd zijn · volledige snapshot iedere 60 seconden.</p>
        </div>
        <aside className="roadEventCard" aria-live="polite">
          <p className="panelKicker">Geselecteerde wegmelding</p>
          <h2>{selectedRoadEvent ? roadEventLabel(selectedRoadEvent) : "Kies een melding op de kaart"}</h2>
          {selectedRoadEvent ? <>
            <p>{selectedRoadEvent.description ?? `${selectedRoadEvent.detailType}. Geen publieksomschrijving meegeleverd.`}</p>
            <dl>
              <div><dt>Status</dt><dd>{selectedRoadEvent.status}</dd></div>
              <div><dt>Weg</dt><dd>{selectedRoadEvent.roadName ?? "Niet meegeleverd"}</dd></div>
              <div><dt>Richting</dt><dd>{selectedRoadEvent.direction ?? "Niet meegeleverd"}</dd></div>
              <div><dt>Bron</dt><dd>{selectedRoadEvent.source}</dd></div>
              <div><dt>Bronupdate</dt><dd>{formatTime(selectedRoadEvent.time.sourceUpdatedAt ?? selectedRoadEvent.time.publicationTime)}</dd></div>
              {selectedRoadEvent.time.validFrom && <div><dt>Start</dt><dd>{formatTime(selectedRoadEvent.time.validFrom)}</dd></div>}
              {selectedRoadEvent.time.validUntil && <div><dt>Einde</dt><dd>{formatTime(selectedRoadEvent.time.validUntil)}</dd></div>}
              {selectedRoadEvent.queueLengthMeters !== null && <div><dt>Filelengte</dt><dd>{(selectedRoadEvent.queueLengthMeters / 1_000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km</dd></div>}
              {selectedRoadEvent.delaySeconds !== null && <div><dt>Vertraging</dt><dd>{Math.round(selectedRoadEvent.delaySeconds / 60)} min</dd></div>}
              {selectedRoadEvent.temporarySpeedLimitKmh !== null && <div><dt>Tijdelijke limiet</dt><dd>{selectedRoadEvent.temporarySpeedLimitKmh} km/h</dd></div>}
            </dl>
            <small>SOURCE · {selectedRoadEvent.provenance.geometryOrigin} · versie {selectedRoadEvent.version}</small>
          </> : <p>Selecteer een gekleurde lijn of stip. Op lage zoomniveaus worden puntmeldingen per categorie gebundeld.</p>}
        </aside>
      </section>

      <section className="fleetTools" aria-label="Treinselectie">
        <div><strong>{vehicles.length}</strong><span>treinen live</span></div>
        <label>
          <span>Zoek treinnummer of materieel</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek trein of materieel" />
        </label>
        {query.trim() && <div className="trainResults">
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
        </div>}
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
              <strong>{roadEvents.length}</strong>
            </button>
          </div>
          <div className="mapAttribution">© OpenStreetMap-bijdragers · spoor: ProRail/PDOK (CC0) · wegmeldingen: NDW/leveranciers</div>
        </div>
        {observation && <aside className="observationPanel" aria-live="polite">
          <div className="selectedTrainHeader">
            <div>
              <p className="panelKicker">Trein {observation.trainNumber} · {selectedRollingStock.label}</p>
              <h2>{journey?.destination.actual ?? journey?.destination.planned ?? `Materieel ${observation.materialNumber ?? "onbekend"}`}</h2>
            </div>
            <button type="button" onClick={clearVehicleSelection} aria-label="Sluit treininformatie">×</button>
          </div>
          <p className="selectedTrainState"><i className={computedState === "FRESH_SOURCE" ? "fresh" : "stale"} /> {computedState === "FRESH_SOURCE" ? "Live" : "Verouderd"} · {measuredAge} geleden</p>
          <div className="trainQuickFacts">
            <div><span>Snelheid</span><strong>{observation?.speed ? `${observation.speed.valueKmh} km/h` : "—"}</strong></div>
            <div><span>Volgende halte</span><strong>{nextStop?.station.shortName ?? nextStop?.station.longName ?? "—"}</strong></div>
            <div><span>Vertraging</span><strong className={currentDelay && currentDelay > 0 ? "staleText" : "freshText"}>{formatDelay(currentDelay)}</strong></div>
          </div>
          <details className="observationDetails">
            <summary>Meer treindetails</summary>
            <div className="observationDetailsBody">
            <div className="timestampGrid">
            <span>Brontijd</span><strong>{formatTime(observation?.time.sourceMeasuredAt ?? null)}</strong>
            <span>Ontvangsttijd</span><strong>{formatTime(observation?.time.receivedAt ?? null)}</strong>
            <span>Bronleeftijd</span><strong>{measuredAge}</strong>
            <span>Snelheid</span><strong>{observation?.speed ? `${observation.speed.valueKmh} km/h · GPS` : "Onbekend"}</strong>
            <span>Materieeltype</span><strong>{selectedRollingStock.label} · {selectedRollingStock.confidence}</strong>
            <span>Status</span><strong className={computedState === "FRESH_SOURCE" ? "freshText" : "staleText"}>{computedState}</strong>
            <span>Rendering</span><strong>{acceptedSelectedMatch ? "MAP_MATCHED · bronhold" : motionLabel}</strong>
            <span>Renderconfidence</span><strong>{confidencePercent === null ? "Onbekend" : `${confidencePercent}% · ${selectedMotion?.confidence.band}`}</strong>
          </div>
          <div className="positionComparison">
            <div><span>Displayed position</span><strong>{displayedPosition ? `${displayedPosition.latitude.toFixed(7)}, ${displayedPosition.longitude.toFixed(7)}` : "Onbekend"}</strong><small>{acceptedSelectedMatch ? `${acceptedSelectedMatch.status} · DERIVED` : `${motionLabel} · clientweergave`}</small></div>
            <div><span>Last source position</span><strong>{observation ? `${observation.position.latitude.toFixed(7)}, ${observation.position.longitude.toFixed(7)}` : "Onbekend"}</strong><small>SOURCE · {measuredAge} geleden</small></div>
          </div>
          <section className={`matchPanel ${selectedTrackMatch?.confidenceClass.toLowerCase() ?? "unknown"}`} aria-label="Landelijk map-matchresultaat">
            <div className="matchPanelHeader">
              <div><span>Landelijke track match</span><strong>{selectedTrackMatch?.status ?? "Buiten Nederland / niet beschikbaar"}</strong></div>
              <button type="button" onClick={() => setDebugMatching((value) => !value)}>{debugMatching ? "Verberg debug" : "Toon debug"}</button>
            </div>
            <p>De interne score is geen kanspercentage. Route naar de volgende halte, actuele wisselstand en rijrichting zijn nog niet beschikbaar als matchbewijs.</p>
            {selectedTrackMatch && <>
              <div className="matchFacts">
                <div><span>Afstand tot spoor</span><strong>{selectedTrackMatch.distanceMeters === null ? "Onbekend" : `${selectedTrackMatch.distanceMeters.toFixed(1)} m`}</strong></div>
                <div><span>Kandidaten</span><strong>{selectedTrackMatch.candidateCount}</strong></div>
                <div><span>Klasse</span><strong>{selectedTrackMatch.confidenceClass}</strong></div>
                <div><span>Interne score</span><strong>{selectedTrackMatch.internalScore === null ? "Onbekend" : selectedTrackMatch.internalScore.toFixed(3)}</strong></div>
                <div><span>Graphzone</span><strong>{selectedTrackMatch.zone ? `${selectedTrackMatch.zone.quality} · ${selectedTrackMatch.zone.id}` : "Onbekend"}</strong></div>
                <div><span>Zoekstraal</span><strong>{selectedTrackMatch.searchRadiusMeters} m</strong></div>
                <div><span>Regionale fallback</span><strong>{selectedTrackMatch.fallback?.applied ? "Toegepast · LOW" : "Niet toegepast"}</strong></div>
                <div><span>Graphkwaliteit</span><strong>{selectedTrackMatch.zone?.fallbackAllowed ? "fallback toegestaan" : "fallback geblokkeerd"}</strong></div>
              </div>
              {debugMatching && <div className="matchDebug">
                <strong>Beste kandidaatsporen</strong>
                {selectedTrackMatch.zone?.reasons.map((reason) => <div key={reason}><code>ZONE</code><span>{reason}</span></div>)}
                {selectedTrackMatch.fallback && <div><code>FALLBACK</code><span>{selectedTrackMatch.fallback.reason} · {selectedTrackMatch.fallback.effectiveRadiusMeters} m</span></div>}
                {selectedTrackMatch.candidates.map((candidate) => <div key={candidate.edgeId}>
                  <code>{candidate.edgeId.slice(-10)}</code>
                  <span>{candidate.distanceMeters.toFixed(1)} m · score {candidate.internalScore.toFixed(3)} · {candidate.continuity}</span>
                </div>)}
              </div>}
            </>}
          </section>
          {selectedMotion && <details className="confidenceDetails">
            <summary>Renderconfidence-opbouw</summary>
            <div><span>Positieleeftijd</span><strong>{Math.round(selectedMotion.confidence.positionAge * 100)}%</strong></div>
            <div><span>GPS-kwaliteit</span><strong>{selectedMotion.confidence.gpsQuality === null ? "Onbekend" : `${Math.round(selectedMotion.confidence.gpsQuality * 100)}%`}</strong></div>
            <div><span>Bewegingsplausibiliteit</span><strong>{Math.round(selectedMotion.confidence.movementPlausibility * 100)}%</strong></div>
            <div><span>Rendermethode</span><strong>{Math.round(selectedMotion.confidence.renderMethod * 100)}%</strong></div>
          </details>}
          <div className="provenance">SOURCE + CLIENT RENDER{selectedTrackMatch ? " + DERIVED MATCH" : ""} · WS · seq {sequence}</div>
            </div>
          </details>
        </aside>}
      </section>

    </main>
  );
}
