# Fase 10 — generalisatie en replay

## Resultaat

Fase 10 maakt twee eerdere keuzes herbruikbaar zonder nieuwe feiten te verzinnen:

- een trein kan over maximaal twee uur worden teruggekeken vanuit de exact opgeslagen, gehashte NDOV-bronberichten;
- dezelfde 3D-stationketen werkt voor Utrecht Centraal, Amsterdam Centraal en Rotterdam Centraal.

Replay is nadrukkelijk geen livebeeld. De interface toont het oorspronkelijke GPS-bronpunt en een opnieuw berekende spoorpositie afzonderlijk. Renderstate wordt niet opgeslagen of als historisch feit gepresenteerd.

## Deterministische replay

De gateway biedt:

```text
GET /v1/replay/catalog
GET /v1/replay/rail?vehicleId=…&from=…&until=…
```

De reconstructie leest alleen `var/raw/rail/journal/*.ndjson` en de daar genoemde gzip-payloads. Ze decodeert opnieuw, sorteert op GPS-meettijd (met ontvangsttijd als expliciete fallback), dedupliceert op `observationId` en rekent map matching opnieuw uit met de lokaal vastgepinde graph. Verwerkingsvelden `normalizedAt` en `matchedAt` worden weggelaten omdat zij geen bron- of gebeurtenistijd zijn.

Elke response vermeldt:

- `sourceOrigin: STORED_RAW_PAYLOAD`;
- `matchOrigin: RECOMPUTED_WITH_PINNED_GRAPH` of `GRAPH_UNAVAILABLE`;
- de SHA-256 van de gebruikte graph;
- de matchermethode;
- `renderStateStored: false`.

Een aanvraag is begrensd op twee uur, 900 bronberichten en 2.000 frames. Tijdens omvangrijke reconstructies geeft de worker periodiek tijd terug aan de live-eventloop. De UI speelt GPS-tijd af op 0,5×, 1×, 2× of 4× en tekent bronspoor, actueel bronpunt en herberekend matchpunt als drie onderscheiden elementen.

De huidige history-slice bevat positie, snelheid, bronkwaliteit, herkomst en opnieuw berekende route over de spoorgraph. Vertraging-over-tijd en volledige historische ritmutaties zijn nog niet toegevoegd: InfoPlus-ritten worden wel raw opgeslagen, maar de replaykoppeling daarvan vraagt een apart versiecontract.

## Drie stations, één keten

`station3d:build` bouwt drie bundles uit dezelfde landelijke ProRail-graph en per station een actuele BGT-snapshot:

| Station | Officiële feature-id | Railcurves | Actuele perronobjecten |
|---|---:|---:|---:|
| Utrecht Centraal | `09f03bdc-2bcd-5640-aaa4-d8b65408cd11` | 439 | 22 |
| Amsterdam Centraal | `0a743f44-b7b1-58df-bb0b-17bcac293349` | 632 | 21 |
| Rotterdam Centraal | `6b12b5c0-1c77-5ec7-9147-c4323bdacb86` | 317 | 16 |

De aantallen zijn gemeten op 21 augustus 2026 en horen bij de vastgelegde bronversies in iedere bundle. De UI wisselt station zonder een tweede renderimplementatie; de oude WebGL- en tile-state wordt bij iedere wissel opgeruimd.

Materieel wordt nog steeds als één neutrale unit getoond. De publieke positie-envelope bevat een materieelnummer, maar geen bewezen type, baklengtes of samenstelling. Ook worden geen andere vervoerders toegevoegd: de gebruikte positie-interface is NS-specifiek. Daarmee voorkomt Fase 10 dat vormgeving of operatorlabels als bronfeit gaan ogen.

## Controles en grenzen

- unit- en contracttests bewijzen GPS-tijdsortering, verwijdering van verwerkingstijden, bronlabels en de maximale replayduur;
- stationtests bewijzen dat Amsterdam en Rotterdam dezelfde lokale meterketen gebruiken;
- de live benchmark reconstrueert twintig minuten raw archief met landelijke matching binnen een budget van vijf seconden;
- typecheck, lint, productiebuild en server-rendering blijven onderdeel van `npm test` en de fasecontrole;
- productiehosting vereist een permanente gateway met ZeroMQ-ingest, lokale/raw opslag of objectstorage en WebSockets. Een statische frontenddeploy alleen zou de kernfunctionaliteit niet leveren.

De raw-retentie is in deze ontwikkelopstelling lokaal en onbeperkt totdat bestanden handmatig worden beheerd. Voor productie moeten bewaartermijn, verwijdering, redistributie en bronvoorwaarden eerst per dataset worden vastgelegd.
