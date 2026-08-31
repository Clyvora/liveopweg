import { z } from "zod";

const nullableIsoTime = z.string().datetime().nullable();

export const railObservationSchema = z.object({
  observationId: z.string().min(1),
  vehicleId: z.string().min(1),
  trainNumber: z.string().min(1),
  materialNumber: z.string().nullable(),
  materialSequence: z.string().nullable(),
  position: z.object({
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
    elevationMeters: z.number().nullable(),
    reference: z.literal("GPS_SOURCE"),
    mapMatching: z.literal("NOT_APPLIED"),
  }),
  speed: z.object({
    valueKmh: z.number().nonnegative(),
    origin: z.literal("MEASURED_GPS"),
  }).nullable(),
  headingDegrees: z.number().min(0).max(360).nullable(),
  gpsQuality: z.object({
    hdop: z.number().nonnegative().nullable(),
    satellites: z.number().nonnegative().nullable(),
    fix: z.string().nullable(),
  }),
  time: z.object({
    sourceMeasuredAt: nullableIsoTime,
    sourceGeneratedAt: nullableIsoTime,
    sourcePublishedAt: nullableIsoTime,
    receivedAt: z.string().datetime(),
    normalizedAt: z.string().datetime(),
  }),
  provenance: z.object({
    sourceId: z.literal("ndov.ns.train-positions.interface-5"),
    sourceTopic: z.literal("/RIG/NStreinpositiesInterface5"),
    schemaVersion: z.literal("TreinLocatie.xsd@2016-10-10"),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
    origin: z.literal("SOURCE"),
  }),
  quality: z.object({
    state: z.enum(["FRESH_SOURCE", "STALE", "UNKNOWN"]),
    flags: z.array(z.string()),
    freshnessThresholdSeconds: z.number().positive(),
  }),
});

export type RailObservation = z.infer<typeof railObservationSchema>;

export const railSnapshotMessageSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("rail.vehicle.snapshot"),
  sequence: z.number().int().nonnegative(),
  sentAt: z.string().datetime(),
  data: railObservationSchema.nullable(),
});

export const railDeltaMessageSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("rail.vehicle.delta"),
  sequence: z.number().int().positive(),
  sentAt: z.string().datetime(),
  data: railObservationSchema,
});

export type RailRealtimeMessage =
  | z.infer<typeof railSnapshotMessageSchema>
  | z.infer<typeof railDeltaMessageSchema>;

export const railFleetSnapshotMessageSchema = z.object({
  protocolVersion: z.literal(2),
  type: z.literal("rail.fleet.snapshot"),
  sequence: z.number().int().nonnegative(),
  sentAt: z.string().datetime(),
  data: z.array(railObservationSchema),
});

export const railFleetBatchMessageSchema = z.object({
  protocolVersion: z.literal(2),
  type: z.literal("rail.fleet.batch"),
  sequence: z.number().int().positive(),
  sentAt: z.string().datetime(),
  upserts: z.array(railObservationSchema),
  removedVehicleIds: z.array(z.string().min(1)),
});

export const railSelectionSnapshotMessageSchema = z.object({
  protocolVersion: z.literal(2),
  type: z.literal("rail.selection.snapshot"),
  sequence: z.number().int().nonnegative(),
  sentAt: z.string().datetime(),
  vehicleId: z.string().nullable(),
  data: railObservationSchema.nullable(),
});

export const railClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ protocolVersion: z.literal(2), type: z.literal("resync") }),
  z.object({ protocolVersion: z.literal(2), type: z.literal("select"), vehicleId: z.string().min(1) }),
]);

export type RailFleetRealtimeMessage =
  | z.infer<typeof railFleetSnapshotMessageSchema>
  | z.infer<typeof railFleetBatchMessageSchema>
  | z.infer<typeof railSelectionSnapshotMessageSchema>;

export const railTrackMatchStatusSchema = z.enum([
  "MATCHED_HIGH",
  "MATCHED_MEDIUM",
  "MATCHED_LOW",
  "MATCHED_LOW_REGIONAL_FALLBACK",
  "UNMATCHED_NO_CANDIDATES",
  "UNMATCHED_AMBIGUOUS",
  "REJECTED_SUSPICIOUS_OBSERVATION",
]);

const matchPointSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});

const railTrackCandidateSchema = z.object({
  edgeId: z.string().min(1),
  distanceMeters: z.number().nonnegative(),
  edgeProgress: z.number().min(0).max(1),
  snappedPosition: matchPointSchema,
  headingDifferenceDegrees: z.number().min(0).max(90).nullable(),
  internalScore: z.number().min(0).max(1),
  continuity: z.enum(["SAME_EDGE", "CONNECTED_EDGE", "UNCONNECTED_EDGE", "NO_HISTORY"]),
});

export const railTrackMatchSchema = z.object({
  observationId: z.string().min(1),
  vehicleId: z.string().min(1),
  region: z.enum(["UTRECHT_PILOT", "NETHERLANDS"]),
  status: railTrackMatchStatusSchema,
  confidenceClass: z.enum(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]),
  rawPosition: matchPointSchema,
  snappedPosition: matchPointSchema.nullable(),
  edgeId: z.string().nullable(),
  edgeProgress: z.number().min(0).max(1).nullable(),
  distanceMeters: z.number().nonnegative().nullable(),
  candidateCount: z.number().int().nonnegative(),
  internalScore: z.number().min(0).max(1).nullable(),
  runnerUpGap: z.number().min(0).max(1).nullable(),
  searchRadiusMeters: z.number().positive(),
  candidates: z.array(railTrackCandidateSchema).max(5),
  zone: z.object({
    id: z.string().min(1),
    quality: z.enum(["NORMAL", "CAUTION", "SPARSE", "BLOCKED", "UNKNOWN"]),
    fallbackAllowed: z.boolean(),
    reasons: z.array(z.string()),
  }).optional(),
  fallback: z.object({
    applied: z.boolean(),
    reason: z.enum(["NOT_NEEDED", "PRIMARY_RADIUS_NO_CANDIDATES", "GRAPH_ZONE_NOT_ELIGIBLE", "AUDIT_UNAVAILABLE"]),
    primaryRadiusMeters: z.number().positive(),
    effectiveRadiusMeters: z.number().positive(),
  }).optional(),
  components: z.object({
    distance: z.literal("USED"),
    heading: z.enum(["USED", "UNAVAILABLE", "IGNORED_LOW_SPEED"]),
    continuity: z.enum(["USED", "UNAVAILABLE"]),
    topology: z.enum(["USED", "UNAVAILABLE"]),
    gpsQuality: z.enum(["USED", "UNAVAILABLE"]),
    routeAlignment: z.literal("UNAVAILABLE"),
    directionality: z.literal("UNAVAILABLE"),
  }),
  method: z.union([
    z.object({
      id: z.literal("utrecht-track-matcher"),
      version: z.literal("1.0.0"),
      graphPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
      origin: z.literal("DERIVED"),
      scoreIsProbability: z.literal(false),
    }),
    z.object({
      id: z.literal("national-track-matcher"),
      version: z.literal("2.0.0"),
      graphPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
      origin: z.literal("DERIVED"),
      scoreIsProbability: z.literal(false),
    }),
  ]),
  sourceMeasuredAt: nullableIsoTime,
  matchedAt: z.string().datetime(),
});

export type RailTrackMatch = z.infer<typeof railTrackMatchSchema>;

export const railMatchSnapshotMessageSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("rail.match.snapshot"),
  sequence: z.number().int().nonnegative(),
  sentAt: z.string().datetime(),
  region: z.enum(["UTRECHT_PILOT", "NETHERLANDS"]),
  data: z.array(railTrackMatchSchema),
});

export const railMatchBatchMessageSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("rail.match.batch"),
  sequence: z.number().int().positive(),
  sentAt: z.string().datetime(),
  region: z.enum(["UTRECHT_PILOT", "NETHERLANDS"]),
  upserts: z.array(railTrackMatchSchema),
  removedVehicleIds: z.array(z.string().min(1)),
});

export type RailMatchRealtimeMessage =
  | z.infer<typeof railMatchSnapshotMessageSchema>
  | z.infer<typeof railMatchBatchMessageSchema>;
