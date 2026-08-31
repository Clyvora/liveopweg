import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders fase 10 met replay, NDW-weglagen, spoor en drie 3D-stations", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Liveopweg/);
  assert.match(html, /Live vooruit/);
  assert.match(html, /Brongetrouw terug/);
  assert.match(html, /Fase 10 · Generalisatie &amp; replay/);
  assert.match(html, /Files/);
  assert.match(html, /Ongevallen &amp; incidenten/);
  assert.match(html, /Werkzaamheden/);
  assert.match(html, /Afsluitingen/);
  assert.match(html, /Veiligheidsmeldingen/);
  assert.match(html, /leveranciersinformatie kan ongevalideerd zijn/);
  assert.match(html, /Kies een melding op de kaart/);
  assert.match(html, /Regionale fallback/);
  assert.match(html, /Stations in meters/);
  assert.match(html, /Niet in giswerk/);
  assert.match(html, /Open 3D-station/);
  assert.match(html, /Amsterdam Centraal/);
  assert.match(html, /Rotterdam Centraal/);
  assert.match(html, /REPLAY/);
  assert.match(html, /geen livebeeld/);
  assert.match(html, /Utrecht · Amsterdam · Rotterdam/);
  assert.match(html, /De interne score is geen kanspercentage/);
  assert.match(html, /Buiten Nederland \/ niet beschikbaar/);
  assert.match(html, /Renderconfidence/);
  assert.match(html, /Displayed position/);
  assert.match(html, /Last source position/);
  assert.match(html, /Zoek treinnummer of materieel/);
  assert.match(html, /Selecteer een trein/);
  assert.match(html, /InfoPlus RIT v5/);
  assert.match(html, /Ritinformatie wordt gekoppeld/);
  assert.match(html, /treinnummer \+ lokale dienstdatum/);
  assert.doesNotMatch(html, /Trein 8667/);
  assert.doesNotMatch(html, /96% zeker/);
});
