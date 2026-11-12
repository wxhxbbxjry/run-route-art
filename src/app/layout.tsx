import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RunRoute PRO | Perencana & Generator Rute Lari',
  description:
    'Rancang rute lari pintar secara otomatis maupun manual tap-to-route di jalur kendaraan umum (mobil & motor) dengan OpenStreetMap & Valhalla routing. Ekspor ke GPX & GeoJSON.',
  keywords: [
    'Run Route Generator',
    'Random Loop Runner',
    'Closed Loop 5K',
    '10K Loop',
    'Marathon Route Planner',
    'Strava Route GPX',
    'Garmin Route',
    'GPX Export',
    'MapLibre GL',
    'OpenFreeMap',
  ],
  authors: [{ name: 'RunRoute PRO' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#070b14',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`dark ${plusJakarta.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://tiles.openfreemap.org" />
        <link rel="preconnect" href="https://valhalla1.openstreetmap.de" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://brouter.de" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://router.project-osrm.org" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden w-screen h-[100dvh]">
        {children}
      </body>
    </html>
  );
}
