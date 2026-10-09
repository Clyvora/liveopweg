# Reisplanner en feedstatussen

## Doel

De bestaande routekeuze wordt een bruikbare actuele reisplanner die beschikbare treinverbindingen van herkomst naar bestemming toont, terwijl reizigers kunnen zien welke databronnen online en recent zijn.

## Ervaring

- Reiziger kiest twee verschillende stations en vraagt verbindingen op.
- De planner toont directe verbindingen en verbindingen met maximaal één overstap.
- Alleen ritten met een vertrek binnen de komende 60 minuten komen in de resultaten.
- Bij overstappen geldt minimaal 8 minuten overstaptijd.
- Geannuleerde haltes/ritten worden uitgesloten. Werkelijke tijden worden gebruikt als ze beschikbaar zijn; anders de geplande tijden.
- Resultaten tonen vertrek, aankomst, eventuele overstap en vertraging. Selectie kan de bijbehorende trein op de kaart volgen wanneer daarvoor een livepositie beschikbaar is.
- De interface maakt duidelijk dat resultaten afkomstig zijn uit de ontvangen InfoPlus-ritten en daarom geen volledige dienstregeling garanderen. Bij lege resultaten worden onderscheidende uitleg en herstelbare foutstatussen getoond.

## Gegevens en interfaces

- De backend zoekt in de in-memory reisstatus die al door de InfoPlus-feed wordt bijgewerkt; er komt geen externe dienstregelingprovider bij.
- Een HTTP-interface accepteert geldige, verschillende stationscodes en geeft passende gevonden verbindingen en tijden terug. Ongeldige invoer wordt als clientfout afgewezen.
- De interface voor de frontend blijft binnen de bestaande realtime HTTP-basis-URL-configuratie.
- De frontend vraagt verbindingen op bij expliciete zoekactie en voorkomt dat verouderde antwoorden een nieuwere zoekactie overschrijven.
- De bestaande `/health`-respons is de bron voor aparte statuskaarten/labels voor treinposities, InfoPlus-reizen en NDW-verkeersmeldingen. De client ververst deze status elke 15 seconden. WebSocketverbinding blijft afzonderlijk zichtbaar.

## Fout- en actualiteitsgedrag

- Een feed kan `HEALTHY`, `DISCONNECTED` of `DEGRADED_*` rapporteren; de interface vertaalt die status en laatste ontvangsttijd naar leesbare tekst.
- Een feed zonder recente ontvangst wordt als mogelijk verouderd getoond, niet als gezonde actuele data.
- Een mislukte status- of zoekopvraag toont een herstelbare melding en laat de rest van de app bruikbaar.
- Bij onvolledige feeddekking meldt de planner dat ontbrekende verbindingen mogelijk zijn.

## Grenzen

- Geen voorspelling van overstaprisico, toegankelijkheidsfilters, alternatieve vervoersmiddelen of externe volledige dienstregeling.
- Geen schijnnauwkeurigheid: alleen gegevens aanwezig in de live InfoPlus-ritten worden gebruikt.
