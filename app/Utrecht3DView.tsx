"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { StationBundle } from "../packages/domain-rail/station-bundle";
import type { RailObservation, RailTrackMatch } from "../packages/protocol/rail";
import type { TilesLayerState } from "./pdok-3d-tiles-layer";
import { realtimeHttpUrl } from "./realtime-url";
import type { StationLayerStats, StationTrain3d, UtrechtStationLayer } from "./utrecht-station-layer";

interface Utrecht3DViewProps {
  vehicles: RailObservation[];
  matchesByVehicle: Record<string, RailTrackMatch>;
  selectedVehicleId: string | null;
}

const startingTiles: TilesLayerState = {
  status: "STARTING",
  visibleTiles: 0,
  activeTiles: 0,
  loadProgress: 0,
  memoryBudgetMb: 0,
};

const stationOptions = [
  { id: "utrecht-centraal", name: "Utrecht Centraal" },
  { id: "amsterdam-centraal", name: "Amsterdam Centraal" },
  { id: "rotterdam-centraal", name: "Rotterdam Centraal" },
] as const;

export function Utrecht3DView({ vehicles, matchesByVehicle, selectedVehicleId }: Utrecht3DViewProps) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const stationLayer = useRef<UtrechtStationLayer | null>(null);
  const stationTrainsRef = useRef<StationTrain3d[]>([]);
  const bundleRef = useRef<StationBundle | null>(null);
  const [active, setActive] = useState(false);
  const [stationId, setStationId] = useState<string>(stationOptions[0].id);
  const [state, setState] = useState<"IDLE" | "BUNDLE" | "RENDERING" | "ERROR">("IDLE");
  const [bundle, setBundle] = useState<StationBundle | null>(null);
  const [stats, setStats] = useState<StationLayerStats | null>(null);
  const [buildings, setBuildings] = useState<TilesLayerState>(startingTiles);
  const [terrain, setTerrain] = useState<TilesLayerState>(startingTiles);

  const stationTrains = useMemo<StationTrain3d[]>(() => {
    if (!bundle) return [];
    const edgeIds = new Set(bundle.rail.curves.map((curve) => curve.edgeId));
    return vehicles.flatMap((vehicle) => {
      const match = matchesByVehicle[vehicle.vehicleId];
      if (!match?.edgeId || match.edgeProgress === null || !match.status.startsWith("MATCHED") || !edgeIds.has(match.edgeId)) return [];
      return [{
        vehicleId: vehicle.vehicleId,
        trainNumber: vehicle.trainNumber,
        edgeId: match.edgeId,
        edgeProgress: match.edgeProgress,
        selected: vehicle.vehicleId === selectedVehicleId,
      }];
    });
  }, [bundle, matchesByVehicle, selectedVehicleId, vehicles]);

  useEffect(() => {
    stationTrainsRef.current = stationTrains;
    stationLayer.current?.setTrains(stationTrains);
  }, [stationTrains]);

  useEffect(() => {
    if (!active || !mapElement.current || map.current) return;
    let disposed = false;
    setState("BUNDLE");
    const initialize = async () => {
      const [{ Map, NavigationControl }, { UtrechtStationLayer: StationLayer }, { Pdok3dTilesLayer }] = await Promise.all([
        import("maplibre-gl"),
        import("./utrecht-station-layer"),
        import("./pdok-3d-tiles-layer"),
      ]);
      if (disposed || !mapElement.current) return;
      const response = await fetch(realtimeHttpUrl(`/v1/stations/${stationId}/3d`));
      if (!response.ok) throw new Error("Stationbundel is niet beschikbaar");
      const stationBundle = await response.json() as StationBundle;
      if (stationBundle.schemaVersion !== 1 || stationBundle.station.id !== stationId) {
        throw new Error("Stationbundel heeft een onbekend formaat");
      }
      if (disposed) return;
      bundleRef.current = stationBundle;
      setBundle(stationBundle);
      const instance = new Map({
        container: mapElement.current,
        center: [stationBundle.station.origin[0], stationBundle.station.origin[1]],
        zoom: 16.15,
        pitch: 64,
        bearing: -31,
        maxPitch: 80,
        minZoom: 14.8,
        maxZoom: 19.2,
        maxBounds: [
          [stationBundle.station.bounds[0], stationBundle.station.bounds[1]],
          [stationBundle.station.bounds[2], stationBundle.station.bounds[3]],
        ],
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
        style: {
          version: 8,
          sources: {
            osm3d: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap-bijdragers",
            },
          },
          layers: [{
            id: "osm3d",
            type: "raster",
            source: "osm3d",
            paint: { "raster-saturation": -0.82, "raster-brightness-max": 0.78, "raster-contrast": 0.2 },
          }],
        },
      });
      map.current = instance;
      instance.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right");
      instance.on("load", () => {
        if (disposed) return;
        const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
        const profile = deviceMemory < 4 ? "low" : deviceMemory >= 8 ? "high" : "standard";
        const totalMemoryBudget = stationBundle.renderBudget.memoryBudgetMb[profile];
        const terrainLayer = new Pdok3dTilesLayer(
          "pdok-3d-terrain-2025",
          stationBundle.pdok3d.terrainTilesetUrl,
          Math.round(totalMemoryBudget * 0.38),
          stationBundle.renderBudget.maxConcurrentTileDownloads,
          stationBundle.renderBudget.maxConcurrentTileParses,
          setTerrain,
        );
        const buildingsLayer = new Pdok3dTilesLayer(
          "pdok-3d-buildings-2025",
          stationBundle.pdok3d.buildingsTilesetUrl,
          Math.round(totalMemoryBudget * 0.62),
          stationBundle.renderBudget.maxConcurrentTileDownloads,
          stationBundle.renderBudget.maxConcurrentTileParses,
          setBuildings,
        );
        const detailLayer = new StationLayer(stationBundle, setStats);
        stationLayer.current = detailLayer;
        detailLayer.setTrains(stationTrainsRef.current);
        instance.addLayer(terrainLayer);
        instance.addLayer(buildingsLayer);
        instance.addLayer(detailLayer);
        setState("RENDERING");
      });
    };
    void initialize().catch(() => { if (!disposed) setState("ERROR"); });
    return () => {
      disposed = true;
      stationLayer.current = null;
      bundleRef.current = null;
      map.current?.remove();
      map.current = null;
      setBundle(null);
      setStats(null);
      setBuildings(startingTiles);
      setTerrain(startingTiles);
    };
  }, [active, stationId]);

  const moveCamera = (preset: "OVERVIEW" | "PLATFORMS" | "FOLLOW") => {
    const instance = map.current;
    const currentBundle = bundleRef.current;
    if (!instance || !currentBundle) return;
    const selectedMatch = selectedVehicleId ? matchesByVehicle[selectedVehicleId] : null;
    const target = preset === "FOLLOW" && selectedMatch?.snappedPosition
      ? [selectedMatch.snappedPosition.longitude, selectedMatch.snappedPosition.latitude] as [number, number]
      : [currentBundle.station.origin[0], currentBundle.station.origin[1]] as [number, number];
    const camera = preset === "OVERVIEW"
      ? { center: target, zoom: 15.55, pitch: 56, bearing: -31 }
      : preset === "PLATFORMS"
        ? { center: target, zoom: 17.35, pitch: 70, bearing: -24 }
        : { center: target, zoom: 18, pitch: 72, bearing: instance.getBearing() };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) instance.jumpTo(camera);
    else instance.easeTo({ ...camera, duration: 900 });
  };

  const tileState = buildings.status === "ERROR" || terrain.status === "ERROR"
    ? "DEGRADED"
    : buildings.status === "READY" && terrain.status === "READY"
      ? "READY"
      : "STREAMING";
  const memoryBudget = buildings.memoryBudgetMb + terrain.memoryBudgetMb;

  return (
    <section className={`station3d ${active ? "active" : ""}`} aria-label="3D-detailzone van Nederlandse stations">
      <header className="station3dHeader">
        <div>
          <p className="panelKicker">Fase 10 · stationschaal 3D</p>
          <h2>Stations in meters.<br /><em>Niet in giswerk.</em></h2>
          <p>Utrecht, Amsterdam en Rotterdam gebruiken dezelfde controleerbare 3D-keten: ProRail-sporen, actuele BGT-perrons en PDOK-gebouwen en terrein. Materieel blijft één neutrale unit zolang de positiebron geen betrouwbaar treintype levert.</p>
        </div>
        <div className="station3dActions">
          <label>Station
            <select value={stationId} onChange={(event) => setStationId(event.target.value)}>
              {stationOptions.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
            </select>
          </label>
          <button className="station3dToggle" type="button" onClick={() => setActive((value) => !value)}>
            {active ? "Sluit 3D" : "Open 3D-station"}
          </button>
        </div>
      </header>
      {active && <>
        <div className="station3dToolbar" aria-label="3D-camerastanden">
          <button type="button" onClick={() => moveCamera("OVERVIEW")}>Overzicht</button>
          <button type="button" onClick={() => moveCamera("PLATFORMS")}>Perrons</button>
          <button type="button" disabled={!selectedVehicleId} onClick={() => moveCamera("FOLLOW")}>Volg selectie</button>
          <span>{state === "ERROR" ? "3D-bundel niet beschikbaar" : `${tileState} · ${memoryBudget || "…"} MB budget`}</span>
        </div>
        <div className="station3dViewport">
          <div ref={mapElement} className="station3dMap" aria-label={`Interactieve 3D-kaart van ${bundle?.station.name ?? "het geselecteerde station"}`} />
          {state !== "RENDERING" && <div className="station3dLoading"><span /> {state === "ERROR" ? "Lokale 3D-weergave kon niet starten" : "Stationbundel en zichtbare tiles laden"}</div>}
          <div className="station3dLegend">
            <span><i className="rail3dLegend" /> rails + dwarsliggers</span>
            <span><i className="live3dLegend" /> live afleiding</span>
            <span><i className="demo3dLegend" /> bochtproef · niet live</span>
          </div>
          <div className="station3dAttribution">ProRail/PDOK · BGT/PDOK (CC0) · 3D Basisvoorziening 2025 (CC BY 4.0) · © OpenStreetMap</div>
        </div>
        <dl className="station3dStats">
          <div><dt>Lokale oorsprong</dt><dd>{bundle ? `${bundle.station.origin[1].toFixed(6)}, ${bundle.station.origin[0].toFixed(6)}` : "laden"}</dd></div>
          <div><dt>Railcurves</dt><dd>{stats?.railCurves ?? "—"}</dd></div>
          <div><dt>Actuele perronobjecten</dt><dd>{stats?.platforms ?? "—"}</dd></div>
          <div><dt>Dwarsliggers binnen LOD</dt><dd>{stats?.sleepers ?? "—"}</dd></div>
          <div><dt>Live units in detailzone</dt><dd>{stats?.liveVehicles ?? 0}</dd></div>
          <div><dt>Zichtbare 3D-tiles</dt><dd>{buildings.visibleTiles + terrain.visibleTiles}</dd></div>
        </dl>
      </>}
    </section>
  );
}
