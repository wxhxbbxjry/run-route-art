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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-[#fc4c02] border border-orange-200 dark:border-orange-500/40">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Ekspor Rute Lari</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Siap sinkron ke Strava, Garmin, Coros</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Route Name Input */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Nama Aktivitas / Rute</label>
          <input
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-[#fc4c02] transition"
            placeholder="Contoh: Lari Pagi 10K Senayan"
          />
        </div>

        {/* Summary Card */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">Jarak</span>
            <p className="font-mono font-black text-[#fc4c02] text-sm mt-0.5">
              {routeData.distanceKm.toFixed(2)} KM
            </p>
          </div>
          <div className="border-l border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">Est. Waktu</span>
            <p className="font-mono font-bold text-slate-900 dark:text-white text-sm mt-0.5">
              {timeInfo.formatted}
            </p>
          </div>
          <div className="border-l border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">Elevasi</span>
            <p className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5">
              +{routeData.elevationGainM}m
            </p>
          </div>
        </div>

        {/* Export Formats */}
        <div className="space-y-2 pt-1">
          <button
            onClick={handleDownloadGpx}
            className="w-full py-3 px-4 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-between shadow-[0_6px_18px_rgba(252,76,2,0.3)] transition active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <Download className="w-4 h-4" />
              <div className="text-left">
                <p className="leading-tight">Download File .GPX (Standar)</p>
                <p className="text-[10px] text-orange-100 font-normal">
                  Kompatibel langsung dengan Strava, Garmin Connect, Coros, Suunto
                </p>
              </div>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/15">
              .GPX
            </span>
          </button>

          <button
            onClick={handleDownloadGeoJson}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center justify-between transition active:scale-[0.98]"
          >
            <div className="flex items-center gap-2.5">
              <FileCode className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <div className="text-left">
                <p className="leading-tight">Download File .GeoJSON / .JSON</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                  Untuk analisis spasial, QGIS, atau developer tools
                </p>
              </div>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              .GEOJSON
            </span>
          </button>

          <button
            onClick={handleCopyGpx}
            className="w-full py-2 px-3 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#fc4c02] hover:bg-orange-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Teks GPX berhasil disalin!' : 'Salin isi GPX ke Clipboard'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
