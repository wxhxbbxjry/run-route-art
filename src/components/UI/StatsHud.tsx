'use client';

import React, { useState } from 'react';
import { RouteData, UnitSystem } from '@/lib/types';
import { calculatePaceTime, calculateCalories, kmToMiles, metersToFeet } from '@/lib/geo';
import {
  Timer,
  Flame,
  Mountain,
  Download,
  Activity,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface StatsHudProps {
  routeData: RouteData | null;
  paceSeconds: number;
  onPaceChange: (seconds: number) => void;
  onOpenExport: () => void;
  showElevation: boolean;
  onToggleElevation: () => void;
  unitSystem?: UnitSystem;
  onToggleUnit?: () => void;
}

const PACE_PRESETS = [
  { label: 'Jalan Santai', pace: 600, text: '10:00' },
  { label: 'Jogging Santai', pace: 420, text: '7:00' },
  { label: 'Pace Sedang', pace: 360, text: '6:00' },
  { label: 'Tempo Run', pace: 300, text: '5:00' },
  { label: 'Speed PB', pace: 255, text: '4:15' },
];

export default function StatsHud({
  routeData,
  paceSeconds,
  onPaceChange,
  onOpenExport,
  showElevation,
  onToggleElevation,
  unitSystem = 'km',
  onToggleUnit,
}: StatsHudProps) {
  const [showPacePicker, setShowPacePicker] = useState(false);

  const isMiles = unitSystem === 'mi';
  const distanceKm = routeData ? routeData.distanceKm : 0;
  const displayDist = isMiles ? kmToMiles(distanceKm) : distanceKm;
  const distUnitLabel = isMiles ? 'MI' : 'KM';

  const timeInfo = calculatePaceTime(distanceKm, paceSeconds);
  const calories = calculateCalories(distanceKm, paceSeconds);

  // Compute pace according to unit
  const activePaceSeconds = isMiles ? Math.round(paceSeconds * 1.60934) : paceSeconds;
  const paceMinutes = Math.floor(activePaceSeconds / 60);
  const paceRemSeconds = activePaceSeconds % 60;
  const paceString = `${paceMinutes}:${paceRemSeconds.toString().padStart(2, '0')}`;
  const paceUnitLabel = isMiles ? '/MI' : '/KM';

  // Compute elevation gain
  const elevGain = routeData ? routeData.elevationGainM : 0;
  const elevDisplay = isMiles ? `+${metersToFeet(elevGain)}ft` : `+${elevGain}m`;

  return (
    <div className="strava-card rounded-2xl p-3.5 space-y-3 text-slate-900 dark:text-slate-100">
      {/* Top Main Metrics Row */}
      <div className="grid grid-cols-4 gap-2 items-center text-center">
        {/* Distance + Unit Switcher */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
              Jarak
            </span>
            {onToggleUnit && (
              <button
                onClick={onToggleUnit}
                title="Ganti satuan KM / Miles"
                className="px-1.5 py-0.2 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-bold text-[9px] border border-slate-200 dark:border-slate-700 transition"
              >
                {distUnitLabel}
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-black font-mono tracking-tight text-[#fc4c02]">
              {displayDist.toFixed(2)}
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{distUnitLabel}</span>
          </div>
        </div>

        {/* Est. Time */}
        <div className="flex flex-col items-center border-l border-slate-200 dark:border-slate-700">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Timer className="w-3 h-3 text-sky-600 dark:text-sky-400" /> Waktu
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-slate-900 dark:text-white mt-0.5">
            {timeInfo.formatted}
          </span>
        </div>

        {/* Calories */}
        <div className="flex flex-col items-center border-l border-slate-200 dark:border-slate-700">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Flame className="w-3 h-3 text-[#fc4c02]" /> Kalori
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-[#ea580c] dark:text-orange-400 mt-0.5">
            ~{calories}
          </span>
        </div>

        {/* Elev Gain */}
        <div className="flex flex-col items-center border-l border-slate-200 dark:border-slate-700">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Mountain className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Elevasi
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-emerald-700 dark:text-emerald-400 mt-0.5">
            {elevDisplay}
          </span>
        </div>
      </div>

      {/* Pace Controller Bar */}
      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#fc4c02]" />
          <span className="text-slate-600 dark:text-slate-300 font-semibold">Target Pace Lari:</span>
          <span className="font-mono font-bold text-[#c93b00] dark:text-orange-300 bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5 rounded border border-orange-200 dark:border-orange-500/40">
            {paceString} {paceUnitLabel}
          </span>
        </div>

        <button
          onClick={() => setShowPacePicker(!showPacePicker)}
          className="text-slate-600 dark:text-slate-300 hover:text-[#fc4c02] flex items-center gap-1 text-[11px] font-bold transition"
        >
          <Sliders className="w-3 h-3" />
          <span>Atur Pace</span>
          {showPacePicker ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Pace Selector Dropdown / Slider Drawer */}
      {showPacePicker && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Geser Pace (Detik/KM):</span>
            <span className="font-mono text-[#fc4c02] font-bold">{paceString} min/km</span>
          </div>

          <input
            type="range"
            min="210"
            max="660"
            step="5"
            value={paceSeconds}
            onChange={(e) => onPaceChange(parseInt(e.target.value, 10))}
            className="w-full accent-[#fc4c02] bg-slate-200 dark:bg-slate-700 h-2 rounded-lg cursor-pointer"
          />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {PACE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => onPaceChange(preset.pace)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition ${
                  paceSeconds === preset.pace
                    ? 'bg-orange-50 dark:bg-orange-950/60 text-[#c93b00] dark:text-orange-300 border-[#fc4c02]/60'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {preset.text} ({preset.label})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Actions: Elevation & Export */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          onClick={onToggleElevation}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
            showElevation
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Mountain className="w-3.5 h-3.5" />
          <span>{showElevation ? 'Tutup Elevasi' : 'Lihat Elevasi'}</span>
        </button>

        <button
          onClick={onOpenExport}
          disabled={!routeData || routeData.coordinates.length < 2}
          className="flex-1 py-2 px-3 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_4px_14px_rgba(252,76,2,0.3)] transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Ekspor GPX / JSON</span>
        </button>
      </div>
    </div>
  );
}
