"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseFavoriteStations, toggleFavoriteStation } from "./favorite-stations";
const key = "liveopweg-favorite-stations";
const eventName = "liveopweg:favorites";
let sessionValue: string | null = null;
let storageFailed = false;
const subscribe = (listener: () => void) => {
  window.addEventListener("storage", listener); window.addEventListener(eventName, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(eventName, listener); };
};
const snapshot = () => { if (sessionValue !== null) return sessionValue; try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; } };
const notify = () => window.dispatchEvent(new Event(eventName));
function persist(raw: string) {
  try { localStorage.setItem(key, raw); sessionValue = null; storageFailed = false; }
  catch { sessionValue = raw; storageFailed = true; }
  notify();
}
export function useFavoriteStations() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const error = useSyncExternalStore(subscribe, () => storageFailed, () => false);
  const favorites = useMemo(() => parseFavoriteStations(raw), [raw]);
  const toggle = useCallback((code: string) => {
    persist(JSON.stringify(toggleFavoriteStation(parseFavoriteStations(snapshot()), code)));
  }, []);
  return { favorites, toggle, error, retry: () => persist(snapshot()) };
}
