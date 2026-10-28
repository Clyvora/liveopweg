"use client";
import { useCallback, useSyncExternalStore } from "react";
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
const parse = (raw: string): string[] => { try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value.filter((code): code is string => typeof code === "string") : []; } catch { return []; } };
function persist(raw: string) {
  try { localStorage.setItem(key, raw); sessionValue = null; storageFailed = false; }
  catch { sessionValue = raw; storageFailed = true; }
  notify();
}
export function useFavoriteStations() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const error = useSyncExternalStore(subscribe, () => storageFailed, () => false);
  const toggle = useCallback((code: string) => {
    const current = parse(snapshot());
    persist(JSON.stringify(current.includes(code) ? current.filter(item => item !== code) : [...current, code].slice(-6)));
  }, []);
  return { favorites: parse(raw), toggle, error, retry: () => persist(snapshot()) };
}
