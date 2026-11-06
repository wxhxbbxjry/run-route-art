'use client';

import React from 'react';
import { LatLng, RouteData } from '@/lib/types';
import {
  Crosshair,
  Shuffle,
  Compass,
  Zap,
  RotateCcw,
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
  routeData,
  isLoading,
}: RandomLoopModeProps) {
  // Deviation calculation
  const currentDist = routeData?.distanceKm || 0;
  const deviation =
    routeData && currentDist > 0
      ? Math.abs(((currentDist - targetDistanceKm) / targetDistanceKm) * 100)
      : null;

  return (
    <div className="space-y-4">
      {/* Origin Point Info & Button */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-lime-400" /> Titik Start & Finish (100% Closed Loop)
          </span>
          <button
            onClick={onUseMyLocation}
            className="text-[11px] font-medium text-lime-400 hover:text-lime-300 flex items-center gap-1 transition"
          >
            <Crosshair className="w-3.5 h-3.5" /> Gunakan GPS Saya
          </button>
        </div>

        <div className="text-xs text-slate-400 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          {startLocation ? (
            <div className="space-y-1">
              <p className="font-mono text-slate-200">
                Lat: {startLocation.lat.toFixed(5)}, Lng: {startLocation.lng.toFixed(5)}
              </p>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                <CheckCircle className="w-3 h-3" /> Dijamin rute mulai dan berakhir di titik yang sama
              </p>
            </div>
          ) : (
            <p className="text-amber-400/90 italic">
              Klik lokasi pada peta atau gunakan tombol GPS di atas untuk menentukan titik start/finish.
            </p>
          )}
        </div>
      </div>

      {/* Preset Distances */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300 block">
          Preset Jarak Cepat
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_DISTANCES.map((preset) => {
            const isSelected = Math.abs(targetDistanceKm - preset.value) < 0.2;
            return (
              <button
                key={preset.label}
                onClick={() => onTargetDistanceChange(preset.value)}
                className={`py-2 px-1.5 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                  isSelected
                    ? 'bg-lime-500/20 border-lime-500 text-lime-400 shadow-[0_0_12px_rgba(163,230,53,0.3)]'
                    : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <span className="text-sm font-bold">{preset.label}</span>
                <span className="text-[9px] text-slate-400 leading-tight">{preset.tag}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Slider */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-medium">Jarak Kustom Target</span>
          <span className="text-sm font-black font-mono text-lime-400">
            {targetDistanceKm.toFixed(1)} KM
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="50"
          step="0.5"
          value={targetDistanceKm}
          onChange={(e) => onTargetDistanceChange(parseFloat(e.target.value))}
          className="w-full accent-lime-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>1 KM</span>
          <span>15 KM</span>
          <span>30 KM</span>
          <span>50 KM</span>
        </div>
      </div>

      {/* Generator & Re-roll Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={onGenerateLoop}
          disabled={!startLocation || isLoading}
          className="col-span-2 py-3 px-4 rounded-xl bg-gradient-to-r from-lime-500 to-emerald-600 hover:from-lime-400 hover:to-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(163,230,53,0.4)] transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
        >
          {isLoading ? (
            <Zap className="w-4 h-4 animate-spin" />
          ) : (
            <Shuffle className="w-4 h-4" />
          )}
          <span>{isLoading ? 'Menghitung Rute OSRM...' : 'Generate Random Loop'}</span>
        </button>

        {routeData && (
          <button
            onClick={onReRoll}
            disabled={!startLocation || isLoading}
            className="col-span-2 py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/60 font-medium text-xs flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4 text-lime-400" />
            <span>Re-roll / Acak Arah Lain</span>
          </button>
        )}
      </div>

      {/* Distance accuracy feedback */}
      {deviation !== null && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
            deviation <= 10
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          }`}
        >
          {deviation <= 10 ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          )}
          <div className="leading-snug">
            <span className="font-semibold">
              Akurasi: {(100 - deviation).toFixed(1)}%
            </span>{' '}
            &bull; Target {targetDistanceKm.toFixed(1)} km &rarr; Hasil {currentDist.toFixed(2)} km
            {deviation > 10 && (
              <p className="text-[10px] text-amber-300/80 mt-0.5">
                Tip: Coba klik &quot;Re-roll&quot; untuk rute dengan deviasi jalan lebih presisi.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
