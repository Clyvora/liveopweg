const stationsUrl = "https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2/stations";

export type NsApiStatus = "DISABLED_CONFIG" | "CONFIGURED_NOT_USED";

export class NsStationsClient {
  private cached: { expiresAt: number; value: unknown } | null = null;

  constructor(
    private readonly subscriptionKey: string,
    private readonly request: typeof fetch = fetch,
    private readonly cacheTtlMs = 24 * 60 * 60 * 1_000,
  ) {
    if (!subscriptionKey.trim()) throw new Error("NS_API_KEY is empty");
  }

  async getStations(): Promise<unknown> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.value;

    const response = await this.request(stationsUrl, {
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": this.subscriptionKey,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`NS stations request failed with HTTP ${response.status}`);

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 10_000_000) throw new Error("NS stations response exceeds the 10 MB limit");
    const value: unknown = await response.json();
    this.cached = { expiresAt: now + this.cacheTtlMs, value };
    return value;
  }
}

export function nsApiStatus(): NsApiStatus {
  return process.env.NS_API_KEY ? "CONFIGURED_NOT_USED" : "DISABLED_CONFIG";
}
