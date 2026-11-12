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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
          ? `${currentRouteData.shape === 'out_and_back' ? 'Out & Back' : 'Loop'} ${currentRouteData.distanceKm.toFixed(1)}K`
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-routes-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-black/75 backdrop-blur-sm transition-opacity duration-200"
    >
      <div className="relative w-full max-w-lg bg-[var(--surface-solid)] rounded-[24px] border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col max-h-[88dvh] text-[var(--text-primary)] ui-modal-enter">
        <div
          aria-hidden="true"
          className="h-[3px] w-full bg-gradient-to-r from-[#fc4c02] via-[#ff7b3b] to-[#fc4c02] shrink-0"
        />

        {/* Header */}
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--surface-solid)]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--brand-tint)] text-[#fc4c02] flex items-center justify-center border border-[var(--brand-border)]">
              <FolderOpen className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="saved-routes-title"
                className="font-display text-lg font-extrabold text-[var(--text-primary)] leading-tight"
              >
                Kelola Rute &amp; Impor GPX
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Simpan rute lari Anda atau buka file GPX
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Tutup kelola rute"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-muted)] hover:text-[var(--brand-ink)] flex items-center justify-center ui-btn-secondary ui-focus-ring"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Animated Sliding Tab Switcher */}
        <div className="p-2.5 bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)]">
          <div className="relative grid grid-cols-2 p-1 rounded-xl bg-[var(--surface-well)] border border-[var(--border-subtle)]">
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-[#fc4c02] shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                activeTab === 'import' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`relative z-10 min-h-[40px] rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 tabular-nums ui-focus-ring ${
                activeTab === 'saved'
                  ? 'text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
              <span>Rute Tersimpan ({savedRoutes.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`relative z-10 min-h-[40px] rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 ui-focus-ring ${
                activeTab === 'import'
                  ? 'text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span>Impor File GPX</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 bg-[var(--surface-solid)]">
          {activeTab === 'saved' && (
            <div className="space-y-4 ui-fade-slide-up">
              {currentRouteData && currentRouteData.coordinates.length > 1 && (
                <div className="p-3.5 rounded-2xl bg-[var(--brand-tint)] border border-[var(--brand-border)] space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--brand-ink)] flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-[#fc4c02]" aria-hidden="true" />
                      <span>Rute Aktif Saat Ini</span>
                    </span>
                    <span className="font-mono text-[var(--text-primary)] font-extrabold tabular-nums">
                      {isMiles
                        ? `${kmToMiles(currentRouteData.distanceKm).toFixed(2)} MI`
                        : `${currentRouteData.distanceKm.toFixed(2)} KM`}
                    </span>
                  </div>

                  {isSaving ? (
                    <div className="flex flex-wrap sm:flex-nowrap gap-2 ui-fade-slide-up">
                      <input
                        type="text"
                        value={newRouteName}
                        onChange={(e) => setNewRouteName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveCurrentRoute();
                        }}
                        placeholder="Nama rute (contoh: 10K Senayan Loop)"
                        className="flex-1 min-w-0 min-h-[42px] bg-[var(--surface-solid)] border border-[var(--border-strong)] rounded-xl px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#fc4c02] focus:ring-2 focus:ring-[#fc4c02]/20 transition-all"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleSaveCurrentRoute}
                        className="min-h-[42px] px-4 py-1.5 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs ui-btn-primary ui-focus-ring"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSaving(false)}
                        className="min-h-[42px] px-3 py-1.5 rounded-xl bg-[var(--surface-solid)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold ui-btn-secondary ui-focus-ring"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsSaving(true)}
                      className="w-full min-h-[42px] py-2 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-center gap-1.5 ui-btn-primary ui-focus-ring"
                    >
                      <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
                      <span>Simpan Rute Ini ke Daftar</span>
                    </button>
                  )}
                </div>
              )}

              {savedRoutes.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[var(--text-muted)] text-xs space-y-1.5">
                  <BookmarkCheck className="w-8 h-8 mx-auto opacity-45 mb-2" aria-hidden="true" />
                  <p className="font-bold text-[var(--text-primary)]">Belum ada rute tersimpan.</p>
                  <p>Buat rute di peta lalu klik tombol simpan di atas.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedRoutes.map((item) => (
                    <div
                      key={item.id}
                      className="group p-3 rounded-2xl cockpit-well hover:border-[var(--brand-border)] flex items-center justify-between gap-3 ui-card-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mt-1 tabular-nums">
                          <span className="font-mono text-[#fc4c02] font-bold">
                            {isMiles
                              ? `${kmToMiles(item.routeData.distanceKm).toFixed(2)} MI`
                              : `${item.routeData.distanceKm.toFixed(2)} KM`}
                          </span>
                          <span>&bull;</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" aria-hidden="true" />
                            {new Date(item.createdAt).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadRoute(item.routeData, item.name);
                            onAddToast('success', 'Rute Dimuat', `"${item.name}" ditampilkan di peta.`);
                            onClose();
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs ui-btn-primary ui-focus-ring"
                        >
                          Muat
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadSavedGpx(item)}
                          title="Unduh GPX"
                          aria-label={`Unduh GPX untuk ${item.name}`}
                          className="w-9 h-9 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center justify-center ui-btn-secondary ui-focus-ring"
                        >
                          <Download className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRoute(item.id, item.name)}
                          title="Hapus Rute"
                          aria-label={`Hapus rute ${item.name}`}
                          className="w-9 h-9 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 flex items-center justify-center ui-btn-secondary ui-focus-ring"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4 ui-fade-slide-up">
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`group p-8 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ui-focus-ring ${
                  isDragging
                    ? 'border-[#fc4c02] bg-[var(--brand-tint)] scale-[0.985]'
                    : 'border-[var(--border-strong)] hover:border-[#fc4c02]/80 bg-[var(--surface-subtle)] hover:bg-[var(--brand-tint)]'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-[var(--brand-tint)] text-[#fc4c02] flex items-center justify-center mb-3 border border-[var(--brand-border)] transition-transform duration-200 group-hover:-translate-y-1">
                  <FileUp className="w-6 h-6" aria-hidden="true" />
                </div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Tarik &amp; Lepas File .GPX ke Sini
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Atau klik untuk memilih file dari perangkat Anda
                </p>
                <span className="mt-3 px-3 py-1 rounded-full bg-[var(--surface-solid)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] font-mono">
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

              <div className="p-3.5 rounded-2xl cockpit-well text-xs text-[var(--text-secondary)] space-y-1.5">
                <p className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-[#fc4c02]" aria-hidden="true" />
                  <span>Format yang Didukung:</span>
                </p>
                <ul className="list-disc list-inside text-xs space-y-1 pl-1 text-[var(--text-muted)]">
                  <li>File GPX standar versi 1.0 dan 1.1</li>
                  <li>Data jarak dan jalur koordinat otomatis dihitung &amp; ditampilkan di peta</li>
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
