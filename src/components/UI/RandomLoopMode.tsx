'use client';

import React from 'react';
import { LatLng, RouteData } from '@/lib/types';
import {
  Crosshair,
  Shuffle,
  Compass,
  Zap,
  RotateCcw,
  Trash2,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

interface RandomLoopModeProps {
  startLocation: LatLng | null;
  targetDistanceKm: number;
  onTargetDistanceChange: (km: number) => void;
  onUseMyLocation: () => void;
  onGenerateLoop: () => void;
  onReRoll: () => void;
  onResetLoop: () => void;
  routeData: RouteData | null;
  isLoading: boolean;
}

const PRESET_DISTANCES = [
  { label: '5K', value: 5, tag: 'Easy / Fun' },
  { label: '10K', value: 10, tag: 'Standard' },
  { label: '21K', value: 21.1, tag: 'Half Marathon' },
  { label: '42K', value: 42.2, tag: 'Marathon' },
];

export default function RandomLoopMode({
  startLocation,
  targetDistanceKm,
  onTargetDistanceChange,
  onUseMyLocation,
  onGenerateLoop,
  onReRoll,
  onResetLoop,
  routeData,
  isLoading,
}: RandomLoopModeProps) {
  // Deviation calculation
  const currentDist = routeData?.distanceKm || 0;
  const deviation =
    routeData && currentDist > 0
      ? Math.abs(((currentDist - targetDistanceKm) / targetDistanceKm) * 100)
      : null;

  const sliderProgress = Math.max(0, Math.min(100, ((targetDistanceKm - 1) / (50 - 1)) * 100));

  return (
    <div className="space-y-2.5 ui-fade-slide-up">
      {/* Origin Point Info & Button */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/75 border border-slate-200 dark:border-slate-700 space-y-2 ui-card-hover">
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-[#fc4c02] shrink-0" />
            <span>Start &amp; Finish (Loop)</span>
          </span>
          <button
            type="button"
            onClick={onUseMyLocation}
            className="group text-[11px] font-bold text-[#fc4c02] hover:text-[#e34402] flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/50 transition-colors ui-focus-ring active:scale-95"
          >
            <Crosshair className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-45" />
            <span>Gunakan GPS Saya</span>
          </button>
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/90 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
          {startLocation ? (
            <div className="space-y-0.5">
              <p className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                Lat: {startLocation.lat.toFixed(5)}, Lng: {startLocation.lng.toFixed(5)}
              </p>
              <p className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-bold">
                <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Dijamin rute mulai dan berakhir di titik yang sama</span>
              </p>
            </div>
          ) : (
            <p className="text-amber-700 dark:text-amber-400 italic">
              Klik lokasi pada peta atau gunakan tombol GPS di atas untuk menentukan titik start/finish.
            </p>
          )}
        </div>
      </div>

      {/* Preset Distances */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
          Preset Jarak Cepat
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_DISTANCES.map((preset) => {
            const isSelected = Math.abs(targetDistanceKm - preset.value) < 0.2;
            return (
              <button
                type="button"
                key={preset.label}
                onClick={() => onTargetDistanceChange(preset.value)}
                aria-pressed={isSelected}
                className={`group relative py-2 px-1.5 rounded-xl border text-center flex flex-col items-center justify-center ui-card-hover ui-focus-ring ${
                  isSelected
                    ? 'bg-orange-50/90 dark:bg-orange-950/60 border-[#fc4c02] text-[#c93b00] dark:text-orange-300 shadow-[0_2px_10px_rgba(252,76,2,0.14)]'
                    : 'bg-slate-50 dark:bg-slate-800/75 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 hover:border-orange-300 dark:hover:border-orange-500/40'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#fc4c02] transition-transform duration-200 ${
                    isSelected ? 'scale-100' : 'scale-0'
                  }`}
                />
                <span className="text-sm font-black tabular-nums transition-transform duration-150 group-hover:scale-105">
                  {preset.label}
                </span>
                <span
                  className={`text-[9px] leading-tight ${
                    isSelected
                      ? 'text-[#c93b00] dark:text-orange-300 font-semibold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {preset.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Slider */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/75 border border-slate-200 dark:border-slate-700 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-600 dark:text-slate-300 font-semibold">Jarak Kustom Target</span>
          <span className="text-sm font-black font-mono text-[#c93b00] dark:text-orange-300 tabular-nums bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5 rounded-lg border border-orange-200/80 dark:border-orange-500/30">
            {targetDistanceKm.toFixed(1)} KM
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="50"
          step="0.5"
          value={targetDistanceKm}
          aria-label="Jarak Kustom Target dalam Kilometer"
          onChange={(e) => onTargetDistanceChange(parseFloat(e.target.value))}
          style={{ '--slider-progress': `${sliderProgress}%` } as React.CSSProperties}
          className="strava-slider"
        />
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono font-medium tabular-nums">
          <span>1 KM</span>
          <span>15 KM</span>
          <span>30 KM</span>
          <span>50 KM</span>
        </div>
      </div>

      {/* Generator, Re-generate & Reset Loop Actions */}
      <div className="space-y-2 pt-0.5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onGenerateLoop}
            disabled={!startLocation || isLoading}
            className="group py-2.5 px-3 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:pointer-events-none ui-btn-primary ui-focus-ring"
          >
            {isLoading ? (
              <Zap className="w-4 h-4 animate-spin" />
            ) : (
              <Shuffle className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" />
            )}
            <span>{isLoading ? 'Menghitung...' : 'Generate Loop'}</span>
          </button>

          <button
            type="button"
            onClick={onReRoll}
            disabled={!startLocation || isLoading}
            title="Acak rute loop dengan arah atau variasi jalan baru"
            className="group py-2.5 px-3 rounded-xl bg-white hover:bg-orange-50/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 hover:text-[#c93b00] dark:hover:text-orange-300 border border-slate-300 dark:border-slate-600 hover:border-[#fc4c02] font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-45 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
          >
            <RotateCcw
              className={`w-4 h-4 text-[#fc4c02] transition-transform duration-200 ${
                isLoading ? 'animate-spin' : 'group-hover:-rotate-90'
              }`}
            />
            <span>Re-generate Loop</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onResetLoop}
          disabled={isLoading || (!routeData && Math.abs(targetDistanceKm - 10) < 0.01)}
          title="Hapus rute loop aktif dan kembalikan target jarak ke default"
          className="group w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/40 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Trash2 className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-rotate-12" />
          <span>Reset Loop</span>
        </button>
      </div>

      {/* Distance accuracy feedback */}
      {deviation !== null && (
        <div
          className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ui-fade-slide-up ${
            deviation <= 10
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-700/60 text-amber-800 dark:text-amber-300'
          }`}
        >
          {deviation <= 10 ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="leading-snug tabular-nums">
            <span className="font-bold">
              Akurasi: {(100 - deviation).toFixed(1)}%
            </span>{' '}
            &bull; Target {targetDistanceKm.toFixed(1)} km &rarr; Hasil {currentDist.toFixed(2)} km
            {deviation > 10 && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                Tip: Klik &quot;Re-generate Loop&quot; untuk variasi jalan lebih presisi.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
