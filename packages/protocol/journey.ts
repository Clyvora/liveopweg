import { z } from "zod";

const nullableIsoTime = z.string().datetime().nullable();

export const journeyStopSchema = z.object({
  order: z.number().int().nonnegative(),
  station: z.object({
    code: z.string().min(1),
    uicCode: z.string().nullable(),
    shortName: z.string().nullable(),
    mediumName: z.string().nullable(),
    longName: z.string().min(1),
  }),
  calls: z.object({
    planned: z.boolean().nullable(),
    actual: z.boolean().nullable(),
  }),
  arrival: z.object({
    plannedAt: nullableIsoTime,
    actualAt: nullableIsoTime,
    exactDelaySeconds: z.number().int().nullable(),
    plannedTrack: z.string().nullable(),
    actualTrack: z.string().nullable(),
  }),
  departure: z.object({
    plannedAt: nullableIsoTime,
    actualAt: nullableIsoTime,
    exactDelaySeconds: z.number().int().nullable(),
    plannedTrack: z.string().nullable(),
    actualTrack: z.string().nullable(),
  }),
  destination: z.object({
    planned: z.string().nullable(),
    actual: z.string().nullable(),
  }),
  changes: z.array(z.object({
    type: z.string(),
    causeCode: z.string().nullable(),
    causeShort: z.string().nullable(),
    causeLong: z.string().nullable(),
  })),
});

export const railJourneySchema = z.object({
  journeyId: z.string().min(1),
  trainNumber: z.string().min(1),
  serviceDate: z.string().date(),
  operator: z.string().nullable(),
  trainCategory: z.object({ code: z.string().nullable(), name: z.string().nullable() }),
  product: z.object({
    id: z.string().min(1),
    version: z.string().nullable(),
    applicationVersion: z.string().nullable(),
    generatedAt: z.string().datetime(),
    informationAt: z.string().datetime(),
    validUntil: z.string().datetime(),
  }),
  destination: z.object({
    planned: z.string().nullable(),
    actual: z.string().nullable(),
  }),
  stops: z.array(journeyStopSchema).min(1),
  provenance: z.object({
    sourceId: z.literal("ndov.infoplus.rit.interface-5"),
    sourceTopic: z.literal("/RIG/InfoPlusRITInterface5"),
    schemaVersion: z.literal("RIT-v5@2024-06-27"),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/),
    receivedAt: z.string().datetime(),
    origin: z.literal("SOURCE"),
  }),
});

export type RailJourney = z.infer<typeof railJourneySchema>;

const journeyLinkSchema = z.object({
  method: z.literal("TRAIN_NUMBER_AND_LOCAL_SERVICE_DATE"),
  origin: z.literal("DERIVED"),
  trainNumber: z.string(),
  serviceDate: z.string().date(),
});

export const journeySnapshotMessageSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("rail.journey.snapshot"),
  sequence: z.number().int().nonnegative(),
  sentAt: z.string().datetime(),
  data: railJourneySchema.nullable(),
  link: journeyLinkSchema.nullable(),
});

export const journeyDeltaMessageSchema = z.object({
  protocolVersion: z.literal(1),
  type: z.literal("rail.journey.delta"),
  sequence: z.number().int().positive(),
  sentAt: z.string().datetime(),
  data: railJourneySchema,
  link: journeyLinkSchema,
});

export type JourneyRealtimeMessage =
  | z.infer<typeof journeySnapshotMessageSchema>
  | z.infer<typeof journeyDeltaMessageSchema>;
