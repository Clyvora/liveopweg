import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders de treinenkaart zonder overlappend meldingenpaneel", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Liveopweg/);
  assert.match(html, /href="\/meldingen"/);
  assert.match(html, /href="\/instellingen"/);
  assert.match(html, /Treinenkaart/);
  assert.match(html, /Live treinen/);
  assert.match(html, /Hoofdnavigatie/);
  assert.match(html, /Landelijke livestatus/);
  assert.match(html, /Stations/);
  assert.match(html, /Kies kaartweergave/);
  assert.match(html, /Standaard/);
  assert.match(html, /Licht/);
  assert.match(html, /Satelliet/);
  assert.match(html, /Inzoomen op kaart/);
  assert.match(html, /Uitzoomen op kaart/);
  assert.match(html, /Kaartbediening/);
  assert.match(html, /Sluit kaartlagen/);
  assert.match(html, /Zoek trein, station of materieel/);
  assert.match(html, /aria-label="Zoek trein, station of materieel"/);
  assert.doesNotMatch(html, /class="railAlertsPanel liveFeedPanel/);
  assert.doesNotMatch(html, /Open 3D-station/);
  assert.doesNotMatch(html, /Stations in meters/);
  assert.doesNotMatch(html, /REPLAY/);
  assert.doesNotMatch(html, /Ritinformatie wordt gekoppeld/);
  assert.doesNotMatch(html, /De interne score is geen kanspercentage/);
  assert.doesNotMatch(html, /Geselecteerde trein/);
  assert.doesNotMatch(html, /Trein 8667/);
  assert.doesNotMatch(html, /96% zeker/);
});

test("server-renders een aparte meldingenkaart zonder treinlaag", async () => {
  const response = await render("/meldingen");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Meldingenkaart/);
  assert.match(html, /Actuele meldingen/);
  assert.match(html, /Files/);
  assert.match(html, /Ongevallen &amp; incidenten/);
  assert.match(html, /Werkzaamheden/);
  assert.match(html, /Afsluitingen/);
  assert.match(html, /Veiligheidsmeldingen/);
  assert.match(html, /Alleen wegmeldingen · geen treinen/);
  assert.doesNotMatch(html, /class="trainOverlay"/);
  assert.doesNotMatch(html, /class="fleetTools"/);
});

test("server-renders een eigen instellingenpagina", async () => {
  const response = await render("/instellingen");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1>Instellingen<\/h1>/);
  assert.match(html, /Kleurthema/);
  assert.match(html, /Browsermeldingen/);
  assert.match(html, /Kaarten en filters/);
  assert.doesNotMatch(html, /class="liveMap"/);
});
