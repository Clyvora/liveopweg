# Fase 4 — Client interpolation

Status op 21 augustus 2026: de vloot wordt vloeiend gerenderd tussen bekende GPS-bronpunten. De client extrapoleert niet en stopt beweging zodra de bron stale is.

## Bewegingsmodel

```text
vorige bekende GPS-positie A ───── nieuwste bekende GPS-positie B
                  ↑
       renderTime = clienttijd - buffer
```

De client bewaart per voertuig de vorige en nieuwste geaccepteerde bronobservatie. Een `requestAnimationFrame`-loop berekent de kaartpositie op een begrensd tempo. De standaardbuffer is 12 seconden, iets langer dan de live gemeten broncadans van ongeveer 10 seconden. Daardoor ligt de rendertijd bij normale ontvangst tussen A en B en kan de positie monotoon worden geïnterpoleerd zonder toekomstige locatie te raden.

`NEXT_PUBLIC_RENDER_DELAY_MS` maakt de buffer configureerbaar tussen 0 en 30 seconden. De standaardwaarde is `12000`. Als de rendertijd voorbij B ligt, blijft de marker op B staan. Er is geen `lastPosition + velocity × time`, geen routeprediction en geen spoorclaim.

De oranje kaartstip is de gerenderde clientpositie. Een afzonderlijke ring toont voor de geselecteerde trein de laatste echte bronpositie. De UI benoemt beide coördinaten expliciet als `Rendered position` en `Last source position`.

## Stale en veiligheidslogica

De brondrempel komt uit de genormaliseerde observatie en is standaard 30 seconden. Daarna:

1. wordt de laatst bekende bronpositie behouden;
2. stopt iedere beweging;
3. wordt de modus `STALE_HOLD`;
4. daalt de renderconfidence verder naar nul bij 40 seconden;
5. blijft de bronleeftijd iedere seconde zichtbaar.

Een segment sneller dan 350 km/h op basis van afstand en broninterval geldt als een onwaarschijnlijke GPS-sprong. Dat segment wordt niet geïnterpoleerd, `movementPlausibility` wordt nul en de eindconfidence wordt begrensd op maximaal 49%. Dit is een veiligheidsfilter, geen correctie van het bronpunt: het raw punt blijft bewaard en zichtbaar als bronfeit.

## Reproduceerbare renderconfidence

De confidence beschrijft uitsluitend betrouwbaarheid van de clientrendering, niet de zekerheid van een spoor- of routekoppeling. De componenten zijn:

- `positionAge`: van 100% bij leeftijd nul naar 50% op de stale-drempel en naar 0% op 40 seconden;
- `gpsQuality`: HDOP van 1–10 wanneer aanwezig, anders satellietaantal van 3–12, anders `Onbekend`;
- `movementPlausibility`: 100% tot 350 km/h segmentsnelheid, anders 0%;
- `renderMethod`: 90% voor interpolatie, 100% voor bron-hold en 0% voor stale-hold.

De bekende componenten worden gewogen met respectievelijk 60%, 15%, 15% en 25% en daarna genormaliseerd. Een ontbrekende GPS-kwaliteitscomponent wordt niet verzonnen en valt uit de som. Banden zijn `HIGH ≥ 80%`, `MEDIUM ≥ 50%` en anders `LOW`. De volledige opbouw is uitklapbaar in de interface.

## Tests en beperkingen

De unit tests bewijzen:

- monotone vooruitgang tussen A en B;
- geen positie voorbij B;
- stilstand en lage confidence na timeout;
- geen interpolatie van een onwaarschijnlijke GPS-sprong.

De live integratieproef op 21 augustus 2026 vond voor trein `8645` een echte opeenvolgende bronupdate. Met de 12-secondenbuffer stond de client op interpolatievoortgang `0,505`, bij een bronleeftijd van `3,1 s` en renderconfidence `95% (HIGH)`. De rendered positie lag daarmee aantoonbaar tussen twee bekende punten en niet voorbij het nieuwste punt.

Een rekenproef over 268 echte voertuigparen en 120 renderframes voerde 32.160 motionberekeningen uit in 26,5 ms: gemiddeld 0,221 ms rekentijd per frame, exclusief MapLibre-rendering. De kaartupdate is via `requestAnimationFrame` begrensd op ongeveer 30 updates per seconde om clientbelasting te beperken.

Deze fase gebruikt nog een rechte WGS84-lijn tussen twee bronpunten. Dat is visuele clientinterpolatie en geen bewijs dat de trein precies over die lijn of een spoor reed. Fase 5 en 6 voegen eerst echte spoorgeometrie en map matching toe; pas daarna kan de rendering een spoorcurve volgen.
