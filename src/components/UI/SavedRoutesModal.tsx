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
        currentRouteData.mode === 'random'
          ? `Loop ${currentRouteData.distanceKm.toFixed(1)}K`
          : `Rute Manual ${currentRouteData.distanceKm.toFixed(1)}K`;
      setNewRouteName(modeLabel.trim());
    }
  }, [isOpen, currentRouteData]);

  if (!isOpen) return null;

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

  const handleDownloadSavedGpx = (item: SavedRoute) => {
    const gpx = generateGpx(item.routeData, item.name, item.paceSeconds);
    const slug = item.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadFile(gpx, `${slug}.gpx`, 'application/gpx+xml');
    onAddToast('success', 'GPX Diunduh', `${item.name}.gpx siap untuk Strava/Garmin.`);
  };

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-[#fc4c02] flex items-center justify-center border border-orange-200 dark:border-orange-500/40">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Kelola Rute &amp; Impor GPX</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Simpan rute lari Anda atau buka file GPX</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-2 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 gap-1.5">
          <button
            onClick={() => setActiveTab('saved')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'saved'
                ? 'bg-[#fc4c02] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Rute Tersimpan ({savedRoutes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'import'
                ? 'bg-[#fc4c02] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor File GPX</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 bg-white dark:bg-slate-900">
          {activeTab === 'saved' && (
            <div className="space-y-4">
              {currentRouteData && currentRouteData.coordinates.length > 1 && (
                <div className="p-3.5 rounded-2xl bg-orange-50/70 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-500/40 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#c93b00] dark:text-orange-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#fc4c02]" /> Rute Aktif Saat Ini
                    </span>
                    <span className="font-mono text-slate-800 dark:text-slate-100 font-bold">
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
                        className="flex-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#fc4c02]"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveCurrentRoute}
                        className="px-3 py-1.5 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs transition"
                      >
                        Simpan
                      </button>
                      <button
                        onClick={() => setIsSaving(false)}
                        className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-semibold transition"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsSaving(true)}
                      className="w-full py-2 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95"
                    >
                      <BookmarkCheck className="w-3.5 h-3.5" />
                      <span>Simpan Rute Ini ke Daftar</span>
                    </button>
                  )}
                </div>
              )}

              {savedRoutes.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-xs space-y-1">
                  <BookmarkCheck className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="font-bold text-slate-700 dark:text-slate-300">Belum ada rute tersimpan.</p>
                  <p>Buat rute di peta lalu klik tombol simpan di atas.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedRoutes.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                          <span className="font-mono text-[#fc4c02] font-bold">
                            {isMiles
                              ? `${kmToMiles(item.routeData.distanceKm).toFixed(2)} MI`
                              : `${item.routeData.distanceKm.toFixed(2)} KM`}
                          </span>
                          <span>&bull;</span>
                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">+{item.routeData.elevationGainM}m</span>
                          <span>&bull;</span>
                          <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
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
                          className="px-2.5 py-1.5 rounded-lg bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-[11px] transition"
                        >
                          Muat
                        </button>
                        <button
                          onClick={() => handleDownloadSavedGpx(item)}
                          title="Unduh GPX"
                          className="p-1.5 rounded-lg bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRoute(item.id, item.name)}
                          title="Hapus Rute"
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/40 transition"
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
                    ? 'border-[#fc4c02] bg-orange-50 dark:bg-orange-950/50 scale-[0.99]'
                    : 'border-slate-300 dark:border-slate-700 hover:border-[#fc4c02]/60 bg-slate-50 dark:bg-slate-800/60'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950/70 text-[#fc4c02] flex items-center justify-center mb-3 border border-orange-200 dark:border-orange-500/40">
                  <FileUp className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Tarik &amp; Lepas File .GPX ke Sini
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Atau klik untuk memilih file dari perangkat Anda
                </p>
                <span className="mt-3 px-3 py-1 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300 font-mono">
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

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-1.5">
                <p className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-[#fc4c02]" />
                  Format yang Didukung:
                </p>
                <ul className="list-disc list-inside text-[11px] space-y-1 pl-1 text-slate-600 dark:text-slate-400">
                  <li>File GPX standar versi 1.0 dan 1.1</li>
                  <li>Data elevasi dan jarak akan otomatis dihitung &amp; divisualisasikan</li>
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
