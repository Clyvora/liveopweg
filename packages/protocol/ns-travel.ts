import { z } from "zod";

const time = z.string().datetime();
export const travelPointSchema = z.object({
  code: z.string().nullable(), name: z.string(), plannedAt: time.nullable(), actualAt: time.nullable(),
  track: z.string().nullable(), plannedTrack: z.string().nullable(),
});
export const adviceLegSchema = z.object({
  id: z.string(), mode: z.string(), service: z.string(), trainNumber: z.string().nullable(),
  origin: travelPointSchema, destination: travelPointSchema, cancelled: z.boolean(), messages: z.array(z.string()),
});
export const adviceResponseSchema = z.object({
  source: z.literal("NS"), fetchedAt: time, journeys: z.array(z.object({
    id: z.string(), durationMinutes: z.number().nonnegative().nullable(), transfers: z.number().int().nonnegative(),
    cancelled: z.boolean(), messages: z.array(z.string()), legs: z.array(adviceLegSchema).min(1),
  })),
});
export const disruptionSchema = z.object({
  id: z.string(), title: z.string(), type: z.enum(["DISRUPTION", "MAINTENANCE", "CALAMITY"]),
  description: z.string(), start: time.nullable(), end: time.nullable(),
  stations: z.array(z.object({ code: z.string().nullable(), name: z.string(), latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable() })),
  geometry: z.object({ type: z.literal("MultiLineString"), coordinates: z.array(z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(2)) }).nullable(),
});
export const disruptionsResponseSchema = z.object({
  source: z.literal("NS"), fetchedAt: time.nullable(), stale: z.boolean(), disruptions: z.array(disruptionSchema),
});
export type AdviceResponse = z.infer<typeof adviceResponseSchema>;
export type AdviceLeg = z.infer<typeof adviceLegSchema>;
export type RailDisruption = z.infer<typeof disruptionSchema>;
export type DisruptionsResponse = z.infer<typeof disruptionsResponseSchema>;
