import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RunRoute PRO | Smart Running Route & Random Loop Planner',
  description:
    'Rancang rute lari pintar, random 5K/10K closed loop, dan manual tap-to-route 100% gratis dengan OpenStreetMap & OSRM routing. Ekspor rute ke GPX (Strava/Garmin) dan GeoJSON.',
  keywords: [
    'Run Route Generator',
    'Random Loop Runner',
    'Closed Loop 5K',
    '10K Loop',
    'Marathon Route Planner',
    'Strava Route GPX',
    'Garmin Route',
    'GPX Export',
    'Leaflet',
    'OSRM',
  ],
  authors: [{ name: 'RunRoute PRO' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#080c14',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className="antialiased bg-[#080c14] text-slate-100 overflow-hidden w-screen h-screen">
        {children}
      </body>
    </html>
  );
}
