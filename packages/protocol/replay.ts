import { z } from "zod";
import { railObservationSchema, railTrackMatchSchema } from "./rail.js";

export const replaySourceObservationSchema = railObservationSchema.omit({ time: true }).extend({
  time: z.object({
    sourceMeasuredAt: z.string().datetime().nullable(),
    sourceGeneratedAt: z.string().datetime().nullable(),
    sourcePublishedAt: z.string().datetime().nullable(),
    receivedAt: z.string().datetime(),
  }),
});

export const replayTrackMatchSchema = railTrackMatchSchema.omit({ matchedAt: true });

export const railReplayFrameSchema = z.object({
  eventTime: z.string().datetime(),
  source: replaySourceObservationSchema,
  match: replayTrackMatchSchema.nullable(),
});

export type RailReplayFrame = z.infer<typeof railReplayFrameSchema>;

export const railReplayCatalogSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("rail.replay.catalog"),
  availableFrom: z.string().datetime().nullable(),
  availableUntil: z.string().datetime().nullable(),
  capturedMessages: z.number().int().nonnegative(),
  maximumWindowSeconds: z.number().int().positive(),
  source: z.literal("ndov.ns.train-positions.interface-5"),
});

export const railReplayResponseSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("rail.replay.sequence"),
  vehicleId: z.string().min(1),
  requestedFrom: z.string().datetime(),
  requestedUntil: z.string().datetime(),
  frames: z.array(railReplayFrameSchema).max(2_000),
  reconstruction: z.object({
    sourceOrigin: z.literal("STORED_RAW_PAYLOAD"),
    matchOrigin: z.enum(["RECOMPUTED_WITH_PINNED_GRAPH", "GRAPH_UNAVAILABLE"]),
    graphPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    matcherMethod: z.literal("national-track-matcher@2.0.0").nullable(),
    renderStateStored: z.literal(false),
  }),
});

export type RailReplayResponse = z.infer<typeof railReplayResponseSchema>;
