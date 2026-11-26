import type { GeoJSONSource, Map as RadarMap, MapSourceDataEvent } from "maplibre-gl";

const sourceId = "pdok-rail-geometry";
const detailLayers = ["pdok-rail-geometry-casing", "pdok-rail-geometry-lines"];
const detailZoom = 8;

export function bindRailMapDetail(map: RadarMap, url: string) {
  const source = map.getSource<GeoJSONSource>(sourceId);
  let enabled = false;
  let eligible = false;
  let disposed = false;
  let status: "idle" | "loading" | "failed" | "loaded" = "idle";
  let drawn = false;

  const visibility = (layer: string, visible: boolean) => {
    if (!map.getLayer(layer)) return;
    const value = visible ? "visible" : "none";
    if ((map.getLayoutProperty(layer, "visibility") ?? "visible") !== value) {
      map.setLayoutProperty(layer, "visibility", value);
    }
  };

  function renderLayers() {
    const detailed = eligible && status === "loaded";
    for (const layer of detailLayers) visibility(layer, detailed);
    visibility("rail-overview", enabled && !(detailed && drawn));
  }

  async function load() {
    if (!source || status === "loading" || status === "loaded") return;
    status = "loading";
    let receivedContent = false;
    let failed = false;
    const onData = (event: MapSourceDataEvent) => {
      if (event.sourceDataType === "content") receivedContent = true;
    };
    const onError = () => { failed = true; };
    source.on("data", onData);
    source.on("error", onError);
    try {
      await source.setData(url);
      if (disposed) return;
      // MapLibre reports a failed URL through an error event, even if
      // setData resolves. Only inspect the worker's data after a content event.
      const data = receivedContent && !failed ? await source.getData() : null;
      if (disposed) return;
      const hasTracks = data?.type === "FeatureCollection" && data.features.some(({ geometry }) =>
        geometry?.type === "LineString" || geometry?.type === "MultiLineString");
      status = hasTracks ? "loaded" : "failed";
    } catch {
      status = "failed";
    } finally {
      source.off("data", onData);
      source.off("error", onError);
      if (!disposed) renderLayers();
    }
  }

  function syncZoom() {
    const nextEligible = enabled && map.getZoom() >= detailZoom;
    if (eligible === nextEligible) return;
    eligible = nextEligible;
    // Retry a failed download when the user zooms back in or enables railways.
    if (eligible) void load();
    renderLayers();
  }

  function afterRender() {
    if (!eligible || status !== "loaded" || drawn || !map.isSourceLoaded(sourceId)) return;
    drawn = true;
    renderLayers();
  }

  map.on("zoom", syncZoom);
  map.on("idle", afterRender);
  return {
    setVisible(visible: boolean) {
      enabled = visible;
      syncZoom();
      renderLayers();
    },
    dispose() {
      disposed = true;
      map.off("zoom", syncZoom);
      map.off("idle", afterRender);
    },
  };
}
