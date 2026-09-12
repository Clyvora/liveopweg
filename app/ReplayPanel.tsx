"use client";

import { useEffect, useMemo, useState } from "react";
import {
  railReplayCatalogSchema,
  railReplayResponseSchema,
  type RailReplayFrame,
} from "../packages/protocol/replay";
import { parseTimestamp, realtimeHttpUrl } from "./realtime-url";

export interface ReplayCursor {
  frames: RailReplayFrame[];
  frameIndex: number;
  clockTime: string;
}

interface ReplayPanelProps {
  vehicleId: string | null;
  trainNumber: string | null;
  onCursorChange: (cursor: ReplayCursor | null) => void;
}

function clockLabel(value: number | null): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
}

export function ReplayPanel({ vehicleId, trainNumber, onCursorChange }: ReplayPanelProps) {
  const [catalog, setCatalog] = useState<ReturnType<typeof railReplayCatalogSchema.parse> | null>(null);
  const [frames, setFrames] = useState<RailReplayFrame[]>([]);
  const [clock, setClock] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [state, setState] = useState<"CATALOG" | "IDLE" | "LOADING" | "READY" | "ERROR">("CATALOG");

  useEffect(() => {
    let disposed = false;
    void fetch(realtimeHttpUrl("/v1/replay/catalog"))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog")))
      .then((value) => railReplayCatalogSchema.parse(value))
      .then((value) => {
        if (disposed) return;
        setCatalog(value);
        setState("IDLE");
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn("[ReplayPanel:Catalog]", {
          timestamp: new Date().toISOString(),
          error: errorMessage,
          context: "fetch replay catalog",
        });
        if (!disposed) setState("ERROR");
      });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!vehicleId || !catalog?.availableFrom || !catalog.availableUntil) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setFrames([]);
        setClock(null);
        setPlaying(false);
        onCursorChange(null);
      });
      return () => { cancelled = true; };
    }
    let disposed = false;
    const until = parseTimestamp(catalog.availableUntil);
    const catalogFrom = parseTimestamp(catalog.availableFrom);
    if (until === null || catalogFrom === null) {
      console.warn("[ReplayPanel] Invalid catalog timestamps:", catalog);
      queueMicrotask(() => {
        if (!disposed) setState("ERROR");
      });
      return;
    }
    const from = Math.max(catalogFrom, until - 20 * 60_000);
    const query = new URLSearchParams({
      vehicleId,
      from: new Date(from).toISOString(),
      until: new Date(until).toISOString(),
    });
    queueMicrotask(() => {
      if (disposed) return;
      setState("LOADING");
      setPlaying(false);
    });
    const replayUrl = new URL(realtimeHttpUrl("/v1/replay/rail"));
    replayUrl.search = query.toString();
    void fetch(replayUrl)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("sequence")))
      .then((value) => railReplayResponseSchema.parse(value))
      .then((value) => {
        if (disposed) return;
        setFrames(value.frames);
        setClock(value.frames.length ? parseTimestamp(value.frames[0].eventTime) : null);
        setState("READY");
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn("[ReplayPanel:Sequence]", {
          timestamp: new Date().toISOString(),
          error: errorMessage,
          context: "fetch replay sequence",
          vehicleId,
        });
        if (disposed) return;
        setFrames([]);
        setClock(null);
        setState("ERROR");
      });
    return () => { disposed = true; };
  }, [catalog, onCursorChange, vehicleId]);

  const firstTime = frames.length ? parseTimestamp(frames[0].eventTime) : null;
  const lastTime = frames.length ? parseTimestamp(frames.at(-1)!.eventTime) : null;
  const frameIndex = useMemo(() => {
    if (clock === null || !Number.isFinite(clock)) return -1;
    let found = -1;
    for (let index = 0; index < frames.length; index += 1) {
      const frameTime = parseTimestamp(frames[index].eventTime);
      if (frameTime !== null && frameTime > clock) break;
      found = index;
    }
    return found;
  }, [clock, frames]);

  useEffect(() => {
    if (frameIndex < 0 || clock === null) onCursorChange(null);
    else onCursorChange({ frames, frameIndex, clockTime: new Date(clock).toISOString() });
  }, [clock, frameIndex, frames, onCursorChange]);

  useEffect(() => {
    if (!playing || clock === null || lastTime === null) return;
    const startedAt = performance.now();
    const startedClock = clock;
    let animationFrame = 0;
    const tick = (now: number) => {
      const next = Math.min(lastTime, startedClock + (now - startedAt) * speed);
      setClock(next);
      if (next >= lastTime) {
        setPlaying(false);
        return;
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [clock, lastTime, playing, speed]);

  const current = frameIndex >= 0 ? frames[frameIndex] : null;
  return (
    <section className="replayPanel" aria-label="Historische treinreplay">
      <header>
        <div>
          <p className="panelKicker">Fase 10 · deterministische replay</p>
          <h2><span>REPLAY</span> Kijk een bronrit terug</h2>
          <p>Bronpunten komen uit opgeslagen NDOV-berichten. De groene positie is opnieuw gematcht met de vastgepinde landelijke spoorgraph; dit is geen livebeeld.</p>
        </div>
        <div className="replayIdentity">
          <span>Geselecteerd</span>
          <strong>{vehicleId ? `Trein ${trainNumber ?? "onbekend"}` : "Kies eerst een trein"}</strong>
          <small>{catalog ? `${catalog.capturedMessages} bronberichten beschikbaar` : "archief wordt gelezen"}</small>
        </div>
      </header>
      <div className="replayControls">
        <button type="button" disabled={!frames.length} onClick={() => {
          if (clock === lastTime && firstTime !== null) setClock(firstTime);
          setPlaying((value) => !value);
        }}>{playing ? "Pauze" : "Afspelen"}</button>
        <button type="button" disabled={!frames.length} onClick={() => { setPlaying(false); setClock(firstTime); }}>Opnieuw</button>
        <label>
          <span>Snelheid</span>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={0.5}>0,5×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
          </select>
        </label>
        <div className="replayClock"><span>Virtuele GPS-tijd</span><strong>{clockLabel(clock)}</strong></div>
      </div>
      <input
        className="replayTimeline"
        type="range"
        aria-label="Replay-tijd"
        min={firstTime ?? 0}
        max={lastTime ?? 1}
        step={1_000}
        value={clock ?? 0}
        disabled={!frames.length}
        onChange={(event) => { setPlaying(false); setClock(Number(event.target.value)); }}
      />
      <footer>
        <span>{state === "LOADING" ? "Bronberichten decoderen…" : state === "ERROR" ? "Replayarchief niet beschikbaar" : frames.length ? `${frames.length} bronframes · ${clockLabel(firstTime)}–${clockLabel(lastTime)}` : "Nog geen frames voor deze trein in het gekozen archiefvenster"}</span>
        <span>{current?.match ? `${current.match.status} · ${current.match.confidenceClass} · herberekend` : "Bronpositie · geen geaccepteerde match"}</span>
      </footer>
    </section>
  );
}
