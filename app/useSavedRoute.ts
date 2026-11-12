"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { RailStation } from "../packages/domain-rail/stations";
import { parseSavedRoute, type FollowedRoute } from "./saved-route";

const key = "liveopweg-followed-route";
const eventName = "liveopweg:saved-route";
let sessionValue: string | null | undefined;
let failed = false;
const snapshot = () => { if (sessionValue !== undefined) return sessionValue; try { return localStorage.getItem(key); } catch { return null; } };
const subscribe = (listener: () => void) => {
  window.addEventListener(eventName, listener); window.addEventListener("storage", listener);
  return () => { window.removeEventListener(eventName, listener); window.removeEventListener("storage", listener); };
};
const persist = (raw: string | null) => {
  try { if (raw === null) localStorage.removeItem(key); else localStorage.setItem(key, raw); sessionValue = undefined; failed = false; }
  catch { sessionValue = raw; failed = true; }
  window.dispatchEvent(new Event(eventName));
};
export function useSavedRoute(stations: RailStation[]) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const error = useSyncExternalStore(subscribe, () => failed, () => false);
  const route = useMemo(() => parseSavedRoute(raw, stations), [raw, stations]);
  const save = useCallback((value: FollowedRoute | null) => persist(value ? JSON.stringify(value) : null), []);
  return { route, save, error, retry: () => persist(snapshot()) };
}
