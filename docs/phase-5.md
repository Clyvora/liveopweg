# Fase 5 — ProRail/PDOK-spoorgeometrie en track graph

Status: afgerond op 21 augustus 2026.

## Resultaat

De applicatie importeert de landelijke spoorgeometrie rechtstreeks uit de officiële ProRail Spoorwegen OGC API van PDOK. De import is herhaalbaar, behoudt de exacte bronresponsen en bouwt daaruit een versieerbare track graph en een gecomprimeerde kaartlaag.

De live kaart toont deze spoorbasis achter de actuele treinposities. Dit is nog geen map matching: het ontvangen WGS84-bronpunt en de clientinterpolatie blijven ongewijzigd. Een trein wordt pas in fase 6 aan een graafedge gekoppeld.

## Bron en lineage

- API: `https://api.pdok.nl/prorail/spoorwegen/ogc/v1`
- aanbieder: ProRail via PDOK
- licentie: CC0 1.0
- authenticatie: niet vereist
- geïmporteerde collecties: `spooras`, `wissel`, `kruising`, `station`
- nieuwste publicatiedatum in deze snapshot: `2026-07-08T11:47:24Z`
- iedere OGC-pagina wordt ongewijzigd opgeslagen met een afzonderlijke SHA-256
- aggregate snapshot SHA-256: `1e48fb0f70125d428dc7c20bf917b9545f20cf5f400f910c7f43c50284f67a63`

De responsepagina's staan per import onder `var/raw/rail-geometry/<import-id>/`. Het manifest, de graph en de kaartproducten staan in `var/rail-geometry/`. Deze afgeleide en ruwe bestanden zijn lokaal reproduceerbaar en bewust niet in Git opgenomen.

## Import en operationele selectie

De snapshot bevatte:

| Collectie | Ruwe features | Operationeel gebruikt |
|---|---:|---:|
| Spooras | 9.460 | 7.998 met status `Bestaand` |
| Wissel | 26.245 | 22.157 met status `Bestaand` |
| Kruising | 784 | Alleen als bewaarde broncontext |
| Station | 425 | Alleen als bewaarde broncontext |

Objecten met status `Definitief ontwerp` blijven in de ruwe bronsnapshot aanwezig, maar worden niet als operationeel spoor aangeboden. De importer volgt officiële `next`-links, accepteert alleen URL's binnen de vaste PDOK API-basis, hanteert een timeout en maximale paginagrootte en schrijft de eindproducten atomair.

Een nieuwe snapshot maken:

```text
npm run rail:import-geometry
```

## Graafmodel

De operationele graaf uit deze snapshot bevat:

- 27.702 nodes;
- 30.155 edges;
- 6.409,9 kilometer brongeometrie;
- 8.286 vertakkingsnodes;
- 547 conservatief gescheiden connected components;
- 12.017 nodes en 13.466 edges in de grootste component.

Een spooras of officiële wissellijn wordt een edge met volledige WGS84-geometrie, lengte, broncollectie, PUIC waar beschikbaar, lifecycle-status, publicatiedatum en bronversie. Richting blijft `unknown` en `inferred` blijft `false`, omdat de geometrie geen bewezen operationele rijrichting levert.

Nodes worden uitsluitend gemaakt door lijneindpunten binnen 0,75 meter samen te voegen. Twee lijnen die elkaar alleen geometrisch in het midden kruisen, worden niet automatisch verbonden. Dat voorkomt fictieve routes bij bruggen, tunnels, parallelsporen en visuele kruisingen. Officiële wisselgeometrie levert wel edges en markeert de betrokken nodes als wissel.

## Spatial indexes en levering

De JSON-graph bevat een vaste bbox-grid van 0,02 graden om lokaal snel kandidaat-edges op te zoeken. Het PostGIS-schema in `infra/postgis/001_track_graph.sql` voegt GIST-indexen toe voor node- en edgegeometrie en B-tree-indexen voor versie, endpoints en PUIC.

De realtime gateway levert:

- `GET /v1/geometry/rail/meta` — klein manifest met bron- en graphmetadata;
- `GET /v1/geometry/rail` — gzip-gecomprimeerde GeoJSON-kaartlaag.

De actuele gecomprimeerde kaartlaag is ongeveer 5,9 MB. De browser tekent spoorassen en wissels als één MapLibre-bronlaag en toont expliciet dat treinposities nog niet zijn gematcht.

## Bewuste beperkingen

- Er is nog geen GPS-naar-spoor-koppeling of routeprediction.
- Een connected component is een conservatief geometrisch resultaat, geen bewezen operationeel routenetwerk.
- Werkelijke wisselstand, rijrichting, buitendienststellingen en toegankelijkheidsregels zijn niet uit deze bron afgeleid.
- De PostGIS-tabellen en GIST-indexen zijn voorbereid, maar konden op deze ontwikkelmachine niet in Docker worden uitgevoerd doordat virtualisatie voor Docker Desktop niet beschikbaar is. De file-backed import en kaartlevering werken wel volledig.
- Een productiepublicatie vereist een extern bereikbare realtime/geometry-gateway; de huidige gateway is lokaal en gebruikt bovendien de NDOV ZeroMQ-bron.

## Geautomatiseerde bewijzen

De graph-tests bewijzen dat gedeelde eindpunten verbonden worden, een visuele middenkruising niet verbonden wordt, officiële wisselgeometrie als edge wordt behouden en de bbox-grid de juiste kandidaat-edges teruggeeft. Daarnaast controleren typecheck, lint, productiebuild en server-rendering de volledige applicatie.
