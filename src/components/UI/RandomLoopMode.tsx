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
    <div className="space-y-3">
      {/* Origin Point Info & Button */}
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-[#fc4c02] shrink-0" />
            <span>Start &amp; Finish (Loop)</span>
          </span>
          <button
            onClick={onUseMyLocation}
            className="text-[11px] font-bold text-[#fc4c02] hover:text-[#e34402] flex items-center gap-1 transition shrink-0"
          >
            <Crosshair className="w-3.5 h-3.5" /> Gunakan GPS Saya
          </button>
        </div>

        <div className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
          {startLocation ? (
            <div className="space-y-1">
              <p className="font-mono font-semibold text-slate-800">
                Lat: {startLocation.lat.toFixed(5)}, Lng: {startLocation.lng.toFixed(5)}
              </p>
              <p className="text-[10px] text-emerald-700 flex items-center gap-1 font-bold">
                <CheckCircle className="w-3 h-3 text-emerald-600" /> Dijamin rute mulai dan berakhir di titik yang sama
              </p>
            </div>
          ) : (
            <p className="text-amber-700 italic">
              Klik lokasi pada peta atau gunakan tombol GPS di atas untuk menentukan titik start/finish.
            </p>
          )}
        </div>
      </div>

      {/* Preset Distances */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 block">
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
                    ? 'bg-orange-50 border-[#fc4c02] text-[#c93b00] shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="text-sm font-black">{preset.label}</span>
                <span
                  className={`text-[9px] leading-tight ${
                    isSelected ? 'text-[#fc4c02] font-semibold' : 'text-slate-500'
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
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-600 font-semibold">Jarak Kustom Target</span>
          <span className="text-sm font-black font-mono text-[#fc4c02]">
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
          className="w-full accent-[#fc4c02] bg-slate-200 h-2 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono font-medium">
          <span>1 KM</span>
          <span>15 KM</span>
          <span>30 KM</span>
          <span>50 KM</span>
        </div>
      </div>

      {/* Generator & Re-generate Loop Buttons Side-by-Side */}
      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <button
          onClick={onGenerateLoop}
          disabled={!startLocation || isLoading}
          className="py-2.5 px-3 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_4px_14px_rgba(252,76,2,0.3)] transition active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none"
        >
          {isLoading ? (
            <Zap className="w-4 h-4 animate-spin" />
          ) : (
            <Shuffle className="w-4 h-4" />
          )}
          <span>{isLoading ? 'Menghitung...' : 'Generate Loop'}</span>
        </button>

        <button
          onClick={onReRoll}
          disabled={!startLocation || isLoading}
          title="Acak rute loop dengan arah atau variasi jalan baru"
          className="py-2.5 px-3 rounded-xl bg-white hover:bg-orange-50 text-slate-800 hover:text-[#fc4c02] border border-slate-300 hover:border-[#fc4c02] font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none"
        >
          <RotateCcw className={`w-4 h-4 text-[#fc4c02] ${isLoading ? 'animate-spin' : ''}`} />
          <span>Re-generate Loop</span>
        </button>
      </div>

      {/* Distance accuracy feedback */}
      {deviation !== null && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
            deviation <= 10
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {deviation <= 10 ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          )}
          <div className="leading-snug">
            <span className="font-bold">
              Akurasi: {(100 - deviation).toFixed(1)}%
            </span>{' '}
            &bull; Target {targetDistanceKm.toFixed(1)} km &rarr; Hasil {currentDist.toFixed(2)} km
            {deviation > 10 && (
              <p className="text-[10px] text-amber-700 mt-0.5">
                Tip: Coba klik &quot;Re-generate Loop&quot; untuk rute dengan deviasi jalan lebih presisi.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
