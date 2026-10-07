import type { MetadataRoute } from "next";

function getSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.origin;
    } catch {
      // Use the canonical production origin when the deployment value is malformed.
    }
  }
  return "https://liveopweg.nl";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const siteOrigin = getSiteOrigin();
  return [
    { url: `${siteOrigin}/`, lastModified, changeFrequency: "always", priority: 1 },
    { url: `${siteOrigin}/meldingen`, lastModified, changeFrequency: "hourly", priority: 0.8 },
    { url: `${siteOrigin}/instellingen`, lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
