# Liveopweg

## ClyvoraAPI migration (prepared locally, not deployed)

The backend implementation now lives in the sibling checkout
`../ClyvoraAPI/services/liveopweg`: ingestion, `/v1/*` HTTP/WebSocket gateway,
geometry/station bundle generation, replay, persistence and PostGIS migrations.
The old `workers/**/*.ts` paths are compatibility re-exports; browser protocol
and domain packages remain here for the frontend. `worker/index.ts` serves the
frontend SSR/image runtime and intentionally remains local to this website.

Install both projects: `npm ci` here and
`npm --prefix ../ClyvoraAPI/services/liveopweg ci`. Run `npm run dev:phase1`
for the website and central backend, or run `npm run dev` and
`npm --prefix ../ClyvoraAPI/services/liveopweg run dev` separately.
Forwarded backend commands now run with the backend directory as cwd.
Set `MOBILITYRADAR_DATA_DIR` to an absolute path to reuse existing data;
otherwise a fresh backend `var/` is used. No existing data is deleted or moved.
Supply server environment variables to the process; npm does not load `.env`.

The frontend still accepts `NEXT_PUBLIC_REALTIME_URL` (WebSocket URL ending in
`/v1/realtime`); all HTTP endpoints derive from that same host. The default
production same-origin reverse proxy remains compatible. A separate reviewed
API host can be configured at frontend build time without changing contracts.
Set backend `CORS_ALLOWED_ORIGIN` to the exact frontend origin, and keep
`NS_API_KEY`, `DATABASE_URL` and `REDIS_URL` server-only. The browser still
loads map tiles, styles, glyphs and applicable 3D assets from their providers;
this is not an offline or network-private application.

For a reviewed production build with sibling checkouts, use
`docker compose --env-file infra/docker/production.env -f infra/docker/compose.production.yml -f infra/docker/compose.clyvora-api.yml build`.
Create that untracked env file from the example using real deployment values
outside source control. The override builds migration/bootstrap/realtime from
ClyvoraAPI; web/proxy and existing volumes retain their original roles. Keep
both Compose files in all future commands. Original deployment definitions
are retained for history; their legacy realtime target contains wrappers and
must not be used alone after this migration. Do not bring this stack up until
the data-volume backup and provider/domain configuration review is complete.

Validate with `npm test`, `npm run typecheck`, `npm run lint` here and
`npm --prefix ../ClyvoraAPI/services/liveopweg test` plus
`npm --prefix ../ClyvoraAPI/services/liveopweg run typecheck`.

Liveopweg maakt Nederlandse mobiliteitsdata realtime zichtbaar met een expliciet onderscheid tussen bronfeit, afleiding en onbekende informatie.

## Stationweergave

De huidige interface is een fullscreen kaart met compacte trein- en stationpanelen. Klik op een blauw omrand stationspunt of zoek op stationsnaam/code. Grote stations verschijnen op landelijk zoomniveau; lokale stations vanaf zoom 10. De oude 3D- en replayonderdelen staan niet meer in deze interface.

Het stationbord wisselt tussen aankomst en vertrek en ververst elke 15 seconden zolang het paneel open is. `GET /v1/stations/{code}/board` geeft ontvangen ritten voor de komende 60 minuten, geordend op actuele tijd (of geplande tijd wanneer onbekend). Verlopen ritproducten en doorrijdende treinen zonder stop worden uitgesloten. Een vervallen geplande stop blijft als ‘Vervalt’ zichtbaar. Onbekende vertraging wordt nooit als ‘Op tijd’ gepresenteerd.

Het bord is **geen volledige dienstregeling**: alleen de ontvangen NDOV InfoPlus-ritberichten zijn beschikbaar. Lege, verouderde en niet-bereikbare borden hebben verschillende meldingen. Doorklikken naar een trein vereist hetzelfde treinnummer én Nederlandse dienstdatum en een GPS-bronpositie van maximaal twee minuten oud; anders is de rij niet interactief.

De gebundelde 397 stations komen uit [Rijden de Treinen / NS](https://www.rijdendetreinen.nl/open-data/stations), CC0, de gepubliceerde Nederlandse stationslijst van september 2023. Bron, downloadadres en versie staan in `packages/domain-rail/stations.json`; nieuwere stations of naamswijzigingen vereisen een catalogusupdate. Er worden geen perrons of voorzieningen verondersteld op basis van deze puntlocaties.

## Eerdere bouwfases

Fase 11 voegt het productierijpe fundament toe: echte PostGIS-historie, persistence-health, Prometheus-metrics, een beveiligde reverse-proxyroute, productiecontainers en continue kwaliteitscontrole. De file-backed ontwikkelmodus blijft beschikbaar.

Fase 10 voegt deterministische treinreplay en herbruikbare 3D-stations toe. Historische GPS-punten worden opnieuw uit de exact opgeslagen NDOV-payloads opgebouwd; spoorposities worden zichtbaar opnieuw berekend met de vastgepinde graph. De 3D-keten werkt nu voor Utrecht, Amsterdam en Rotterdam Centraal.

Fase 9 blijft het officiële NDW Actueel Beeld leveren: files, ongevallen, werkzaamheden, afsluitingen en veiligheidsmeldingen met brongeometrie, bronupdate en geldigheidsstatus. De rail- en wegdomeinen blijven functioneel gescheiden.

Fase 8 blijft rond Utrecht Centraal een begrensde 3D-detailzone leveren zonder de landelijke waarheidsketen te veranderen. De stationbundel combineert echte ProRail-spoorcurves, actuele BGT-perronvlakken en viewportgestreamde PDOK 3D-gebouwen en terrein.

Fase 7 blijft echte GPS-observaties in heel Nederland aan de ProRail/PDOK-spoor-graaf koppelen. Raw GPS en de afgeleide spoorpositie blijven afzonderlijk bewaard. Een landelijke graph-audit markeert regionale anomalieën en staat een ruimere zoekstraal alleen toe in gezonde zones; zo'n fallback blijft altijd `LOW`.

Fase 5 levert daarvoor de versieerbare officiële spoor-graaf. Fase 4 blijft alle actuele materieeldelen uit de publieke NS-positiefeed vloeiend tonen, zonder voorbij de nieuwste ontvangen GPS-positie te extrapoleren. Fase 3 koppelt de echte InfoPlus-route aan de geselecteerde trein.

## Lokaal starten

Vereist: Node.js 22.13 of nieuwer.

```text
npm install
npm run rail:import-geometry
npm run rail:audit-graph
npm run station3d:build
npm run dev:phase11
```

Open daarna `http://localhost:3000`. De realtime gateway draait op `http://127.0.0.1:8081`.

De eerste verbinding kan enkele seconden wachten op de volgende NDOV-publicatie. Er wordt geen mockdata getoond als de bron niet bereikbaar is.

## Wat Fase 2 tot en met 11 doen

```text
NDOV NS-treinposities
  → alle actuele materieeldelen per bronbericht
  → dedupe en ordering per voertuig
  → begrensd livevenster van vijf minuten
  → één WebSocket-vlootbatch per bronupdate
  → onafhankelijke treinselectie per browser
  → landelijke MapLibre-laag zonder honderden HTML-markers

NDW Actueel Beeld
  → officiële gzip-DATEX II v3-snapshot via HTTPS
  → exacte raw bytes + SHA-256 en ontvangstjournaal
  → begrensde XML-parser, schema-/domeinvalidatie en quarantine
  → dedupe op event-id en bronversie; geometriewijzigingen als upsert
  → ACTIVE, PLANNED, STALE en ENDED op brontijd en geldigheid
  → file-backed live-state + Redis wanneer REDIS_URL staat
  → REST-snapshot en WebSocket-delta's
  → afzonderlijke, schakelbare kaartlagen met clustering van puntmeldingen
  → bronleverancier en bronupdate zichtbaar; ontbrekende velden blijven onbekend

Geselecteerde trein + InfoPlus RIT v5
  → beide exacte gzip-bronberichten + SHA-256
  → afzonderlijke begrensde XML-decoders
  → ritten geordend op producttijd
  → koppeling op treinnummer + lokale dienstdatum (DERIVED)
  → file-backed live state (+ Redis wanneer REDIS_URL staat)
  → vlootprotocol WebSocket v2 + ritsnapshot
  → kaart + echte route, volgende halte, spoor, vertraging en bestemming

Client rendering
  → requestAnimationFrame-loop met begrensde kaartupdates
  → 12 seconden buffer op basis van de gemeten broncadans
  → lineaire WGS84-interpolatie tussen bekende punten
  → geen extrapolatie of spoorclaim
  → beweging stopt bij stale data of onwaarschijnlijke GPS-sprong
  → zichtbare bronpositie naast rendered positie
  → reproduceerbare renderconfidence met uitklapbare componenten

ProRail / PDOK spoorbasis
  → exacte, gepagineerde OGC-snapshots met SHA-256
  → bestaande spoorassen én wisselgeometrie als operationele edges
  → nodes uitsluitend op echte lijneindpunten; geen verbinding op een visuele kruising
  → versie, bronpublicatiedatum, licentie en lineage in een manifest
  → lokale bbox-grid en voorbereide PostGIS GIST-indexen
  → gzip-GeoJSON voor de landelijke MapLibre-laag

Landelijke map matching
  → candidate lookup binnen een configureerbare straal van 75 meter
  → projectie op de echte brongeometrie
  → afstand, heading, GPS-kwaliteit, vorige edge en graafconnectiviteit als uitlegbare componenten
  → HIGH, MEDIUM, LOW, NO_CANDIDATES, AMBIGUOUS of REJECTED_SUSPICIOUS
  → raw GPS blijft naast de afgeleide spoorpositie zichtbaar en opgeslagen
  → debugweergave voor kandidaten, scores en gekozen edge
  → graph-audit per zone van 0,25° met zichtbare NORMAL, CAUTION, SPARSE en BLOCKED kwaliteit
  → regionale fallback tot 125 meter uitsluitend in NORMAL-zones en altijd als LOW gelabeld
  → landelijke schaal-, uitkomst- en afstandsmeting zonder ongefundeerde accuracyclaim
  → nog geen routeprediction, werkelijke wisselstand of bewezen rijrichting

Gegeneraliseerde stations-3D
  → Utrecht, Amsterdam en Rotterdam Centraal via één versieerbare bundelketen
  → respectievelijk 439/632/317 lokale railcurves en 22/21/16 actuele BGT-perronobjecten
  → lokale ENU-achtige metercoördinaten rond de officiële ProRail-stationspositie
  → afzonderlijke linker- en rechterrail, ballast, dwarsliggers, wisselcurves en geëxtrudeerde perrons
  → live gematcht materieel als bron-neutrale enkele unit
  → expliciet niet-live bochtproef waarin vier bakken ieder afzonderlijk de curve volgen
  → PDOK 3D Basisvoorziening 2025 voor gebouwen en terrein, uitsluitend bij geopende detailzone
  → viewport/LOD-culling, maximaal vier downloads, twee parses en 96/192/256 MB devicebudget
  → sluiten van de detailzone ontlaadt tiles en WebGL-objecten

Deterministische treinreplay
  → maximaal twee uur uit exact opgeslagen, gehashte NDOV-payloads
  → bronpunten op oorspronkelijke GPS-tijd, zonder verwerkingstijd als historisch feit
  → spoorpositie opnieuw berekend met graph-hash en matchermethode in de response
  → bronspoor, bronpunt en herberekend matchpunt afzonderlijk zichtbaar
  → afspeelsnelheid 0,5×/1×/2×/4× en een expliciet niet-live label

Productierijp fundament
  → idempotente PostGIS-historie voor observaties, matches, ritversies en NDW-events
  → Redis voor live-state en pub/sub; file-backed fallback blijft beschikbaar
  → Prometheus-metrics voor bronkwaliteit, WebSockets en persistence
  → productiecompose met migratie, bronbootstrap, gateway, web en Nginx
  → same-origin WebSocket/REST in productie met rate limits en securityheaders
  → continue typecheck, lint, tests, build en productie-audit
```

Ruwe positieberichten komen lokaal in `var/raw/rail/`, ruwe ritberichten in `var/raw/rail-journey/`, NDW-snapshots in `var/raw/road/` en exacte PDOK-pagina's in `var/raw/rail-geometry/`; deze mappen staan in `.gitignore`. De actuele rail- en wegstate staat in `var/live/`. Zet voor Redis bijvoorbeeld `REDIS_URL=redis://127.0.0.1:6379`.

De huidige positie-envelope is specifiek de NS-interface. Andere railvervoerders worden pas toegevoegd nadat een werkelijke positiebron en een betrouwbare identiteitskoppeling per vervoerder zijn bewezen; de interface noemt deze dekking daarom niet ten onrechte landelijk volledig.

De NS Reisinformatie API-adapter is server-only en optioneel. Zonder `NS_API_KEY` blijft hij expliciet `DISABLED_CONFIG`; InfoPlus levert dan nog steeds de actuele stations en ritcontext. Er wordt nooit een fictief NS API-antwoord gebruikt.

De meegeleverde lokale PostGIS/Redis-infrastructuur staat in `infra/docker/compose.yml`. Docker is optioneel voor de file-backed ontwikkelmodus. Op deze ontwikkelmachine is Docker Desktop wel geïnstalleerd, maar de engine stopt momenteel door een ontoegankelijke achtergebleven runtime-socket. Zie `docs/phase-11.md` voor de veilige herstelroute.

## Controles

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run benchmark:journey-decode
npm run benchmark:track-match
npm run rail:measure-match-quality
npm run benchmark:station3d
npm run benchmark:road-decode
npm run benchmark:replay
npm run station3d:validate-source
```

Meer details en aantoonbare evidence staan in [docs/phase-11.md](docs/phase-11.md), [docs/phase-10.md](docs/phase-10.md) en de eerdere fasedocumenten. De broninventarisatie en bekende voorwaarden staan in [docs/data-sources.md](docs/data-sources.md).
