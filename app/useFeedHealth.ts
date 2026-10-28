"use client";

import { useEffect, useState } from "react";
import { realtimeHttpUrl } from "./realtime-url";
import { parseFeedHealth, type FeedHealthSnapshot } from "./feed-health";

export function useFeedHealth() {
  const [feedHealth, setFeedHealth] = useState<FeedHealthSnapshot | null>(null);
  const [feedHealthUnavailable, setFeedHealthUnavailable] = useState(false);
  useEffect(() => {
    let stopped = false;
    let controller: AbortController | null = null;
    const refreshFeedHealth = async () => {
      if (controller || document.visibilityState === "hidden") return;
      controller = new AbortController();
      const requestController = controller;
      try {
        const response = await fetch(realtimeHttpUrl("/health"), {
          signal: AbortSignal.any([requestController.signal, AbortSignal.timeout(10_000)]),
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error("health_request_failed");
        const parsed = parseFeedHealth(await response.json());
        if (!parsed) throw new Error("health_response_invalid");
        if (!stopped) {
          setFeedHealth(parsed);
          setFeedHealthUnavailable(false);
        }
      } catch {
        if (!stopped && !requestController.signal.aborted) setFeedHealthUnavailable(true);
      } finally {
        if (controller === requestController) controller = null;
      }
    };
    void refreshFeedHealth();
    const interval = window.setInterval(() => { void refreshFeedHealth(); }, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") void refreshFeedHealth(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      controller?.abort();
    };
  }, []);
  return { feedHealth, feedHealthUnavailable };
}
