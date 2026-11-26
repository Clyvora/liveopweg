import type { Map as MapLibreMap } from "maplibre-gl";

export function crossingDetails(properties: Record<string, unknown>, language: string) {
  const en = language === "en";
  const text = (key: string) => typeof properties[key] === "string" ? properties[key].trim() : "";
  const name = text("locatieaanduiding");
  const town = text("plaats") || text("gemeente");
  const type = text("overweg_type");
  const protection = type === "AHOB" || type === "AHOB-MINI"
    ? (en ? "Automatic half barriers" : "Automatische halve overwegbomen")
    : type === "AKI" ? (en ? "Automatic warning lights" : "Automatische knipperlichten")
    : type === "Geen" ? (en ? "No active protection listed" : "Geen actieve beveiliging geregistreerd")
    : (en ? "Protection details unavailable" : "Beveiliging niet gespecificeerd");
  const tracks = properties.aantal_sporen;
  return {
    title: name || (en ? "Railway crossing" : "Spoorwegovergang"),
    location: town,
    protection,
    tracks: typeof tracks === "number" && Number.isInteger(tracks) && tracks > 0
      ? (en ? `${tracks} ${tracks === 1 ? "track" : "tracks"}` : `${tracks} ${tracks === 1 ? "spoor" : "sporen"}`) : "",
    note: en ? "Infrastructure data · barrier status unavailable" : "Infrastructuurgegevens · geen actuele stand van de slagbomen",
  };
}

export function crossingPopupContent(properties: Record<string, unknown>, language: string) {
  const { title, location, protection, tracks, note } = crossingDetails(properties, language);
  const root = document.createElement("div");
  root.className = "crossingMapDetails";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const details = document.createElement("span");
  details.textContent = [location, protection, tracks].filter(Boolean).join(" · ");
  const footnote = document.createElement("small");
  footnote.textContent = note;
  const source = document.createElement("a");
  source.href = "https://maps.prorail.nl/arcgis/rest/services/Overwegen/MapServer/8";
  source.target = "_blank";
  source.rel = "noreferrer";
  source.textContent = "ProRail / PDOK";
  root.append(heading, details, footnote, source);
  return root;
}

export function addCrossingLayer(instance: MapLibreMap) {
  const crossingIcon = document.createElement("canvas");
  crossingIcon.width = 48;
  crossingIcon.height = 48;
  const crossingContext = crossingIcon.getContext("2d");
  if (crossingContext) {
    crossingContext.beginPath(); crossingContext.roundRect(5, 5, 38, 38, 10);
    crossingContext.fillStyle = "#fff7e5"; crossingContext.fill();
    crossingContext.strokeStyle = "#956329"; crossingContext.lineWidth = 2.5; crossingContext.stroke();
    crossingContext.beginPath(); crossingContext.lineCap = "round"; crossingContext.lineJoin = "round";
    crossingContext.moveTo(16, 16); crossingContext.lineTo(32, 32);
    crossingContext.moveTo(32, 16); crossingContext.lineTo(16, 32);
    crossingContext.strokeStyle = "#71471e"; crossingContext.lineWidth = 4; crossingContext.stroke();
  }
  if (crossingContext) instance.addImage("liveopweg-level-crossing", crossingContext.getImageData(0, 0, 48, 48), { pixelRatio: 2 });
  instance.addSource("rail-level-crossings", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  instance.addLayer({
    id: "rail-level-crossing-symbols", type: "symbol", source: "rail-level-crossings", minzoom: 13,
    filter: ["==", ["get", "karakter"], "Openbare overweg"],
    layout: { "icon-image": "liveopweg-level-crossing", "icon-size": 0.9 },
  });
}
