import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./train-panel.css";
import "./dashboard-polish.css";
import "./sections.css";
import { ThemeProvider } from "./ThemeContext";
import { LanguageProvider } from "./LanguageContext";
import type { Metadata } from "next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://liveopweg.nl";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Liveopweg | Live treinlocaties Nederland",
    template: "%s | Liveopweg",
  },
  description: "Bekijk live treinlocaties in Nederland, stations, spoorlijnen, vertragingen en actuele wegmeldingen op één duidelijke kaart.",
  applicationName: "Liveopweg",
  keywords: [
    "live treinlocaties",
    "trein volgen",
    "treinen op de kaart",
    "trein vertraging",
    "NS trein live",
    "treinposities Nederland",
    "stations Nederland",
    "actuele wegmeldingen",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    url: siteUrl,
    siteName: "Liveopweg",
    title: "Live treinlocaties in Nederland",
    description: "Volg actuele treinposities, stations en vertragingen op een live kaart.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Liveopweg live treinlocaties in Nederland" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Live treinlocaties in Nederland",
    description: "Volg actuele treinposities, stations en vertragingen op een live kaart.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <LanguageProvider>
            {children}
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
