import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "MobilityRadar NL — Realtime spoor, weg en replay",
  description: "Nederlandse realtime treinposities, officiële NDW-wegmeldingen en brongetrouwe replay met herleidbare tijden en geometrie.",
  openGraph: {
    title: "MobilityRadar NL — Realtime spoor, weg en replay",
    description: "Landelijk realtime spoor, officiële NDW-wegmeldingen en brongetrouwe treinreplay.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "MobilityRadar NL — Van GPS-punt naar spoor" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MobilityRadar NL — Realtime spoor, weg en replay",
    description: "Landelijk realtime spoor, officiële NDW-wegmeldingen en brongetrouwe treinreplay.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
        {children}
      </body>
    </html>
  );
}
