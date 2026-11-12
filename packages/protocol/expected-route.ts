import { z } from "zod";

export const expectedRouteSchema = z.object({
  method: z.literal("EXPECTED_SHORTEST_TRACK_PATH"),
  exactSwitchPathKnown: z.literal(false),
  geometry: z.object({
    type: z.literal("MultiLineString"),
    coordinates: z.array(z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(2)),
  }),
  stops: z.array(z.object({
    code: z.string().min(1), name: z.string(),
    arrivalAt: z.string().datetime().nullable(), departureAt: z.string().datetime().nullable(),
    delaySeconds: z.number().finite().nullable(),
  })),
  routedStops: z.number().int().nonnegative(),
});
export type ExpectedRoute = z.infer<typeof expectedRouteSchema>;
