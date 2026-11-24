type Copy = readonly [nl: string, en: string];

export type StationGuideItem = {
  icon: string;
  title: Copy;
  detail: Copy;
  url: string;
};

export type StationGuide = {
  photo: { file: string; page: string; author: string; license: "BY" | "BY-SA"; alt: Copy; position: string };
  facilities: StationGuideItem[];
  onward: StationGuideItem[];
};

const commons = "https://commons.wikimedia.org/wiki/File:";
const utrecht = "https://stations.nl/stations/utrecht-centraal/";
const zwolle = "https://stations.nl/stations/zwolle/";
const groningen = "https://stations.nl/stations/groningen/";
const parking = "https://www.ns.nl/producten/deur-tot-deur/parkeer-en-reis";
const parkingBike = "https://www.ns.nl/reizen/stallen-en-parkeren/bewaakte-stallingen";

function facilities(source: string, toiletDetail: Copy, shopSource = source, toiletSource = source): StationGuideItem[] {
  return [
    { icon: "toilet", title: ["Toiletten", "Toilets"], detail: toiletDetail, url: toiletSource },
    { icon: "wheelchair", title: ["Toegankelijkheid", "Accessibility"], detail: ["Bekijk informatie over liften en de toegang tot de perrons.", "Check lift and platform access information."], url: source },
    { icon: "shop", title: ["Winkels en horeca", "Shops and food"], detail: ["Bekijk wat er op het station te vinden is.", "See what is available at the station."], url: shopSource },
    { icon: "lockers", title: ["Bagagekluizen", "Luggage lockers"], detail: ["Bekijk de beschikbare formaten en tarieven.", "Check the available sizes and prices."], url: "https://www.ns.nl/reizen/op-het-station/voorzieningen/bagage-op-het-station" },
  ];
}

const utrechtToilets = ["Onder meer in de stationshal bij spoor 20 en 21.", "One location is in the main hall near platforms 20 and 21."] as const;
const stationToilets = ["Op het station. Bekijk de actuele stationsinformatie voor locatie en openingstijden.", "At the station. Check the current station information for location and opening hours."] as const;

export const stationGuides: Readonly<Partial<Record<string, StationGuide>>> = {
  UT: {
    photo: {
      file: "utrecht-centraal.webp", page: `${commons}Utrecht_Centraal_station.jpg`, author: "Periodismodepaz", license: "BY-SA",
      alt: ["De ingang met de klok en het bord Utrecht Centraal", "Entrance with the clock and Utrecht Centraal sign"], position: "center 70%",
    },
    facilities: facilities(utrecht, utrechtToilets, "https://mijnstation.nl/nl/utrecht/net-gehaald/", "https://mijnstation.nl/nl/utrecht/contact/"),
    onward: [
      { icon: "bicycle", title: ["OV-fiets", "OV-fiets rental"], detail: ["Stationsplein 2, dag en nacht open. Ook verhuur bij Jaarbeursplein en De Knoop.", "Stationsplein 2 is open 24 hours. Rental is also available at Jaarbeursplein and De Knoop."], url: "https://www.ns.nl/producten/deur-tot-deur/ov-fiets/utrecht-centraal-stationsplein" },
      { icon: "bicycle", title: ["Fietsenstallingen", "Bicycle parking"], detail: ["Onder meer Stationsplein, Jaarbeursplein en De Knoop.", "Locations include Stationsplein, Jaarbeursplein and De Knoop."], url: parkingBike },
      { icon: "stations", title: ["Bus en tram", "Bus and tram"], detail: ["Volg de borden naar de bus- en tramhaltes.", "Follow the signs to the bus and tram stops."], url: "https://www.ns.nl/stationsinformatie/ut/utrecht-centraal" },
    ],
  },
  ZL: {
    photo: {
      file: "zwolle.webp", page: `${commons}Station_Zwolle_2024.jpg`, author: "Deerpeter", license: "BY-SA",
      alt: ["De hoofdingang van station Zwolle aan het Stationsplein", "Zwolle station main entrance on Stationsplein"], position: "center 56%",
    },
    facilities: facilities(zwolle, stationToilets),
    onward: [
      { icon: "bicycle", title: ["OV-fiets", "OV-fiets rental"], detail: ["Stationsplein 13A1. Bekijk de openingstijden per dag.", "Stationsplein 13A1. Check the hours for the day you travel."], url: "https://www.ns.nl/producten/deur-tot-deur/ov-fiets/zwolle" },
      { icon: "bicycle", title: ["Fietsenstallingen", "Bicycle parking"], detail: ["Onder het Stationsplein en bij het Lübeckplein.", "Under Stationsplein and near Lübeckplein."], url: parkingBike },
      { icon: "stations", title: ["Busstation", "Bus station"], detail: ["Volg vanuit het station de borden naar de bussen.", "Follow signs for buses from the railway station."], url: "https://www.ns.nl/stationsinformatie/zl/zwolle" },
      { icon: "parking", title: ["P+R Hanzelaan", "Hanzelaan park and ride"], detail: ["Parkeren aan de zuidkant van het station.", "Parking on the south side of the station."], url: parking },
    ],
  },
  GN: {
    photo: {
      file: "groningen.webp", page: `${commons}HS_Groningen.jpg`, author: "JAHensens", license: "BY",
      alt: ["De historische voorgevel van Groningen Hoofdstation", "Historic entrance façade of Groningen main station"], position: "center 61%",
    },
    facilities: facilities(groningen, stationToilets),
    onward: [
      { icon: "bicycle", title: ["OV-fiets en OV-ebike", "OV-fiets and OV-ebike rental"], detail: ["Verhuur bij Groningen Hoofdstation. Bekijk locaties en openingstijden bij NS.", "Rental at Groningen main station. Check NS for locations and hours."], url: "https://www.ns.nl/stationsinformatie/gn/groningen" },
      { icon: "bicycle", title: ["Fietsenstalling centrumzijde", "City-side bicycle parking"], detail: ["Bewaakte stalling aan de stadskant.", "Staffed storage on the city side."], url: parkingBike },
      { icon: "stations", title: ["Busstation aan de zuidzijde", "Bus station on the south side"], detail: ["Volg de doorgang naar de zuidzijde. Er is een lift naar het busstation.", "Follow the passage to the south side. A lift serves the bus station."], url: "https://www.prorail.nl/nieuws/busstation-groningen-op-nieuwe-plek" },
      { icon: "parking", title: ["P+R Hoofdstation", "Main station park and ride"], detail: ["Betaald parkeren bij het station.", "Paid parking at the station."], url: parking },
    ],
  },
};
