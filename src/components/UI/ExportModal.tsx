'use client';

import React, { useState, useEffect } from 'react';
import { RouteData } from '@/lib/types';
import { generateGpx, generateGeoJson, downloadFile } from '@/lib/gpx';
import { calculatePaceTime } from '@/lib/geo';
import { X, Download, FileCode, Check, Copy } from 'lucide-react';

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
    if (routeData.mode === 'random') {
      const label = routeData.shape === 'out_and_back' ? 'Out & Back' : 'Random Loop';
      return `${label} ${routeData.distanceKm.toFixed(1)}K`;
    }
    return `Manual Run Route ${routeData.distanceKm.toFixed(1)}K`;
  });

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (routeData.mode === 'random') {
      const label = routeData.shape === 'out_and_back' ? 'Out & Back' : 'Random Loop';
      setRouteName(`${label} ${routeData.distanceKm.toFixed(1)}K`);
    } else {
      setRouteName(`Manual Run Route ${routeData.distanceKm.toFixed(1)}K`);
    }
  }, [isOpen, routeData]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm transition-opacity duration-200"
    >
      <div className="w-full max-w-md rounded-[24px] bg-[var(--surface-solid)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden text-[var(--text-primary)] ui-modal-enter">
        <div
          aria-hidden="true"
          className="h-[3px] w-full bg-gradient-to-r from-[#fc4c02] via-[#ff7b3b] to-[#fc4c02]"
        />

        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[var(--brand-tint)] text-[#fc4c02] border border-[var(--brand-border)] flex items-center justify-center">
                <Download className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h3
                  id="export-modal-title"
                  className="font-display text-xl font-extrabold text-[var(--text-primary)] leading-tight"
                >
                  Ekspor Rute Lari
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Siap sinkron ke Strava, Garmin, Coros
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Tutup dialog ekspor"
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-muted)] hover:text-[var(--brand-ink)] flex items-center justify-center ui-btn-secondary ui-focus-ring"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* Route Name Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="export-route-name"
              className="text-xs font-bold text-[var(--text-secondary)] block"
            >
              Nama Aktivitas / Rute
            </label>
            <input
              id="export-route-name"
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-medium focus:bg-[var(--surface-solid)] focus:outline-none focus:border-[#fc4c02] focus:ring-2 focus:ring-[#fc4c02]/20 transition-all duration-150"
              placeholder="Contoh: Lari Pagi 10K Senayan"
            />
          </div>

          {/* Summary Card */}
          <div className="p-3.5 rounded-2xl cockpit-well grid grid-cols-2 gap-2 text-center tabular-nums">
            <div>
              <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
                Jarak
              </span>
              <p className="font-display text-2xl font-extrabold text-[#fc4c02] mt-0.5 leading-none">
                {routeData.distanceKm.toFixed(2)} <span className="text-xs font-mono">KM</span>
              </p>
            </div>
            <div className="border-l border-[var(--border-subtle)]">
              <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
                Est. Waktu
              </span>
              <p className="font-mono text-lg font-extrabold text-[var(--text-primary)] mt-1 leading-none">
                {timeInfo.formatted}
              </p>
            </div>
          </div>

          {/* Export Formats */}
          <div className="space-y-2 pt-0.5">
            <button
              type="button"
              onClick={handleDownloadGpx}
              className="group w-full min-h-[52px] py-3 px-4 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-between ui-btn-primary ui-focus-ring"
            >
              <div className="flex items-center gap-2.5">
                <Download
                  className="w-4 h-4 transition-transform duration-150 group-hover:translate-y-0.5"
                  aria-hidden="true"
                />
                <div className="text-left">
                  <p className="leading-tight font-bold">Download File .GPX (Standar)</p>
                  <p className="text-[11px] text-orange-100 font-normal mt-0.5">
                    Kompatibel Strava, Garmin Connect, Coros, Suunto
                  </p>
                </div>
              </div>
              <span className="text-[11px] uppercase font-mono px-2 py-0.5 rounded-lg bg-black/15">
                .GPX
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadGeoJson}
              className="group w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--brand-border)] font-semibold text-xs flex items-center justify-between ui-card-hover ui-focus-ring"
            >
              <div className="flex items-center gap-2.5">
                <FileCode
                  className="w-4 h-4 text-sky-600 dark:text-sky-400 transition-transform duration-150 group-hover:scale-110"
                  aria-hidden="true"
                />
                <div className="text-left">
                  <p className="leading-tight font-bold">Download File .GeoJSON / .JSON</p>
                  <p className="text-[11px] text-[var(--text-muted)] font-normal mt-0.5">
                    Untuk analisis spasial, QGIS, atau developer
                  </p>
                </div>
              </div>
              <span className="text-[11px] uppercase font-mono px-2 py-0.5 rounded-lg bg-[var(--surface-solid)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                .GEOJSON
              </span>
            </button>

            <button
              type="button"
              onClick={handleCopyGpx}
              className="w-full min-h-[44px] py-2 px-3 rounded-xl text-[var(--text-secondary)] hover:text-[var(--brand-ink)] hover:bg-[var(--brand-tint)] text-xs font-bold flex items-center justify-center gap-1.5 ui-btn-secondary ui-focus-ring"
            >
              {copied ? (
                <Check
                  className="w-4 h-4 text-emerald-600 dark:text-emerald-400 ui-fade-slide-up"
                  aria-hidden="true"
                />
              ) : (
                <Copy className="w-4 h-4" aria-hidden="true" />
              )}
              <span>{copied ? 'Teks GPX berhasil disalin!' : 'Salin isi GPX ke Clipboard'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
