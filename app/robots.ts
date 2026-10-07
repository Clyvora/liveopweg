import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://liveopweg.nl/sitemap.xml",
    host: "https://liveopweg.nl",
  };
}
