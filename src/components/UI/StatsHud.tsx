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
    <div className="glass-panel rounded-2xl border border-slate-700/70 p-3.5 shadow-2xl space-y-3">
      {/* Top Main Metrics Row */}
      <div className="grid grid-cols-4 gap-2 items-center text-center">
        {/* Distance + Unit Switcher */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Jarak
            </span>
            {onToggleUnit && (
              <button
                onClick={onToggleUnit}
                title="Ganti satuan KM / Miles (OnTheGoMap style)"
                className="px-1 py-0.2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[9px] border border-slate-700"
              >
                {distUnitLabel}
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-2xl font-black font-mono tracking-tight text-lime-400">
              {displayDist.toFixed(2)}
            </span>
            <span className="text-[10px] font-bold text-slate-400">{distUnitLabel}</span>
          </div>
        </div>

        {/* Est. Time */}
        <div className="flex flex-col items-center border-l border-slate-800">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
            <Timer className="w-3 h-3 text-cyan-400" /> Waktu
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-slate-100 mt-0.5">
            {timeInfo.formatted}
          </span>
        </div>

        {/* Calories */}
        <div className="flex flex-col items-center border-l border-slate-800">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
            <Flame className="w-3 h-3 text-orange-400" /> Kalori
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-orange-400 mt-0.5">
            ~{calories}
          </span>
        </div>

        {/* Elev Gain */}
        <div className="flex flex-col items-center border-l border-slate-800">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
            <Mountain className="w-3 h-3 text-emerald-400" /> Elevasi
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-emerald-400 mt-0.5">
            {elevDisplay}
          </span>
        </div>
      </div>

      {/* Pace Controller Bar */}
      <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-lime-400" />
          <span className="text-slate-300 font-medium">Target Pace Lari:</span>
          <span className="font-mono font-bold text-lime-400 bg-lime-500/10 px-2 py-0.5 rounded border border-lime-500/30">
            {paceString} {paceUnitLabel}
          </span>
        </div>

        <button
          onClick={() => setShowPacePicker(!showPacePicker)}
          className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] font-medium transition"
        >
          <Sliders className="w-3 h-3" />
          <span>Atur Pace</span>
          {showPacePicker ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* Pace Selector Dropdown / Slider Drawer */}
      {showPacePicker && (
        <div className="p-3 rounded-xl bg-slate-900/95 border border-slate-700/80 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Geser Pace (Detik/KM):</span>
            <span className="font-mono text-lime-400 font-bold">{paceString} min/km</span>
          </div>

          <input
            type="range"
            min="210" // 3:30 min/km
            max="660" // 11:00 min/km
            step="5"
            value={paceSeconds}
            onChange={(e) => onPaceChange(parseInt(e.target.value, 10))}
            className="w-full accent-lime-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
          />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {PACE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => onPaceChange(preset.pace)}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition ${
                  paceSeconds === preset.pace
                    ? 'bg-lime-500/20 text-lime-400 border-lime-500/50'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
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
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
            showElevation
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-slate-900/70 border-slate-700/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Mountain className="w-3.5 h-3.5" />
          <span>{showElevation ? 'Tutup Elevasi' : 'Lihat Elevasi'}</span>
        </button>

        <button
          onClick={onOpenExport}
          disabled={!routeData || routeData.coordinates.length < 2}
          className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_16px_rgba(249,115,22,0.4)] transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Ekspor GPX / JSON</span>
        </button>
      </div>
    </div>
  );
}
