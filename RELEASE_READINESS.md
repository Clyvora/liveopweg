# Basis voor publieke release

## Structuur

- `app/MobilityDashboard.tsx`: samenstelling van kaart, selectie en live gegevens.
- `app/feed-health.ts`: zuivere vertaling en validatie van bronstatussen; afzonderlijk te testen.
- `app/useFeedHealth.ts`: ophalen, annuleren en pauzeren van statusverzoeken.
- `app/next-train-stop.ts`: gedeelde ritlogica zonder afhankelijkheid van de schermcomponent.
- `app/AsyncPanel.tsx`: laadstatus en foutafhandeling voor aanvullende panelen.
- `app/release-ui.css`: publieksgerichte laadmeldingen en mobiele reishulpmiddelen.

De vier panelen voor stations, treinen, reizen en statistieken zijn dynamische imports. Voeg nieuwe aanvullende schermen op dezelfde manier toe. Importeer gedeelde hulpfuncties uit een kleine module zodat een statische import niet onbedoeld een volledig scherm weer in de startbundel trekt.

Binnenkomende berichten worden eerst op berichttype geselecteerd en daarna met het bijbehorende schema gevalideerd. De schema-validatie blijft verplicht. Bronstatussen blijven onafhankelijk van de WebSocketverbinding: een open verbinding bewijst geen gezonde gegevensbron.

## Uitgevoerde verbeteringen

- Panelen worden pas geladen bij openen; de productie-manifest bevat hiervoor vier afzonderlijke dynamische imports.
- Statusverzoeken pauzeren in een verborgen tabblad en vernieuwen bij terugkeer.
- Herverbinden gebruikt oplopende wachttijden met spreiding, maximaal ongeveer 30 seconden.
- Een mislukte paneelimport laat de kaart beschikbaar en biedt herladen aan.
- Technische wachtmeldingen zijn vervangen door uitleg over laden en onderbroken verbindingen.
- De reisplanner en statistieken zijn ook op mobiel bereikbaar.

## Nog vast te stellen voor publicatie

Deze wijzigingen zijn geen bevestiging dat de volledige applicatie klaar is voor productie. Controleer vóór publicatie:

1. Een groene GitHub-run op de te publiceren commit, inclusief schone dependency-installatie en beide deployment-builds.
2. Werkende productieverbinding naar de backend met toegestane origin en correcte URL-configuratie.
3. Zoekactie, treinselectie, stationsbord en reisresultaten met echte actuele gegevens. De lokale browsercontrole zonder actieve backend bewijst alleen de interface en het gedrag bij uitval.
4. Praktijkmetingen van laden en kaartbediening op een gewone telefoon. Code splitsen is aangetoond; er is nog geen snelheidspercentage gemeten.
5. Controle van bronvermelding, privacytekst, contactmogelijkheid en de beperkingen van de beschikbare reisinformatie.

De resterende grote technische onderdelen zijn de kaart- en realtime-effecten in `MobilityDashboard.tsx` en de oudere overlappende CSS-lagen. Splits deze vervolgens per verantwoordelijkheid met behoud van browsercontroles voor kaartcanvas, mobiel en donker thema.
