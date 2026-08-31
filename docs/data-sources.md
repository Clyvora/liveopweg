# MobilityRadar NL - databronnenonderzoek

Status van dit onderzoek: **20 augustus 2026, Europe/Berlin**.

Dit document is de fase-0 beslisbasis. Het bevestigt wat publiek vindbaar en technisch bereikbaar is, benoemt wat nog niet bewezen is en voorkomt dat een latere implementatie fictieve realtime nauwkeurigheid suggereert.

## 1. Uitkomst in het kort

De voorgestelde bronvolgorde is uitvoerbaar, met belangrijke beperkingen:

1. Gebruik **GOVI/NDOV `NStreinpositiesInterface5`** als primaire positiebron voor NS-materieel. De publieke best-effort ZeroMQ-poort en envelope zijn op 20 augustus 2026 opnieuw bevestigd. De feed documenteert GPS, snelheid en kwaliteitsvelden, maar kan oude of verkeerd aan een rit gekoppelde posities bevatten.
2. Gebruik **InfoPlus RIT Interface 5** voor rit-, stop-, spoor- en wijzigingsinformatie. Dit is eventgedreven ritinformatie, geen GPS-bron en geen landelijke incidentenfeed.
3. Gebruik **KV6** en/of de landelijke **GTFS-Realtime-conversie van OVapi** voor niet-NS-vervoerders. KV6 is maximaal iedere 60 seconden verplicht en bevat RD-coordinaten; kwaliteit en vervoerdersdekking verschillen per bron.
4. Gebruik de **NS Reisinformatie API** alleen als aanvullende, gecachte verrijking. Alle geteste endpoints bestaan maar vereisen een subscription key. Het is geen geschikte primaire nationale realtime ingest.
5. Gebruik **ProRail Spoorwegen via PDOK OGC API** als officiele geometrische basis. Gebruik aanvullend het ProRail Geleidingssysteem voor rijkere infrastructuur wanneer de specifieke CC-BY-voorwaarden zijn verwerkt.
6. Gebruik **PDOK 3D Basisvoorziening** primair voor runtime 3D Tiles en terrein. Gebruik **3DBAG** als aanvullende of voorberekende bron, niet als enig runtime-afhankelijk punt.
7. Gebruik **NDW DATEX II v3** voor files, incidenten, werkzaamheden, afsluitingen, tijdelijke maximumsnelheden en SRTI. Gebruik de afzonderlijke snelheids- en reistijdfeeds plus hun meetlocatietabel voor verkeersmetingen.
8. De licentiestatus moet per concrete dataset en distributieroute in een bronregister worden vastgezet. Een licentie op een website of document is niet automatisch de licentie op ieder datapakket.

## 2. Verificatiemethode en betekenis van statussen

### Statussen

- **Bevestigd**: officiele documentatie en endpoint zijn beschikbaar; een read-only bereikbaarheidscontrole is uitgevoerd waar mogelijk.
- **Voorwaardelijk**: bron is beschikbaar, maar account, overeenkomst, sleutel, dekkingscontrole of juridische bevestiging ontbreekt nog.
- **Fallback**: bruikbaar als primaire bron faalt of niet dekt, maar niet de voorkeursbron.
- **Niet geschikt**: onvoldoende betrouwbaar, niet operationeel of juridisch onduidelijk voor de beoogde rol.

### Uitgevoerde controles

- HTTP(S)-endpoints zijn zonder credentials op status, redirect, contenttype, omvang en waar aanwezig `Last-Modified` gecontroleerd.
- De publieke ZeroMQ-host `pubsub.besteffort.ndovloket.nl` accepteerde TCP-verbindingen op poorten **7658** en **7664**. Er is in deze fase geen payloaddecoder geinstalleerd; inhouds- en intervalclaims komen daarom uit de gepubliceerde schemas en publicatiedocumenten.
- De OVapi GTFS-RT feeds zijn viermaal bemonsterd. De `Last-Modified`-waarde verschoof in die observatie van 18:21:22Z naar 18:22:22Z: een waargenomen publicatiecyclus van circa een minuut. Dit is een momentopname, geen SLA.
- NDW open-datafiles waren bereikbaar. Op het controlemoment waren `actueel_beeld`, `trafficspeed`, `traveltime`, afsluitingen, maximumsnelheden en SRTI op dezelfde minuut bijgewerkt; werkzaamheden/evenementen liep op een vijfminutengrens.
- PDOK OGC API-landingspagina's en collectiecatalogi zijn als JSON opgehaald; de relevante collecties en 3D tilesetlinks bestaan.
- NS gateway-endpoints retourneerden zonder sleutel `401`, niet `404`; dit bevestigt routebestaan en verplichte authenticatie, niet de inhoud van een geautoriseerd antwoord.

## 3. Beslismatrix

| Bron | Rol | Status | Auth | Nominale/waargenomen actualiteit | Licentie/voorwaarden | Besluit |
|---|---|---|---|---|---|---|
| GOVI/NDOV NS Treinposities | NS GPS-posities | Bevestigd, best effort | Geen op best-effort; overeenkomst voor beheerde toegang | Documentatie: 10 s GPS + 10 s push; bron kan veel ouder zijn | NDOV publiceert data onder CC0; fair use, 1 verbinding per stroom | Primair voor NS |
| InfoPlus RIT Interface 5 | Rit- en halteverrijking | Bevestigd, best effort | Zelfde ZeroMQ-stroom; beheerde toegang via overeenkomst | Eventgedreven bij iedere ritaanpassing | NDOV-data CC0; documentatie zelf kent eigen auteursrecht | Primair voor ritcontext |
| KV6 | Niet-NS positie/punctualiteit | Bevestigd, best effort | Geen op best-effort | Specificatie: minimaal 1 bericht per 60 s voor actieve rit | NDOV-data CC0; BISON-documentatie heeft eigen licentie | Primair kandidaat niet-NS |
| OVapi GTFS-RT | Uniforme afgeleide feed | Bevestigd maar afgeleid | Geen | Circa 60 s waargenomen | Huidige feedlicentie nog schriftelijk bevestigen | Fallback/accelerator |
| NS API | Stations, vertrekken, reizen, verstoringen, virtuele trein | Voorwaardelijk | Account + subscription key | Pull; productlimieten verschillen | Gratis met limieten; NS-portaalvoorwaarden gelden | Verrijking, niet hot path |
| ProRail Spoorwegen OGC API | Spooras, wissel, station, kruising, overweg | Bevestigd | Geen | Metadata: handmatig; features hebben publicatiedatum/geldig-vanaf | CC0 1.0 | Primaire basisgeometrie |
| ProRail Geleidingssysteem | Rijkere railobjecten | Bevestigd | Geen | Dagelijks volgens catalogus | CC-BY 4.0 | Aanvullende import |
| BGT OGC API | Detailtopografie | Bevestigd | Geen | Dagelijks | OGC endpoint meldt CC0; register vermeldt ook CC-BY | Enrichment, licentie per endpoint vastleggen |
| OpenStreetMap | Tags en fallbackgeometrie | Bevestigd | Geen voor extracts | Minutely diffs mogelijk; geen SLA | ODbL 1.0 + attributie | Alleen enrichment/fallback |
| PDOK 3D Basisvoorziening | Gebouwen/terrein/3D Tiles | Bevestigd | Geen | Jaar-/jaarganggebonden, niet realtime | CC-BY 4.0 | Primaire 3D runtimebron |
| 3DBAG | Gebouwmodellen en analyse | Bevestigd | Geen | Release 2025.09.03 gevonden | CC-BY 4.0 | Aanvullend/voorbewerking |
| NDW DATEX II v3 | Wegsituaties | Bevestigd | Geen voor open files; bearer key voor backbone pull | Meestal 60 s; wijzigingenfeed 5 min waargenomen | Datasetvoorwaarden per product bevestigen | Primair voor weg |
| NDW speed/travel time | Snelheid en reistijd | Bevestigd | Geen voor open files | Iedere 60 s volgens docs en observatie | Datasetvoorwaarden per product bevestigen | Primair voor verkeersmetingen |

## 4. Rail - GOVI/NDOV

### 4.1 Distributie en toegang

Officiele/bronhoudende pagina's:

- [GOVI realtime overzicht](https://govi.nu/realtime.html)
- [NDOV open-data-index](https://data.ndovloket.nl/)
- [NDOV realtime aansluitinformatie](https://data.ndovloket.nl/REALTIME.TXT)
- [GOVI FAQ over aanmelden, overeenkomst en data](https://govi.nu/faq.html)
- [NDOV CC0-verklaring](https://data.ndovloket.nl/LICENTIE-CC0.TXT)

Best-effort endpoints:

```text
BISON KV6/KV15/KV17  tcp://pubsub.besteffort.ndovloket.nl:7658
NS InfoPlus           tcp://pubsub.besteffort.ndovloket.nl:7664
SIRI                  tcp://pubsub.besteffort.ndovloket.nl:7666
KV78Turbo             tcp://pubsub.besteffort.ndovloket.nl:7817
```

Best-effort is fair use met maximaal een verbinding per afnemer per datastroom. Voor beheerde/premium toegang, ontwikkel- en productieomgevingen en eventueel SLA is aanmelden en ondertekenen van de GOVI/NDOV-gebruikersovereenkomst nodig.

### 4.2 NStreinpositiesInterface5

Envelope:

```text
/RIG/NStreinpositiesInterface5
```

Specificaties:

- [Treinpositie publicatiedocument](https://data.ndovloket.nl/docs/infoplus/TreinLocatie/Publicatiedocument_NDOV_NS-Treinposities-161202.pdf)
- [TreinLocatie XSD](https://data.ndovloket.nl/docs/infoplus/TreinLocatie/TreinLocatie.xsd)
- [TreinLocatie WSDL](https://data.ndovloket.nl/docs/infoplus/TreinLocatie/TreinLocatiePushService.wsdl)

Geleverde velden omvatten:

- `TreinNummer`;
- per materieeldeel `MaterieelDeelNummer` en `Materieelvolgnummer`;
- `GeneratieTijd` en `GpsDatumTijd`;
- `BronId`, `Bron`, `Fix`, `Berichttype`;
- WGS84 `Longitude`, `Latitude`, optioneel `Elevation`;
- `Snelheid` in km/h;
- `Richting`, `Rijrichting`, `Orientatie`;
- `Hdop` en `AantalSatelieten`.

Actualiteit:

- De documentatie beschrijft onder normale omstandigheden een GPS-bericht iedere 10 seconden en een volledige push iedere 10 seconden.
- Hetzelfde document waarschuwt dat steeds de laatste GPS-positie wordt meegestuurd; die kan incidenteel een dag of meerdere dagen oud zijn.
- Materieelsamenstelling en koppeling tussen positie en trein zijn deels afgeleid uit planning/bijsturing en kunnen fout zijn.
- `Rijrichting` en `Orientatie` worden expliciet als onvoldoende betrouwbaar beschreven; GPS-richting is onder 10 km/h eveneens zwak.
- De in 2016 genoemde materieeluitzonderingen zijn historisch en mogen in 2026 niet zonder live dekkingsmeting worden overgenomen.

Architectuurconsequentie:

- Gebruik `GpsDatumTijd` als meettijd wanneer geldig, nooit envelope- of ontvangsttijd als vervanging.
- Bewaar alle raw velden en de serverontvangsttijd afzonderlijk.
- Een lege of ongeldige GPS-tijd betekent `sourceMeasuredAt = null`, niet "nu".
- Toon `Snelheid` alleen als `MEASURED_GPS` wanneer bronveld en bronleeftijd voldoen; anders afgeleid of onbekend.
- Bepaal dekking per vervoerder/materieel dagelijks uit feitelijke berichten.

Fallback:

1. recente eigen laatste bronpositie met `STALE`-status;
2. KV6 of vervoerdersspecifieke officiele positiefeed wanneer identiteit betrouwbaar koppelbaar is;
3. GTFS-RT VehiclePositions;
4. route-/dienstregelinggebaseerde schatting, expliciet `PREDICTED`, met korte horizon;
5. geen marker wanneer de onzekerheid niet verantwoord is.

### 4.3 InfoPlus RIT Interface 5

Envelope:

```text
/RIG/InfoPlusRITInterface5
```

Documentatie:

- [InfoPlus RIT documentatie-index](https://data.ndovloket.nl/docs/infoplus/RIT/)
- [Publicatiedocument RITInfo](https://data.ndovloket.nl/docs/infoplus/RIT/Publicatiedocument%20RITI%20voor%20NDOV%201.3.pdf)
- [RIT v5 WSDL/XSD-bundel](https://data.ndovloket.nl/docs/infoplus/RIT/RIT-v5-wsdl-xsd.zip)

Relevante inhoud:

- treindatum en logistiek treinnummer;
- treinsoort, naam, vervoerder en materieelsoort waar geleverd;
- ritdelen en stationsvolgorde;
- geplande en actuele aankomst-/vertrektijden;
- geplande en actuele sporen;
- stopstatus;
- wijzigingstypen zoals vertraging, spoorwijziging, vervallen/extra stop, omleiding en ingekorte/verlengde rit.

Realtimekarakter:

- Een volledige rit wordt opnieuw gepubliceerd bij iedere ritaanpassing.
- Updates worden zo snel mogelijk verstuurd, waardoor tijdelijke onderlinge inconsistentie kan ontstaan.
- Het is een continue pushstroom; er is geen pull om alle actuele ritten opnieuw op te vragen.
- Berichten kunnen out of order arriveren; documentatie waarschuwt dat ontvangstvolgorde niet gelijk hoeft te zijn aan actualiteitsvolgorde.
- RIT wordt al enkele dagen voor vertrek geleverd. Aanwezigheid van een RIT-bericht betekent dus niet dat de trein live rijdt.
- RIT bevat niet automatisch alle landelijke ernstige/geplande verstoringsberichten; daarvoor zijn aparte InfoPlus LAB/STB/TRB en/of NS API-bronnen nodig.

Gebruik:

- `Treindatum + TreinNummer` is de ritidentiteit aan bronzijde, maar wordt intern namespaced met provider en versie.
- Spoor/perron wordt als **reported platform/track** opgeslagen. Een koppeling aan fysieke geometrie is een apart, geconfidentieerd resultaat.
- Vertraging is bron-/InfoPlus-informatie; afronding en interpretatie worden niet omgezet in een nauwkeuriger getal dan geleverd.

### 4.4 KV6

Specificatie:

- [BISON KV6 v8.1.2.0](https://data.ndovloket.nl/docs/bison/kv6/TMI8%20Actuele%20ritpunctualiteit%20en%20voertuiginformatie%20%28kv%206%29%2C%20v8.1.2.0%2C%20release.pdf)

Belangrijke envelopes staan per vervoerder op de GOVI realtimepagina, bijvoorbeeld `/ARR/KV6posinfo`, `/QBUZZ/KV6posinfo`, `/RIG/KV6posinfo` en `/KEOLIS/KV6posinfo`.

Kernvelden/events:

- ritidentiteit: `DataOwnerCode`, `LinePlanningNumber`, `OperatingDay`, `JourneyNumber`, `ReinforcementNumber`;
- voertuig: `VehicleNumber`, optioneel `BlockCode`, `NumberOfCoaches`, toegankelijkheid;
- positie/punctualiteit: `Timestamp`, `Source`, `Punctuality`, `DistanceSinceLastUserStop`, `RD-X`, `RD-Y`;
- events: `DELAY`, `INIT`, `ARRIVAL`, `ONSTOP`, `DEPARTURE`, `ONROUTE`, `OFFROUTE`, `END`.

Actualiteit en nauwkeurigheid:

- Voor een geinitialiseerde rit moet binnen de standaard `MESSAGE INTERVAL` van 60 seconden minimaal een relevant bericht worden gestuurd.
- RD-X/RD-Y zijn EPSG:28992-meters; `-1` of afwezig betekent onbekend.
- `ONROUTE` zegt dat het voertuig volgens het bronsysteem de geplande route volgt; het bewijst geen spoorniveau of actuele wisselstand.
- KV6 is oorspronkelijk breed gebruikt voor bus/tram/metro. Train coverage moet empirisch per operator worden bevestigd.

### 4.5 GTFS-Realtime

Operationele afgeleide landelijke endpoints op 20 augustus 2026:

```text
https://gtfs.ovapi.nl/nl/vehiclePositions.pb
https://gtfs.ovapi.nl/nl/tripUpdates.pb
https://gtfs.ovapi.nl/nl/alerts.pb
```

De eerste twee en `alerts.pb` retourneerden HTTP 200; `serviceAlerts.pb` retourneerde 404. De publicatiecyclus was tijdens de korte observatie circa een minuut.

Referenties:

- [Mobility Database-vermelding OVapi](https://mobilitydatabase.org/feeds/gtfs_rt/mdb-1644)
- [GTFS-Realtime best practices](https://gtfs.org/documentation/realtime/realtime-best-practices/)

Velden kunnen bestaan uit VehiclePositions, TripUpdates en Alerts met protobuf `FeedHeader.timestamp`, rit-/voertuigidentiteit, meettimestamp, positie, stopupdates en schedule relationship. Een veld is optioneel tenzij de specifieke feed het consequent levert.

Beperkingen:

- Dit is een conversie/aggregatie van onderliggende Nederlandse feeds, dus timestamps en identifiers kunnen zijn getransformeerd.
- De huidige exacte feedlicentie en productie-SLA zijn via de publiek zichtbare bronnen niet voldoende juridisch hard bevestigd.
- Een algemene GTFS-RT best practice is geen bewijs dat deze feed aan die frequentie of volledigheid voldoet.

Besluit: gebruik als uniforme fallback en voor snelle dekking, maar behoud de oorspronkelijke provider in provenance en maak productiegebruik afhankelijk van een schriftelijke licentie-/servicebevestiging.

### 4.6 NS API

Officiele informatie:

- [NS API-portaal](https://apiportal.ns.nl/)
- [Starter's Guide](https://apiportal.ns.nl/startersguide)
- [Gebruiksvoorwaarden](https://apiportal.ns.nl/voorwaarden)
- [FAQ](https://apiportal.ns.nl/content/html_widgets/4oaqo.html)

Technisch bevestigde gatewayroutes:

```text
GET https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2/stations
GET https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2/departures?station=UT
GET https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2/arrivals?station=UT
GET https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3/trips
GET https://gateway.apiportal.ns.nl/reisinformatie-api/api/v3/disruptions
GET https://gateway.apiportal.ns.nl/virtual-train-api/vehicle
```

Zonder key retourneerden deze routes `401` met de melding dat een actieve subscription key ontbreekt. De sleutel moet server-side via `Ocp-Apim-Subscription-Key` worden meegestuurd. Productcatalogus, exacte schemas en limieten zijn pas na inloggen volledig zichtbaar en kunnen per product verschillen.

Beperkingen/voorwaarden:

- registratie en productabonnement zijn verplicht;
- NS kan limieten en service wijzigen of stoppen;
- data mag niet zo worden gemanipuleerd dat onjuiste informatie ontstaat;
- het NS-logo mag niet zonder toestemming worden gebruikt;
- API key mag nooit naar browser, log of repository lekken.

Besluit: stations, reizen, vertrekken/arriveren en verstoringen cachen als enrichment. De Virtual Train API mag alleen worden gebruikt nadat het geautoriseerde schema en de productvoorwaarden zijn vastgelegd; hij vervangt de raw NDOV-feed niet.

## 5. Railgeometrie en topografie

### 5.1 ProRail Spoorwegen via PDOK

Endpoints:

```text
OGC API  https://api.pdok.nl/prorail/spoorwegen/ogc/v1
WFS      https://service.pdok.nl/prorail/spoorwegen/wfs/v1_0?service=WFS&request=GetCapabilities
WMS      https://service.pdok.nl/prorail/spoorwegen/wms/v1_0?service=WMS&request=GetCapabilities
ATOM     https://service.pdok.nl/prorail/spoorwegen/atom/spoorwegen.xml
```

Beschikbare OGC-collecties zijn `kilometrering`, `kruising`, `overweg`, `spooras`, `station`, `trace` en `wissel`.

Officiele metadata:

- [PDOK Spoorwegen](https://api.pdok.nl/prorail/spoorwegen/ogc/v1?f=html)
- [PDOK OGC-services](https://www.pdok.nl/ogc-webservices/-/article/spoorwegen)
- [Data.overheid Spoorwegen](https://data.overheid.nl/dataset/47185-spoorwegen)

Metadata meldt: ProRail als aanbieder, CC0 1.0, geen authenticatie, geen kosten. De API-landingspagina noemt updatefrequentie `handmatig`; individuele features bevatten onder meer `geldig_vanaf` en `publicatiedatum`.

Beperkingen:

- Dit is infrastructuurgeometrie, geen realtime operationele toestand.
- Een wisselpunt of geometrische aansluiting zegt niets over de actuele wisselstand.
- De collectie `spooras` bevat geometrie en referentieattributen, maar niet vanzelf een complete routable graph.
- Kruisende lijnen mogen pas een graphverbinding krijgen na niveau-/objectcontrole.

### 5.2 ProRail Geleidingssysteem

Endpoint:

```text
https://maps.prorail.nl/arcgis/rest/services/Geleidingssysteem/FeatureServer
```

[Data.overheid metadata](https://data.overheid.nl/en/dataset/prorail-geleidingssysteem) beschrijft dagelijkse verversing, sporen, wissels en bijbehorende objecten volgens IMSpoor en een CC-BY 4.0-licentie.

Gebruik dit als aanvullende import voor Utrecht en later landelijk, met bronvermelding en een aparte `source_dataset_version`. Niet stilzwijgend samenvoegen met CC0-Spoorwegen: lineage en licentie blijven per object/attribuut bewaard.

### 5.3 BGT

Endpoint:

```text
https://api.pdok.nl/lv/bgt/ogc/v1
```

Relevante collecties zijn onder andere `spoor`, `pand`, `wegdeel`, `overbruggingsdeel`, `tunneldeel`, `kunstwerkdeel_*`, terreindelen en water.

[PDOK BGT OGC API](https://api.pdok.nl/lv/bgt/ogc/v1?f=html) meldt dagelijkse updates, geen authenticatie en CC0 1.0. [Data.overheid](https://data.overheid.nl/dataset/43122-basisregistratie--grootschalige-topografie--bgt---donl-) vermeldt echter CC-BY 4.0. Dit verschil moet voor productie juridisch worden opgelost door de licentie van het werkelijk afgenomen endpoint en de bijbehorende metadata-snapshot vast te leggen.

Gebruik BGT voor topografische context en waar nodig detail, niet als eerste bron voor spoorsemantiek.

### 5.4 OpenStreetMap

Officiele voorwaarden:

- [OSM copyright en attributie](https://www.openstreetmap.org/copyright)
- [OSMF tile usage policy](https://operations.osmfoundation.org/policies/tiles/)

OSM-data valt onder ODbL 1.0 en vereist zichtbare attributie. De publieke `tile.openstreetmap.org`-servers zijn best effort, verbieden bulk/prefetch en zijn niet geschikt als onbeperkte productiekaartserver. Gebruik voor productie een passende tileprovider of self-hosted vector tiles en bewaar `© OpenStreetMap contributors` zichtbaar.

Gebruik OSM alleen voor enrichment/fallback: aanvullende railtags, gebouwen of objectkenmerken die in officiele bronnen ontbreken. Iedere gemengde database vraagt vooraf een ODbL-compliancebeoordeling; voorkom een onbedoeld afgeleid databankproduct zonder deelverplichtingen te begrijpen.

## 6. 3D-bronnen

### 6.1 PDOK 3D Basisvoorziening

API:

```text
https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1
```

Directe runtime tilesets:

```text
https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1/collections/gebouwen/3dtiles?f=json
https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1/collections/terreinen/3dtiles?f=json
```

De acht collecties omvatten 3D Tiles gebouwen/terreinen, CityJSON gebouwen en gebouwen+terreinen, 2D gebouwen met hoogteattributen, DTM en twee DSM-producten. Opnieuw gecontroleerd op 21 augustus 2026: de 3D Tiles-collecties `gebouwen` en `terreinen` zijn bijgewerkt op 1 juli 2026 en leveren de hoogtesituatie 2025. Gebouwen zijn gebaseerd op BAG-panden per 1 januari 2026 met AHN en luchtfoto's uit 2025; terrein gebruikt sinds deze release AHN.

Bronnen:

- [PDOK introductie en downloads](https://www.pdok.nl/introductie/-/article/3d-basisvoorziening-1)
- [3D Basisvoorziening API-catalogus](https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1?f=html)
- [Data.overheid metadata en licentie](https://data.overheid.nl/dataset/57260-3d-basisvoorziening)
- [Publicatie over de 2025-update](https://www.pdok.nl/-/nieuwe-data-van-de-3d-basisvoorziening-beschikbaar-op-pdok)

Licentie: CC-BY 4.0. Actualiteit is jaarganggebonden en verschilt per collectie; deze data is niet realtime. De 3D Objecten-collecties worden jaarlijks geactualiseerd. Runtime registreert daarom collectiejaar 2025, bronupdate 1 juli 2026 en de bundelafnamedatum. Een gecontroleerde byte-range request naar een gebouwtile bevestigde HTTP 206 en wildcard-CORS, zodat viewportstreaming vanuit de browser technisch mogelijk is.

Beperkingen:

- gebouwen kunnen LoD 2.2 of terugval-LoD 1.3 zijn;
- terrein/gebouwjaren kunnen verschillen;
- ontbrekende of beperkte 3D-data is mogelijk;
- 3D Tiles zijn visualisatie, niet automatisch betrouwbare spoorhoogte of perronmaatvoering.

### 6.2 3DBAG

Endpoints:

```text
API root   https://api.3dbag.nl
API docs   https://api.3dbag.nl/api.html
3D Tiles   https://data.3dbag.nl/v20250903/cesium3dtiles/lod22/tileset.json
Downloads  https://3dbag.nl/en/download
```

Bronnen:

- [3DBAG webservices](https://docs.3dbag.nl/en/delivery/webservices/)
- [3DBAG release notes](https://docs.3dbag.nl/nl/overview/release_notes/)
- [3DBAG gebruiksvoorwaarden](https://docs.3dbag.nl/nl/copyright/)

Bevestigde release: `v2025.09.03`; licentie: CC-BY 4.0. De release notes noemen ontbrekende gebouwen en kwaliteitsattributen. De API is volgens de eigen documentatie nog niet volledig OGC API Features-conform.

Besluit: geschikt voor voorbewerking, gebouwanalyse en fallback; PDOK blijft de voorkeursbron voor runtime 3D. Cache alleen conform voorwaarden en pin een datasetversie zodat renders reproduceerbaar blijven.

## 7. Road - NDW

### 7.1 Distributieroutes

Open-data-index:

```text
https://opendata.ndw.nu/
```

Belangrijkste open files:

```text
https://opendata.ndw.nu/actueel_beeld.xml.gz
https://opendata.ndw.nu/veiligheidsgerelateerde_berichten_srti.xml.gz
https://opendata.ndw.nu/planningsfeed_wegwerkzaamheden_en_evenementen.xml.gz
https://opendata.ndw.nu/tijdelijke_verkeersmaatregelen_afsluitingen.xml.gz
https://opendata.ndw.nu/tijdelijke_verkeersmaatregelen_maximum_snelheden.xml.gz
https://opendata.ndw.nu/trafficspeed.xml.gz
https://opendata.ndw.nu/traveltime.xml.gz
https://opendata.ndw.nu/measurement_current.xml.gz
https://opendata.ndw.nu/ndw_avg_meetlocaties_shapefile.zip
https://opendata.ndw.nu/Matrixsignaalinformatie.xml.gz
https://opendata.ndw.nu/ndw_msi_shapefiles_latest.zip
```

Beheerde backbone pull:

```text
GET https://backbone.ndw.nu/pull/datex3-complete
Authorization: Bearer <apikey>
```

Push is ook beschikbaar en levert wijzigingen zodra beschikbaar. Beide beheerde vormen vereisen een NCIS-account/abonnement. Zie [NDW DATEX II v3 afname](https://docs.ndw.nu/handleidingen/NCIS/WebportaalD2v3/).

### 7.2 Actueel Beeld

[Actueel Beeld-productdocumentatie](https://docs.ndw.nu/en/producten/situatieberichten-v3/actueel-beeld/) noemt:

- ongevallen en incidenten;
- slechte wegtoestand;
- weerinvloed;
- files en filelengte;
- spitsstrookstatus;
- SRTI;
- werkzaamheden/evenementen;
- tijdelijke afsluitingen;
- tijdelijke maximumsnelheden.

De feed is DATEX II v3 `SituationPublication`. Een gecontroleerd live bericht bevatte onder meer `publicationTime`, bronidentiteit, situation/version times, `informationStatus`, probability, geldigheid, bronnaam, WGS84-geometrie en type-specifieke velden. De documentatie noemt Actueel Beeld **ongevalideerde** informatie uit toeleveranciers plus andere realtimefeeds. Dat woord moet in data quality terugkomen; `informationStatus=real` betekent niet automatisch "gevalideerd".

Waargenomen frequentie: circa 60 seconden. Voor werkzaamheden/evenementen was vijf minuten zichtbaar. Deze intervallen worden gemeten en geconfigureerd, niet hard gecodeerd als garantie.

Implementatiemetingen op 21 augustus 2026: de open `actueel_beeld.xml.gz` was circa 260 kB gecomprimeerd en 2,84 MB uitgepakt. Eén momentopname bevatte 514 situations en 788 records. De Fase 9-adapter begrenst payloads op 10 MB gecomprimeerd en 64 MB uitgepakt, en volgt het door NDW geadviseerde poll-interval van 60 seconden met een harde ondergrens van 30 seconden.

### 7.3 Snelheid en reistijd

Bronnen:

- [NDW verkeersgegevensprofiel](https://docs.ndw.nu/dataformaten/datex2-v3/verkeersgegevens/)
- [TrafficSpeed](https://docs.ndw.nu/dataformaten/datex2-v3/elementen/payloadpublication/measureddatapublication/trafficSpeed/)
- [TravelTimeData](https://docs.ndw.nu/dataformaten/datex2-v2.3/elementen/payloadpublication/MeasuredDataPublication/travelTimeData/)
- [Floating Car Data](https://docs.ndw.nu/en/producten/fcd/)
- [Meetlocatie-shapefiles](https://docs.ndw.nu/en/producten/shapefiles/)

NDW documenteert een cyclus van 60 seconden. Snelheid is gemiddelde snelheid op een detectiepunt in km/h; reistijd hoort bij een meetvak en kan typen hebben als `estimated`, `instantaneous` of `reconstituted`. Kwaliteitsvelden kunnen onder meer rekenmethode, inputaantallen, standaarddeviatie, leverancierskwaliteit en `dataError` bevatten. `-1` in combinatie met `dataError=true` betekent geen betrouwbare waarde, nooit -1 km/h of -1 seconden als echte meting tonen.

Meetwaarden verwijzen naar een aparte MeasurementSiteTable/meetlocatiegeometrie. Ingest moet de referentieversie controleren en mag geen waarde op een locatie tekenen als die referentie ontbreekt.

### 7.4 Matrixsignalen

NDW publiceert `Matrixsignaalinformatie.xml.gz` plus een MSI-shapefile. Gebruik is technisch mogelijk, maar productdekking, semantiek, licentie en het verschil tussen feitelijk signaalbeeld en afgeleide tijdelijke maximumsnelheid moeten voor implementatie apart worden gevalideerd. Matrixsignalen komen daarom niet in de eerste road vertical slice.

### 7.5 Licentie

[NDW copyright](https://www.ndw.nu/service/copyright) zegt dat website-inhoud tenzij anders vermeld CC0 is. Het Nationaal Toegangspunt beschrijft meerdere verkeersdatasets als Creative Commons of vergelijkbaar. Dat is niet voldoende om zonder meer alle onderliggende DATEX-records en afgeleide historische opslag onder CC0 te verklaren.

Voor productie is per NDW-product nodig:

1. license/usage metadata uit het concrete product of abonnement vastleggen;
2. opslag-, caching-, herpublicatie- en attributieregels bevestigen;
3. bronattributie `NDW` en oorspronkelijke leverancier tonen wanneer geleverd;
4. bewaartermijn voor historie schriftelijk bevestigen;
5. geen ANWB-scraping gebruiken.

## 8. Bronregister dat voor implementatie verplicht is

Iedere adapter krijgt een record met minimaal:

```text
source_id
dataset_name
owner
distribution_url
protocol
schema_version
license_id
license_url
attribution_text
auth_mode
rate_or_connection_limit
documented_update_interval
observed_update_interval
geographic_coverage
operator_coverage
retention_allowed
redistribution_allowed
verified_at
verification_method
contact
known_limitations
```

Een ingestworker start niet in productie wanneer `license_id`, `verified_at`, `schema_version` of noodzakelijke credentials ontbreken. Bij onzekerheid is de status `DISABLED_LEGAL` of `DISABLED_CONFIG`, niet een stille mockfallback.

## 9. Openstaande bewijzen voor fase 1

Voordat de eerste echte trein wordt geimplementeerd:

- GOVI/NDOV overeenkomst voor ontwikkel- en productiegebruik afronden of bewust best-effort gebruiken met geaccepteerd risico;
- gedurende minimaal 24 uur per envelope berichtintervallen, omvang, disconnects, vervoerders en veldvulling meten;
- het actuele Interface 5 payloadschema tegen de gepubliceerde XSD valideren;
- vaststellen welke NS-materieeltypes werkelijk positie leveren in 2026;
- identiteitskoppeling `TreinNummer`/treindatum tussen positie en RIT bewijzen;
- NS API-producten, schemas, limieten en voorwaarden vanuit een geautoriseerd account exporteren;
- GTFS-RT licentie en herpublicatievoorwaarden schriftelijk bevestigen;
- PDOK/ProRail en BGT metadata als versieerbare snapshots opslaan;
- NDW gebruiks-/bewaarvoorwaarden per gekozen product bevestigen;
- meetwaarden en eind-tot-eindlatency als metrics publiceren.

## 10. Definitieve fase-0 bronkeuze

```text
NS positie:          GOVI/NDOV NStreinpositiesInterface5
NS ritcontext:       InfoPlus RIT Interface 5
Niet-NS positie:     KV6 per vervoerder; GTFS-RT als fallback
Reis/station extra:  NS Reisinformatie API, gecacht
Railgeometrie:       ProRail Spoorwegen OGC API
Raildetail:          ProRail Geleidingssysteem, apart gelicenseerd
Topografie:          BGT; OSM alleen enrichment/fallback
3D runtime:          PDOK 3D Basisvoorziening
3D aanvulling:       3DBAG, versiegepind
Wegevents:           NDW DATEX II v3 Actueel Beeld + specifieke feeds
Snelheid/reistijd:   NDW MeasuredData + MeasurementSiteTable
```

Deze keuze is geldig zolang de bronhealth, voorwaarden en schemas bij iedere deployment opnieuw worden gecontroleerd.
