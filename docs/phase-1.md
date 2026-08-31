# Fase 1 — echte treinvertical slice

Status: **werkende lokale vertical slice, 20 augustus 2026**.

## Aantoonbare live-ontvangst

De adapter heeft op 20 augustus 2026 daadwerkelijk multipartberichten ontvangen van:

```text
tcp://pubsub.besteffort.ndovloket.nl:7664
/RIG/NStreinpositiesInterface5
```

Een gecontroleerde observatie uit die sessie:

```text
treinnummer       8667
materieel         2015
GPS-meettijd      2026-08-20T18:53:06.000Z
ontvangsttijd     2026-08-20T18:53:12.153Z
latitude          52.0400346667
longitude         4.64963833333
kaartmatching     NOT_APPLIED
payload SHA-256   fc622ee555ec64134f64baabab801ef19bd7b58fc9c4af6fcce84394468f13d1
```

Dit record is geen fixture of handgeschreven demo-inhoud. Testfixtures staan apart in `workers/rail-ingestion/fixtures.ts` en komen nooit in de productiestroom terecht.

## Datapad en garanties

1. De ZeroMQ Subscriber neemt alleen het expliciete Interface-5 topic af.
2. Het gzip-frame wordt vóór parsing content-addressed opgeslagen. Een dagjournal bewaart topic, endpoint, ontvangsttijd, lengte, encoding, schema-id en checksum.
3. De decoder begrenst compressed en expanded size, weigert DTD/entities en valideert root, namespace, cardinaliteit, bekende wirevelden en de XSD-datatypen die voor de positie relevant zijn.
4. `GpsDatumTijd`, `GeneratieTijd`, publicatietijd en ontvangsttijd blijven aparte velden. Een leeg bronveld blijft `null`.
5. Longitude en latitude blijven het exacte ontvangen WGS84-punt. Er wordt niet gesnapt.
6. Snelheid verschijnt uitsluitend als `MEASURED_GPS`.
7. Fresh/stale gebruikt `GpsDatumTijd`; ontvangsttijd geldt niet als bewijs voor een recente meting.
8. De gevolgde live state accepteert geen duplicate of oudere GPS-meettijd.
9. REST geeft een snapshot; WebSocket-protocol v1 geeft snapshot/delta en ondersteunt een gerichte resync.
10. De UI toont bron, beide tijden, bronleeftijd, position origin, kaartmatchstatus en onbekende waarden.

## Opslag

De lokale ontwikkelmodus gebruikt een append-only, content-addressed raw store en een atomisch vervangen live-statebestand. Bij `REDIS_URL` wordt dezelfde geaccepteerde live bronstate daarnaast atomisch met TTL in Redis geschreven en via `rail:vehicle:updates` gepubliceerd.

De Docker Compose-definitie levert Redis en PostgreSQL/PostGIS. PostgreSQL is in deze slice nog niet de raw store; de overgang kan later achter hetzelfde storage-contract gebeuren zonder het wire- of protocolmodel te wijzigen.

## Acceptatie en controles

Geautomatiseerd:

- geldige decode met exact punt, null-tijden en gemeten snelheid;
- schema-drift-quarantaine;
- DTD/entity-blokkade;
- duplicate- en out-of-order-bescherming;
- stale op brontijd;
- exacte raw-byteopslag plus dagjournal;
- TypeScript strict, ESLint en productiebuild.

Handmatig tijdens deze implementatie:

- echte feedverbinding en meerdere opeenvolgende updates;
- gezonde `/health` response;
- versie-1 REST-snapshot met echte observatie;
- lokale webpagina op HTTP 200.

De decodebenchmark op een echt gzip-bericht van 12.470 bytes met 295 observaties draaide 100 iteraties in 1.234,36 ms: gemiddeld 12,344 ms per volledig bericht op deze werkplek. Dit is een lokale referentiemeting, geen landelijke SLO.

## Bekende beperkingen van Fase 1

- Er wordt bewust maar één materieeldeel gevolgd. Landelijke selectie en viewportabonnementen horen bij een latere fase.
- Geen kaartmatching, ritverrijking, interpolatie, prediction of 3D.
- `GeneratieTijd` is in de waargenomen berichten leeg; `sourceGeneratedAt` blijft daarom `null`. Een feed-publicatietijd ontbreekt en blijft ook `null`.
- De XSD op NDOV Loket draagt nog de bronversie uit 2016. De lokaal gepinde schemarepresentatie moet bij upstream wijziging bewust worden bijgewerkt; onbekende velden gaan nu naar quarantaine.
- Redis-integratie is geïmplementeerd, maar kon op deze werkplek niet tegen een lokale Redis-container worden uitgevoerd omdat Docker niet is geïnstalleerd. De file-backed keten en protocoltests zijn wel uitgevoerd.
- De MapLibre-client gebruikt OpenStreetMap-rastertiles en toont de vereiste attributie. Productiegebruik moet het tilebeleid en de verwachte belasting apart regelen.
- De bundler meldt dat de MapLibre-clientchunk groter is dan 500 kB. Verdere code-splitting is een latere performanceverbetering; de build slaagt.
- `npm audit --omit=dev` rapporteert 0 productiekwetsbaarheden. De volledige audit rapporteert nog 20 meldingen in de ontwikkel-/vinext-toolchain; geen `--force`-upgrade is uitgevoerd omdat dat breaking wijzigingen kan introduceren.
