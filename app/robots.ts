import type { MetadataRoute } from "next";
import { getSiteOrigin } from "./site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${getSiteOrigin()}/sitemap.xml`,
  };
}
