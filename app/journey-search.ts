import { z } from "zod";
import { realtimeHttpUrl } from "./realtime-url";

const stationPointSchema = z.object({ code: z.string(), name: z.string() });
const legSchema = z.object({
  journeyId: z.string(),
  trainNumber: z.string(),
  serviceType: z.string(),
  from: stationPointSchema,
  to: stationPointSchema,
  departureAt: z.string().datetime(),
  arrivalAt: z.string().datetime(),
  departureDelaySeconds: z.number().nullable(),
  arrivalDelaySeconds: z.number().nullable(),
});

export const journeySearchResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  coverage: z.literal("LIVE_INFO_PLUS"),
  connections: z.array(z.object({
    id: z.string(),
    legs: z.array(legSchema).min(1).max(2),
    departureAt: z.string().datetime(),
    arrivalAt: z.string().datetime(),
    transferStation: stationPointSchema.nullable(),
    delaySeconds: z.number().nullable(),
  })),
});

export type JourneySearchResponse = z.infer<typeof journeySearchResponseSchema>;
export type JourneyConnection = JourneySearchResponse["connections"][number];

export async function searchJourneys(
  originCode: string,
  destinationCode: string,
  signal?: AbortSignal,
): Promise<JourneySearchResponse> {
  const url = new URL(realtimeHttpUrl("/v1/journeys/search"));
  url.searchParams.set("from", originCode);
  url.searchParams.set("to", destinationCode);
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: "no-store", headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("journey_search_failed");
  const parsed = journeySearchResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("journey_search_invalid_response");
  return parsed.data;
}
