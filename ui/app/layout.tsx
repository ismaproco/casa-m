import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const metadataBase = new URL(`${protocol}://${host}`);
  return {
    metadataBase,
    title: "Casa Mapa — Apartamentos verificados en Bogotá",
    description:
      "Explora 2.275 apartamentos verificados en Bogotá con mapa, filtros, favoritos y búsquedas guardadas.",
    openGraph: {
      title: "Casa Mapa",
      description: "2.275 apartamentos verificados en Bogotá",
      type: "website",
      locale: "es_CO",
      alternateLocale: "en_US",
      images: [
        {
          url: "/og.png",
          width: 1731,
          height: 909,
          alt: "Casa Mapa — mapa de apartamentos verificados en Bogotá",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Casa Mapa",
      description: "2.275 apartamentos verificados en Bogotá",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
