# Fase 9 — NDW Actueel Beeld

Status: **operationele vertical slice op 21 augustus 2026**.

## Resultaat

Fase 9 haalt één echte, officiële NDW-feed server-side op:

```text
https://opendata.ndw.nu/actueel_beeld.xml.gz
```

De feed is een volledige DATEX II v3 `SituationPublication`. De gateway pollt standaard iedere 60 seconden, bewaart de exacte gzip-bytes content-addressed met SHA-256, valideert de begrensde XML en normaliseert ieder bruikbaar `situationRecord` naar een apart road-domeinmodel.

De webkaart toont afzonderlijk schakelbare lagen voor:

- files;
- ongevallen en incidenten;
- werkzaamheden en tijdelijke snelheidsmaatregelen;
- afsluitingen;
- veiligheids-, weer- en obstakelmeldingen.

Puntmeldingen clusteren per categorie op lage zoom. Lijnen en meerdere lijnsegmenten blijven de door NDW geleverde WGS84-geometrie. Een geselecteerde melding toont uitsluitend geleverde velden, waaronder leverancier, bronupdate, start/einde, filelengte, vertraging en tijdelijke snelheidslimiet.

## Waarheidsketen

```text
NDW Actueel Beeld .xml.gz
  → exact raw object + ontvangstjournaal
  → gzip-limiet 10 MB / XML-limiet 64 MB
  → DTD/entities geblokkeerd
  → DATEX II SituationPublication-validatie
  → Point / LineString / MultiLineString uit bron
  → Zod road-eventcontract
  → complete-snapshot dedupe en geldigheid
  → file-backed live-state (+ Redis indien geconfigureerd)
  → REST /v1/road/events
  → WebSocket snapshot + batches
  → MapLibre-lagen en bronpaneel
```

De decoder gebruikt bij een itinerary uitsluitend `gmlLineString/posList`. Alleen wanneer zo'n lijn ontbreekt wordt een expliciet `pointByCoordinates` gebruikt. Alert-C-referenties worden niet zelf naar geometrie vertaald: zonder bruikbare broncoördinaten wordt een record met `MISSING_GEOMETRY` afgewezen.

## Snapshot- en tijdregels

- Identiteit: samengestelde `situationId:sourceRecordId`.
- Duplicaten binnen één snapshot: hoogste bronversie, daarna nieuwste `situationRecordVersionTime`.
- Geometriewijziging op dezelfde id: WebSocket-upsert.
- Id ontbreekt in volgende volledige snapshot: verwijderen.
- `validFrom` in de toekomst: `PLANNED`.
- Geldig en recente publicatie: `ACTIVE`.
- Publicatie ouder dan drie minuten: `STALE`.
- `validUntil` bereikt: `ENDED` en uit zicht/live-state verwijderd.
- Ontbrekende eindtijd wordt nooit verzonnen.

## Opslag

Ontwikkelmodus werkt zonder Docker:

```text
var/raw/road/ndw-actueel-beeld/messages/{sha256}.xml.gz
var/raw/road/ndw-actueel-beeld/journal/{date}.ndjson
var/live/road-events.json
```

Met `REDIS_URL` schrijft de gateway actuele events met eindige TTL en publiceert alleen gewijzigde/verwijderde ids. `infra/postgis/003_road_events.sql` bereidt versiehistorie, geldigheidsindexen en een GIST-geometrie-index voor. De huidige lokale vertical slice schrijft nog niet naar PostGIS omdat de database optioneel is.

## Actuele bronmeting

Op 21 augustus 2026 was een gecontroleerde snapshot ongeveer 260 kB gecomprimeerd en 2,84 MB uitgepakt. Hij bevatte ruim vijfhonderd situations en bijna achthonderd records, waaronder `AbnormalTraffic`, `Accident`, `MaintenanceWorks`, `RoadOrCarriagewayOrLaneManagement`, `SpeedManagement` en veiligheidsgerelateerde obstakels. Dit zijn meetwaarden van één moment, geen gegarandeerde vaste omvang of dekking.

NDW beschrijft Actueel Beeld als een bundeling van ongevallen/incidenten, wegtoestand, weer, files, SRTI, werkzaamheden, afsluitingen en tijdelijke snelheden. De pull-protocoldocumentatie adviseert 60 seconden en minimaal 30 seconden. De UI vermeldt expliciet dat leveranciersinformatie ongevalideerd kan zijn.

## Controles

De Fase 9-tests dekken:

- dubbele event-ids en bronversieselectie;
- geometriewijzigingen;
- start/einde en gepland versus actief;
- verlopen en uit snapshot verdwenen events;
- ontbrekende geometrie;
- meerdere bronsegmenten;
- malafide of ongeldige DATEX II;
- server-rendering van alle vijf weglagen.

Uitvoeren:

```text
npm run typecheck
npm run lint
npm test
npm run benchmark:road-decode
npm audit --omit=dev
```

## Bekende grenzen

- Dit is bewust één echte feed; aparte SRTI-, plannings- en afsluitingsfeeds zijn niet dubbel aangesloten omdat Actueel Beeld ze al bundelt.
- Snelheids- en reistijdmeetwaarden vragen MeasurementSite-referenties en vallen buiten deze event-slice.
- Een wegnaam ontbreekt in veel records; de UI toont dan `Niet meegeleverd`.
- Alert-C-only records krijgen geen zelf berekende positie.
- Juridische bewaartermijn en herpublicatievoorwaarden moeten vóór publieke productie per NDW-product definitief worden vastgelegd.
- De Site kan niet zelfstandig publiek worden gehost zolang de huidige architectuur een aparte stateful realtime gateway en lokale NDOV ZeroMQ-verbinding vereist.

## Bronnen

- [NDW Situatieberichten v3](https://docs.ndw.nu/producten/situatieberichten-v3/)
- [NDW DATEX II v3 basisstructuur](https://docs.ndw.nu/dataformaten/datex2-v3/)
- [NDW Actueel Beeld — file](https://docs.ndw.nu/dataformaten/datex2-v3/situatieberichten/actueel-beeld/file/)
- [NDW ketenprotocol situatieberichten v3](https://docs.ndw.nu/data-uitwisseling/interface-beschrijvingen/ketenprotocol-sb-v3/)
- [NDW open-data-index](https://opendata.ndw.nu/)
