import { z } from "zod";

export const railStationCategorySchema = z.enum([
  "megastation",
  "knooppuntIntercitystation",
  "intercitystation",
  "knooppuntSneltreinstation",
  "knooppuntStoptreinstation",
  "sneltreinstation",
  "stoptreinstation",
  "facultatiefStation",
]);

export const stationCatalogSchema = z.object({
  source: z.literal("NS API"),
  fetchedAt: z.string().datetime(),
  stations: z.array(z.object({
    code: z.string().min(1).max(8),
    name: z.string().min(1),
    latitude: z.number().min(50).max(54),
    longitude: z.number().min(3).max(8),
    category: railStationCategorySchema,
  })).min(1),
});

export type StationCatalog = z.infer<typeof stationCatalogSchema>;
