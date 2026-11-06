'use client';

import React, { useState, useRef, useEffect } from 'react';
import { RouteData, SavedRoute, UnitSystem } from '@/lib/types';
import { parseGpx, generateGpx, downloadFile } from '@/lib/gpx';
import { kmToMiles } from '@/lib/geo';
import {
  X,
  Upload,
  BookmarkCheck,
  Trash2,
  Download,
  FolderOpen,
  Calendar,
  CheckCircle2,
  FileCode,
  FileUp,
} from 'lucide-react';

interface SavedRoutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRouteData: RouteData | null;
  paceSeconds: number;
  unitSystem: UnitSystem;
  onLoadRoute: (route: RouteData, name?: string) => void;
  onAddToast: (type: 'success' | 'info' | 'warning' | 'error', title: string, desc?: string) => void;
}

const STORAGE_KEY = 'runroute_saved_routes_v1';

export default function SavedRoutesModal({
  isOpen,
  onClose,
  currentRouteData,
  paceSeconds,
  unitSystem,
  onLoadRoute,
  onAddToast,
}: SavedRoutesModalProps) {
  const [activeTab, setActiveTab] = useState<'saved' | 'import'>('saved');
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [newRouteName, setNewRouteName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved routes from localStorage on mount & open
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSavedRoutes(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load saved routes:', e);
    }

    if (currentRouteData) {
      const modeLabel =
        currentRouteData.mode === 'art'
          ? `GPS Art ${currentRouteData.shapeName || ''}`
          : currentRouteData.mode === 'random'
          ? `Loop ${currentRouteData.distanceKm.toFixed(1)}K`
          : `Rute Manual ${currentRouteData.distanceKm.toFixed(1)}K`;
      setNewRouteName(modeLabel.trim());
    }
  }, [isOpen, currentRouteData]);

  if (!isOpen) return null;

  // Save current route
  const handleSaveCurrentRoute = () => {
    if (!currentRouteData || currentRouteData.coordinates.length < 2) {
      onAddToast('warning', 'Belum Ada Rute', 'Buat atau tap rute terlebih dahulu sebelum menyimpan.');
      return;
    }

    const title = newRouteName.trim() || `Rute ${currentRouteData.distanceKm.toFixed(2)} KM`;
    const newSaved: SavedRoute = {
      id: `saved-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: title,
      createdAt: Date.now(),
      routeData: currentRouteData,
      paceSeconds,
    };

    const updated = [newSaved, ...savedRoutes];
    setSavedRoutes(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setIsSaving(false);
      onAddToast('success', 'Rute Berhasil Disimpan', `"${title}" tersimpan di peramban.`);
    } catch {
      onAddToast('error', 'Gagal Menyimpan', 'Penyimpanan lokal browser penuh.');
    }
  };

  // Delete saved route
  const handleDeleteRoute = (id: string, name: string) => {
    const updated = savedRoutes.filter((r) => r.id !== id);
    setSavedRoutes(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      onAddToast('info', 'Rute Dihapus', `"${name}" telah dihapus.`);
    } catch {
      // ignore
    }
  };

  // Download GPX for saved route
  const handleDownloadSavedGpx = (item: SavedRoute) => {
    const gpx = generateGpx(item.routeData, item.name, item.paceSeconds);
    const slug = item.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadFile(gpx, `${slug}.gpx`, 'application/gpx+xml');
    onAddToast('success', 'GPX Diunduh', `${item.name}.gpx siap untuk Strava/Garmin.`);
  };

  // Process GPX File
  const processGpxFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const parsed = parseGpx(text);
      if (!parsed || parsed.coordinates.length < 2) {
        onAddToast('error', 'Gagal Membaca GPX', 'Format file tidak memiliki koordinat jalur yang valid.');
        return;
      }

      // Build RouteData from imported GPX
      const waypoints = [
        {
          id: 'imported-start',
          lat: parsed.coordinates[0].lat,
          lng: parsed.coordinates[0].lng,
          name: 'Start (Imported)',
        },
        {
          id: 'imported-finish',
          lat: parsed.coordinates[parsed.coordinates.length - 1].lat,
          lng: parsed.coordinates[parsed.coordinates.length - 1].lng,
          name: 'Finish (Imported)',
        },
      ];

      const routeData: RouteData = {
        coordinates: parsed.coordinates,
        waypoints,
        distanceKm: parsed.totalDistanceKm,
        elevationGainM: parsed.elevationGainM,
        elevationLossM: parsed.elevationLossM,
        elevationProfile: parsed.elevationProfile,
        isSnapped: true,
        source: 'direct',
        mode: 'manual',
      };

      onLoadRoute(routeData, parsed.name);
      onAddToast(
        'success',
        'GPX Berhasil Dimuat!',
        `${parsed.name} (${parsed.totalDistanceKm.toFixed(2)} km) siap ditampilkan di peta.`
      );
      onClose();
    };

    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processGpxFile(e.dataTransfer.files[0]);
    }
  };

  const isMiles = unitSystem === 'mi';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg glass-panel rounded-3xl border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-lime-500/20 text-lime-400 flex items-center justify-center border border-lime-500/30">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Kelola Rute & Impor GPX</h2>
              <p className="text-[11px] text-slate-400">Simpan rute lari Anda atau buka file GPX</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-2 bg-slate-950/70 border-b border-slate-800 gap-1.5">
          <button
            onClick={() => setActiveTab('saved')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'saved'
                ? 'bg-lime-500 text-slate-950 shadow-[0_0_12px_rgba(163,230,53,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Rute Tersimpan ({savedRoutes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'import'
                ? 'bg-lime-500 text-slate-950 shadow-[0_0_12px_rgba(163,230,53,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor File GPX</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'saved' && (
            <div className="space-y-4">
              {/* Save current active route card */}
              {currentRouteData && currentRouteData.coordinates.length > 1 && (
                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-lime-500/30 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-lime-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Rute Aktif Saat Ini
                    </span>
                    <span className="font-mono text-slate-300 font-bold">
                      {isMiles
                        ? `${kmToMiles(currentRouteData.distanceKm).toFixed(2)} MI`
                        : `${currentRouteData.distanceKm.toFixed(2)} KM`}
                    </span>
                  </div>

                  {isSaving ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newRouteName}
                        onChange={(e) => setNewRouteName(e.target.value)}
                        placeholder="Nama rute (contoh: 10K Senayan Loop)"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-lime-500"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveCurrentRoute}
                        className="px-3 py-1.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold text-xs transition"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => setIsSaving(false)}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs transition"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsSaving(true)}
                      className="w-full py-2 rounded-xl bg-lime-500/20 hover:bg-lime-500/30 text-lime-400 font-semibold text-xs border border-lime-500/40 flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <BookmarkCheck className="w-3.5 h-3.5" />
                      <span>Simpan Rute Ini ke Daftar</span>
                    </button>
                  )}
                </div>
              )}

              {/* Saved routes list */}
              {savedRoutes.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs space-y-1">
                  <BookmarkCheck className="w-8 h-8 mx-auto opacity-40 mb-2" />
                  <p className="font-medium text-slate-400">Belum ada rute tersimpan.</p>
                  <p>Buat rute di peta lalu klik tombol simpan di atas.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedRoutes.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-200 truncate">{item.name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                          <span className="font-mono text-lime-400 font-semibold">
                            {isMiles
                              ? `${kmToMiles(item.routeData.distanceKm).toFixed(2)} MI`
                              : `${item.routeData.distanceKm.toFixed(2)} KM`}
                          </span>
                          <span>&bull;</span>
                          <span className="text-emerald-400">+{item.routeData.elevationGainM}m</span>
                          <span>&bull;</span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <Calendar className="w-2.5 h-2.5" />
                            {new Date(item.createdAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            onLoadRoute(item.routeData, item.name);
                            onAddToast('success', 'Rute Dimuat', `"${item.name}" ditampilkan di peta.`);
                            onClose();
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-lime-500/20 hover:bg-lime-500/30 text-lime-300 font-bold text-[11px] transition"
                        >
                          Muat
                        </button>
                        <button
                          onClick={() => handleDownloadSavedGpx(item)}
                          title="Unduh GPX"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRoute(item.id, item.name)}
                          title="Hapus Rute"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4">
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-8 rounded-3xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition ${
                  isDragging
                    ? 'border-lime-400 bg-lime-500/10 scale-[0.99]'
                    : 'border-slate-700 hover:border-slate-500 bg-slate-900/50'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-lime-400/20 to-emerald-500/20 text-lime-400 flex items-center justify-center mb-3 border border-lime-500/30">
                  <FileUp className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-200">
                  Tarik & Lepas File .GPX ke Sini
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Atau klik untuk memilih file dari perangkat Anda
                </p>
                <span className="mt-3 px-3 py-1 rounded-full bg-slate-800 text-[10px] text-slate-300 font-mono">
                  Mendukung Strava, Garmin, Coros, Komoot
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".gpx,application/gpx+xml"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processGpxFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </div>

              {/* Info guidelines */}
              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-1.5">
                <p className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-lime-400" />
                  Format yang Didukung:
                </p>
                <ul className="list-disc list-inside text-[11px] space-y-1 pl-1 text-slate-400">
                  <li>File GPX standar versi 1.0 dan 1.1</li>
                  <li>Data elevasi dan jarak akan otomatis dihitung & divisualisasikan</li>
                  <li>Rute hasil impor dapat langsung diedit dengan Manual Tap atau diunduh ulang</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
