import { describe, expect, it, vi } from "vitest";
import { NsStationsClient } from "./ns-api.js";

describe("NsStationsClient", () => {
  it("keeps the key server-side and caches the stations response", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ payload: [{ code: "UT", namen: { lang: "Utrecht Centraal" } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const client = new NsStationsClient("secret-key", request, 60_000);

    const first = await client.getStations();
    const second = await client.getStations();

    expect(first).toEqual(second);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(String(url)).toBe("https://gateway.apiportal.ns.nl/reisinformatie-api/api/v2/stations");
    expect(options?.headers).toMatchObject({ "Ocp-Apim-Subscription-Key": "secret-key" });
  });

  it("rejects an empty subscription key", () => {
    expect(() => new NsStationsClient(" ")).toThrow("NS_API_KEY is empty");
  });
});
