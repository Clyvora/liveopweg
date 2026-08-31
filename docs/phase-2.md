# Fase 2 — Alle actuele treinen

Status op 21 augustus 2026: de actuele NS-vloot wordt als één begrensde, selecteerbare realtime laag geleverd. De Fase 3-ritinformatie blijft gekoppeld aan de selectie van iedere afzonderlijke browser.

## Geleverde keten

```text
/RIG/NStreinpositiesInterface5
  → exact gzip-bronbericht + SHA-256
  → veilige Interface 5-decoder
  → ordering en dedupe per voertuig
  → vlootvenster van vijf minuten
  → atomaire file-backed vlootstate (+ optioneel Redis)
  → WebSocket v2-vlootsnapshot
  → één batch met upserts/verwijderingen per bronbericht
  → landelijke GeoJSON-kaartlaag
  → zoek- en selectiefunctie per browser
  → geselecteerde InfoPlus RIT-context uit Fase 3
```

Een vlootobject is een materieeldeel met een stabiele, namespaced `vehicleId`. Voor ieder voertuig wordt alleen een observatie met een latere GPS-brontijd geaccepteerd. Voertuigen zonder update binnen vijf minuten verdwijnen uit de live state en worden expliciet als `removedVehicleIds` naar clients gestuurd. De versheidsstatus van een bewaard punt wordt bij uitlezen opnieuw berekend; een oud punt wordt dus niet als verse GPS-meting gepresenteerd.

## WebSocket v2

De gateway stuurt bij verbinding één `rail.fleet.snapshot`. Daarna wordt ieder NDOV-bronbericht één `rail.fleet.batch` met alle geaccepteerde upserts en verwijderingen. Hierdoor ontstaan niet honderden losse WebSocket-berichten per bronpublicatie. Iedere batch heeft een oplopend volgnummer; bij een gat vraagt de client een volledige resync.

Treinselectie is per verbinding. Een client stuurt `protocolVersion: 2`, `type: select` en een bestaande `vehicleId`. De server antwoordt met `rail.selection.snapshot` en de bijbehorende Fase 3-ritsnapshot. Een selectie van de ene gebruiker verandert die van een andere gebruiker niet.

De kaart rendert de vloot als één MapLibre GeoJSON-source met één circle layer en een label layer vanaf hoger zoomniveau. Dit voorkomt honderden afzonderlijke HTML-markers. Zoeken kan op treinnummer, materieelnummer of interne voertuigidentiteit; kaartpunten zijn eveneens selecteerbaar.

## Live bewijs

Bij de integratiecontrole op 21 augustus 2026:

- leverde `/v1/fleet` protocolversie 2 met 355 actuele materieeldelen bij de eerste meting;
- groeide de live vloot tijdens de selectieproef naar 367 materieeldelen;
- meldde de positiebron `HEALTHY`;
- accepteerde de gateway een onafhankelijke selectie van trein `547`, materieel `9561`;
- ontving die client achtereenvolgens een vlootsnapshot, selectiesnapshot en ritsnapshot;
- bleef het livevenster expliciet 300 seconden.

De aantallen zijn momentopnamen uit de bron en geen gegarandeerde landelijke dekking.

## Dekking en eerlijke beperking

`NStreinpositiesInterface5` is de feitelijk bewezen actuele NS-positiebron. Fase 2 toont daarom alle actuele posities die deze interface levert, niet automatisch iedere trein van iedere Nederlandse vervoerder. Voor Arriva, Keolis, Qbuzz en andere railvervoerders is nog geen gelijkwaardige actuele railpositiebron met bewezen identiteitskoppeling geïmplementeerd. De UI meldt dit als `overige railvervoerders nog onbewezen`; er wordt geen dienstregelingspositie als GPS gepresenteerd.

## Verificatie

```text
npm run typecheck
npm run lint
npm test
npm run benchmark:decode
```

De tests controleren de vlootordering, dedupe, retentie, herstel uit opslag, veilige brondecoders en server-rendering zonder mocktrein. De live integratie controleert daarnaast vlootsnapshot, selectiebericht en gekoppelde ritcontext.
