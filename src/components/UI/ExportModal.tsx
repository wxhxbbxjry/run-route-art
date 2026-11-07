'use client';

import React, { useState } from 'react';
import { RouteData } from '@/lib/types';
import { generateGpx, generateGeoJson, downloadFile } from '@/lib/gpx';
import { calculatePaceTime } from '@/lib/geo';
import {
  X,
  Download,
  FileCode,
  Check,
  Copy,
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  routeData: RouteData;
  paceSeconds: number;
}

export default function ExportModal({
  isOpen,
  onClose,
  routeData,
  paceSeconds,
}: ExportModalProps) {
  const [routeName, setRouteName] = useState(() => {
    if (routeData.mode === 'random') return `Random Loop ${routeData.distanceKm.toFixed(1)}K`;
    return `Manual Run Route ${routeData.distanceKm.toFixed(1)}K`;
  });

  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const timeInfo = calculatePaceTime(routeData.distanceKm, paceSeconds);

  const handleDownloadGpx = () => {
    const gpxContent = generateGpx(routeData, routeName, paceSeconds);
    const filename = `${routeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.gpx`;
    downloadFile(gpxContent, filename, 'application/gpx+xml');
  };

  const handleDownloadGeoJson = () => {
    const geoJsonContent = generateGeoJson(routeData, routeName);
    const filename = `${routeName.toLowerCase().replace(/[^a-z0-9]/g, '_')}.geojson`;
    downloadFile(geoJsonContent, filename, 'application/geo+json');
  };

  const handleCopyGpx = () => {
    const gpxContent = generateGpx(routeData, routeName, paceSeconds);
    navigator.clipboard.writeText(gpxContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl glass-panel border border-slate-700/80 p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-500/20 text-orange-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Ekspor Rute Lari</h3>
              <p className="text-xs text-slate-400">Siap sinkron ke Strava, Garmin, Coros</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Route Name Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">Nama Aktivitas / Rute</label>
          <input
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-lime-400 transition"
            placeholder="Contoh: Lari Pagi 10K Hati Senayan"
          />
        </div>

        {/* Summary Card */}
        <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-bold">Jarak</span>
            <p className="font-mono font-bold text-lime-400 text-sm mt-0.5">
              {routeData.distanceKm.toFixed(2)} KM
            </p>
          </div>
          <div className="border-l border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase font-bold">Est. Waktu</span>
            <p className="font-mono font-bold text-slate-200 text-sm mt-0.5">
              {timeInfo.formatted}
            </p>
          </div>
          <div className="border-l border-slate-800">
            <span className="text-slate-400 text-[10px] uppercase font-bold">Elevasi</span>
            <p className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
              +{routeData.elevationGainM}m
            </p>
          </div>
        </div>

        {/* Export Formats */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handleDownloadGpx}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center justify-between shadow-[0_0_20px_rgba(249,115,22,0.35)] transition active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4" />
              <div className="text-left">
                <p className="leading-tight">Download File .GPX (Standar)</p>
                <p className="text-[10px] text-slate-900/80 font-normal">
                  Kompatibel langsung dengan Strava, Garmin Connect, Coros, Suunto
                </p>
              </div>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/20">
              .GPX
            </span>
          </button>

          <button
            onClick={handleDownloadGeoJson}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 font-semibold text-xs flex items-center justify-between transition active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <FileCode className="w-4 h-4 text-cyan-400" />
              <div className="text-left">
                <p className="leading-tight">Download File .GeoJSON / .JSON</p>
                <p className="text-[10px] text-slate-400 font-normal">
                  Untuk analisis spasial, QGIS, Mapbox, atau developer tools
                </p>
              </div>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400">
              .GEOJSON
            </span>
          </button>

          <button
            onClick={handleCopyGpx}
            className="w-full py-2 px-3 rounded-lg text-slate-400 hover:text-slate-200 text-xs flex items-center justify-center gap-1.5 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Teks GPX berhasil disalin!' : 'Salin isi GPX ke Clipboard'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
