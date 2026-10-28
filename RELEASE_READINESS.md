# Liveopweg: treinradar en releasecontrole

Implementatie en lokale controles: 28 oktober 2026. Wijzigingen horen bij twee repositories: deze frontend en `../ClyvoraAPI/services/liveopweg`. Alleen de frontend publiceren levert de nieuwe NS-routes niet op.

## Gedrag en structuur

- `panel-navigation.ts` beheert één primair paneel, een begrensde geschiedenis en het herstel van zoekopdrachten. `PanelHost.tsx` beheert scrollherstel, toetsenbordfocus, Escape en de mobiele sleep-/knopbediening.
- Desktop gebruikt een rechterpaneel van 380–420 px vanaf 1024 px. Mobiel gebruikt een compacte of uitgebreide onderkant van het scherm, boven de navigatie.
- Navigatie, formulieronderdelen, tabs, meldingen, knoppen en paneelkoppen gebruiken gedeelde stijlen. Vervangen primaire paneelregels, de oude planneropmaak, voorzieningenplaceholder en positiegeschiedenisopmaak zijn verwijderd. Treinopmaak staat in `train-panel.css`; gedeelde onderdelen in `ui.css`.
- Stationslijsten, stationborden en reisadviezen bewaren hun toestand wanneer een trein wordt geopend. Favorieten gebruiken de bestaande lokale opslagsleutel. Bij geblokkeerde opslag delen de schermen tijdelijke sessiefavorieten en bieden ze opnieuw opslaan aan.
- Het treinpaneel houdt de volgknop zichtbaar. Ontbrekende actuele posities schakelen volgen uit; eerder ontvangen informatie blijft beschikbaar. Stationritten zonder livepositie blijven openklapbaar.
- De planner gebruikt doorzoekbare stations, vertrek nu of een gekozen tijd, omwisselen, alternatieven, ritdelen, overstappen, spoorwijzigingen en bronmeldingen. Alleen passende actuele treinposities krijgen een radaractie.
- Permanente verbindings- en bronstatuslabels zijn verwijderd. Foutmeldingen blijven zichtbaar wanneer informatie ontbreekt of verouderd is. De statische, gedateerde stakingsmelding is vervangen door de officiële meldingenroute. Kaartbediening en treinlagen worden gereedgemaakt zodra de kaartstijl beschikbaar is, zodat mislukte achtergrondtegels het kiezen van een andere weergave niet blokkeren.
- De afzonderlijke imports voor stations, trein, planner, vloot en stationsdirectory blijven behouden. MapLibre wordt afzonderlijk geladen. Achterhaalde verzoeken worden geannuleerd; periodieke schermverzoeken pauzeren bij verborgen tabbladen.

## Backend en NS

De nieuwe backendroutes zijn:

| Route | Gedrag |
| --- | --- |
| `GET /v1/rail/disruptions` | Gevalideerde NS-meldingen, centraal iedere minuut vernieuwd. Bij uitval blijven eerder opgehaalde meldingen beschikbaar met `stale` en hun oorspronkelijke ontvangsttijd. |
| `GET /v1/journeys/advice?from=UT&to=ASD&language=nl` | Officiële reisadviezen, optioneel `dateTime` als ISO-tijd inclusief tijdzone. Gelijke aanvragen delen een aanvraag en een cache van 30 seconden. |
| `GET /v1/journeys/search` | Bestaande livezoekroute blijft behouden voor compatibiliteit. |

`NS_API_KEY` blijft uitsluitend op de backend en wordt alleen als header naar NS gestuurd. De gedeelde contracten in beide repositories zijn identiek. Ongeldige bronresponsen worden niet als een geslaagde lege uitslag gecachet. De cache is begrensd op 50 aanvraagvarianten per backendproces. Ook na een mislukte meldingenaanvraag geldt een centrale wachttijd van een minuut, zodat extra bezoekers geen storm van herhaalde aanvragen naar NS veroorzaken.

Meldingen krijgen kaartpunten via expliciet getroffen stations en de stationscatalogus, of lijnen via geleverde geometrie. Een lijn wordt niet afgeleid uit nabijheid of zelf tussen stations getekend. Meldingen zonder locatie blijven in de lijst leesbaar. Wegmeldingen blijven een afzonderlijke, secundaire kaart: de huidige gegevens leveren geen gevalideerde koppeling tussen een wegmelding en treinverkeer.

## Knoppeninventaris

| Onderdeel | Bediening en vervolg |
| --- | --- |
| Navigatie | Radar herstelt het kaartoverzicht; Stations, Spoormeldingen en Favorieten openen het gedeelde paneel. Meer bevat planner, vloot, instellingen en wegmeldingen. Desktop heeft ook directe planner-/instellingenacties. |
| Zoeken | Trein-/stationsgroepen, wissen, pijltjestoetsen, Enter en Escape; selectie opent het betreffende paneel. Terug herstelt de zoektekst. |
| Paneel | Terug en sluiten herstellen de vorige context; zonder geschiedenis sluit het paneel. Escape sluit het bovenste paneel. Mobiel zijn slepen en vergroten/verkleinen beide beschikbaar. |
| Trein | Haltevolgorde open-/dichtklappen, volgen/stoppen en sluiten. Volgen is uitgeschakeld wanneer een actuele positie ontbreekt, met uitleg. |
| Station | Favoriet, delen met feedback, vertrek-/aankomsttabs, ritdetails en radaractie. De radaractie vereist een actuele positie; ritdetails blijven leesbaar. |
| Favorieten | Bewaren/verwijderen, zoeken, station openen en bij opslaguitval opnieuw opslaan. Geen account. |
| Planner | Stationsuggesties met toetsenbord, omwisselen, datum/tijd, zoeken, route bewaren/verwijderen, favoriete stations, alternatieven en ritdetails. Zoeken/bewaren vereisen twee verschillende bekende stations. Opnieuw proberen herhaalt een mislukte aanvraag. |
| Spoormeldingen | Alles/storingen/werkzaamheden, detail open-/dichtklappen, getroffen locatie bekijken en opnieuw proberen. Een geslaagde lege respons en een onbereikbare bron hebben verschillende weergaven. |
| Kaart | Lagen aan/uit, kaartstijl, zoom, nabijzoeken en terug naar Nederland. Locatie wordt uitsluitend na gebruik van nabijzoeken aangevraagd. |
| Vloot | Geobserveerde aantallen en snelheden, sluiten/terug. Geen verzonnen landelijke vertragingsstatistieken. |
| Instellingen | Licht/donker, Nederlands/Engels, browsermeldingen en kaartlinks. Toestemming wordt alleen gevraagd bij inschakelen. |
| Wegmeldingen | Filters, melding openen/sluiten, kaartfocus, kaartstijl, zoom en landelijk overzicht. |

## Controles

- Frontend: 72 unit-/regressietests en 3 controles van gerenderde productiepagina's.
- Backend: 105 unit-/regressietests en 3 serverintegratietests. De servertests controleren ook 400/503-responsen van de nieuwe routes en CORS zonder een echte sleutel te gebruiken.
- Typecontrole en frontendlint; Cloudflare-build en Vercel-build. De builds waarschuwen nog over grote kaartbundels; Vercel/Nitro meldt daarnaast optionele traceInclude-pakketten. Dit zijn geen geslaagde prestatieoptimalisatieclaims.
- Browser: zoeken → trein → volgen → weggevallen positie → terug; station → vertrek → trein; aankomsttab; rit zonder positie; favoriet bewaren en terugvinden; advies → radar → hetzelfde advies; lege adviezen, uitval en herstel; melding met/zonder kaartlocatie.
- Browserfouten: ontbrekende NS-rechten, geslaagde lege meldingen, geweigerde locatie en geblokkeerde opslag met herstel. Uitval van de kaartachtergrond geeft uitleg; zoeken en treininformatie blijven beschikbaar en een andere kaartweergave kan worden gekozen.
- Toetsenbord: zoeken en stationssuggesties, tabs, Escape en focusherstel. Mobiele sleepbediening is afzonderlijk getest, inclusief het voorkomen van een dubbele omschakeling door de klik na een sleepbeweging. Een aparte browsercontrole met 250 teststations bevestigt werkelijk scrollherstel: 4550 px vóór openen van een station en 4550 px na teruggaan.
- Een berekende contrastcontrole van planner en instellingen in licht/donker gaf geen afwijkingen. De mobiele controle van zichtbare zelfstandige bediening gaf geen aanraakvlakken kleiner dan 44 × 44 px. Kleine native selectievakjes worden via hun volledige label bediend. Dit vervangt geen praktijktest met een schermlezer.
- Schermcontroles gebruiken 390, 768, 1024, 1440 en 1920 px. Screenshots en browserlogs staan lokaal onder `output/playwright/` en `.playwright-cli/` en worden niet mee gepubliceerd.

De herhaalbare browsercontroles staan in `tests/radar-browser.mjs`, `tests/radar-failure-browser.mjs`, `tests/radar-layout-browser.mjs`, `tests/radar-accessibility-browser.mjs`, `tests/radar-map-failure-browser.mjs` en `tests/radar-scroll-browser.mjs`. Open lokaal de app met Playwright CLI en voer de bestanden in die volgorde via `run-code --filename` uit. De browser onderschept gegevens uitsluitend in die testsessie; de app bevat geen testgegevensmodus of publieke voorbeeldreizen. Meldingsfixtures en screenshotnamen zijn herkenbaar als testgegevens.

## Metingen en beperkingen

De lokale ontwikkelbrowser gaf tijdens herhaalde controles ongeveer 0,3–2,3 seconden tot DOMContentLoaded en het load-event van de wegmeldingenpagina. Dit zijn warme lokale metingen, met onderschepte bronresponsen, zonder mobiele netwerk-/CPU-beperking en deels terwijl builds draaiden. Ze meten geen productie-NS-latentie. Er is geen vergelijkbare vóórmeting vastgelegd; daarom wordt geen procentuele snelheidswinst geclaimd.

De productie-manifest bevestigt aparte imports voor de vijf aanvullende panelen en MapLibre. Een kaartbibliotheek blijft een grote bundel. Laden en kaartbediening moeten ook op een gewone telefoon met de productiebackend worden gemeten.

## Nog vereist vóór openbare publicatie

De bestaande openbare healthroute meldt dat de NS-sleutel is geconfigureerd. Dat bewijst geen toegang tot beide API-producten. Deze sessie heeft geen shelltoegang tot de bestaande hosting en heeft de sleutel niet opgehaald. Er is niets gepubliceerd of gepusht.

1. Voer in de bestaande backendhosting met de nieuwe backendcode `npm run ns:check-access` uit. Deze controle vraagt echte verstoringen en een reisadvies UT → ASD op en toont alleen succes, aantallen en ontvangsttijden. De sleutel verschijnt niet in de uitvoer.
2. Beide producten moeten toegankelijk zijn. Controleer zo nodig het abonnement in het NS API-portaal. Een leeg meldingenresultaat is toegestaan; controleer daarnaast minimaal één echt reisadvies met ritdelen en perrons.
3. Controleer beide nieuwe routes via de hosting, inclusief toegestane frontend-origin. Test een echte reis → trein, een echte melding en het gedrag bij bronuitval.
4. Publiceer de bijbehorende backend en frontend samen, met een groene CI-run op beide commits. Beoordeel laad-/kaartmetingen op een gewone telefoon en controleer de publieke bron-/contact-/privacyinformatie.

De lokale interface- en contractcontroles bewijzen de implementatie; de bovenstaande productiecontrole blijft de voorwaarde voor een openbare release.
