import type { Metadata } from "next";

export const siteName = "Liveopweg";
export const radarTitle = "Live treinlocaties in Nederland";
export const radarDescription = "Bekijk live treinlocaties op de kaart van Nederland. Zoek een trein of station en bekijk actuele treinposities, vertrektijden, vertragingen en spoormeldingen.";
export const guidePath = "/over-de-treinradar";

export function getSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (["http:", "https:"].includes(url.protocol) && !["liveopweg.nl", "www.liveopweg.nl"].includes(url.hostname)) return url.origin;
    } catch {
      // Use the production origin when the deployment value is malformed.
    }
  }
  return "https://www.liveopweg.nl";
}

export function pageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website", locale: "nl_NL", siteName, url: path, title, description,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liveopweg · Live treinlocaties in Nederland" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}
