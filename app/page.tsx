import { MobilityDashboard } from "./MobilityDashboard";

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": "https://liveopweg.nl/#website",
        url: "https://liveopweg.nl/",
        name: "Liveopweg",
        description: "Live treinlocaties, stations, vertragingen en wegmeldingen in Nederland.",
        inLanguage: "nl-NL",
      },
      {
        "@type": "WebApplication",
        "@id": "https://liveopweg.nl/#application",
        name: "Liveopweg live treinkaart",
        url: "https://liveopweg.nl/",
        applicationCategory: "TravelApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript",
        isAccessibleForFree: true,
        inLanguage: "nl-NL",
        description: "Bekijk actuele treinposities, stations en treinvertragingen op een kaart van Nederland.",
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
