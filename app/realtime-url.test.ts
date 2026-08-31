import { afterEach, describe, expect, it, vi } from "vitest";
import { realtimeHttpUrl, realtimeWebSocketUrl } from "./realtime-url.js";

afterEach(() => vi.unstubAllGlobals());

describe("realtime URLs", () => {
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
