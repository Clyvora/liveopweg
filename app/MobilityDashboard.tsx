"use client";
import { groupTrainServices } from "../packages/domain-rail/train-service";

import { lazy, useReducer, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { Feature } from "geojson";
import { trainDisplayPosition } from "../packages/domain-rail/display-position";
import { measurementTime } from "../packages/domain-rail/position-quality";
import { identifyRollingStock } from "../packages/domain-rail/rolling-stock";
import {
  journeySnapshotMessageSchema,
  journeyDeltaMessageSchema,
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
import { parseTimestamp, realtimeHttpUrl } from "./realtime-url";
import { normalizeSearchText, railStations, searchStations, stationMinZoom, type RailStation } from "../packages/domain-rail/stations";
import { stationCatalogSchema } from "../packages/protocol/station-catalog";
import { nextTrainStop } from "./next-train-stop";
import { distanceBetweenMeters, trainRouteFeatures, trainTrailFeatures, updateTrainTrail } from "./train-route-progress";
import { panelReducer, type Panel } from "./panel-navigation";
import { uiCopy } from "./ui-copy";
import { addRadarMarkerLayers, stationLayers, trainHitLayers, trainLayers } from "./radar-marker-layers";
import { trainMapPreview } from "./train-map-preview";
import { fleetMapUpdate, type FleetMapFeatures } from "./rail-fleet-map";
import { failedBaseMaps } from "./map-source-state";
import { baseMapLayers, baseMapStyle, nightFallbackLayer, nightMapBackground, type BaseMapKey } from "./radar-basemaps";
import { AppNavigation } from "./AppNavigation";
import { MapCredits } from "./MapCredits";
import { BrandLogo } from "./BrandLogo";
import { guidePath, radarTitle } from "./site";
import { AppIcon } from "./Icons";
import { expectedRouteSchema, type ExpectedRoute } from "../packages/protocol/expected-route";
import { PanelHost } from "./PanelHost";
import { BlauwnetLayer, type RegionalTrainPosition } from "./BlauwnetLayer";
import { RegionalTrainPanel } from "./RegionalTrainPanel";
import { roadPlace } from "./road-presentation";
import { openRadarConnection, type ConnectionState } from "./radar-connection";
import { bindRailMapDetail } from "./rail-map-detail";
import { useDisruptions } from "./useDisruptions";
import { RailNotices } from "./RailNotices";
import { SavedRouteCard } from "./SavedRouteCard";
import { AsyncPanel } from "./AsyncPanel";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { FollowedRoute } from "./saved-route";
import { useSavedRoute } from "./useSavedRoute";
import { journeyMatchesSelection } from "./journey-selection";
import { delayNotificationKey } from "./delay-notification";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

const StationPanel = lazy(() => import("./StationPanel").then(module => ({ default: module.StationPanel })));
const TrainPanel = lazy(() => import("./TrainPanel").then(module => ({ default: module.TrainPanel })));
const JourneyPlanner = lazy(() => import("./JourneyPlanner").then(module => ({ default: module.JourneyPlanner })));
const DelayStats = lazy(() => import("./DelayStats").then(module => ({ default: module.DelayStats })));
const RadarDirectory = lazy(() => import("./RadarDirectory").then(module => ({ default: module.RadarDirectory })));

type RoadLayerKey = "congestion" | "incidents" | "roadworks" | "closures" | "safety";
type MapLayerKey = "trains" | "stations" | "railways";
type UiIconName = "map" | "train" | "station" | "rail" | "car" | "bell" | "sliders" | "clock" | "settings" | "queue" | "warning" | "works" | "closure" | "shield" | "chevron";
const baseMapDefinitions: { key: BaseMapKey; label: string }[] = [
  { key: "standard", label: "Standaard" },
  { key: "light", label: "Nacht" },
  { key: "satellite", label: "Luchtfoto" },
];

function UiIcon({ name }: { name: UiIconName }) {
  const paths: Record<UiIconName, React.ReactNode> = {
    map: <><path d="m3.5 6 5-2.5 7 3 5-2.5v14l-5 2.5-7-3-5 2.5V6Z" /><path d="M8.5 3.5v14M15.5 6.5v14" /></>,
    train: <><rect x="6" y="3" width="12" height="15" rx="4" /><path d="M8 21l2-3m6 0 2 3M9 7h6M8 13h8" /><circle cx="9" cy="16" r=".7" /><circle cx="15" cy="16" r=".7" /></>,
    station: <><path d="M3 20h18M5 17V8l7-5 7 5v9M3 8h18M9 12h6M9 16h6" /></>,
    rail: <><path d="M8 3 5 21M16 3l3 18M7 7h10M6 12h12M5 17h14" /></>,
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

function nearbyDistanceLabel(meters: number) {
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`;
}



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

function roadEventLabel(event: RoadEvent, language = "nl"): string {
  const labels: Record<RoadEvent["type"], string> = {
    congestion: "File", accident: "Ongeval", incident: "Incident", roadworks: "Werkzaamheden",
    closure: "Afsluiting", speedRestriction: "Tijdelijke snelheid", safety: "Veiligheidsmelding",
    weather: "Weerhinder", obstacle: "Obstakel", other: "Wegmelding",
  };
  return uiCopy(labels[event.type], language);
}

function roadEventTitle(event: RoadEvent, language = "nl"): string {
  const label = roadEventLabel(event, language);
  const name = roadPlace(event).name;
  return name ? `${label} ${name}` : label;
}

function roadEventBadge(event: RoadEvent, language = "nl"): string {
  if (event.delaySeconds !== null) return `+${Math.max(1, Math.round(event.delaySeconds / 60))} min`;
  if (event.queueLengthMeters !== null) return `${(event.queueLengthMeters / 1_000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`;
  if (event.temporarySpeedLimitKmh !== null) return `${event.temporarySpeedLimitKmh} km/h`;
  return uiCopy(event.status === "PLANNED" ? "Gepland" : "Actief", language);
}

function roadEventStatusLabel(event: RoadEvent, language = "nl"): string {
  if (event.status === "PLANNED") return uiCopy("Gepland", language);
  if (event.status === "ACTIVE") return uiCopy("Actief", language);
  if (event.status === "STALE") return uiCopy("Niet recent", language);
  return uiCopy("Beëindigd", language);
}

function roadEventDetail(event: RoadEvent, language = "nl"): string | null {
  if (event.delaySeconds !== null && event.delaySeconds > 0) return `${Math.max(1, Math.round(event.delaySeconds / 60))} ${language === "en" ? "min extra travel time" : "min extra reistijd"}`;
  if (event.queueLengthMeters !== null) return `${(event.queueLengthMeters / 1_000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} ${language === "en" ? "km congestion" : "km vertraging"}`;
  if (event.temporarySpeedLimitKmh !== null) return `${language === "en" ? "Temporary limit" : "Tijdelijke limiet"} ${event.temporarySpeedLimitKmh} km/h`;
  return null;
}

function isCurrentRoadEvent(event: RoadEvent): boolean {
  return event.status === "ACTIVE" || event.status === "PLANNED";
}

function roadEventPriority(event: RoadEvent): number {
  const severity = event.severity.toLowerCase();
  const severityScore = severity.includes("high") || severity.includes("hoog") || severity.includes("critical") ? 3 : severity.includes("medium") || severity.includes("gemiddeld") ? 2 : 1;
  const impactScore = event.type === "closure" || event.type === "accident" ? 3 : event.type === "incident" || event.type === "congestion" ? 2 : 1;
  return severityScore + impactScore + (event.safetyRelated ? 1 : 0);
}

function deduplicateRoadEvents(events: RoadEvent[]): RoadEvent[] {
  const latestBySituation = new Map<string, RoadEvent>();
  for (const event of events) {
    const current = latestBySituation.get(event.situationId);
    const eventTime = parseTimestamp(event.time.sourceUpdatedAt ?? event.time.publicationTime) ?? 0;
    const currentTime = current ? parseTimestamp(current.time.sourceUpdatedAt ?? current.time.publicationTime) ?? 0 : -1;
    if (!current || eventTime >= currentTime) latestBySituation.set(event.situationId, event);
  }
  return [...latestBySituation.values()];
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

function radarDockWidth(width: number) {
  if (width < 768) {
    const landscapeDock = window.matchMedia("(min-width:600px) and (max-height:500px)").matches;
    return landscapeDock ? Math.max(286, width * .42) : 0;
  }
  return width < 1024 ? Math.max(328, Math.min(width * .42, 384)) : 396;
}

function radarPanelOffset(instance: MapLibreMap): [number, number] {
  const dock = radarDockWidth(window.innerWidth);
  if (dock) return [-dock / 2, 0];
  return [0, -Math.min(220, instance.getContainer().clientHeight * .24)];
}

export function MobilityDashboard({ mode = "trains" }: { mode?: "trains" | "alerts" }) {
  const isAlertsPage = mode === "alerts";
  const { theme } = useTheme();
  const { language, t } = useLanguage();
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);
  const shell = useRef<HTMLElement>(null);
  const mapElement = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const element = shell.current;
    if (!viewport || !element) return;
    const update = () => {
      if (viewport.scale === 1 && viewport.height < window.innerHeight - 1) {
        element.style.setProperty("--radar-visible-height", `${viewport.height}px`);
        element.dataset.keyboardOpen = "";
      } else {
        element.style.removeProperty("--radar-visible-height");
        delete element.dataset.keyboardOpen;
      }
    };
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, []);
  const setRailDetailVisible = useRef<((visible: boolean) => void) | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const selectFromMapRef = useRef<(vehicleId: string) => void>(() => undefined);
  const trackMatchesRef = useRef(new Map<string, RailTrackMatch>());
  const selectedVehicleIdRef = useRef<string | null>(null);
  const selectedTrainNumberRef = useRef<string | null>(null);
  const pendingTrainNumberRef = useRef<string | null>(null);
  const deepLinkHandledRef = useRef(false);
  const selectRoadFromMapRef = useRef<(eventId: string) => void>(() => undefined);
  const selectStationFromMapRef = useRef<(stationCode: string) => void>(() => undefined);
  const [selectedStation, setSelectedStation] = useState<RailStation | null>(null);
  const [stationCatalog, setStationCatalog] = useState<RailStation[]>(railStations);
  const [stationCatalogFetchedAt, setStationCatalogFetchedAt] = useState<string | null>(null);
  const [stationCatalogResolved, setStationCatalogResolved] = useState(isAlertsPage);
  const stationDirectory = useMemo(() => new Map(stationCatalog.map((station) => [station.code.toUpperCase(), station])), [stationCatalog]);
  useEffect(() => {
    if (isAlertsPage) return;
    let disposed = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    void fetch(realtimeHttpUrl("/v1/stations/catalog"), { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!payload || disposed) return;
        const catalog = stationCatalogSchema.parse(payload);
        setStationCatalog(catalog.stations);
        setStationCatalogFetchedAt(catalog.fetchedAt);
      })
      .catch(() => { /* De ingebouwde catalogus blijft beschikbaar als de live NS-catalogus niet bereikbaar is. */ })
      .finally(() => { window.clearTimeout(timeout); if (!disposed) setStationCatalogResolved(true); });
    return () => { disposed = true; controller.abort(); window.clearTimeout(timeout); };
  }, [isAlertsPage]);
  const [fleetReceived, setFleetReceived] = useState(false);
  const fleetMapState = useRef<{ source: GeoJSONSource; features: FleetMapFeatures } | null>(null);
  const [vehiclesById, setVehiclesById] = useState<Record<string, RailObservation>>({});
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [observation, setObservation] = useState<RailObservation | null>(null);
  const [trainMemory] = useState(() => new Map<string, { observation: RailObservation; journey: RailJourney | null }>());
  const [journey, setJourney] = useState<RailJourney | null>(null);
  const [expectedRoute, setExpectedRoute] = useState<{ key: string; route: ExpectedRoute } | null>(null);
  const trainTrail = useRef<{ key: string | null; points: ReturnType<typeof updateTrainTrail> }>({ key: null, points: [] });
  const [visibleTrailKey, setVisibleTrailKey] = useState<string | null>(null);
  const [trackMatchesByVehicle, setTrackMatchesByVehicle] = useState<Record<string, RailTrackMatch>>({});
  useEffect(() => {
    if (!observation) return;
    trainMemory.set(observation.vehicleId, { observation, journey });
    if (trainMemory.size > 12) trainMemory.delete(trainMemory.keys().next().value!);
  }, [trainMemory, observation, journey]);
  const [connection, setConnection] = useState<ConnectionState>("verbinden");
  const [mapReady, setMapReady] = useState(false);
  const pendingMapFocus = useRef<(() => void) | null>(null);
  useEffect(() => { if (mapReady) { pendingMapFocus.current?.(); pendingMapFocus.current = null; } }, [mapReady]);
  const [query, setQuery] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [isFollowingTrain, setIsFollowingTrain] = useState(false);
  const [navigation, panelDispatch] = useReducer(panelReducer, { current: null, history: [] });
  const restoringPanel = useRef(false);
  const closePanelRef = useRef<() => void>(() => undefined);
  const navigate = useCallback((panel: Panel) => { if (!restoringPanel.current) panelDispatch({ type: "open", panel }); }, []);
  const panel = navigation.current;
  const activePanelRef = useRef(panel);
  useEffect(() => { activePanelRef.current = panel; }, [panel]);
  const [panelScroll] = useState(() => new Map<string, number>());
  const [directoryQueries, setDirectoryQueries] = useState({ stations: "", favorites: "" });
  const { data: disruptions, error: disruptionsError, retry: retryDisruptions } = useDisruptions(!isAlertsPage);
  const [selectedDisruptionId, setSelectedDisruptionId] = useState<string | null>(null);
  const [stationMemory] = useState<import("./StationPanel").StationPanelMemory>(() => new Map());
  const [plannerMemory] = useState<import("./JourneyPlanner").PlannerMemory>(() => new Map());
  const setNearbyOpen = useCallback((value: boolean | ((open: boolean) => boolean)) => {
    if (typeof value === "function") { panelDispatch({ type: "toggle", panel: { kind: "nearby" } }); return; }
    panelDispatch(value ? { type: "open", panel: { kind: "nearby" } } : { type: "dismiss", kinds: ["nearby"] });
  }, []);
  const nearbyOpen = panel?.kind === "nearby";
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "denied" | "unavailable">("idle");
  const [now, setNow] = useState(() => Date.now());
  const debugMatching = false;
  const [roadEventsById, setRoadEventsById] = useState<Record<string, RoadEvent>>({});
  const [roadReceived, setRoadReceived] = useState(false);
  const [selectedRoadEventId, setSelectedRoadEventId] = useState<string | null>(null);
  const showLayers = panel?.kind === "layers";
  const setShowLayers = useCallback((value: boolean) => panelDispatch(value ? { type: "open", panel: { kind: "layers" } } : { type: "dismiss", kinds: ["layers"] }), []);
  const showJourneyPlanner = panel?.kind === "planner";
  const setShowJourneyPlanner = useCallback((value: boolean) => panelDispatch(value ? { type: "open", panel: { kind: "planner" } } : { type: "dismiss", kinds: ["planner"] }), []);
  const radarSection = panel && ["stations", "favorites", "notices", "more"].includes(panel.kind) ? panel.kind : null;
  const setRadarSection = useCallback((kind: "stations" | "favorites" | "notices" | "more" | null) => panelDispatch(kind ? { type: "open", panel: { kind } } : { type: "dismiss", kinds: ["stations", "favorites", "notices", "more"] }), []);
  const { route: followedRoute, save: setFollowedRoute, error: savedRouteError, retry: retrySavedRoute } = useSavedRoute(stationCatalog);
  const showDelayStats = panel?.kind === "stats";
  const setShowDelayStats = useCallback((value: boolean) => panelDispatch(value ? { type: "open", panel: { kind: "stats" } } : { type: "dismiss", kinds: ["stats"] }), []);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  // Houd de meldingenstand in sync met de instellingenpagina, zodat de twee
  // onafhankelijke componenten niet uit elkaar groeien.
  useEffect(() => {
    const syncNotificationSetting = () => {
      try {
        setNotificationsEnabled(window.localStorage.getItem("liveopweg-notifications") === "on");
      } catch {
        setNotificationsEnabled(false);
      }
    };
    syncNotificationSetting();
    window.addEventListener("storage", syncNotificationSetting);
    return () => window.removeEventListener("storage", syncNotificationSetting);
  }, []);
  const [selectedMapStyle, setSelectedMapStyle] = useState<BaseMapKey | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem("liveopweg-map-style") === "light") {
        const frame = window.requestAnimationFrame(() => setSelectedMapStyle("light"));
        return () => window.cancelAnimationFrame(frame);
      }
    } catch {
      // The map can still follow the theme when storage is unavailable.
    }
  }, []);
  const baseMap = selectedMapStyle ?? (theme === "dark" ? "light" : "standard");
  const [mapSourceFailures, setMapSourceFailures] = useState<Record<string, boolean>>({});
  const useNightFallback = baseMap === "light" && Boolean(mapSourceFailures["base-light"]);
  const mapBackgroundUnavailable = Boolean(mapSourceFailures[useNightFallback ? "base-standard" : `base-${baseMap}`]);
  const [showMapStyles, setShowMapStyles] = useState(false);
  const selectBaseMap = (mode: BaseMapKey) => {
    setSelectedMapStyle(mode);
    setShowMapStyles(false);
    try {
      if (mode === "light") localStorage.setItem("liveopweg-map-style", mode);
      else localStorage.removeItem("liveopweg-map-style");
    } catch {
      // Keep the selected map style for this visit.
    }
  };
  const [mapLayers, setMapLayers] = useState<Record<MapLayerKey, boolean>>({
    trains: !isAlertsPage, stations: !isAlertsPage, railways: !isAlertsPage,
  });
  const [showBlauwnet, setShowBlauwnet] = useState(false);
  const [blauwnetUnavailable, setBlauwnetUnavailable] = useState(false);
  const [regionalPositions, setRegionalPositions] = useState<RegionalTrainPosition[]>([]);
  const [regionalSelection, setRegionalSelection] = useState<RegionalTrainPosition | null>(null);
  const [trainChoices, setTrainChoices] = useState<string[]>([]);
  const [viewportBounds, setViewportBounds] = useState<ReturnType<NonNullable<typeof map.current>["getBounds"]> | null>(null);
  const mapLayersRef = useRef(mapLayers);
  useEffect(() => { mapLayersRef.current = mapLayers; }, [mapLayers]);
  const [roadLayers, setRoadLayers] = useState<Record<RoadLayerKey, boolean>>({
    congestion: isAlertsPage, incidents: isAlertsPage, roadworks: false, closures: isAlertsPage, safety: false,
  });

  const vehicles = useMemo(() => Object.values(vehiclesById).sort((left, right) => (
    left.trainNumber.localeCompare(right.trainNumber, "nl", { numeric: true })
  )), [vehiclesById]);

  const trainServices = useMemo(() => groupTrainServices(vehicles,now,selectedVehicleId),[vehicles,now,selectedVehicleId]);
  const vehiclesWithSearchData = useMemo(() => trainServices.map(service => ({
    ...service.primary,
    searchableTrainNumber: normalizeSearchText(`trein ${service.trainNumber} train ${service.trainNumber}`),
    searchableMaterialNumber: normalizeSearchText(service.units.map(unit=>unit.materialNumber??"").join(" ")),
    searchableVehicleId: normalizeSearchText(service.units.map(unit=>unit.vehicleId).join(" ")),
    searchableRollingStockLabel: normalizeSearchText(service.units.map(unit=>identifyRollingStock(unit.materialNumber).label).join(" ")),
  })),[trainServices]);
  const displayTrains = useMemo(() => trainServices.flatMap(({primary:observation}) => {
    const display = trainDisplayPosition(observation, trackMatchesByVehicle[observation.vehicleId], now);
    return display ? [{ observation, position:display.position, matched:display.matched, stale:display.stale }] : [];
  }),[trainServices,trackMatchesByVehicle,now]);
  const inViewport = (position: { longitude: number; latitude: number }) => viewportBounds?.contains([position.longitude, position.latitude]);
  const mappedTrainCount = (mapLayers.trains ? displayTrains.filter(({ position }) => inViewport(position)).length : 0)
    + (showBlauwnet ? regionalPositions.filter(inViewport).length : 0);
  const regionalPosition = panel?.kind === "regional-train" ? regionalPositions.find(position => position.id === panel.id) : undefined;
  const liveTrainNumbers = useMemo(() => new Set(displayTrains.filter(train => !train.stale).map(train => train.observation.trainNumber)), [displayTrains]);
  const searchResults = useMemo(() => {
    const needle = normalizeSearchText(query);
    if (!needle) return vehiclesWithSearchData.slice(0, 12);
    return vehiclesWithSearchData.filter(vehicle =>
      vehicle.searchableTrainNumber.includes(needle) ||
      vehicle.searchableMaterialNumber.includes(needle) ||
      vehicle.searchableVehicleId.includes(needle) ||
      vehicle.searchableRollingStockLabel.includes(needle)
    ).slice(0, 12);
  }, [query, vehiclesWithSearchData]);
  const stationResults = useMemo(() => searchStations(query, stationCatalog), [query, stationCatalog]);
  const combinedSearchResultCount = stationResults.length + searchResults.length;
  const activeSearchResultIndex = combinedSearchResultCount ? Math.min(activeSearchIndex, combinedSearchResultCount - 1) : 0;
  const nearbyStations = useMemo(() => userLocation ? stationCatalog
    .map((station) => ({ station, distance: distanceBetweenMeters(userLocation, { latitude: station.latitude, longitude: station.longitude }) }))
    .filter(({ distance }) => distance <= 50_000).sort((left, right) => left.distance - right.distance).slice(0, 4) : [], [stationCatalog, userLocation]);
  const nearbyTrains = useMemo(() => userLocation ? displayTrains
    .map((train) => ({ train, distance: distanceBetweenMeters(userLocation, train.position) }))
    .sort((left, right) => left.distance - right.distance).slice(0, 4) : [], [displayTrains, userLocation]);
  const availableVehicleIds = useMemo(() => new Set(vehicles.filter(vehicle => { const display=trainDisplayPosition(vehicle,trackMatchesByVehicle[vehicle.vehicleId],now); return display&&!display.stale; }).map(vehicle=>vehicle.vehicleId)), [vehicles,trackMatchesByVehicle,now]);
  const roadEvents = useMemo(() => Object.values(roadEventsById), [roadEventsById]);
  const currentRoadEvents = useMemo(() => deduplicateRoadEvents(roadEvents.filter(isCurrentRoadEvent)), [roadEvents]);
  const recentRoadEvents = useMemo(() => currentRoadEvents.filter((event) => roadLayers[roadLayerFor(event)]).toSorted((left, right) => {
    const priorityDifference = roadEventPriority(right) - roadEventPriority(left);
    if (priorityDifference !== 0) return priorityDifference;
    const leftTime = parseTimestamp(left.time.sourceUpdatedAt ?? left.time.publicationTime) ?? 0;
    const rightTime = parseTimestamp(right.time.sourceUpdatedAt ?? right.time.publicationTime) ?? 0;
    return rightTime - leftTime;
  }).slice(0, isAlertsPage ? 100 : 5), [currentRoadEvents, roadLayers, isAlertsPage]);
  const selectedRoadEvent = selectedRoadEventId ? roadEventsById[selectedRoadEventId] ?? null : null;
  useEffect(() => {
    if (!isAlertsPage || !selectedRoadEvent || !map.current) return;
    const geometry = selectedRoadEvent.geometry;
    const coordinate = geometry.type === "Point" ? geometry.coordinates
      : geometry.type === "LineString" ? geometry.coordinates[Math.floor(geometry.coordinates.length / 2)]
        : geometry.coordinates[0][Math.floor(geometry.coordinates[0].length / 2)];
    if (coordinate) map.current.flyTo({ center: coordinate, zoom: Math.max(map.current.getZoom(), 10), duration: 650, essential: true });
  }, [isAlertsPage, selectedRoadEvent]);
  const roadCounts = useMemo(() => Object.fromEntries(roadLayerDefinitions.map(({ key }) => [
    key, currentRoadEvents.filter((event) => roadLayerFor(event) === key).length,
  ])) as Record<RoadLayerKey, number>, [currentRoadEvents]);

  const selectVehicle = useCallback((vehicleId: string, focusMap = true) => {
    const cached = trainMemory.get(vehicleId);
    const selected = vehiclesById[vehicleId] ?? cached?.observation;
    if (!selected) return;
    if (query.trim()) navigate({ kind: "search", id: query });
    navigate({ kind: "train", id: vehicleId });
    setSelectedStation(null);
    setSelectedVehicleId(vehicleId);
    setIsFollowingTrain(false);
    setNearbyOpen(false);
    selectedVehicleIdRef.current = vehicleId;
    selectedTrainNumberRef.current = selected.trainNumber;
    setObservation(selected);
    setJourney(cached?.journey ?? null);
    setQuery("");
    setShowLayers(false);
    setShowJourneyPlanner(false);
    setShowDelayStats(false);
    setSelectedRoadEventId(null);
    replaceSelectionUrl({ train: selected.trainNumber });
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ protocolVersion: 2, type: "select", vehicleId }));
    const focus = () => {
      if (!map.current) return;
      const display = trainDisplayPosition(selected, trackMatchesRef.current.get(vehicleId), Date.now());
      if (display) map.current.easeTo({
        center: [display.position.longitude, display.position.latitude],
        zoom: Math.max(map.current.getZoom(), 10),
        offset: radarPanelOffset(map.current),
        duration: 700,
      });
    };
    pendingMapFocus.current = null;
    if (focusMap) { if (mapReady) focus(); else pendingMapFocus.current = focus; }
  }, [vehiclesById, trainMemory, query, navigate, setNearbyOpen, setShowLayers, setShowJourneyPlanner, setShowDelayStats, mapReady]);

  const clearVehicleSelection = useCallback(() => {
    pendingMapFocus.current = null;
    panelDispatch({ type: "dismiss", kinds: ["train"] });
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ protocolVersion: 2, type: "deselect" }));
    setSelectedVehicleId(null);
    setIsFollowingTrain(false);
    selectedVehicleIdRef.current = null;
    selectedTrainNumberRef.current = null;
    setObservation(null);
    setJourney(null);
    setQuery("");
    replaceSelectionUrl();
  }, []);
  const selectRegionalTrain = useCallback((position: RegionalTrainPosition) => {
    setIsFollowingTrain(false);
    setRegionalSelection(position);
    navigate({ kind: "regional-train", id: position.id });
  }, [navigate]);

  const requestNearbyLocation = useCallback(() => {
    if (locationStatus === "loading") { setNearbyOpen(true); return; }
    setIsFollowingTrain(false);
    if (userLocation) {
      setNearbyOpen((open) => !open);
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      setNearbyOpen(true);
      return;
    }
    setNearbyOpen(true);
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition((position) => {
      const nextLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setUserLocation(nextLocation);
      setLocationStatus("idle");
      if (activePanelRef.current?.kind === "nearby") map.current?.easeTo({ center: [nextLocation.longitude, nextLocation.latitude], zoom: Math.max(map.current.getZoom(), 11), duration: 650 });
    }, (error) => {
      setLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
    }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 });
  }, [userLocation, locationStatus, setNearbyOpen]);

  const followPointRef = useRef<{ vehicleId: string; longitude: number; latitude: number } | null>(null);
  useEffect(() => {
    if (!isFollowingTrain || !selectedVehicleId || !map.current) {
      followPointRef.current = null;
      return;
    }
    const train = displayTrains.find((item) => item.observation.vehicleId === selectedVehicleId);
    if (!train) return;
    const previous = followPointRef.current;
    const movedMeters = previous?.vehicleId === selectedVehicleId
      ? distanceBetweenMeters(
        { latitude: previous.latitude, longitude: previous.longitude },
        train.position,
      )
      : Number.POSITIVE_INFINITY;
    if (movedMeters < 8) return;
    followPointRef.current = { vehicleId: selectedVehicleId, ...train.position };
    map.current.easeTo({
      center: [train.position.longitude, train.position.latitude],
      offset: radarPanelOffset(map.current),
      duration: 550,
      essential: true,
    });
  }, [displayTrains, isFollowingTrain, selectedVehicleId]);

  function zoomRadar(step: 1 | -1) {
    const instance = map.current;
    if (!instance) return;
    const followed = isFollowingTrain ? followPointRef.current : null;
    instance.easeTo({
      zoom: instance.getZoom() + step,
      duration: 250,
      ...(followed && { center: [followed.longitude, followed.latitude], offset: radarPanelOffset(instance) }),
    });
  }

  const selectStation = useCallback((station: RailStation) => {
    if (query.trim()) navigate({ kind: "search", id: query });
    navigate({ kind: "station", id: station.code });
    clearVehicleSelection();
    setSelectedStation(station);
    setNearbyOpen(false);
    replaceSelectionUrl({ station: station.code });
    setShowLayers(false);
    setShowJourneyPlanner(false);
    setShowDelayStats(false);
    setSelectedRoadEventId(null);
    const focus = () => map.current?.easeTo({
      center: [station.longitude, station.latitude],
      zoom: Math.max(map.current.getZoom(), 11),
      offset: radarPanelOffset(map.current),
      duration: 700,
    });
    if (mapReady) focus(); else pendingMapFocus.current = focus;
  }, [clearVehicleSelection, query, navigate, setNearbyOpen, setShowLayers, setShowJourneyPlanner, setShowDelayStats, mapReady]);

  const resetMap = useCallback(() => {
    panelDispatch({ type: "close" });
    setRadarSection(null);
    setShowLayers(false);
    setShowJourneyPlanner(false);
    setShowDelayStats(false);
    setSelectedRoadEventId(null);
    setSelectedStation(null);
    clearVehicleSelection();
    map.current?.fitBounds([[3.15, 50.7], [7.45, 53.7]], { padding: { top: 130, right: 24, bottom: 120, left: 24 }, duration: 500 });
  }, [clearVehicleSelection, setShowLayers, setShowJourneyPlanner, setShowDelayStats, setRadarSection]);

  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const stationCode = params.get("station")?.toUpperCase();
    const trainNumber = params.get("train");
    const requestedPanel = params.get("panel");
    if (requestedPanel && ["stations", "favorites", "notices", "more", "planner", "stats"].includes(requestedPanel)) {
      deepLinkHandledRef.current = true;
      panelDispatch({ type: "open", panel: { kind: requestedPanel as Panel["kind"] } });
      return;
    }
    if (stationCode && !stationDirectory.has(stationCode) && !stationCatalogResolved) return;
    deepLinkHandledRef.current = true;
    if (stationCode && stationDirectory.has(stationCode)) queueMicrotask(() => selectStation(stationDirectory.get(stationCode)!));
    else if (trainNumber) pendingTrainNumberRef.current = trainNumber;
  }, [selectStation, stationCatalogResolved, stationDirectory]);

  useEffect(() => {
    const trainNumber = pendingTrainNumberRef.current;
    if (!trainNumber) return;
    const vehicle = vehicles.find((candidate) => candidate.trainNumber === trainNumber);
    if (!vehicle) {
      // De eerste vlootbatch komt pas ná deze effectronde binnen. Geef de
      // deep link daarom niet op voordat er überhaupt voertuigen zijn
      // geladen; anders wordt ?train= verwijderd vóórat de trein gezien wordt.
      if (vehicles.length > 0) pendingTrainNumberRef.current = null;
      return;
    }
    pendingTrainNumberRef.current = null;
    selectVehicle(vehicle.vehicleId);
  }, [selectVehicle, vehicles]);

  useEffect(() => {
    selectStationFromMapRef.current = (code) => {
      const station = stationDirectory.get(code);
      if (station) selectStation(station);
    };
  }, [selectStation, stationDirectory]);

  useEffect(() => {
  }, [selectedStation]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      const target = event.target;
      const editing = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (event.key === "/" && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); searchInputRef.current?.focus(); return; }
      if (event.key !== "Escape") return;
      if (showMapStyles) { setShowMapStyles(false); return; }
      closePanelRef.current();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [showMapStyles]);

  useEffect(() => {
    selectFromMapRef.current = (vehicleId) => selectVehicle(vehicleId);
  }, [selectVehicle]);

  useEffect(() => {
    selectRoadFromMapRef.current = (eventId) => {
      setSelectedRoadEventId(eventId);
      setShowLayers(false);
    };
  }, [setShowLayers]);

  useEffect(() => {
    // Map markers represent measured positions, not animated estimates. A
    // 100 ms React ticker repainted the entire dashboard ten times per second
    // without making the underlying GPS position any newer.
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // Monitor selected train for delay notifications
  const lastDelayRef = useRef<string | null>(null);
  useEffect(() => {
    if (!notificationsEnabled || !observation || !journey || !("Notification" in window)) {
      lastDelayRef.current = null;
      return;
    }
    const nextStop = nextTrainStop(journey.stops, Date.now());
    const currentDelay = nextStop?.arrival.exactDelaySeconds ?? nextStop?.departure.exactDelaySeconds;
    const notificationKey = delayNotificationKey(
      observation.vehicleId,
      nextStop?.station.code ?? null,
      currentDelay ?? null,
      Notification.permission === "granted",
    );
    if (!notificationKey) {
      lastDelayRef.current = null;
      return;
    }
    if (lastDelayRef.current !== notificationKey) {
      lastDelayRef.current = notificationKey;
      new Notification("Vertraging", {
        body: `Trein ${observation.trainNumber} heeft bij ${nextStop?.station.longName ?? "de volgende halte"} ${Math.round((currentDelay ?? 0) / 60)} minuten vertraging`,
        icon: "/train-icon.png",
      });
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

  const openJourneyPlanner = useCallback(() => {
    setShowJourneyPlanner(true);
    setRadarSection(null);
    clearVehicleSelection();
    setSelectedStation(null);
    setSelectedRoadEventId(null);
    setShowJourneyPlanner(true);
    setShowDelayStats(false);
    setShowLayers(false);
  }, [clearVehicleSelection, setShowLayers, setShowJourneyPlanner, setShowDelayStats, setRadarSection]);
  const openRoutePlanner = () => {
    const draft = plannerMemory.get("planner");
    const route = followedRoute;
    plannerMemory.set("planner", {
      from: route?.originName ?? draft?.from ?? "",
      to: route?.destinationName ?? draft?.to ?? "",
      when: "",
      results: null,
      expanded: null,
    });
    openJourneyPlanner();
  };
  const selectLiveTrain = (trainNumber: string) => {
    const train = displayTrains.find(item => !item.stale && item.observation.trainNumber === trainNumber);
    if (train) selectVehicle(train.observation.vehicleId);
  };
  const updateFollowedRoute = useCallback((route: FollowedRoute | null) => {
    setFollowedRoute(route);
  }, [setFollowedRoute]);

  const openDelayStats = useCallback(() => {
    setShowDelayStats(true);
    setRadarSection(null);
    clearVehicleSelection();
    setSelectedStation(null);
    setSelectedRoadEventId(null);
    setShowDelayStats(true);
    setShowJourneyPlanner(false);
    setShowLayers(false);
  }, [clearVehicleSelection, setShowLayers, setShowJourneyPlanner, setShowDelayStats, setRadarSection]);
  useEffect(() => {
    let disposed = false;
    void import("maplibre-gl").then(({ Map, Popup, setWorkerUrl }) => {
      if (disposed || !mapElement.current || map.current) return;
      setWorkerUrl(mapWorkerUrl);
      const mapHeight = mapElement.current.clientHeight;
      const instance = new Map({
        container: mapElement.current,
        bounds: [[3.15, 50.7], [7.45, 53.7]] as [[number, number], [number, number]],
        fitBoundsOptions: {
          padding: window.innerWidth < 1024
            ? { top: Math.min(120, mapHeight * .2), right: 22, bottom: Math.min(100, mapHeight * .2), left: 22 }
            : { top: 108, right: 28, bottom: 92, left: 28 },
        },
        attributionControl: false,
        minZoom: 5,
        maxZoom: 21,
        scrollZoom: true,
        boxZoom: true,
        doubleClickZoom: true,
        touchZoomRotate: true,
        touchPitch: false,
        keyboard: true,
        dragRotate: false,
        style: baseMapStyle,
      });
      map.current = instance;
      instance.on("dragstart", event => { if (event.originalEvent) setIsFollowingTrain(false); });
      instance.on("error", event => {
        const sources = failedBaseMaps(event as Parameters<typeof failedBaseMaps>[0]);
        if (sources.length) setMapSourceFailures(current => sources.every(id => current[id]) ? current : { ...current, ...Object.fromEntries(sources.map(id => [id, true])) });
      });
      instance.on("sourcedata", event => {
        if (event.sourceId?.startsWith("base-") && event.sourceDataType === "content" && event.isSourceLoaded) setMapSourceFailures(current => current[event.sourceId] ? { ...current, [event.sourceId]: false } : current);
      });
      instance.on("style.load", () => {
        if (disposed) return;
        if (isAlertsPage) {
          instance.resize();
          instance.fitBounds([[3.15, 50.7], [7.45, 53.7]], { padding: window.innerWidth < 1024 ? 18 : 40, duration: 0 });
        }
        instance.touchZoomRotate.disableRotation();
        const stationPopup = new Popup({ closeButton: false, closeOnClick: true, offset: 12, className: "stationTooltip" });
        const trainPopup = new Popup({
          closeButton: false, closeOnClick: false, focusAfterOpen: false, offset: 22, className: "trainMapTooltip",
        });
        let previewKey: string | null = null;
        const clearTrainHover = () => { previewKey = null; trainPopup.remove(); };
        const clearMarkerHover = () => { clearTrainHover(); stationPopup.remove(); instance.getCanvas().style.cursor = ""; };
        addRadarMarkerLayers(instance);
        const hoverLayers = [...trainHitLayers, ...stationLayers];
        instance.on("mousemove", hoverLayers, event => {
          if (isAlertsPage || instance.isMoving()) return;
          const train = mapLayersRef.current.trains ? event.features?.find(feature => feature.source === "rail-fleet") : undefined;
          if (train?.geometry.type === "Point") {
            stationPopup.remove();
            instance.getCanvas().style.cursor = "pointer";
            const { vehicleId, trainNumber, materialNumber } = train.properties;
            const key = `${vehicleId}:${trainNumber}:${materialNumber}:${languageRef.current}`;
            const position = train.geometry.coordinates as [number, number];
            if (previewKey !== key) {
              previewKey = key;
              trainPopup.setDOMContent(trainMapPreview(trainNumber, materialNumber ?? null, languageRef.current));
              trainPopup.setLngLat(position).addTo(instance);
            } else {
              const location = trainPopup.getLngLat();
              if (location.lng !== position[0] || location.lat !== position[1]) trainPopup.setLngLat(position);
            }
            return;
          }
          clearTrainHover();
          const feature = mapLayersRef.current.stations ? event.features?.find(item => item.source === "radar-stations") : undefined;
          if (feature?.geometry.type !== "Point") { clearMarkerHover(); return; }
          const coordinates = feature.geometry.coordinates as [number, number];
          if (stationPopup.isOpen() && stationPopup.getLngLat().toArray().every((value, index) => value === coordinates[index])) return;
          instance.getCanvas().style.cursor = "pointer";
          stationPopup.setLngLat(coordinates).setText(String(feature.properties.name)).addTo(instance);
        });
        instance.on("mouseleave", hoverLayers, clearMarkerHover);
        instance.on("movestart", clearMarkerHover);
        instance.on("styledata", () => {
          if (previewKey && instance.getLayoutProperty("rail-fleet-points", "visibility") === "none") clearMarkerHover();
        });
        instance.addSource("user-location", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        instance.addLayer({ id: "user-location-halo", type: "circle", source: "user-location", paint: { "circle-radius": 13, "circle-color": "#1682ed", "circle-opacity": 0.18 } });
        instance.addLayer({ id: "user-location-dot", type: "circle", source: "user-location", paint: { "circle-radius": 6, "circle-color": "#1682ed", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
        if (!isAlertsPage) {
          instance.addSource("rail-overview", {
            type: "geojson", data: new URL("/rail/overview.geojson", window.location.origin).href,
            maxzoom: 12, tolerance: 0.12,
          });
          instance.addLayer({
            id: "rail-overview", type: "line", source: "rail-overview",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#455b78",
              "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1.15, 8, 1.9, 11, 2.3],
              "line-opacity": 0.83,
            },
          }, "rail-fleet-points");
        }
        instance.addSource("pdok-rail-geometry", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
          maxzoom: 18, tolerance: 0.08,
        });
        // Draw a casing below the individual track lines for contrast.
        instance.addLayer({
          id: "pdok-rail-geometry-casing",
          type: "line",
          source: "pdok-rail-geometry",
          minzoom: 8,
          paint: {
            "line-color": "#ffffff",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2.2, 12, 2.8, 16, 3.6],
            "line-opacity": 0.72,
          },
          layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        }, "rail-fleet-points");
        instance.addLayer({
          id: "pdok-rail-geometry-lines",
          type: "line",
          source: "pdok-rail-geometry",
          minzoom: 8,
          paint: {
            "line-color": "#455b78",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.15, 12, 1.45, 16, 2],
            "line-opacity": 1,
          },
          layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
        }, "rail-fleet-points");
        const railDetail = bindRailMapDetail(instance, realtimeHttpUrl("/v1/geometry/rail"));
        setRailDetailVisible.current = railDetail.setVisible;
        instance.once("remove", railDetail.dispose);
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
          paint: { "line-color": "#b4caff", "line-width": 6, "line-opacity": 0.9 },
        }, "rail-fleet-points");
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
          filter: ["==", ["get", "kind"], "route"],
          paint: { "line-color": "#2563eb", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.5, 12, 4], "line-dasharray": [2, 1] },
        }, "rail-fleet-points");
        instance.addSource("selected-train-trail", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        instance.addLayer({
          id: "selected-train-trail-line", type: "line", source: "selected-train-trail",
          layout: { "line-cap": "round" },
          paint: { "line-color": "#728095", "line-width": 4 },
        }, "rail-fleet-points");
        instance.addLayer({
          id: "expected-rail-route-stops",
          type: "circle",
          source: "expected-rail-route",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": ["match", ["get", "kind"], "next", 7, "passed", 4, 5],
            "circle-color": ["match", ["get", "kind"], "next", "#2563eb", "passed", "#728095", "#fff"],
            "circle-stroke-color": ["match", ["get", "kind"], "stop", "#2563eb", "#fff"],
            "circle-stroke-width": 2,
          },
        }, "rail-fleet-points");
        instance.addLayer({
          id: "expected-rail-route-next-label", type: "symbol", source: "expected-rail-route",
          filter: ["==", ["get", "kind"], "next"],
          layout: {
            "text-field": ["get", "label"], "text-font": ["Arial Bold"], "text-size": 12,
            "text-anchor": "bottom", "text-offset": [0, -1], "text-allow-overlap": true,
          },
          paint: { "text-color": "#10213f", "text-halo-color": "#fff", "text-halo-width": 2 },
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
            "circle-color": "#b4caff",
            "circle-stroke-color": "#163e35",
            "circle-stroke-width": 3,
          },
        });
        if (isAlertsPage) {
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
        }
        for (const layerId of [...stationLayers, ...trainLayers]) instance.moveLayer(layerId);
        instance.on("click", (event) => {
          if (isAlertsPage) return;
          const { x, y } = event.point;
          const hits = (layers: string[], radius: number) => instance.queryRenderedFeatures(
            [[x - radius, y - radius], [x + radius, y + radius]], { layers },
          );
          if (mapLayersRef.current.trains) {
            const trains = [...new Set(hits(trainHitLayers, 8).map(feature => String(feature.properties.vehicleId)))];
            if (trains.length) {
              clearMarkerHover();
              if (trains.length === 1) selectFromMapRef.current(trains[0]!);
              else {
                setTrainChoices(trains);
                setIsFollowingTrain(false);
                panelDispatch({ type: "open", panel: { kind: "train-choices" } });
              }
              return;
            }
          }
          if (instance.getLayer("ns-disruption-points")) {
            const notice = hits(["ns-disruption-points", "ns-disruption-lines"], 2)[0];
            if (typeof notice?.properties.id === "string") {
              setSelectedDisruptionId(notice.properties.id);
              setRadarSection("notices");
              return;
            }
          }
          if (mapLayersRef.current.stations) {
            const station = hits(stationLayers, 8)[0];
            if (station) { stationPopup.remove(); selectStationFromMapRef.current(String(station.properties.code)); return; }
          }
        });
        instance.on("remove", clearMarkerHover);
        const updateViewport = () => setViewportBounds(instance.getBounds());
        instance.on("moveend", updateViewport);
        instance.on("resize", updateViewport);
        updateViewport();
        setMapReady(true);
      });
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      setRailDetailVisible.current = null;
    };
  }, [isAlertsPage, setRadarSection]);

  useEffect(() => {
    const source = map.current?.getSource("rail-fleet") as GeoJSONSource | undefined;
    if (!mapReady || !source || isAlertsPage) return;
    const frame = window.requestAnimationFrame(() => {
      const previous = fleetMapState.current?.source === source ? fleetMapState.current.features : new Map();
      const { features, diff } = fleetMapUpdate(previous, displayTrains, selectedVehicleId);
      fleetMapState.current = { source, features };
      if (diff) void source.updateData(diff);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [displayTrains, isAlertsPage, mapReady, selectedVehicleId]);

  useEffect(() => {
    const source = map.current?.getSource("radar-stations") as GeoJSONSource | undefined;
    if (!mapReady || !source || isAlertsPage) return;
    source.setData({
      type: "FeatureCollection",
      features: stationCatalog.map(station => ({
        type: "Feature",
        id: station.code,
        geometry: { type: "Point", coordinates: [station.longitude, station.latitude] },
        properties: { code: station.code, name: station.name, minZoom: stationMinZoom(station), selected: station.code === selectedStation?.code },
      })),
    });
  }, [isAlertsPage, mapReady, selectedStation, stationCatalog]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    const applyMatchDebug = () => {
      if (!instance.isStyleLoaded()
        || !instance.getLayer("selected-track-edge")
        || !instance.getLayer("match-candidate-lines")) return;
      const selectedMatch = selectedVehicleId ? trackMatchesByVehicle[selectedVehicleId] : null;
      const matchSource = instance.getSource("selected-track-match") as GeoJSONSource | undefined;
      const features = debugMatching && selectedMatch?.snappedPosition ? [
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
        const visibility = visible ? "visible" : "none";
        if (instance.getLayer(layerId) && (instance.getLayoutProperty(layerId, "visibility") ?? "visible") !== visibility) {
          instance.setLayoutProperty(layerId, "visibility", visibility);
        }
      }
    };
    setVisibility(trainLayers, mapLayers.trains);
    setVisibility(stationLayers, mapLayers.stations);
    setRailDetailVisible.current?.(mapLayers.railways);
  }, [mapLayers, mapReady]);

  useEffect(() => {
    const source = map.current?.getSource("user-location") as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: userLocation ? [{ type: "Feature", geometry: { type: "Point", coordinates: [userLocation.longitude, userLocation.latitude] }, properties: {} }] : [],
    });
  }, [userLocation, mapReady]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    for (const [mode, layerIds] of Object.entries(baseMapLayers)) {
      for (const layerId of layerIds) instance.setLayoutProperty(layerId, "visibility", mode === baseMap ? "visible" : "none");
    }
    instance.setLayoutProperty(nightFallbackLayer, "visibility", useNightFallback ? "visible" : "none");
    const nightMap = baseMap !== "standard";
    instance.setPaintProperty("atlas-paper", "background-color", nightMap ? nightMapBackground : "#eef2f5");
    instance.setPaintProperty("atlas-paper", "background-opacity", 1);
    for (const layer of ["rail-overview", "pdok-rail-geometry-lines"]) {
      if (instance.getLayer(layer)) instance.setPaintProperty(layer, "line-color", nightMap ? "#bacbe6" : "#455b78");
    }
    instance.setPaintProperty("pdok-rail-geometry-casing", "line-color", nightMap ? "#26354b" : "#ffffff");
  }, [baseMap, mapReady, useNightFallback]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    for (const layer of roadLayerDefinitions) {
      const matching = currentRoadEvents.filter((event) => roadLayerFor(event) === layer.key);
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
  }, [currentRoadEvents, mapReady, roadLayers, selectedRoadEvent]);

  useEffect(() => {
    let latestSequence: number | null = null;
    let latestMatchSequence: number | null = null;
    let latestRoadSequence: number | null = null;
    let fleet: Record<string, RailObservation> = {};
    let fleetChanged = false;
    let matchesChanged = false;
    let frame: number | null = null;
    const flushRail = () => {
      frame ??= window.requestAnimationFrame(() => {
        frame = null;
        if (fleetChanged) {
          setVehiclesById({ ...fleet });
          setFleetReceived(true);
        }
        if (matchesChanged) setTrackMatchesByVehicle(Object.fromEntries(trackMatchesRef.current));
        fleetChanged = matchesChanged = false;
        setNow(Date.now());
      });
    };
    const updateSelection = (value: RailObservation | undefined | null) => {
      if (!value || value.vehicleId !== selectedVehicleIdRef.current) return;
      if (value.trainNumber !== selectedTrainNumberRef.current) {
        selectedTrainNumberRef.current = value.trainNumber;
        setJourney(null);
      }
      setObservation(current => current?.observationId === value.observationId ? current : value);
    };
    const stop = openRadarConnection({
      feed: isAlertsPage ? "road" : "rail",
      recovered: () => latestSequence !== null || latestRoadSequence !== null,
      onStatus: setConnection,
      onSocket: socket => { socketRef.current = socket; },
      onOpen: socket => {
        latestSequence = latestMatchSequence = latestRoadSequence = null;
        const vehicleId = selectedVehicleIdRef.current;
        if (vehicleId) socket.send(JSON.stringify({ protocolVersion: 2, type: "select", vehicleId }));
      },
      onMessage: (event, socket) => {
        let decoded: unknown;
        try { decoded = JSON.parse(String(event.data)); } catch (error) {
          console.warn("[MobilityDashboard] Failed to parse WebSocket message:", error);
          return;
        }

        const messageType = typeof decoded === "object" && decoded !== null && "type" in decoded ? decoded.type : null;
        if (typeof messageType !== "string") return;
        if (isAlertsPage ? !messageType.startsWith("road.") : !messageType.startsWith("rail.")) return;
        const fleetSnapshot = messageType === "rail.fleet.snapshot" ? railFleetSnapshotMessageSchema.safeParse(decoded) : null;
        if (fleetSnapshot?.success) {
          if (latestSequence !== null && fleetSnapshot.data.sequence < latestSequence) return;
          latestSequence = fleetSnapshot.data.sequence;
          fleet = toRecord(fleetSnapshot.data.data);
          fleetChanged = true;
          if (selectedVehicleIdRef.current) updateSelection(fleet[selectedVehicleIdRef.current]);
          flushRail();
          return true;
        }
        const fleetBatch = messageType === "rail.fleet.batch" ? railFleetBatchMessageSchema.safeParse(decoded) : null;
        if (fleetBatch?.success) {
          // At-least-once levering kan een batch herhalen of te laat afleveren.
          // Zo'n batch mag de vloot nooit bevriezen: een reeds verwerkt of ouder
          // volgnummer wordt genegeerd en de batch wordt daarna altijd toegepast,
          // zodat iedere trein die de gateway nog live houdt op de kaart blijft.
          // Alleen een echt gat vraagt om een volledige resync.
          if (latestSequence !== null && fleetBatch.data.sequence <= latestSequence) return;
          if (latestSequence !== null && fleetBatch.data.sequence !== latestSequence + 1) {
            console.warn("[MobilityDashboard] Fleet sequence gap, requesting resync", {
              expected: latestSequence + 1,
              received: fleetBatch.data.sequence,
            });
            socket?.send(JSON.stringify({ protocolVersion: 2, type: "resync" }));
          }
          latestSequence = fleetBatch.data.sequence;
          for (const vehicleId of fleetBatch.data.removedVehicleIds) {
            delete fleet[vehicleId];
            if (trackMatchesRef.current.delete(vehicleId)) matchesChanged = true;
          }
          for (const vehicle of fleetBatch.data.upserts) {
            fleet[vehicle.vehicleId] = vehicle;
            updateSelection(vehicle);
          }
          fleetChanged = true;
          flushRail();
          return true;
        }
        const matchSnapshot = messageType === "rail.match.snapshot" ? railMatchSnapshotMessageSchema.safeParse(decoded) : null;
        if (matchSnapshot?.success) {
          if (latestMatchSequence !== null && matchSnapshot.data.sequence < latestMatchSequence) return;
          latestMatchSequence = matchSnapshot.data.sequence;
          trackMatchesRef.current = new Map(matchSnapshot.data.data.map(match => [match.vehicleId, match]));
          matchesChanged = true;
          flushRail();
          return;
        }
        const matchBatch = messageType === "rail.match.batch" ? railMatchBatchMessageSchema.safeParse(decoded) : null;
        if (matchBatch?.success) {
          if (latestMatchSequence !== null && matchBatch.data.sequence <= latestMatchSequence) return;
          latestMatchSequence = matchBatch.data.sequence;
          const matches = trackMatchesRef.current;
          for (const vehicleId of matchBatch.data.removedVehicleIds) {
            matches.delete(vehicleId);
          }
          for (const match of matchBatch.data.upserts) {
            matches.set(match.vehicleId, match);
          }
          matchesChanged = true;
          flushRail();
          return;
        }
        const selection = messageType === "rail.selection.snapshot" ? railSelectionSnapshotMessageSchema.safeParse(decoded) : null;
        if (selection?.success) {
          if (selection.data.vehicleId !== selectedVehicleIdRef.current) return;
          const value = selection.data.data;
          const fleetValue = selection.data.vehicleId ? fleet[selection.data.vehicleId] : undefined;
          if (value && fleetValue && (measurementTime(value) ?? 0) < (measurementTime(fleetValue) ?? 0)) return;
          updateSelection(value);
          return;
        }
        const journeySnapshot = messageType === "rail.journey.snapshot" ? journeySnapshotMessageSchema.safeParse(decoded) : messageType === "rail.journey.delta" ? journeyDeltaMessageSchema.safeParse(decoded) : null;
        if (journeySnapshot?.success) {
          if (!selectedVehicleIdRef.current || !journeyMatchesSelection(journeySnapshot.data, selectedTrainNumberRef.current)) return;
          setJourney(journeySnapshot.data.data);
          return;
        }
        const roadSnapshot = messageType === "road.event.snapshot" ? roadSnapshotMessageSchema.safeParse(decoded) : null;
        if (roadSnapshot?.success) {
          latestRoadSequence = roadSnapshot.data.sequence;
          setRoadReceived(true);
          setRoadEventsById(Object.fromEntries(roadSnapshot.data.data.map((roadEvent) => [roadEvent.id, roadEvent])));
          return true;
        }
        const roadBatch = messageType === "road.event.batch" ? roadBatchMessageSchema.safeParse(decoded) : null;
        if (roadBatch?.success) {
          if (latestRoadSequence !== null && roadBatch.data.sequence <= latestRoadSequence) return;
          if (latestRoadSequence !== null && roadBatch.data.sequence !== latestRoadSequence + 1) {
            console.warn("[MobilityDashboard] Road sequence gap, requesting resync", {
              expected: latestRoadSequence + 1,
              received: roadBatch.data.sequence,
            });
            socket?.send(JSON.stringify({ protocolVersion: 2, type: "resync" }));
          }
          latestRoadSequence = roadBatch.data.sequence;
          setRoadReceived(true);
          setRoadEventsById((current) => {
            const next = { ...current };
            for (const eventId of roadBatch.data.removedEventIds) delete next[eventId];
            for (const roadEvent of roadBatch.data.upserts) next[roadEvent.id] = roadEvent;
            return next;
          });
          return true;
        }
      },
    });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      stop();
    };
  }, [isAlertsPage]);

  const routeJourney = selectedVehicleId && journey && journey.trainNumber === observation?.trainNumber
    && Date.parse(journey.product.validUntil) >= now ? journey : null;
  const routeStops = useMemo(() => routeJourney?.stops.toSorted((a, b) => a.order - b.order) ?? [], [routeJourney]);
  const nextOrder = nextTrainStop(routeStops, now)?.order;
  const routeKey = routeJourney && nextOrder !== undefined
    ? JSON.stringify([selectedVehicleId, routeJourney.journeyId, routeJourney.provenance.payloadSha256, nextOrder])
    : null;
  const currentRoute = expectedRoute?.key === routeKey ? expectedRoute.route : null;
  const trailObservation = selectedVehicleId ? vehiclesById[selectedVehicleId] : null;
  const trailMatch = selectedVehicleId ? trackMatchesByVehicle[selectedVehicleId] : null;
  const trailKey = selectedVehicleId && observation
    ? JSON.stringify([selectedVehicleId, observation.trainNumber]) : null;
  useEffect(() => {
    if (!routeKey || !selectedVehicleId) return;
    let active: AbortController | null = null;
    const load = async () => {
      if (active || document.visibilityState === "hidden") return;
      const controller = new AbortController();
      active = controller;
      try {
        const response = await fetch(realtimeHttpUrl(`/v1/trains/${encodeURIComponent(selectedVehicleId)}/route`), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error("Route unavailable");
        const route = expectedRouteSchema.parse(await response.json());
        if (!controller.signal.aborted) setExpectedRoute({ key: routeKey, route });
      } catch {
        // The timetable still supplies station markers if the track route is unavailable.
      } finally {
        if (active === controller) active = null;
      }
    };
    void load();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { active?.abort(); active = null; }
      else void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedVehicleId, routeKey]);

  useEffect(() => {
    if (!mapReady) return;
    const source = map.current?.getSource("expected-rail-route") as GeoJSONSource | undefined;
    source?.setData(trainRouteFeatures(currentRoute, routeStops, nextOrder, stationDirectory, language));
  }, [currentRoute, language, mapReady, nextOrder, routeStops, stationDirectory]);

  useEffect(() => {
    if (!mapReady) return;
    const source = map.current?.getSource("selected-train-trail") as GeoJSONSource | undefined;
    if (!source) return;
    const previous = trainTrail.current;
    const base = previous.key === trailKey ? previous.points : [];
    const position = trainDisplayPosition(trailObservation, trailMatch, now);
    const at = trailObservation ? measurementTime(trailObservation) : null;
    const point = trailKey && trailObservation && trailObservation.trainNumber === observation?.trainNumber
      && position && !position.stale && at !== null && document.visibilityState !== "hidden"
      ? { latitude: trailObservation.position.latitude, longitude: trailObservation.position.longitude, at }
      : null;
    const points = updateTrainTrail(base, point, now);
    if (previous.key === trailKey && points === previous.points) return;
    trainTrail.current = { key: trailKey, points };
    const data = trainTrailFeatures(points);
    source.setData(data);
    setVisibleTrailKey(data.features.length ? trailKey : null);
  }, [mapReady, now, observation?.trainNumber, trailKey, trailMatch, trailObservation]);

  useEffect(() => {
    const instance = map.current;
    if (!mapReady || !instance) return;
    const features: Feature[] = [];
    for (const notice of disruptions?.disruptions ?? []) {
      if (notice.geometry) features.push({ type: "Feature", geometry: notice.geometry, properties: { id: notice.id } });
      for (const station of notice.stations) {
        const catalog = station.code ? stationDirectory.get(station.code.toUpperCase()) : null;
        const longitude = station.longitude ?? catalog?.longitude, latitude = station.latitude ?? catalog?.latitude;
        if (longitude !== null && longitude !== undefined && latitude !== null && latitude !== undefined) features.push({ type: "Feature", geometry: { type: "Point", coordinates: [longitude, latitude] }, properties: { id: notice.id } });
      }
    }
    if (!instance.getSource("ns-disruptions")) {
      instance.addSource("ns-disruptions", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      instance.addLayer({ id: "ns-disruption-lines", type: "line", source: "ns-disruptions", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#e87919", "line-width": 5, "line-dasharray": [2, 1] } }, "rail-fleet-heading");
      instance.addLayer({ id: "ns-disruption-points", type: "circle", source: "ns-disruptions", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 8, "circle-color": "#e87919", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } }, "rail-fleet-heading");
    }
    (instance.getSource("ns-disruptions") as GeoJSONSource).setData({ type: "FeatureCollection", features });
    instance.setPaintProperty("ns-disruption-lines", "line-opacity", disruptions?.stale || disruptionsError ? 0.4 : 0.9);
    instance.setPaintProperty("ns-disruption-points", "circle-opacity", disruptions?.stale || disruptionsError ? 0.4 : 1);
  }, [disruptions, disruptionsError, mapReady, stationDirectory]);

  const dismissPrimaryPanel = () => { panelDispatch({ type: "close" }); clearVehicleSelection(); setSelectedStation(null); replaceSelectionUrl(); };
  const backPrimaryPanel = () => {
    const previous = navigation.history.at(-1);
    if (!previous) { dismissPrimaryPanel(); return; }
    restoringPanel.current = true;
    if (!["train", "station", "search"].includes(previous.kind)) { clearVehicleSelection(); setSelectedStation(null); replaceSelectionUrl(); }
    if (previous.kind === "search") { clearVehicleSelection(); setSelectedStation(null); replaceSelectionUrl(); setQuery(previous.id ?? ""); requestAnimationFrame(() => searchInputRef.current?.focus()); }
    if (previous.kind === "train" && previous.id) selectVehicle(previous.id, false);
    if (previous.kind === "station" && previous.id) { const station = stationDirectory.get(previous.id); if (station) selectStation(station); }
    restoringPanel.current = false;
    panelDispatch({ type: "back" });
  };
  const closePrimaryPanel = () => { if (navigation.history.length) backPrimaryPanel(); else dismissPrimaryPanel(); };
  useEffect(() => { closePanelRef.current = closePrimaryPanel; });
  const focusDisruption = (notice: import("../packages/protocol/ns-travel").RailDisruption) => {
    const coordinates = notice.geometry?.coordinates.flat() ?? notice.stations.flatMap(station => { const catalog = station.code ? stationDirectory.get(station.code.toUpperCase()) : null; const lng = station.longitude ?? catalog?.longitude, lat = station.latitude ?? catalog?.latitude; return lng != null && lat != null ? [[lng, lat] as [number, number]] : []; });
    if (!coordinates.length || !map.current) return;
    const bounds = coordinates.reduce<[[number, number], [number, number]]>((b, p) => [[Math.min(b[0][0], p[0]), Math.min(b[0][1], p[1])], [Math.max(b[1][0], p[0]), Math.max(b[1][1], p[1])]], [[Infinity, Infinity], [-Infinity, -Infinity]]);
    const dock = radarDockWidth(window.innerWidth);
    const height = map.current.getContainer().clientHeight;
    const padding = dock
      ? { left: 28, right: dock + 32, top: Math.min(110, height * .22), bottom: Math.min(100, height * .22) }
      : { left: 24, right: 24, top: Math.min(120, height * .2), bottom: Math.min(height * .48 + 80, height * .68) };
    map.current.fitBounds(bounds, { padding, maxZoom: 12, duration: 500 });
  };
  const openRadarSection = (section: "stations" | "favorites" | "notices" | "more") => {
    navigate({ kind: section });
    clearVehicleSelection();
    setSelectedStation(null);
    setShowJourneyPlanner(false);
    setShowDelayStats(false);
    setShowLayers(false);
    setRadarSection(section);
  };
  const openSavedRouteNotice = (id: string) => {
    const notice = disruptions?.disruptions.find(item => item.id === id);
    if (!notice) return;
    openRadarSection("notices");
    setSelectedDisruptionId(id);
    focusDisruption(notice);
  };

  return (
    <main ref={shell} data-night-map={baseMap === "light" ? "" : undefined} className={`shell radarShell ${panel && panel.kind !== "search" ? "radarPanelOpen" : ""} ${isAlertsPage ? "alertsPage" : "trainPage"}`}>
      {!isAlertsPage && <h1 className="srOnly">{language === "en" ? "Live train locations in the Netherlands" : radarTitle}</h1>}
      <AppNavigation active={isAlertsPage ? "roads" : panel?.kind ?? "radar"} onHome={isAlertsPage ? undefined : resetMap} onOpen={isAlertsPage ? undefined : kind => {
        if (kind === "planner") openJourneyPlanner();
        else if (kind === "stats") openDelayStats();
        else if (kind === "stations" || kind === "favorites" || kind === "notices" || kind === "more") openRadarSection(kind);
      }} />

      {isAlertsPage && <aside className="railAlertsPanel liveFeedPanel open" aria-label={uiCopy("Actuele meldingen", language)}>
        <div className="railAlertsHeader liveFeedHeader">
          <div><span className="railAlertsKicker">{uiCopy("Alleen relevant", language)}</span><strong>{uiCopy("Actuele meldingen", language)}</strong></div>
          <div className="liveFeedHeaderActions"><span className="railAlertCount">{roadReceived ? currentRoadEvents.length.toLocaleString(language === "en" ? "en-GB" : "nl-NL") : "—"}</span></div>
        </div>
        <div className="alertFilterSection" aria-label={uiCopy("Filter meldingen", language)}>
          <strong>{uiCopy("Belangrijkste meldingen", language)}</strong>
          <p className="alertFilterHint">{uiCopy("Files, incidenten en afsluitingen staan standaard aan. Werkzaamheden en veiligheidsmeldingen kun je zelf inschakelen.", language)}</p>
          <div className="alertFilterGrid">
            {roadLayerDefinitions.map((layer) => <label key={layer.key} className={roadLayers[layer.key] ? "selected" : ""} style={{ "--road-color": layer.color } as React.CSSProperties}>
              <input type="checkbox" checked={roadLayers[layer.key]} onChange={(event) => setRoadLayers((current) => ({ ...current, [layer.key]: event.target.checked }))} />
              <span className="alertFilterIcon"><UiIcon name={roadLayerIcon(layer.key)} /></span>
              <span className="alertFilterName">{uiCopy(layer.label, language)}</span>
              <small>{roadReceived ? roadCounts[layer.key] : "—"}</small>
            </label>)}
          </div>
        </div>
        <div className="networkSummary" aria-label={uiCopy("Landelijk live-overzicht", language)}>
          <div><strong>{roadReceived ? currentRoadEvents.length : "—"}</strong><span>{uiCopy("actuele meldingen", language)}</span></div>
          <div><strong>{roadReceived ? roadCounts.incidents + roadCounts.closures : "—"}</strong><span>{language === "en" ? "incidents and closures" : "incidenten en afsluitingen"}</span></div>
        </div>
        <div className="feedSectionTitle"><strong>{uiCopy("Laatste updates", language)}</strong><span>{recentRoadEvents.length} {language === "en" ? "shown" : "zichtbaar"}</span></div>
        <div className="liveFeedList">
          {!recentRoadEvents.length && <p className="alertFeedEmpty" role="status">{roadReceived && connection === "live" ? uiCopy("Geen meldingen binnen de gekozen filters.", language) : uiCopy("De actuele verkeersinformatie is nog niet beschikbaar. We proberen de verbinding automatisch opnieuw.", language)}</p>}
          {recentRoadEvents.map((roadEvent) => <button className={`liveFeedItem ${roadLayerFor(roadEvent)} ${selectedRoadEventId === roadEvent.id ? "selected" : ""}`} type="button" key={roadEvent.id} onClick={() => setSelectedRoadEventId(roadEvent.id)}>
            <span className="feedIcon"><UiIcon name={roadLayerIcon(roadLayerFor(roadEvent))} /></span>
            <span className="feedCopy"><strong>{roadEventTitle(roadEvent, language)}</strong><small>{roadPlace(roadEvent).direction ?? roadPlace(roadEvent).description ?? roadEventDetail(roadEvent, language) ?? (language === "en" ? "Location shown on the map" : "Locatie op de kaart")}</small></span>
            <b>{roadEventBadge(roadEvent, language)}</b><span className="feedArrow"><UiIcon name="chevron" /></span>
          </button>)}
        </div>
        {selectedRoadEvent && <article className="liveFeedDetail">
          <button className="feedDetailClose" type="button" onClick={() => setSelectedRoadEventId(null)} aria-label={uiCopy("Sluit melding", language)}>×</button>
          <span className="detailEyebrow">{roadEventLabel(selectedRoadEvent, language)} · {roadEventStatusLabel(selectedRoadEvent, language)}</span>
          <h2>{roadEventTitle(selectedRoadEvent, language)}</h2>
          <p>{roadPlace(selectedRoadEvent).description ?? roadEventDetail(selectedRoadEvent, language) ?? (language === "en" ? "The source supplied a map location." : "De bron geeft een locatie op de kaart.")}</p>
          <div><span>{[roadPlace(selectedRoadEvent).direction, selectedRoadEvent.source].filter(Boolean).join(" · ")}</span><strong>{roadEventBadge(selectedRoadEvent, language)}</strong></div>
          <small className="feedUpdated">{language === "en" ? "Updated" : "Bijgewerkt"} {formatJourneyClock(selectedRoadEvent.time.sourceUpdatedAt ?? selectedRoadEvent.time.publicationTime)}</small>
        </article>}


      </aside>}


      {!isAlertsPage && <div className="radarTopMeta">
        <button type="button" className="radarFleetCount" onClick={openDelayStats}><UiIcon name="train" /><strong>{mappedTrainCount.toLocaleString(language === "en" ? "en-GB" : "nl-NL")}</strong><span>{mappedTrainCount === 1 ? (language === "en" ? "train in view" : "trein in beeld") : uiCopy("treinen in beeld", language)}</span></button>
        <button type="button" className="radarNoticeChip" onClick={() => openRadarSection("notices")}><UiIcon name="warning" /><span>{uiCopy("Spoormeldingen", language)}</span><UiIcon name="chevron" /></button>
        <button type="button" className="radarMobilePlanner" onClick={openJourneyPlanner}><UiIcon name="queue" /><span>{uiCopy("Reisplanner", language)}</span></button>
      </div>}
      {!isAlertsPage && <section className="fleetTools" aria-label={uiCopy("Treinselectie", language)}>
        <label>
          <svg className="radarSearchIcon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <span>{t("search.placeholder")}</span>
          <input
            ref={searchInputRef}
            aria-label={t("search.label")}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={Boolean(query.trim() && combinedSearchResultCount)}
            aria-controls="liveopweg-search-results"
            aria-activedescendant={query.trim() && combinedSearchResultCount ? `live-search-result-${activeSearchResultIndex}` : undefined}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveSearchIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query.trim()) {
                event.stopPropagation();
                setQuery("");
                setActiveSearchIndex(0);
              } else if (event.key === "ArrowDown" && combinedSearchResultCount) {
                event.preventDefault();
                setActiveSearchIndex((activeSearchResultIndex + 1) % combinedSearchResultCount);
              } else if (event.key === "ArrowUp" && combinedSearchResultCount) {
                event.preventDefault();
                setActiveSearchIndex((activeSearchResultIndex - 1 + combinedSearchResultCount) % combinedSearchResultCount);
              } else if (event.key === "Enter" && query.trim()) {
                event.preventDefault();
                if (activeSearchResultIndex < stationResults.length) selectStation(stationResults[activeSearchResultIndex]);
                else if (searchResults[activeSearchResultIndex - stationResults.length]) selectVehicle(searchResults[activeSearchResultIndex - stationResults.length].vehicleId);
              }
            }}
            placeholder={language === "en" ? "Search train or station" : "Zoek trein of station"}
          />
          {!query && <kbd className="searchShortcut" aria-hidden="true">/</kbd>}
          {query && <button className="clearSearchButton" type="button" aria-label={uiCopy("Wis zoekopdracht", language)} onClick={() => { setQuery(""); setActiveSearchIndex(0); searchInputRef.current?.focus(); }}>×</button>}
        </label>
        {query.trim() && <div className="trainResults" id="liveopweg-search-results" role="listbox" aria-label={uiCopy("Zoekresultaten", language)}>
          {stationResults.length > 0 && <p className="searchGroupLabel" role="presentation">{uiCopy("Stations", language)}</p>}
          {stationResults.map((station, index) => <button type="button" role="option" id={`live-search-result-${index}`} aria-selected={activeSearchResultIndex === index} className={`stationSearchResult ${activeSearchResultIndex === index ? "searchActive" : ""}`} key={station.code} onMouseEnter={() => setActiveSearchIndex(index)} onClick={() => selectStation(station)}>
            <strong>{station.name}</strong><span>Station · {station.code}</span>
          </button>)}
          {searchResults.length > 0 && <p className="searchGroupLabel" role="presentation">{uiCopy("Treinen", language)}</p>}
          {searchResults.map((vehicle, index) => {
            const rollingStock = identifyRollingStock(vehicle.materialNumber);
            const display = trainDisplayPosition(vehicle, trackMatchesByVehicle[vehicle.vehicleId], now);
            const positionNote = display === null
              ? ""
              : display.matched ? "" : display.stale ? (language === "en" ? " · position out of date" : " · positie verouderd") : (language === "en" ? " · GPS position" : " · GPS-positie");
            return (
              <button
                id={`live-search-result-${stationResults.length + index}`}
                role="option"
                aria-selected={activeSearchResultIndex === stationResults.length + index}
                className={`${vehicle.vehicleId === selectedVehicleId ? "selected" : ""} ${activeSearchResultIndex === stationResults.length + index ? "searchActive" : ""}`}
                key={vehicle.vehicleId}
                type="button"
                onMouseEnter={() => setActiveSearchIndex(stationResults.length + index)}
                onClick={() => selectVehicle(vehicle.vehicleId)}
              >
                <strong>{language === "en" ? "Train" : "Trein"} {vehicle.trainNumber}</strong>
                <span>{rollingStock.label} · {language === "en" ? "unit" : "materieel"} {vehicle.materialNumber ?? (language === "en" ? "unknown" : "onbekend")}{positionNote}</span>
              </button>
            );
          })}
          {!stationResults.length && !searchResults.length && <p className="searchGroupLabel" role="presentation">{uiCopy("Geen trein of station gevonden.", language)}</p>}
        </div>}
      </section>}

      <section className="workspace" id="main-content" tabIndex={-1} aria-label={uiCopy(isAlertsPage ? "Kaart met actuele wegmeldingen" : "Landelijk realtime treindashboard", language)}>
        <div className="mapWrap">
          <div ref={mapElement} className="liveMap" aria-label={uiCopy(isAlertsPage ? "Kaart van Nederland met wegmeldingen" : "Kaart van Nederland met actuele treinposities", language)} aria-busy={!mapReady ? "true" : undefined} />
          {!isAlertsPage && mapReady && showBlauwnet && <BlauwnetLayer map={map} language={language} onUnavailable={setBlauwnetUnavailable} onPositions={setRegionalPositions} onSelect={selectRegionalTrain} />}
          {mapBackgroundUnavailable ? <div className="mapStatusNotice uiNotice" role="status"><strong>{language === "en" ? "Map background unavailable" : "Kaartachtergrond niet beschikbaar"}</strong><p>{language === "en" ? "The background cannot be loaded. Search and train information remain available. Try another map style." : "De achtergrond kan niet worden geladen. Zoeken en treininformatie blijven beschikbaar. Probeer een andere kaartweergave."}</p><button onClick={() => { setShowLayers(true); setShowMapStyles(true); }}>{language === "en" ? "Choose map style" : "Kies kaartweergave"}</button></div> : !isAlertsPage && mapLayers.trains && (connection !== "live" || !displayTrains.length) && <div className="mapStatusNotice" role="status">
            <strong>{connection === "offline" || connection === "herstellen" ? (language === "en" ? "Connection interrupted" : "Verbinding onderbroken") : (fleetReceived ? (language === "en" ? "No current train positions" : "Geen actuele treinposities") : (language === "en" ? "Loading live trains" : "Live treinen ophalen"))}</strong>
            <p>{connection === "offline" || connection === "herstellen" ? (language === "en" ? "We are reconnecting automatically. Any positions shown may be out of date." : "We verbinden automatisch opnieuw. Getoonde posities kunnen verouderd zijn.") : (language === "en" ? "The map is ready to explore. Train positions appear as soon as updates arrive." : "Je kunt de kaart alvast verkennen. Treinposities verschijnen zodra er updates binnenkomen.")}</p>
          </div>}
          {!isAlertsPage && <nav className="mobilePlannerActions" aria-label={language === "en" ? "Travel tools" : "Reishulpmiddelen"}>
            <button type="button" onClick={openJourneyPlanner} aria-pressed={showJourneyPlanner}>{language === "en" ? "Plan journey" : "Plan je reis"}</button>
            <button type="button" onClick={openDelayStats} aria-pressed={showDelayStats}>{language === "en" ? "Live overview" : "Live overzicht"}</button>
          </nav>}
          {isAlertsPage && <div className="alertMapHeading"><span>{uiCopy("Meldingenkaart", language)}</span><strong>{uiCopy("Nederland onderweg", language)}</strong><small>{uiCopy("Alleen wegmeldingen · geen treinen", language)}</small></div>}
          <div className="mapActions" aria-label={uiCopy("Kaartbediening", language)}>
            {!isAlertsPage && <button type="button" onClick={() => setShowLayers(true)} aria-expanded={showLayers} aria-label={uiCopy("Kaartlagen", language)}><AppIcon name="layers" /><span>{language === "en" ? "Map" : "Kaart"}</span></button>}
            {!isAlertsPage && <button className="nearbyAction" aria-label={uiCopy("Bij mij in de buurt", language)} type="button" onClick={requestNearbyLocation} aria-expanded={nearbyOpen}><AppIcon name="locate" /><span>{uiCopy("Bij mij in de buurt", language)}</span></button>}
            {isAlertsPage && <button type="button" onClick={() => map.current?.fitBounds([[3.15, 50.7], [7.45, 53.7]], { padding: 40, duration: 400 })}><UiIcon name="map" /><span>{uiCopy("Heel Nederland", language)}</span></button>}
          </div>
          {!isAlertsPage && followedRoute && <SavedRouteCard key={`${followedRoute.originCode}:${followedRoute.destinationCode}`} route={followedRoute} disruptions={disruptions} noticesUnavailable={disruptionsError} liveTrainNumbers={liveTrainNumbers} now={now} onOpenPlanner={openRoutePlanner} onTrain={selectLiveTrain} onNotice={openSavedRouteNotice} />}
          <div className="mapZoomControls" aria-label={language === "en" ? "Map zoom" : "Kaartzoom"}>
            <button type="button" onClick={() => zoomRadar(1)} aria-label={t("map.zoomIn")}><AppIcon name="plus" /></button>
            <button type="button" onClick={() => zoomRadar(-1)} aria-label={t("map.zoomOut")}><AppIcon name="minus" /></button>
            <MapCredits baseMap={baseMap} roadMap={isAlertsPage} language={language} mapReady={mapReady} />
          </div>
{isAlertsPage && <>          <div className={`mapStylePicker ${showMapStyles ? "open" : ""}`}>
            <div className="mapStyleMenu" role="menu" aria-label={t("map.style")} aria-hidden={!showMapStyles}>
              {baseMapDefinitions.map((definition) => <button role="menuitemradio" aria-checked={baseMap === definition.key} type="button" key={definition.key} onClick={() => selectBaseMap(definition.key)}>
                <span className={`mapStylePreview ${definition.key}`} /><span>{uiCopy(definition.label, language)}</span>{baseMap === definition.key && <b>✓</b>}
              </button>)}
            </div>
            <button className="mapStyleCurrent" type="button" aria-expanded={showMapStyles} aria-label={uiCopy("Kies kaartweergave", language)} onClick={() => setShowMapStyles((current) => !current)}>
              <UiIcon name="map" /><span>{uiCopy(baseMapDefinitions.find((definition) => definition.key === baseMap)?.label ?? "", language)}</span><UiIcon name="chevron" />
            </button>
          </div>
</>}

        </div>
        {panel && panel.kind !== "search" && <PanelHost memory={panelScroll} panelKey={`${panel.kind}:${panel.id ?? ""}`} onClose={closePrimaryPanel} onBack={navigation.history.length ? backPrimaryPanel : undefined}>
        {panel.kind === "regional-train" && <RegionalTrainPanel key={panel.id} position={regionalPosition ?? (regionalSelection?.id === panel.id ? regionalSelection : null)} current={Boolean(regionalPosition)} onClose={closePrimaryPanel} onShow={() => {
          const instance = map.current;
          if (regionalPosition && instance) instance.easeTo({ center: [regionalPosition.longitude, regionalPosition.latitude], zoom: Math.max(instance.getZoom(), 10), offset: radarPanelOffset(instance), duration: 650 });
        }} />}
        {panel.kind === "train-choices" && <aside className="uiPanel" aria-label={language === "en" ? "Choose a train" : "Kies een trein"}>
          <header className="uiPanelHeader"><h2>{language === "en" ? "Trains at this spot" : "Treinen op deze plek"}</h2><button type="button" className="radarClose" onClick={closePrimaryPanel} aria-label={language === "en" ? "Close" : "Sluiten"}><AppIcon name="close" /></button></header>
          <ul className="uiResultList">{trainChoices.map(id => {
            const train = vehiclesById[id];
            return train && <li key={id}><button type="button" className="uiResultButton" onClick={() => selectVehicle(id)}><strong>{t("train.number")} {train.trainNumber}</strong><span>{identifyRollingStock(train.materialNumber).label}</span></button></li>;
          })}</ul>
        </aside>}
      {!isAlertsPage && showLayers && <section className="mapDrawer uiPanel" aria-label={uiCopy("Kaartlagen", language)}>
        <header className="uiPanelHeader"><div><span className="radarEyebrow">LIVEOPWEG</span><h2>{uiCopy("Kaartlagen", language)}</h2></div><button className="radarClose" type="button" onClick={closePrimaryPanel} aria-label={uiCopy("Sluit kaartlagen", language)}>×</button></header>
        <p>{language === "en" ? "Choose what appears on your train radar." : "Kies wat je op de treinradar wilt zien."}</p>
          <div className={`mapStylePicker mapStyleInline ${showMapStyles ? "open" : ""}`}>
            <div className="mapStyleMenu" role="menu" aria-label={t("map.style")} aria-hidden={!showMapStyles}>
              {baseMapDefinitions.map((definition) => <button role="menuitemradio" aria-checked={baseMap === definition.key} type="button" key={definition.key} onClick={() => selectBaseMap(definition.key)}>
                <span className={`mapStylePreview ${definition.key}`} /><span>{uiCopy(definition.label, language)}</span>{baseMap === definition.key && <b>✓</b>}
              </button>)}
            </div>
            <button className="mapStyleCurrent" type="button" aria-expanded={showMapStyles} aria-label={uiCopy("Kies kaartweergave", language)} onClick={() => setShowMapStyles((current) => !current)}>
              <UiIcon name="map" /><span>{uiCopy(baseMapDefinitions.find((definition) => definition.key === baseMap)?.label ?? "", language)}</span><UiIcon name="chevron" />
            </button>
          </div>
        <div className="uiLayerOptions">{mapLayerDefinitions.map(layer => <label key={layer.key}>
          <UiIcon name={layer.key === "trains" ? "train" : layer.key === "stations" ? "station" : "rail"} />
          <span>{uiCopy(layer.label, language)}</span><input type="checkbox" checked={mapLayers[layer.key]} onChange={event => setMapLayers(current => ({ ...current, [layer.key]: event.target.checked }))} />
        </label>)}<label>
          <UiIcon name="train" />
          <span>Blauwnet</span>
          <input type="checkbox" checked={showBlauwnet} onChange={event => setShowBlauwnet(event.target.checked)} />
        </label></div>
        {showBlauwnet && <p className="mapLayerNote" role="status">{blauwnetUnavailable
          ? (language === "en" ? "Blauwnet positions are temporarily unavailable." : "Blauwnet-posities zijn tijdelijk niet beschikbaar.")
          : (language === "en" ? "Solid blue markers are measured. Dashed outlines are estimates from station times." : "Volblauwe symbolen zijn gemeten. Een gestippelde rand betekent een schatting op basis van haltetijden.")}</p>}
        {mapLayers.trains && <ul className="positionLegend" aria-label={uiCopy("Positienauwkeurigheid", language)}>
          <li><i className="matched" aria-hidden="true" />{uiCopy("Op spoor", language)}</li>
          <li><i className="gps" aria-hidden="true" />{uiCopy("GPS-punt", language)}</li>
          <li><i className="stale" aria-hidden="true" />{language === "en" ? "Older position" : "Oudere positie"}</li>
        </ul>}
      </section>}

          {!isAlertsPage && nearbyOpen && <aside className="nearbyPanel uiPanel" aria-label={uiCopy("Wat is er bij mij in de buurt", language)}>
            <header className="uiPanelHeader"><div><span className="radarEyebrow">{uiCopy("OM JE HEEN", language)}</span><h2>{uiCopy("Bij jou in de buurt", language)}</h2></div><button type="button" className="radarClose" onClick={closePrimaryPanel} aria-label={uiCopy("Sluit buurtpaneel", language)}>×</button></header>
            {locationStatus === "loading" && <p className="nearbyMessage">{uiCopy("Je locatie ophalen…", language)}</p>}
            {locationStatus === "denied" && <p className="nearbyMessage">{uiCopy("Locatietoegang is geblokkeerd. Sta locatie toe in je browser en probeer opnieuw.", language)}</p>}
            {locationStatus === "unavailable" && <p className="nearbyMessage">{uiCopy("Je locatie is nu niet beschikbaar. Controleer je browserinstellingen en probeer opnieuw.", language)}</p>}
            {(locationStatus === "denied" || locationStatus === "unavailable") && <div className="uiActions"><button type="button" onClick={requestNearbyLocation}>{language === "en" ? "Try again" : "Opnieuw proberen"}</button></div>}
            {userLocation && <>
              <section><h3><UiIcon name="station" />{language === "en" ? "Nearby stations" : "Stations in de buurt"}</h3>{nearbyStations.map(({ station, distance }) => <button className="nearbyResult" type="button" key={station.code} onClick={() => selectStation(station)}><span><strong>{station.name}</strong><small>Station · {station.code}</small></span><b>{nearbyDistanceLabel(distance)}</b></button>)}{!nearbyStations.length && <p className="nearbyMessage">{uiCopy("Geen station binnen 50 km in de beschikbare kaartdata.", language)}</p>}</section>
              <section><h3><UiIcon name="train" />{language === "en" ? "Nearby trains" : "Treinen in de buurt"}</h3>{nearbyTrains.filter(({ distance }) => distance <= 25_000).map(({ train, distance }) => <button className="nearbyResult" type="button" key={train.observation.vehicleId} onClick={() => selectVehicle(train.observation.vehicleId)}><span><strong>{language === "en" ? "Train" : "Trein"} {train.observation.trainNumber}</strong><small>{identifyRollingStock(train.observation.materialNumber).label}{train.stale ? (language === "en" ? " · position out of date" : " · positie verouderd") : ""}</small></span><b>{nearbyDistanceLabel(distance)}</b></button>)}{!nearbyTrains.some(({ distance }) => distance <= 25_000) && <p className="nearbyMessage">{uiCopy("Geen live treinposities binnen 25 km.", language)}</p>}</section>
              <p className="nearbyPrivacy">{uiCopy("Je locatie blijft op dit apparaat en wordt niet opgeslagen.", language)}</p>
            </>}
          </aside>}
        <AsyncPanel key={radarSection ?? "directory"}>
          {!isAlertsPage && (radarSection === "stations" || radarSection === "favorites") && <RadarDirectory initialQuery={directoryQueries[radarSection]} onQueryChange={value => setDirectoryQueries(current => ({ ...current, [radarSection]: value }))} key={radarSection} stations={stationCatalog} favoritesOnly={radarSection === "favorites"} onSelect={selectStation} onClose={closePrimaryPanel} />}
        </AsyncPanel>
        {!isAlertsPage && radarSection === "more" && <aside className="radarCard" aria-label={language === "en" ? "More" : "Meer"}>
          <header><h2 className="srOnly">{language === "en" ? "More" : "Meer"}</h2><BrandLogo /><button className="radarClose" onClick={closePrimaryPanel} aria-label={language === "en" ? "Close" : "Sluiten"}>×</button></header>
          <div className="uiMenu"><button onClick={openJourneyPlanner}>{language === "en" ? "Journey planner" : "Reisplanner"}</button><button onClick={openDelayStats}>{language === "en" ? "Fleet overview" : "Vlootoverzicht"}</button><Link href="/instellingen">{language === "en" ? "Settings" : "Instellingen"}</Link><Link href="/meldingen">{language === "en" ? "Road alerts" : "Wegmeldingen"}</Link><Link href={guidePath}>{language === "en" ? "About the train radar (Dutch)" : "Over de treinradar"}</Link></div>
        </aside>}
        {!isAlertsPage && radarSection === "notices" && <RailNotices selectedId={selectedDisruptionId} onSelected={setSelectedDisruptionId} data={disruptions} error={disruptionsError} retry={retryDisruptions} onSelect={focusDisruption} onClose={closePrimaryPanel} onPlan={openRoutePlanner} />}
        <AsyncPanel key={selectedStation?.code ?? selectedVehicleId ?? (showJourneyPlanner ? "planner" : "stats")}>
        {!isAlertsPage && panel?.kind === "station" && selectedStation && <StationPanel memory={stationMemory} key={selectedStation.code} station={selectedStation} now={now} availableVehicleIds={availableVehicleIds} catalogFetchedAt={stationCatalogFetchedAt} onClose={closePrimaryPanel} onSelectVehicle={selectVehicle} />}
        {!isAlertsPage && panel?.kind === "train" && observation && <TrainPanel
          key={observation.vehicleId}
          positionMatched={displayTrains.find(train => train.observation.vehicleId === observation.vehicleId)?.matched ?? false}
          units={trainServices.find(service => service.units.some(unit => unit.vehicleId === observation.vehicleId))?.units}
          observation={vehiclesById[observation.vehicleId] ?? observation}
          journey={journey} now={now}
          showExpectedRoute={Boolean(currentRoute?.geometry.coordinates.length)}
          showRecentTrail={trailKey !== null && visibleTrailKey === trailKey}
          isFollowing={isFollowingTrain}
          canFollow={displayTrains.some(train => !train.stale && train.observation.vehicleId === observation.vehicleId)}
          onToggleFollow={() => setIsFollowingTrain(following => !following)}
          onClose={closePrimaryPanel}
        />}
        {!isAlertsPage && showJourneyPlanner && <JourneyPlanner storageError={savedRouteError} onRetryStorage={retrySavedRoute} memory={plannerMemory} stations={stationCatalog} route={followedRoute} onRouteChange={updateFollowedRoute} onClose={closePrimaryPanel} liveTrainNumbers={liveTrainNumbers} onSelectTrain={selectLiveTrain} />}
        {!isAlertsPage && showDelayStats && <DelayStats now={now} vehicles={displayTrains.map(train=>train.observation)} onClose={closePrimaryPanel} />}
        </AsyncPanel>
        </PanelHost>}
      </section>
    </main>
  );
}
