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

test("server-renders uitsluitend de fullscreen livekaart met contextuele lagen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Liveopweg/);
  assert.match(html, /Files/);
  assert.match(html, /Ongevallen &amp; incidenten/);
  assert.match(html, /Werkzaamheden/);
  assert.match(html, /Afsluitingen/);
  assert.match(html, /Veiligheidsmeldingen/);
  assert.match(html, /leveranciersinformatie kan ongevalideerd zijn/);
  assert.match(html, /Actuele meldingen/);
  assert.match(html, /Snelle kaartfilters/);
  assert.match(html, /Legenda/);
  assert.match(html, /Kaartbediening/);
  assert.match(html, /Sluit kaartlagen/);
  assert.match(html, /Zoek trein, station of materieel/);
  assert.match(html, /aria-label="Zoek trein, station of materieel"/);
  assert.doesNotMatch(html, /Open 3D-station/);
  assert.doesNotMatch(html, /Stations in meters/);
  assert.doesNotMatch(html, /REPLAY/);
  assert.doesNotMatch(html, /Ritinformatie wordt gekoppeld/);
  assert.doesNotMatch(html, /De interne score is geen kanspercentage/);
  assert.doesNotMatch(html, /Geselecteerde trein/);
  assert.doesNotMatch(html, /Trein 8667/);
  assert.doesNotMatch(html, /96% zeker/);
});
