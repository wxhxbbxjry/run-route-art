'use client';

import React from 'react';
import { GeneratorShape, LatLng, RouteData } from '@/lib/types';
import {
  Crosshair,
  Shuffle,
  Compass,
  Zap,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Repeat,
  ArrowLeftRight,
  Undo2,
  Minus,
  Plus,
} from 'lucide-react';

interface RandomLoopModeProps {
  startLocation: LatLng | null;
  targetDistanceKm: number;
  onTargetDistanceChange: (km: number) => void;
  routeShape: GeneratorShape;
  onRouteShapeChange: (shape: GeneratorShape) => void;
  onUseMyLocation: () => void;
  onGenerateLoop: () => void;
  onReRoll: () => void;
  onResetLoop: () => void;
  isEdited: boolean;
  canUndoEdit: boolean;
  onUndoRouteEdit: () => void;
  isLoading: boolean;
  routeData: RouteData | null;
}

const PRESET_DISTANCES = [
  { label: '5K', value: 5, tag: 'Fun Run' },
  { label: '10K', value: 10, tag: 'Standar' },
  { label: '21K', value: 21.1, tag: 'Half' },
  { label: '42K', value: 42.2, tag: 'Full' },
];

export default function RandomLoopMode({
  startLocation,
  targetDistanceKm,
  onTargetDistanceChange,
  routeShape,
  onRouteShapeChange,
  onUseMyLocation,
  onGenerateLoop,
  onReRoll,
  onResetLoop,
  isEdited,
  canUndoEdit,
  onUndoRouteEdit,
  isLoading,
  routeData,
}: RandomLoopModeProps) {
  const currentDist = routeData?.distanceKm || 0;
  const refTarget = routeData?.targetDistanceKm || targetDistanceKm || 1;
  const deviation =
    routeData && currentDist > 0
      ? Math.abs(((currentDist - refTarget) / refTarget) * 100)
      : null;

  const sliderProgress = Math.max(0, Math.min(100, ((targetDistanceKm - 1) / (50 - 1)) * 100));

  const stepTargetDistance = (delta: number) => {
    const next = Math.max(1, Math.min(50, Math.round((targetDistanceKm + delta) * 2) / 2));
    onTargetDistanceChange(next);
  };

  return (
    <div className="space-y-2.5 ui-fade-slide-up">
      {/* 1. Segmented Shape Toggle (Loop Memutar vs Pergi-Pulang PP) */}
      <div className="space-y-1">
        <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-muted)] block px-0.5">
          Bentuk Rute
        </span>
        <div
          role="radiogroup"
          aria-label="Bentuk Rute Generator"
          className="relative grid grid-cols-2 p-1 rounded-xl bg-[var(--surface-well)] border border-[var(--border-subtle)]"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-[var(--surface-solid)] shadow-sm border border-[var(--border-subtle)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              routeShape === 'out_and_back' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            role="radio"
            aria-checked={routeShape === 'loop'}
            onClick={() => onRouteShapeChange('loop')}
            className={`relative z-10 min-h-[40px] md:min-h-[34px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ui-focus-ring ${
              routeShape === 'loop'
                ? 'text-[var(--brand-ink)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Loop Memutar</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={routeShape === 'out_and_back'}
            onClick={() => onRouteShapeChange('out_and_back')}
            className={`relative z-10 min-h-[40px] md:min-h-[34px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ui-focus-ring ${
              routeShape === 'out_and_back'
                ? 'text-[var(--brand-ink)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Pergi-Pulang</span>
          </button>
        </div>
      </div>

      {/* 2. Origin Coordinate Strip */}
      <div className="p-2.5 xl:p-3 rounded-2xl cockpit-well space-y-1.5">
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-[#fc4c02] shrink-0" aria-hidden="true" />
            <span>Titik Start &amp; Finish</span>
          </span>
          <button
            type="button"
            onClick={onUseMyLocation}
            className="group min-h-[36px] md:min-h-[28px] text-xs font-bold text-[var(--brand-ink)] hover:bg-[var(--brand-tint)] flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-xl border border-transparent hover:border-[var(--brand-border)] transition-colors ui-focus-ring active:scale-95"
          >
            <Crosshair
              className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-45"
              aria-hidden="true"
            />
            <span>GPS Saya</span>
          </button>
        </div>

        <div className="text-xs bg-[var(--surface-solid)] px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] flex items-center justify-between gap-2">
          {startLocation ? (
            <>
              <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums truncate">
                {startLocation.lat.toFixed(5)}, {startLocation.lng.toFixed(5)}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 bg-[var(--status-ok-bg)] text-[var(--status-ok-text)] border border-[var(--status-ok-border)]">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                <span>Jalan Umum</span>
              </span>
            </>
          ) : (
            <p className="text-amber-700 dark:text-amber-300 font-medium">
              Ketuk peta untuk memilih titik start/finish.
            </p>
          )}
        </div>
      </div>

      {/* 3. Hero Target Distance Studio + Quick Presets */}
      <div className="p-3 xl:p-3.5 rounded-2xl cockpit-well space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-muted)] block">
              Target Jarak Lari
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-display text-3xl xl:text-4xl font-extrabold tracking-tight text-[var(--text-primary)] tabular-nums leading-none">
                {targetDistanceKm.toFixed(1)}
              </span>
              <span className="font-mono text-xs font-extrabold text-[#fc4c02] uppercase">
                KM
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => stepTargetDistance(-1)}
              disabled={targetDistanceKm <= 1}
              aria-label="Kurangi jarak 1 km"
              title="Kurangi 1 km"
              className="w-10 h-10 md:w-9 md:h-9 rounded-xl bg-[var(--surface-solid)] border border-[var(--border-subtle)] hover:border-[var(--brand-border)] text-[var(--text-primary)] hover:text-[var(--brand-ink)] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
            >
              <Minus className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => stepTargetDistance(1)}
              disabled={targetDistanceKm >= 50}
              aria-label="Tambah jarak 1 km"
              title="Tambah 1 km"
              className="w-10 h-10 md:w-9 md:h-9 rounded-xl bg-[var(--surface-solid)] border border-[var(--border-subtle)] hover:border-[var(--brand-border)] text-[var(--text-primary)] hover:text-[var(--brand-ink)] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 4 Preset Chips */}
        <div className="grid grid-cols-4 gap-2">
          {PRESET_DISTANCES.map((preset) => {
            const isSelected = Math.abs(targetDistanceKm - preset.value) < 0.2;
            return (
              <button
                type="button"
                key={preset.label}
                onClick={() => onTargetDistanceChange(preset.value)}
                aria-pressed={isSelected}
                className={`group relative min-h-[48px] py-1.5 px-1 rounded-xl border text-center flex flex-col items-center justify-center ui-card-hover ui-focus-ring ${
                  isSelected
                    ? 'bg-[var(--brand-tint)] border-[#fc4c02] text-[var(--brand-ink)] shadow-[0_2px_10px_rgba(252,76,2,0.16)]'
                    : 'bg-[var(--surface-solid)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-[var(--brand-border)]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#fc4c02] transition-transform duration-200 ${
                    isSelected ? 'scale-100' : 'scale-0'
                  }`}
                />
                <span className="font-display text-lg font-extrabold tracking-tight tabular-nums leading-none transition-transform duration-150 group-hover:scale-105">
                  {preset.label}
                </span>
                <span
                  className={`text-[10px] mt-0.5 leading-none ${
                    isSelected
                      ? 'text-[var(--brand-ink)] font-bold'
                      : 'text-[var(--text-muted)] font-medium'
                  }`}
                >
                  {preset.tag}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom Slider */}
        <div className="space-y-1.5 pt-0.5">
          <input
            type="range"
            min="1"
            max="50"
            step="0.5"
            value={targetDistanceKm}
            aria-label="Jarak Target dalam Kilometer"
            onChange={(e) => onTargetDistanceChange(parseFloat(e.target.value))}
            style={{ '--slider-progress': `${sliderProgress}%` } as React.CSSProperties}
            className="strava-slider"
          />
          <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-mono font-medium tabular-nums">
            <span>1 KM</span>
            <span>15 KM</span>
            <span>30 KM</span>
            <span>50 KM</span>
          </div>
        </div>
      </div>

      {/* 4. Dominant Primary CTA + Balanced Secondary Controls */}
      <div className="space-y-2 pt-0.5">
        <button
          type="button"
          onClick={onGenerateLoop}
          disabled={!startLocation || isLoading}
          className="group w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-45 disabled:pointer-events-none ui-btn-primary ui-focus-ring"
        >
          {isLoading ? (
            <Zap className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Shuffle
              className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12"
              aria-hidden="true"
            />
          )}
          <span>
            {isLoading
              ? 'Menghitung Jalur Terbaik...'
              : routeShape === 'out_and_back'
              ? 'Generate Rute PP'
              : 'Generate Rute'}
          </span>
        </button>

        {isLoading && (
          <div className="h-1 w-full rounded-full bg-orange-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-[#fc4c02] ui-loading-bar" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onReRoll}
            disabled={!startLocation || isLoading}
            title="Cari arah rute lain yang berbeda"
            className="group min-h-[44px] md:min-h-[40px] py-2 px-3 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] hover:text-[var(--brand-ink)] border border-[var(--border-subtle)] hover:border-[var(--brand-border)] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 text-[#fc4c02] transition-transform duration-200 ${
                isLoading ? 'animate-spin' : 'group-hover:-rotate-90'
              }`}
              aria-hidden="true"
            />
            <span>Buat Ulang</span>
          </button>

          <button
            type="button"
            onClick={onResetLoop}
            disabled={isLoading || (!routeData && Math.abs(targetDistanceKm - 10) < 0.01)}
            title="Hapus rute aktif dan kembalikan target ke 10 km"
            className="group min-h-[44px] md:min-h-[40px] py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
          >
            <Trash2
              className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-rotate-12"
              aria-hidden="true"
            />
            <span>Reset Rute</span>
          </button>
        </div>
      </div>

      {/* 5. Active Generated Route Accuracy & Anchor Edit Summary (Single Route, Zero Saran Rute list) */}
      {routeData && deviation !== null && (
        <div
          className={`p-3 rounded-2xl border space-y-2 ui-fade-slide-up ${
            deviation <= 10
              ? 'bg-[var(--status-ok-bg)] border-[var(--status-ok-border)]'
              : 'bg-amber-50 dark:bg-amber-950/45 border-amber-200 dark:border-amber-700/60'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {deviation <= 10 ? (
                <CheckCircle2
                  className="w-4 h-4 shrink-0 text-[var(--status-ok-text)]"
                  aria-hidden="true"
                />
              ) : (
                <AlertTriangle
                  className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-extrabold ${
                      deviation <= 10
                        ? 'text-[var(--status-ok-text)]'
                        : 'text-amber-800 dark:text-amber-300'
                    }`}
                  >
                    Akurasi {Math.max(0, 100 - deviation).toFixed(1)}%
                  </span>
                  {isEdited && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500 text-white leading-none">
                      Diedit
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-mono tabular-nums text-[var(--text-secondary)] mt-0.5">
                  Target {refTarget.toFixed(1)} km &rarr;{' '}
                  <strong className="text-[var(--text-primary)]">{currentDist.toFixed(2)} km</strong>
                </p>
              </div>
            </div>

            {isEdited && canUndoEdit && (
              <button
                type="button"
                onClick={onUndoRouteEdit}
                className="min-h-[36px] px-2.5 py-1 rounded-xl bg-[var(--surface-solid)] border border-[var(--border-subtle)] hover:border-[var(--brand-border)] text-xs font-bold text-[var(--text-primary)] hover:text-[var(--brand-ink)] flex items-center gap-1 shrink-0 ui-btn-secondary ui-focus-ring"
              >
                <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Undo Edit</span>
              </button>
            )}
          </div>

          <p className="text-[11px] text-[var(--text-muted)] leading-snug pt-1 border-t border-black/5 dark:border-white/10">
            Seret titik putih-oranye atau klik langsung garis rute di peta untuk menyesuaikan jalur.
          </p>
        </div>
      )}
    </div>
  );
}
