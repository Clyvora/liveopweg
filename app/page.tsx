import { MobilityDashboard } from "./MobilityDashboard";
import { getSiteOrigin, radarDescription, siteName } from "./site";

export default function Home() {
  const root = `${getSiteOrigin()}/`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${root}#website`,
        url: root,
        name: siteName,
        description: radarDescription,
        inLanguage: "nl-NL",
      },
      {
        "@type": "WebApplication",
        "@id": `${root}#application`,
        name: siteName,
        isPartOf: { "@id": `${root}#website` },
        image: `${root}og.png`,
        url: root,
        applicationCategory: "TravelApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript",
        isAccessibleForFree: true,
        inLanguage: "nl-NL",
        description: radarDescription,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <MobilityDashboard key="trains" />
    </>
  );
}
