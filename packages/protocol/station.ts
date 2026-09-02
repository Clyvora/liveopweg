import { z } from "zod";

const stationBoardEntrySchema = z.object({
  id: z.string(),
  trainNumber: z.string(),
  serviceDate: z.string().date(),
  direction: z.string(),
  operator: z.string().nullable(),
  serviceType: z.string(),
  plannedAt: z.string().datetime().nullable(),
  expectedAt: z.string().datetime(),
  timeBasis: z.enum(["UPDATED", "PLANNED"]),
  delaySeconds: z.number().nullable(),
  track: z.string().nullable(),
  plannedTrack: z.string().nullable(),
  trackChanged: z.boolean(),
  cancelled: z.boolean(),
  vehicleId: z.string().nullable(),
  rollingStock: z.string().nullable(),
});

export const stationBoardSchema = z.object({
  stationCode: z.string(),
  generatedAt: z.string().datetime(),
  lastReceivedAt: z.string().datetime().nullable(),
  sourceHealthy: z.boolean(),
  coverage: z.literal("RECEIVED_JOURNEYS"),
  windowMinutes: z.literal(60),
  departures: z.array(stationBoardEntrySchema),
  arrivals: z.array(stationBoardEntrySchema),
});

export type StationBoardEntry = z.infer<typeof stationBoardEntrySchema>;
export type StationBoard = z.infer<typeof stationBoardSchema>;
