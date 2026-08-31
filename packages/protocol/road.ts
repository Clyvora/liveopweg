import { z } from "zod";

export const roadEventTypeSchema = z.enum([
  "congestion",
  "accident",
  "incident",
  "roadworks",
  "closure",
  "speedRestriction",
  "safety",
  "weather",
  "obstacle",
  "other",
]);

export const roadEventStatusSchema = z.enum(["ACTIVE", "PLANNED", "STALE", "ENDED"]);

const coordinateSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

export const roadGeometrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Point"), coordinates: coordinateSchema }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(coordinateSchema).min(2) }),
  z.object({ type: z.literal("MultiLineString"), coordinates: z.array(z.array(coordinateSchema).min(2)).min(1) }),
]);

const nullableIsoTime = z.string().datetime().nullable();

export const roadEventSchema = z.object({
  id: z.string().min(1),
  situationId: z.string().min(1),
  sourceId: z.string().min(1),
  version: z.number().int().nonnegative(),
  type: roadEventTypeSchema,
  detailType: z.string().min(1),
  source: z.string().min(1),
  roadName: z.string().min(1).nullable(),
  direction: z.string().min(1).nullable(),
  description: z.string().min(1).nullable(),
  geometry: roadGeometrySchema,
  delaySeconds: z.number().nonnegative().nullable(),
  queueLengthMeters: z.number().nonnegative().nullable(),
  temporarySpeedLimitKmh: z.number().positive().nullable(),
  severity: z.string().min(1),
  safetyRelated: z.boolean(),
  status: roadEventStatusSchema,
  time: z.object({
    publicationTime: z.string().datetime(),
    sourceCreatedAt: nullableIsoTime,
    sourceUpdatedAt: nullableIsoTime,
    validFrom: nullableIsoTime,
    validUntil: nullableIsoTime,
    receivedAt: z.string().datetime(),
    normalizedAt: z.string().datetime(),
  }),
  provenance: z.object({
    sourceId: z.literal("ndw.datex3.actueel-beeld"),
    sourceUrl: z.string().url(),
    schemaVersion: z.literal("DATEX-II-v3-NL-actueel-beeld@2025-06-27"),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
    origin: z.literal("SOURCE"),
    geometryOrigin: z.enum(["POINT_BY_COORDINATES", "GML_LINE_STRING"]),
  }),
  qualityFlags: z.array(z.string()),
});

export type RoadEvent = z.infer<typeof roadEventSchema>;

export const roadSnapshotMessageSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("road.event.snapshot"),
  sequence: z.number().int().nonnegative(),
  sentAt: z.string().datetime(),
  publicationTime: z.string().datetime().nullable(),
  data: z.array(roadEventSchema),
});

export const roadBatchMessageSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("road.event.batch"),
  sequence: z.number().int().positive(),
  sentAt: z.string().datetime(),
  publicationTime: z.string().datetime(),
  upserts: z.array(roadEventSchema),
  removedEventIds: z.array(z.string().min(1)),
});

export type RoadRealtimeMessage =
  | z.infer<typeof roadSnapshotMessageSchema>
  | z.infer<typeof roadBatchMessageSchema>;
