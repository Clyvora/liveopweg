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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.liveopweg.nl"),
  title: "Liveopweg — Nederland beweegt. Live.",
  description: "Nederlandse realtime treinposities, officiële NDW-wegmeldingen en brongetrouwe replay.",
  openGraph: {
    title: "Liveopweg — Nederland beweegt. Live.",
    description: "Landelijk realtime spoor, officiële NDW-wegmeldingen en brongetrouwe treinreplay.",
    type: "website",
    images: [{ url: "/liveopweg-logo.png", width: 1228, height: 324, alt: "Liveopweg — Nederland beweegt. Live." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Liveopweg — Nederland beweegt. Live.",
    description: "Landelijk realtime spoor, officiële NDW-wegmeldingen en brongetrouwe treinreplay.",
    images: ["/liveopweg-logo.png"],
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
