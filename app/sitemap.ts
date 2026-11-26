import type { MetadataRoute } from "next";
import { getSiteOrigin, guidePath } from "./site";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteOrigin = getSiteOrigin();
  return [
    { url: `${siteOrigin}/` },
    { url: `${siteOrigin}${guidePath}` },
    { url: `${siteOrigin}/meldingen` },
  ];
}
