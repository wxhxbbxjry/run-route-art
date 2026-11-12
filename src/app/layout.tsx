import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
});

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RunRoute PRO | Smart Running Route & Random Loop Planner',
  description:
    'Rancang rute lari pintar, random 5K/10K closed loop, dan manual tap-to-route 100% gratis di jalur aman kendaraan (mobil & motor) dengan OpenStreetMap & Valhalla routing. Ekspor rute ke GPX (Strava/Garmin) dan GeoJSON.',
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
    'OSRM',
  ],
  authors: [{ name: 'RunRoute PRO' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#fc4c02',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://tiles.openfreemap.org" />
        <link rel="preconnect" href="https://valhalla1.openstreetmap.de" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://router.project-osrm.org" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased bg-[#f1f5f9] text-slate-900 overflow-hidden w-screen h-screen">
        {children}
      </body>
    </html>
  );
}
