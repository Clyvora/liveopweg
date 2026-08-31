# Fase 3 — Journey enrichment

Status op 21 augustus 2026: de Fase 3-keten werkt lokaal op echte NDOV/InfoPlus-data en wisselt mee met de trein die een gebruiker in de inmiddels voltooide Fase 2-vloot selecteert.

## Geleverde keten

```text
/RIG/NStreinpositiesInterface5 ─┐
                                ├─ exact treinnummer + Nederlandse dienstdatum
/RIG/InfoPlusRITInterface5 ─────┘
  → destination
  → stationsvolgorde
  → geplande en actuele aankomst/vertrek
  → geplande en actuele sporen
  → exacte InfoPlus-vertraging
  → stopstatus en wijzigingen
  → volgende halte in de client
```

Ieder ontvangen RIT-bericht wordt eerst exact als gzip opgeslagen en krijgt een SHA-256. Daarna controleert de decoder de gzipgrenzen, XML-veiligheid, namespaces en het vastgelegde RIT v5-wirecontract. De actuele rit per `treindatum + treinnummer` wordt alleen vervangen door een product met een nieuwere `TimeStamp`; duplicaten en oudere berichten worden geweigerd.

De positie/rit-koppeling is een afleiding, geen bronveld. Daarom draagt ieder WebSocket-bericht expliciet `origin: DERIVED` en `method: TRAIN_NUMBER_AND_LOCAL_SERVICE_DATE`. Omdat InfoPlus ook dagen vooruit publiceert, wordt een rit nooit alleen wegens aanwezigheid als live beschouwd.

## Live bewijs

Tijdens de eindcontrole op 20 augustus 2026 volgde de applicatie:

- materiaal `2769`, treinnummer `5879`;
- positiebrontijd `2026-08-20T19:55:12Z`;
- exact gekoppelde RIT voor treinnummer `5879` en dienstdatum `2026-08-20`;
- actuele en geplande bestemming `Amersfoort Centraal`;
- 11 bronstations;
- positiebron en ritbron beide `HEALTHY`.

De REST-routes `/v1/snapshot` en `/v1/journey` leverden dezelfde treinidentiteit. Een WebSocket-resync leverde in volgorde een positie-snapshot en een rit-snapshot, en herhaalde beide na een geldig resyncverzoek.

## NS API

De stationsadapter voor `GET /reisinformatie-api/api/v2/stations` is server-only, gebruikt `Ocp-Apim-Subscription-Key`, heeft een timeout, responsgrens en cache. Er is op deze machine geen `NS_API_KEY`; daarom is de status aantoonbaar `DISABLED_CONFIG` en is geen ongeautoriseerd of fictief stationsantwoord gebruikt. De actuele stationsnamen komen rechtstreeks uit InfoPlus RIT. Na het toevoegen van een geldige sleutel moet het geautoriseerde NS-responsschema nog als apart contract worden vastgelegd voordat enrichment wordt ingeschakeld.

## Opslag en Docker

File-backed live state is de werkende ontwikkelmodus. Redis-mirroring bestaat voor zowel posities als ritten wanneer `REDIS_URL` beschikbaar is. `infra/docker/compose.yml` bevat PostGIS en Redis.

Docker Desktop 4.87.0, Docker 29.7.2 en Compose 5.4.0 zijn geïnstalleerd. De engine start op deze machine niet omdat Docker Desktop meldt dat virtualisatieondersteuning niet is gedetecteerd. Daarom zijn de containers niet als draaiend geclaimd en is de werkende file-backed modus gebruikt. Het inschakelen van firmware-/Windowsvirtualisatie is een beheeractie buiten deze codefase.

## Verificatie

```text
npm run typecheck
npm run lint
npm test
npm run benchmark:journey-decode
```

De fixtures controleren bron/actueel-onderscheid, spoor en vertraging, duplicate/out-of-order-bescherming en de server-only NS API-cache. De decoderbenchmark gebruikt een werkelijk opgeslagen, aan de gevolgde trein gekoppeld gzip-bericht.

Officiële bron: [NDOV InfoPlus RIT-documentatie](https://data.ndovloket.nl/docs/infoplus/RIT/) en de [RIT v5 WSDL/XSD-bundel](https://data.ndovloket.nl/docs/infoplus/RIT/RIT-v5-wsdl-xsd.zip). De vastgelegde checksums staan in `schemas/rit-v5-manifest.json`.
