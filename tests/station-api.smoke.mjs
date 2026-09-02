// Run against the local realtime service: node --test tests/station-api.smoke.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";

const base = process.env.REALTIME_TEST_URL ?? "http://127.0.0.1:8081";

test("stationborden zijn beschikbaar en onbekende codes krijgen 404", async () => {
  for (const code of ["UT", "asd", "VTN"]) {
    const response = await fetch(`${base}/v1/stations/${code}/board`, { signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200);
    const board = await response.json();
    assert.equal(board.stationCode, code.toUpperCase());
    assert.equal(board.coverage, "RECEIVED_JOURNEYS");
    assert.equal(board.windowMinutes, 60);
    for (const rows of [board.arrivals, board.departures]) {
      assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
      for (let i = 1; i < rows.length; i++) assert.ok(Date.parse(rows[i].expectedAt) >= Date.parse(rows[i - 1].expectedAt));
    }
  }
  const unknown = await fetch(`${base}/v1/stations/ZZZZZZZZ/board`, { signal: AbortSignal.timeout(10_000) });
  assert.equal(unknown.status, 404);
});

test("treinselectie kan worden gewist bij het openen van een station", async (t) => {
  const url = new URL("/v1/realtime", base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    let selectedId = null;
    let selectedConfirmed = false;
    const timeout = setTimeout(() => { socket.close(); reject(new Error("select/deselect timed out")); }, 10_000);
    const finish = () => { clearTimeout(timeout); socket.close(); resolve(); };
    socket.on("error", (error) => { clearTimeout(timeout); reject(error); });
    socket.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === "rail.fleet.snapshot" && !selectedId) {
        selectedId = message.data[0]?.vehicleId;
        if (!selectedId) { t.skip("Geen live vloot om selectie te testen"); finish(); return; }
        socket.send(JSON.stringify({ protocolVersion: 2, type: "select", vehicleId: selectedId }));
      }
      if (message.type !== "rail.selection.snapshot") return;
      if (!selectedConfirmed && message.vehicleId === selectedId && selectedId) {
        selectedConfirmed = true;
        socket.send(JSON.stringify({ protocolVersion: 2, type: "deselect" }));
      } else if (selectedConfirmed && message.vehicleId === null) {
        try { assert.equal(message.data, null); finish(); } catch (error) { clearTimeout(timeout); socket.close(); reject(error); }
      }
    });
  });
});
