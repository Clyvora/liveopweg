# Fase 7 — landelijke map matching

Datum: 21 augustus 2026

## Resultaat

De uitlegbare matcher uit fase 6 verwerkt nu alle actuele NS-posities binnen het expliciete Nederlandse werkgebied. Iedere afleiding verwijst naar dezelfde versie van de ProRail/PDOK-graaf. Het ontvangen GPS-punt blijft ongewijzigd bewaard naast een eventuele afgeleide spoorpositie.

De normale zoekstraal blijft 75 meter. Als daar geen kandidaat ligt, mag de matcher alleen in een door de graph-audit als `NORMAL` beoordeelde zone nogmaals zoeken tot 125 meter. Een match uit deze regionale fallback wordt nooit opgewaardeerd: status `MATCHED_LOW_REGIONAL_FALLBACK`, confidence `LOW`, plus reden, primaire straal en effectieve straal in het protocol. In `CAUTION`, `SPARSE`, `BLOCKED` of onbekende zones blijft de ruimere zoekactie geblokkeerd.

## Graph-audit

`npm run rail:audit-graph` analyseert de geïmporteerde graaf zonder deze te muteren en schrijft `var/rail-geometry/graph-audit.json`. De audit controleert:

- ongeldige edges;
- edges korter dan 2 meter of langer dan 20 kilometer;
- dangling nodes;
- kleine verbonden componenten van maximaal twee edges;
- regionale dekking in vaste zones van 0,25 graad.

De huidige PDOK-snapshot bevat 27.702 nodes en 30.155 edges. Er zijn geen ongeldige edges gevonden. De audit rapporteert 218 korte edges, 9 lange edges, 3.973 dangling nodes, 547 verbonden componenten en 347 kleine componenten. Van de 89 aanwezige zones zijn er 72 `NORMAL`, 15 `CAUTION`, 2 `SPARSE` en 0 `BLOCKED`; alleen de 72 normale zones laten fallback toe. Dit zijn signalen voor voorzichtige matching, geen automatische correcties van brongeometrie.

## Realtime contract en opslag

- `GET /v1/matches/rail` levert de landelijke snapshot; de oude Utrecht-route blijft tijdelijk een compatibiliteitsalias.
- De WebSocket-berichten `rail.match.snapshot` en `rail.match.batch` gebruiken regio `NETHERLANDS`.
- `GET /v1/geometry/rail/audit` levert de graph-audit.
- `/health.sources.nationalTrackMatcher` en `/health.sources.railGraphAudit` maken matcher- en auditstatus zichtbaar.
- Afgeleide state wordt atomisch geschreven naar `var/live/rail-track-matches.json`.
- Het PostGIS-model bevat nu landelijke regio, zonekwaliteit en fallbackvelden.

Wanneer de audit ontbreekt, blijft primaire 75-metermatching mogelijk maar rapporteert health `DEGRADED_AUDIT`; regionale fallback is dan overal geblokkeerd.

## Schaal- en kwaliteitsmeting

De reproduceerbare opdrachten zijn:

```text
npm run rail:measure-match-quality
npm run benchmark:track-match
```

Een actuele live steekproef van 369 observaties produceerde 369 landelijke matchresultaten. Daarvan waren 63 geaccepteerd: 39 `HIGH`, 21 `MEDIUM`, 2 `LOW` en 1 regionale fallback. Verder bleven 229 observaties expliciet ambigu en hadden 77 geen kandidaten. De p95-afstand van geaccepteerde matches was 21,41 meter. Er waren 45 fallbackpogingen; één daarvan leverde een ondubbelzinnige lage match op.

De performancemeting berekende 36.900 resultaten tegen 30.155 edges. Gemiddeld duurde één match 0,717 ms; p50 0,469 ms, p95 2,334 ms en de gemeten maximumwaarde 16,646 ms. De lokale bbox-grid voorkomt een volledige graphscan.

Deze live verdeling meet dekking, uitkomstgedrag, afstand en rekentijd. Er is nog geen landelijk gelabelde ground-truthset, dus zij bewijst geen spoor-accuracy en kalibreert de interne score niet als kanspercentage. Het rapport legt dat expliciet vast als `NOT_MEASURED_WITHOUT_LABELLED_GROUND_TRUTH`.

## UI

De kaart toont landelijke aantallen voor geaccepteerde, ambigue en regionale fallbackmatches. Bij een geselecteerde trein zijn zonekwaliteit, zone-id, zoekstraal, fallbackstatus en graphredenen zichtbaar. Raw GPS, afgeleide spoorpositie en hun verbindingslijn blijven afzonderlijk getoond.

## Tests en bekende beperkingen

De tests dekken landelijke scope, succesvolle fallback in een gezonde zone, geblokkeerde fallback in een schaarse zone, ambiguïteit, continuïteit, verdachte sprongen, protocolvalidatie, graph-audit en atomische state.

- De Nederlandse werk-bbox is een operationele begrenzing, geen landsgrenspolygoon; een klein grensgebied kan geometrisch binnen de bbox vallen.
- De audit detecteert structurele signalen maar bewijst niet dat elke edge operationeel berijdbaar is.
- Routealignment, actuele wisselstand en bewezen rijrichting ontbreken nog en blijven in het contract `UNAVAILABLE`.
- Veel parallelle sporen blijven bewust ambigu; er wordt geen positie verzonnen om de dekkingsratio te verhogen.
- Alleen de NS-positie-interface is aangesloten. “Landelijk” beschrijft de matching-scope, niet alle Nederlandse vervoerders.
- De live kwaliteitssnapshot verandert met de actuele vloot en is geen vast productpercentage.
- Publieke hosting is nog niet compleet: de realtime gateway gebruikt lokale ZeroMQ- en WebSocket-verbindingen en heeft nog geen extern bereikbare productie-ingress.
