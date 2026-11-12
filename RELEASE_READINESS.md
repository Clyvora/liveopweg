# Liveopweg: treinradar en releasecontrole

## NS-toegang bevestigd — 12 november 2026, 19:31 UTC

De bestaande `NS_API_KEY` is rechtstreeks in de draaiende Northflank-container getest, zonder de sleutel uit te lezen of te tonen. De officiële meldingenroute gaf HTTP 200 met 9 meldingen; de officiële reisadviesroute gaf HTTP 200 met 5 adviezen voor UT → ASD. Voor deze twee aanvragen zijn geen gewijzigde NS-productrechten nodig. Dit bevestigt brontoegang; de bijgewerkte eigen backendroutes en frontend moeten na deployment nog samen worden gecontroleerd. Er is bij deze controle niets gedeployed of aan de sleutel gewijzigd.

## API, posities en treinbeelden — 12 november 2026

De backendcontrole vond een concrete oorzaak van de verkeerde kaartposities: de gepubliceerde graph-audit verwees naar een andere bronversie dan de spoorgraph, waardoor de volledige matcher uitgeschakeld was. De audit is opnieuw berekend. Nieuwe imports maken hun audit mee aan; de backend herstelt een ontbrekende of afwijkende audit bij opstarten. Overweggeometrie wordt nu ook meegenomen in de Docker-context.

De interface koppelt spoormatches uitsluitend aan hun eigen GPS-meting. Ongeldige, toekomstige en te oude metingen worden niet als actuele posities getoond. Gekoppelde stellen tellen als één trein op de kaart en in zoeken, met behoud van de samenstelling in de details. De zijbeelden en kaartbeelden behouden hun verhouding; mislukte afbeeldingen krijgen een bruikbare terugval zonder eindeloze herhaalverzoeken. Voor ontbrekende materieelillustraties verschijnt een neutrale aanduiding, geen afbeelding van een ander type. Verouderde snelheid wordt niet als actueel getoond en de detailklok loopt onafhankelijk van de kaart.

De backend bevat gedeelde bronvalidatie, begrensde caches, gedeelde gelijke verzoeken, afhandeling van bronlimieten, veilige HTTP-fouten, ondersteuning voor nachtritten en een nieuw compatibel treinniveau op `GET /v1/trains`. Het bestaande vloot- en WebSocket-contract blijft beschikbaar. Stationcategorieën accepteren varianten in de bronnotatie en vallen terug op de bestaande catalogus; de huidige hosting gaf alle 397 stations als klein station terug.

Controles: 142 backendtests en zes HTTP/WebSocket-procescontroles, 99 frontendtests, drie servergerenderde paginacontroles, typecontrole, lint en beide frontendbuilds. Aanvullende browsertests controleren samenstellingen, zoeken op gekoppeld materieel, afbeeldingsuitval, verlopen metingen, snelheid, herstel en correcte beeldverhoudingen. Een leescontrole met echte openbare vlootdata bevestigde dat de herstelde lokale matcher bruikbare projecties kan maken; afstanden tot spoor bewijzen geen exacte fysieke positie of wisselstand.

Alles blijft lokaal. De hosting draait nog de oudere API: de eigen reisadvies- en spoormeldingenroutes gaven daar 404. NS-brontoegang is inmiddels bevestigd zoals hierboven beschreven. Na publicatie van beide projecten moeten de API-versie, matcher, stationcategorieën en eigen routes op de hosting opnieuw worden gecontroleerd. De volledige onderbouwing en bronnen staan in `../ClyvoraAPI/services/liveopweg/API_REVIEW_2026-11-12.md`.

## Ontwerp en bugfixes — 12 november 2026

Het goedgekeurde beeld met witte horizontale navigatie, compacte zoekbalk, blauwe acties en een zwevend treinpaneel is de nieuwe visuele referentie. Desktop heeft een navigatiebalk van 56 px, een rechterpaneel van 396 px, rustige randen en kleinere typografie. Mobiel gebruikt dezelfde onderdelen in een uitklapbaar paneel boven vijf navigatieknoppen. De bestaande treinbeelden blijven behouden. Stations, favorieten, planner, meldingen, vloot, kaartmenu en instellingen delen dezelfde componentopmaak.

De vervangen `dashboard-polish.css`, `sections.css` en `release-ui.css` zijn verwijderd. De actieve opmaak heeft vier eigenaren: `globals.css` voor tokens/basis, `radar.css` voor navigatie/kaart, `ui.css` voor gedeelde schermen en `train-panel.css` voor treininformatie.

Verholpen problemen:

- Een bewaarde route werd pas na openen van de planner hersteld. De radar herstelt deze nu direct en deelt wijzigingen tussen schermen en tabbladen. Geblokkeerde opslag houdt wijzigingen tijdelijk bij en biedt opnieuw opslaan aan.
- Een zevende favoriet verwijderde stilzwijgend de eerste. Favorieten worden nu zonder die willekeurige limiet bewaard.
- Tab kon in de stationskiezer eindigen op een inmiddels verdwenen suggestie. Focus blijft nu op het invoerveld tot de volgende echte bediening.
- Laat ontvangen ritinformatie kon bij een inmiddels andere trein verschijnen. Snapshot- en deltaberichten moeten nu bij de geselecteerde trein horen; de gekoppelde dienstdata moeten overeenkomen.
- Vertraagde aankomsten konden worden overgeslagen als de geplande vertrektijd al voorbij was. Een trein op het station toont vertrekgegevens; een aankomst over enkele seconden wordt niet alvast als aangekomen beschreven.
- Verouderde snelheidsmetingen telden mee in het vlootoverzicht. De meetwaarden verlopen nu mee met de tijd.
- Een geslaagde lege vloot bleef als laden verschijnen. De interface maakt nu onderscheid tussen laden, geen posities en een onderbroken verbinding.
- Een treinlink kon vóór de kaart laden en de kaart op landelijk niveau achterlaten. Selectie en zoomen wachten nu op de kaart. Handmatig slepen stopt automatisch volgen.
- Kaartzoom kon achter een paneel vallen. De bediening blijft naast of onder het paneel bereikbaar. Kaartlagen en kaartstijl staan samen in één menu.
- Laat ontvangen locatiegegevens verplaatsen de kaart niet meer nadat iemand het buurtpaneel heeft verlaten.
- Routecoördinaten en haltemetadata worden gevalideerd voordat de kaart ze verwerkt. Een geannuleerde routeaanvraag kan de nieuwe selectie niet overschrijven.

De treinacties volgen, delen en dienstregeling hebben een werkende vervolgactie. Delen gebruikt de systeemdialoog of kopiëren, met een selecteerbare link als de browser dat blokkeert. Dienstregeling opent en focust de haltevolgorde. Meldingen inklappen verplaatst de kaart niet meer; filters verbergen een via de kaart gekozen melding niet stilzwijgend.

Lokale controle:

- 88 regressietests, typecontrole en lint geslaagd.
- Cloudflare-build, Vercel-build en drie controles van servergerenderde pagina's geslaagd. De buildgereedschappen melden nog waarschuwingen over grote kaartbundels en optionele tracingpakketten; beide builds eindigen succesvol.
- Browsercontroles geslaagd voor zoeken → volgen → terug, station → trein, favorieten, reisadvies → radar → reisadvies, meldingen en kaartlagen.
- Zes panelen, instellingen en wegmeldingen gecontroleerd op 390, 768, 1024, 1440 en 1920 px, in licht en donker. Aanvullende vergelijkingsbeelden op 1718 × 916 en 390 × 844.
- Geweigerde locatie, bronuitval, lege antwoorden, mislukte kaarttegels, opslagblokkade en herstel gecontroleerd. Escape/focusherstel, Tab in de stationskiezer, mobiel slepen en aanraakvlakken gecontroleerd. De contrastcontrole voor planner en instellingen rapporteert geen fouten in beide thema's; dit vervangt geen volledige schermlezertest.
- Een lange stationslijst herstelde exact dezelfde scrollpositie: 4857 → 4857 px.
- Browserfixtures bestaan alleen in de tests; ze worden niet in de openbare app ingebouwd. Vergelijkingsbeelden dragen `TESTGEGEVENS` in het treinpaneel.

De goedgekeurde afbeelding staat lokaal in `output/design/approved-radar-reference-20261112.png`; actuele browserbeelden in `output/playwright/reference-desktop-TESTGEGEVENS.png` en `output/playwright/reference-mobile-TESTGEGEVENS.png`. Deze uitvoerbestanden zijn genegeerd door Git. De echte kaart, treinen, tijden en beschikbare trajectgeometrie zijn dynamisch; de gegenereerde geografie en voorbeeldwaarden worden niet als openbare gegevens gekopieerd.

Een vroege lokale ontwikkelmeting van de wegmeldingenpagina gaf 667/728 ms voor DOMContentLoaded/load; een latere controle 673/733 ms. Dit zijn losse lokale controles met browserfixtures, geen vergelijkbare productiebenchmark of bewijs van een snelheidswinst.

De wijzigingen zijn lokaal. Productietoegang tot beide NS-producten, actuele gegevens op de hosting, CI en publicatie zijn hiermee niet bevestigd. Deze ronde verandert de backend niet. De eerdere releasevoorwaarden hieronder blijven gelden.

## Eerdere implementatie — 28 oktober 2026

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

De oorspronkelijke healthcontrole bevestigde alleen dat de sleutel aanwezig was. De aanvullende controle van 12 november om 19:31 UTC bevestigt toegang tot beide officiële NS-routes vanuit de bestaande hosting. De sleutel is niet getoond of gekopieerd. Er is niets gepubliceerd of gepusht.

1. Herhaal na deployment met de nieuwe backendcode `npm run ns:check-access`. Brontoegang is bevestigd; deze herhaling controleert ook de nieuwe normalisatie. De controle toont alleen succes, aantallen en ontvangsttijden. De sleutel verschijnt niet in de uitvoer.
2. Controleer minimaal één echt genormaliseerd reisadvies met ritdelen en perrons. Een leeg meldingenresultaat is toegestaan; de huidige NS-productrechten werkten bij de directe broncontrole.
3. Controleer beide nieuwe routes via de hosting, inclusief toegestane frontend-origin. Test een echte reis → trein, een echte melding en het gedrag bij bronuitval.
4. Publiceer de bijbehorende backend en frontend samen, met een groene CI-run op beide commits. Beoordeel laad-/kaartmetingen op een gewone telefoon en controleer de publieke bron-/contact-/privacyinformatie.

De lokale interface- en contractcontroles bewijzen de implementatie; de bovenstaande productiecontrole blijft de voorwaarde voor een openbare release.
