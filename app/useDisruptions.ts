"use client";
import { useEffect, useState } from "react";
import type { DisruptionsResponse } from "../packages/protocol/ns-travel";
import { requestDisruptions } from "./travel-api";

export function useDisruptions() {
  const [data, setData] = useState<DisruptionsResponse | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    let active: AbortController | null = null;
    const refresh = async () => {
      if (active || document.visibilityState === "hidden") return;
      const controller = new AbortController(); active = controller;
      try { const value = await requestDisruptions(controller.signal); if (!disposed) { setData(value); setError(false); } }
      catch { if (!disposed) setError(true); }
      finally { active = null; }
    };
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { disposed = true; active?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [revision]);
  return { data, error, retry: () => setRevision(value => value + 1) };
}
