import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTimestamp, realtimeHttpUrl, realtimeWebSocketUrl } from "./realtime-url.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("realtime URLs", () => {
  it("keeps the central gateway HTTP and WebSocket contracts on one configured host", () => {
    vi.stubGlobal("window", { location: new URL("https://frontend.example/") });
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://gateway.example/v1/realtime");
    expect(realtimeWebSocketUrl()).toBe("wss://gateway.example/v1/realtime");
    expect(realtimeHttpUrl("/v1/fleet")).toBe("https://gateway.example/v1/fleet");
  });
  it("gebruikt lokaal de afzonderlijke gatewaypoort", () => {
    vi.stubGlobal("window", { location: new URL("http://localhost:3000/") });
    expect(realtimeWebSocketUrl()).toBe("ws://localhost:8081/v1/realtime");
    expect(realtimeHttpUrl("/health")).toBe("http://localhost:8081/health");
  });

  it("gebruikt in productie dezelfde origin zodat de reverse proxy kan routeren", () => {
    vi.stubGlobal("window", { location: new URL("https://mobility.example/") });
    expect(realtimeWebSocketUrl()).toBe("wss://mobility.example/v1/realtime");
    expect(realtimeHttpUrl("/v1/fleet")).toBe("https://mobility.example/v1/fleet");
  });
});

describe("parseTimestamp", () => {
  it("parses valid ISO timestamps", () => {
    expect(parseTimestamp("2026-08-21T12:00:00Z")).toBe(Date.parse("2026-08-21T12:00:00Z"));
  });
  it("returns null for empty and null values", () => {
    expect(parseTimestamp(null)).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });
  it("returns null for malformed timestamps", () => {
    expect(parseTimestamp("invalid")).toBeNull();
    expect(parseTimestamp("not-a-date")).toBeNull();
    expect(parseTimestamp("garbage string")).toBeNull();
  });
});
