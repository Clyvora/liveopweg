# Fase 6 — Utrecht map matching

Status: afgerond op 21 augustus 2026.

## Resultaat

MobilityRadar NL koppelt actuele NS-GPS-observaties binnen een afgebakende Utrecht-proefregio aan de officiële ProRail/PDOK-spoor-graaf uit fase 5. De match is een afzonderlijk afgeleid record: de originele observatie, positie, tijd en bronhash blijven ongewijzigd beschikbaar.

De proefregio gebruikt de WGS84-bbox `4.95, 51.95, 5.35, 52.22`. Buiten dit gebied blijft de landelijke fase-4-weergave actief; fase 7 schaalt matching pas landelijk op na kwaliteits- en performancemetingen.

## Matchpipeline

Per Utrecht-observatie:

1. zoek kandidaat-edges via de graph bbox-grid binnen 75 meter;
2. projecteer het raw GPS-punt op ieder lijnsegment;
3. bereken afstand en edgeprogress;
4. vergelijk heading alleen bij minimaal 8 km/h;
5. gebruik GPS-kwaliteit wanneer HDOP of satellietaantal bruikbaar is;
6. vergelijk met de vorige edge en directe graphconnectiviteit;
7. geef een penalty aan een sprong naar een niet-verbonden edge;
8. weiger observaties die binnen de gemeten tijd meer dan een fysiek plausibele afstand springen;
9. rangschik kandidaten met configureerbare gewichten;
10. bewaar raw GPS en matchresultaat afzonderlijk.

De startgewichten zijn afstand `0,35`, heading `0,20`, vorige edge `0,25`, topologie `0,15` en GPS-kwaliteit `0,05`. Ontbrekende componenten worden niet als nul geïnterpreteerd: hun gewicht valt weg en de resterende gewichten worden opnieuw genormaliseerd.

Routealignment en richting worden expliciet als `UNAVAILABLE` opgeslagen. De geometrie bewijst geen actuele wisselstand, rijrichting of werkelijk gekozen operationele route.

## Matchklassen

- `MATCHED_HIGH`: sterke score, maximaal 25 meter afstand en duidelijke marge ten opzichte van een ruimtelijk andere runner-up;
- `MATCHED_MEDIUM`: voldoende score en maximaal 45 meter afstand;
- `MATCHED_LOW`: één beste kandidaat, maar onvoldoende bewijs voor een hogere klasse;
- `UNMATCHED_NO_CANDIDATES`: geen edge binnen de zoekstraal;
- `UNMATCHED_AMBIGUOUS`: ruimtelijk verschillende kandidaten hebben onvoldoende scoreverschil;
- `REJECTED_SUSPICIOUS_OBSERVATION`: de bronpositie maakt binnen de beschikbare tijd een fysiek onwaarschijnlijke sprong.

De klassengrenzen zijn met synthetische Utrecht-scenario's en live verdelingsmetingen afgestemd. Ze zijn geen statistische kanskalibratie. `internalScore` is alleen een candidatescore; `scoreIsProbability` staat verplicht op `false` en de UI toont geen percentage.

Overlappende bronobjecten die vrijwel hetzelfde projectiepunt opleveren worden niet ten onrechte als twee ruimtelijk verschillende sporen beschouwd. Echte parallelsporen van enkele meters uit elkaar blijven zonder voldoende continuïteitsbewijs bewust ambigu.

## Live integratie en opslag

De realtime gateway laadt `track-graph.json` één keer en verwerkt uitsluitend geaccepteerde observaties uit de Utrecht-bbox. De afzonderlijke matchstroom gebruikt:

- `rail.match.snapshot` voor een volledige startsnapshot;
- `rail.match.batch` voor upserts en verwijderde voertuigen;
- `GET /v1/matches/utrecht` voor een actuele REST-snapshot;
- `/health.sources.utrechtTrackMatcher` voor matcherstatus en actief aantal resultaten.

De afgeleide live-state wordt atomisch geschreven naar `var/live/utrecht-track-matches.json`; raw NDOV-payloads en genormaliseerde bronobservaties blijven in hun bestaande, afzonderlijke opslag. Het voorbereidende PostGIS-model staat in `infra/postgis/002_track_matches.sql` en bevat aparte GIST-indexen voor raw en matched punten.

## Debugweergave

Voor een geselecteerde Utrecht-trein toont de kaart:

- het raw GPS-punt;
- de afgeleide snapped positie wanneer een match geaccepteerd is;
- de afwijkingslijn tussen beide punten;
- de gekozen graph-edge;
- optioneel maximaal vijf kandidaat-edges;
- afstand, interne score, continuïteitsklasse en matchstatus.

Bij `UNMATCHED_AMBIGUOUS`, `UNMATCHED_NO_CANDIDATES` of een verdachte observatie wordt geen snapped positie verzonnen.

## Live evidence en performance

Een live snapshot op 21 augustus 2026 bevatte 34 Utrecht-materieeldelen: 8 `MATCHED_HIGH`, 3 `MATCHED_MEDIUM`, 1 `MATCHED_LOW`, 18 `UNMATCHED_AMBIGUOUS` en 4 `UNMATCHED_NO_CANDIDATES`. Deze verdeling is een momentopname en geen kwaliteitspercentage.

De reproduceerbare benchmark over 32 actuele Utrecht-observaties berekende 3.200 matches tegen 30.155 graph-edges. Gemiddeld kostte dit 0,564 ms per observatie; p95 was 0,980 ms en de eenmalige maximumwaarde 15,430 ms. De bbox-grid voorkomt een volledige scan van alle edges.

## Geautomatiseerde bewijzen

De tests bewijzen:

- projectie op een uniek spoor met behoud van raw GPS;
- geen geforceerde keuze tussen parallelsporen;
- voorkeur voor een werkelijk verbonden vervolg bij een wissel;
- afwijzing van een onmogelijke GPS-sprong;
- `NO_CANDIDATES` zonder verzonnen positie;
- expliciete beperking tot Utrecht;
- atomische, afzonderlijke opslag en restore van match-state;
- protocolschema's waarin score en confidence niet als kans worden gepresenteerd.

## Bekende beperkingen

- Er is nog geen route-alignment naar de volgende halte.
- Directionality en actuele wisselstand zijn onbekend.
- De live marker houdt bij een geaccepteerde Utrecht-match de nieuwste snapped bronpositie vast; spoorcurve-interpolatie tussen verschillende edges volgt pas na aanvullende graph-routing.
- De PostGIS-tabellen zijn voorbereid maar konden lokaal niet in Docker worden uitgevoerd zolang Windows/firmwarevirtualisatie niet beschikbaar is.
- Voor landelijke productie zijn gelabelde truth-data, anomaly-audits en regionale fallback nodig; dat is fase 7.
