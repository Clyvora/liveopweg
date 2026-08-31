# Fase 11 — productierijp fundament

## Resultaat

Fase 11 maakt de lokaal bewezen dataketen deploybaar zonder de bronbetekenis te veranderen:

- PostgreSQL/PostGIS krijgt echte versietabellen voor railobservaties, matches, InfoPlus-ritten en NDW-events;
- Redis blijft de kortlevende live-state en pub/sub-laag;
- de gateway publiceert Prometheus-metrics en uitgebreide persistence-health;
- dezelfde frontend gebruikt lokaal poort 8081 en in productie automatisch de same-origin reverse proxy;
- een afzonderlijke productiecompose bouwt web, gateway, PostGIS, Redis, bronbootstrap en migraties;
- Nginx verzorgt WebSocket-upgrades, begrensde API-verzoeken en basis-securityheaders;
- GitHub Actions herhaalt typecheck, lint, tests, build, server-rendering en de productie-audit.

De directe build- en runtimepakketten zijn naar de actuele compatibele versies gebracht. `npm audit --omit=dev` rapporteert nul bekende kwetsbaarheden. De volledige ontwikkelaudit houdt vier gematigde meldingen over in de alleen lokaal gebruikte `drizzle-kit`-keten; de huidige upstreamversie heeft daarvoor nog geen niet-brekende oplossing.

## Persistente geschiedenis

`infra/postgis/004_realtime_history.sql` voegt toe:

- `rail_observation_versions`: raw GPS-geometrie en alle genormaliseerde bronvelden;
- `rail_track_match_versions`: afgeleide match apart van de observatie, inclusief graph-hash en matcher-versie;
- `rail_journey_versions`: iedere geaccepteerde InfoPlus-productversie;
- `source_health_samples`: tijdreeks voor latere beschikbaarheids- en stale-analyses.

NDW-events gebruiken de bestaande `road_event_versions`. Inserts zijn idempotent. De file-backed en raw stores blijven daarnaast actief; PostGIS overschrijft geen bronpayloads. Met `REQUIRE_PERSISTENCE=true` weigert de gateway te starten wanneer de databaseverbinding ontbreekt. Zonder die productieflag blijft lokale file-backed ontwikkeling mogelijk en meldt health `DISABLED_CONFIG` of `DEGRADED`.

Migraties draaien expliciet met:

```text
npm run db:migrate-postgis
```

## Observability

`GET /metrics` levert onder meer:

- railenvelopes, observaties, duplicaten en out-of-order records;
- ouderdom van de nieuwste gemeten bronpositie;
- InfoPlus-berichten en NDW-polls;
- actieve wegmeldingen en WebSocketclients;
- geslaagde en mislukte PostGIS-writes.

De endpoint wordt alleen intern door de gateway aangeboden; de meegeleverde publieke Nginx-route exposeert hem niet.

## Productiecompose

Maak een eigen omgevingsbestand op basis van `infra/docker/production.env.example` en start daarna:

```text
docker compose --env-file infra/docker/production.env -f infra/docker/compose.production.yml up --build -d
```

De bronbootstrap importeert de landelijke ProRail-graph, voert de graph-audit uit en bouwt de drie stationbundels in een persistent volume. De publieke poort is standaard 8080. TLS hoort bij de externe load balancer of hostproxy; publiceer de poort niet rechtstreeks zonder HTTPS.

## Huidige machineblokkade

Op 31 augustus 2026 start Docker Desktop 4.87 niet omdat Windows geen toegang geeft tot de achtergebleven socket `sailor-ingest.sock` in Docker Desktop zijn eigen runtime-map. Een gewone en schone procesherstart loste dit niet op. De productiecompose is daarom statisch gevalideerd maar kon op deze machine nog niet end-to-end worden uitgevoerd. Een Docker Desktop-reparatie of gecontroleerde reset is nodig; voer geen fabrieksreset uit zonder eerst bestaande Docker-volumes te inventariseren of accepteren dat die verloren kunnen gaan.

## Grenzen

- Deze fase maakt de bestaande scope productierijp; zij voegt nog geen KV6, NDW-meetwaarden of materieelspecifieke modellen toe.
- PostGIS is historie en spatial audit, niet de realtime fanout; Redis en WebSocket blijven daarvoor verantwoordelijk.
- Productiewachtwoorden staan nooit in Git. De voorbeeldwaarden zijn uitsluitend placeholders.
- Back-ups, externe TLS/DNS, monitoringbackend en definitieve juridische bewaartermijnen blijven omgevingsspecifiek en moeten vóór publieke ingebruikname worden ingericht.
