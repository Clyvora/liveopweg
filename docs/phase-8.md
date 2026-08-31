# Fase 8 — Utrecht Centraal 3D

Datum: 21 augustus 2026

## Resultaat

MobilityRadar NL heeft nu een lokale 3D-detailzone rond Utrecht Centraal. De bestaande landelijke kaart en realtime waarheidsketen blijven leidend; de 3D-zone is een aanvullende renderlaag die pas na expliciet openen data en grafische resources laadt.

De laag combineert:

- ProRail/PDOK-spoorassen en wissels uit dezelfde graphversie als de landelijke matcher;
- actuele BGT-perronvlakken uit `kunstwerkdeel_vlak`;
- 3D Tiles Gebouwen en Terreinen uit de PDOK 3D Basisvoorziening, hoogtesituatie 2025;
- gematchte live treineenheden binnen de stationzone;
- een zichtbaar als niet-live gelabelde vierbaks bochtproef.

## Stationbundel en lokale coördinaten

`npm run station3d:build-utrecht` haalt de actuele BGT-selectie op, bewaart de exacte response met SHA-256 en schrijft atomisch `var/station-bundles/utrecht-centraal.json`. De huidige bundel is 452.766 bytes en bevat 439 railcurves, 4.160 railpunten, 22 actuele perronobjecten en 5.119 perronpunten.

De officiële ProRail-stationspositie van Utrecht Centraal is de lokale oorsprong: `5.1089276663, 52.0907868206`. Binnen de maximaal 1.500 meter brede detailcontext worden WGS84-coördinaten vertaald naar meters met assen `EAST`, `NORTH`, `UP`. Three.js verwerkt daardoor kleine lokale getallen in plaats van wereldcoördinaten, wat floating-point-jitter beperkt. Tests controleren de omzetting en exacte inverse binnen deze lokale benadering.

De gateway levert de bundel via `GET /v1/stations/utrecht-centraal/3d`; `/health.sources.utrechtStation3d` rapporteert `READY` zodra het bestand beschikbaar is.

## Rails, wissels en perrons

De procedurele Three.js-laag gebruikt per spoorcurve:

- een ballastbed met kleine negatieve hoogte-offset;
- afzonderlijke linker- en rechterrail op 1.435 meter spoorwijdte;
- dwarsliggers op een LOD-afstand van 2,4 meter, met een harde bovengrens van 8.000 instances;
- officiële wisselcurves uit de ProRail-collectie `wissel`;
- geëxtrudeerde actuele BGT-perronpolygonen.

De offsets zijn renderkeuzes tegen z-fighting. Zij zijn geen claim over gemeten spoor-, ballast- of perronhoogte.

## Treinen door bochten

Iedere bak wordt op een eigen afstand langs een polyline gesampled en krijgt daar zijn eigen positie en tangent. Een vierbaks technologieproef maakt dit zichtbaar: de bakken staan 19,2 meter uit elkaar langs de curve en draaien afzonderlijk mee. Deze oranje trein is duidelijk gelabeld als `bochtproef · niet live`.

Een live NDOV-observatie bewijst geen GPS-referentiepunt, baklengte of volledige samenstelling. Daarom rendert een geaccepteerde live match voorlopig als één bron-neutrale unit. De applicatie verzint geen meerbakscompositie om de demo indrukwekkender te maken.

## PDOK 3D streaming en budget

De 3D Tiles-lagen gebruiken de officiële PDOK-endpoints voor gebouwen en terrein. De op 21 augustus 2026 gecontroleerde collecties zijn op 1 juli 2026 bijgewerkt en bevatten hoogtesituatie 2025. Een eerste GLB-tile ondersteunt byte-range requests en wildcard-CORS.

De detailkaart is begrensd tot Utrecht Centraal en gebruikt:

- cameragestuurde 3D Tiles traversal, frustumculling en LOD;
- LRU-cache met automatische unloading;
- maximaal vier gelijktijdige downloads en twee parses per tileset;
- een totaal geheugenbudget van 96 MB op lichte, 192 MB op standaard- en 256 MB op zwaardere apparaten;
- 38% van het budget voor terrein en 62% voor gebouwen;
- volledige disposal bij het sluiten van de 3D-zone.

Bij een uitgevallen PDOK 3D-service blijft de lokale spoor-/perronlaag conceptueel de fallback; de UI rapporteert de tiles dan als `DEGRADED`. De landelijke 2D-kaart blijft onafhankelijk werken.

## Camera en toegankelijkheid

De gebruiker kan kiezen tussen overzicht, perrons en de geselecteerde live trein. `prefers-reduced-motion` schakelt vloeiende cameravluchten om naar directe camerawissels. De detailzone start alleen na de knop `Open 3D Utrecht` en kan volledig worden gesloten om geheugen vrij te geven.

## Performancecontrole

`npm run benchmark:station3d` voerde 7.800 compositieberekeningen uit en plaatste 46.800 afzonderlijke bakken. Gemiddeld duurde één zesbaksberekening 0,0079 ms; p95 was 0,0215 ms en het maximum 0,769 ms. Dit meet de curveplaatsing, niet de uiteindelijke GPU-framerate: werkelijke frameprestatie hangt af van apparaat, viewport en geladen PDOK-tiles.

`npm run station3d:validate-source` controleert beide tilesetroots en een byte-range uit de eerste bereikbare GLB-tile. Zo worden endpoint-, formaat- en CORS-problemen zichtbaar vóór lokaal gebruik.

## Bekende beperkingen

- Er is nog geen betrouwbare bron voor baklengte, volledige treinsamenstelling of de precieze GPS-antennepositie.
- De stationsbundel bevat geen bewezen metrische koppeling tussen railhoogte en perronhoogte.
- PDOK 3D Tiles zijn visualisatiegeometrie en geen bewijs van operationele spoorhoogte.
- Bovenleiding, seinen, perronmeubilair en een materieel-specifiek GLB-model zijn nog niet toegevoegd.
- Het algemene PDOK-terrein kan lokaal over procedurele spoorlagen lopen; kleine depth-offsets verminderen dit, maar lossen bronhoogteverschillen niet semantisch op.
- De bundle-bbox is rechthoekig en bevat ook objecten buiten het formele stationsareaal.
- Een echte GPU-/FPS-meting vereist expliciete browser-QA op meerdere apparaatklassen en is in deze fase niet als vaste prestatieclaim opgenomen.
- Externe Sites-publicatie blijft geblokkeerd zolang de NDOV/InfoPlus- en WebSocket-gateway alleen lokaal bereikbaar zijn.
