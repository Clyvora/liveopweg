# MobilityRadar NL

MobilityRadar NL maakt Nederlandse mobiliteitsdata realtime zichtbaar met een expliciet onderscheid tussen bronfeit, afleiding en onbekende informatie.

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
npm run dev:phase10
```

Open daarna `http://localhost:3000`. De realtime gateway draait op `http://127.0.0.1:8081`.

De eerste verbinding kan enkele seconden wachten op de volgende NDOV-publicatie. Er wordt geen mockdata getoond als de bron niet bereikbaar is.

## Wat Fase 2 tot en met 10 doen

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
```

Ruwe positieberichten komen lokaal in `var/raw/rail/`, ruwe ritberichten in `var/raw/rail-journey/`, NDW-snapshots in `var/raw/road/` en exacte PDOK-pagina's in `var/raw/rail-geometry/`; deze mappen staan in `.gitignore`. De actuele rail- en wegstate staat in `var/live/`. Zet voor Redis bijvoorbeeld `REDIS_URL=redis://127.0.0.1:6379`.

De huidige positie-envelope is specifiek de NS-interface. Andere railvervoerders worden pas toegevoegd nadat een werkelijke positiebron en een betrouwbare identiteitskoppeling per vervoerder zijn bewezen; de interface noemt deze dekking daarom niet ten onrechte landelijk volledig.

De NS Reisinformatie API-adapter is server-only en optioneel. Zonder `NS_API_KEY` blijft hij expliciet `DISABLED_CONFIG`; InfoPlus levert dan nog steeds de actuele stations en ritcontext. Er wordt nooit een fictief NS API-antwoord gebruikt.

De meegeleverde lokale PostGIS/Redis-infrastructuur staat in `infra/docker/compose.yml`. Docker is optioneel voor de file-backed ontwikkelmodus. Op deze ontwikkelmachine is Docker Desktop wel geïnstalleerd, maar de engine kan niet starten zolang virtualisatie in Windows/firmware niet beschikbaar is.

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

Meer details en aantoonbare evidence staan in [docs/phase-10.md](docs/phase-10.md) en de eerdere fasedocumenten. De broninventarisatie en bekende voorwaarden staan in [docs/data-sources.md](docs/data-sources.md).
