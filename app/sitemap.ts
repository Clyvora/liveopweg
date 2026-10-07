import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: "https://liveopweg.nl/", lastModified, changeFrequency: "always", priority: 1 },
    { url: "https://liveopweg.nl/meldingen", lastModified, changeFrequency: "hourly", priority: 0.8 },
    { url: "https://liveopweg.nl/instellingen", lastModified, changeFrequency: "monthly", priority: 0.3 },
  ];
}
