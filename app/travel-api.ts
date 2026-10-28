import { adviceResponseSchema, disruptionsResponseSchema } from "../packages/protocol/ns-travel";
import { realtimeHttpUrl } from "./realtime-url";

export async function travelRequest(path: string, query: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const url = new URL(realtimeHttpUrl(path));
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: "no-store" });
  if (!response.ok) throw new Error("travel_temporarily_unavailable");
  return response.json();
}
export async function requestAdvice(from: string, to: string, dateTime: string | null, language: string, signal: AbortSignal) {
  return adviceResponseSchema.parse(await travelRequest("/v1/journeys/advice", { from, to, language, ...(dateTime ? { dateTime } : {}) }, signal));
}
export async function requestDisruptions(signal: AbortSignal) {
  return disruptionsResponseSchema.parse(await travelRequest("/v1/rail/disruptions", {}, signal));
}
