type FeedHealthEntry = { status: string; lastReceivedAt: string | null; lastCheckedAt?: string | null; pollSeconds?: number };
export type FeedHealthSnapshot = { positions: FeedHealthEntry; journeys: FeedHealthEntry; roads: FeedHealthEntry };

export function parseFeedHealth(value: unknown): FeedHealthSnapshot | null {
  if (typeof value !== "object" || value === null || !("sources" in value)) return null;
  const sources = value.sources;
  if (typeof sources !== "object" || sources === null) return null;
  const entry = (candidate: unknown, timestampKey: "lastEnvelopeReceivedAt" | "lastReceivedAt"): FeedHealthEntry => {
    if (typeof candidate !== "object" || candidate === null || !("status" in candidate) || typeof candidate.status !== "string") {
      return { status: "UNKNOWN", lastReceivedAt: null };
    }
    const record = candidate as Record<string, unknown>;
    const received = record[timestampKey];
    const checked = record.lastCheckedAt;
    const pollSeconds = typeof record.pollSeconds === "number" ? record.pollSeconds : undefined;
    return {
      status: candidate.status,
      lastReceivedAt: typeof received === "string" && Number.isFinite(Date.parse(received)) ? received : null,
      ...(typeof checked === "string" && Number.isFinite(Date.parse(checked)) ? { lastCheckedAt: checked } : {}),
      ...(pollSeconds === undefined ? {} : { pollSeconds }),
    };
  };
  return {
    positions: entry("positions" in sources ? sources.positions : null, "lastEnvelopeReceivedAt"),
    journeys: entry("journeys" in sources ? sources.journeys : null, "lastEnvelopeReceivedAt"),
    roads: entry("ndwActueelBeeld" in sources ? sources.ndwActueelBeeld : null, "lastReceivedAt"),
  };
}

export function describeFeedHealth(feedHealth: FeedHealthSnapshot | null, feedHealthUnavailable: boolean, now: number, language: string) {
  return ([
    { key: "positions", name: language === "en" ? "Positions" : "Treinposities", source: feedHealth?.positions ?? null, maxAgeSeconds: 60 },
    { key: "journeys", name: language === "en" ? "Journeys" : "Ritten", source: feedHealth?.journeys ?? null, maxAgeSeconds: 300 },
    { key: "roads", name: "NDW", source: feedHealth?.roads ?? null, maxAgeSeconds: Math.max(120, (feedHealth?.roads.pollSeconds ?? 60) * 2) },
  ] as const).map((item) => {
    const source = item.source;
    const freshnessTimestamp = source ? (item.key === "roads" ? source.lastCheckedAt ?? source.lastReceivedAt : source.lastReceivedAt) : null;
    let state: "healthy" | "stale" | "offline" | "degraded" | "waiting" | "unknown";
    if (feedHealthUnavailable) state = "unknown";
    else if (!source) state = "waiting";
    else if (source.status === "DISCONNECTED") state = "offline";
    else if (source.status === "STARTING") state = "waiting";
    else if (source.status.startsWith("DEGRADED")) state = "degraded";
    else if (source.status !== "HEALTHY") state = "unknown";
    else if (!freshnessTimestamp || now - Date.parse(freshnessTimestamp) > item.maxAgeSeconds * 1_000) state = "stale";
    else state = "healthy";
    const statusText = language === "en"
      ? ({ healthy: "Live", stale: "Stale", offline: "Offline", degraded: "Issue", waiting: "Waiting", unknown: "Unknown" } as const)[state]
      : ({ healthy: "Live", stale: "Verouderd", offline: "Offline", degraded: "Probleem", waiting: "Wachten", unknown: "Onbekend" } as const)[state];
    const lastSeen = freshnessTimestamp
      ? new Date(freshnessTimestamp).toLocaleTimeString(language === "en" ? "en-GB" : "nl-NL", { hour: "2-digit", minute: "2-digit" })
      : language === "en" ? "no data received" : "nog geen data ontvangen";
    return { key: item.key, name: item.name, state, statusText, lastSeen };
  });

}
