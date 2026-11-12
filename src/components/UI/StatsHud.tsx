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
} from 'lucide-react';
import PaceControl, { formatPaceValue } from './PaceControl';

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

  const paceString = formatPaceValue(paceSeconds, unitSystem);
  const paceUnitLabel = isMiles ? '/MI' : '/KM';

  // Compute elevation gain
  const elevGain = routeData ? routeData.elevationGainM : 0;
  const elevDisplay = isMiles ? `+${metersToFeet(elevGain)}ft` : `+${elevGain}m`;

  return (
    <div className="strava-card rounded-2xl p-3.5 space-y-2.5 text-slate-900 dark:text-slate-100">
      {/* Top Main Metrics Row */}
      <div className="grid grid-cols-4 gap-1 items-center text-center">
        {/* Distance + Unit Switcher */}
        <div className="group flex flex-col items-center py-1 px-0.5 rounded-xl hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors duration-150">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
              Jarak
            </span>
            {onToggleUnit && (
              <button
                type="button"
                onClick={onToggleUnit}
                title="Ganti satuan KM / Miles"
                className="px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono font-bold text-[9px] leading-none border border-slate-200 dark:border-slate-700 ui-btn-secondary ui-focus-ring"
              >
                {distUnitLabel}
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-0.5 mt-0.5">
            <span className="text-2xl font-black font-mono tracking-tight text-[#fc4c02] tabular-nums transition-transform duration-150 group-hover:scale-[1.03]">
              {displayDist.toFixed(2)}
            </span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {distUnitLabel}
            </span>
          </div>
        </div>

        {/* Est. Time */}
        <div className="group flex flex-col items-center py-1 px-0.5 rounded-xl hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors duration-150 border-l border-slate-200/70 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Timer className="w-3 h-3 text-sky-600 dark:text-sky-400 transition-transform duration-150 group-hover:scale-110" />{' '}
            Waktu
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-slate-900 dark:text-white mt-0.5 tabular-nums">
            {timeInfo.formatted}
          </span>
        </div>

        {/* Calories */}
        <div className="group flex flex-col items-center py-1 px-0.5 rounded-xl hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors duration-150 border-l border-slate-200/70 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Flame className="w-3 h-3 text-[#fc4c02] transition-transform duration-150 group-hover:scale-110" />{' '}
            Kalori
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-[#c93b00] dark:text-orange-400 mt-0.5 tabular-nums">
            ~{calories}
          </span>
        </div>

        {/* Elev Gain */}
        <div className="group flex flex-col items-center py-1 px-0.5 rounded-xl hover:bg-slate-50/90 dark:hover:bg-slate-800/60 transition-colors duration-150 border-l border-slate-200/70 dark:border-slate-800">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Mountain className="w-3 h-3 text-emerald-600 dark:text-emerald-400 transition-transform duration-150 group-hover:scale-110" />{' '}
            Elevasi
          </span>
          <span className="text-lg font-black font-mono tracking-tight text-emerald-700 dark:text-emerald-400 mt-0.5 tabular-nums">
            {elevDisplay}
          </span>
        </div>
      </div>

      {/* Pace Controller Bar */}
      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-[#fc4c02] shrink-0" />
          <span className="text-slate-600 dark:text-slate-300 font-semibold whitespace-nowrap">
            Target Pace:
          </span>
          <span className="font-mono font-bold text-[#c93b00] dark:text-orange-300 bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5 rounded-lg border border-orange-200 dark:border-orange-500/40 tabular-nums whitespace-nowrap">
            {paceString} {paceUnitLabel}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowPacePicker(!showPacePicker)}
          aria-expanded={showPacePicker}
          className="group text-slate-700 dark:text-slate-200 hover:text-[#fc4c02] dark:hover:text-orange-300 flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg hover:bg-white dark:hover:bg-slate-700/70 transition-colors shrink-0 ui-focus-ring active:scale-95"
        >
          <Sliders className="w-3 h-3 transition-transform duration-150 group-hover:scale-110" />
          <span>{showPacePicker ? 'Tutup' : 'Atur Pace'}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${
              showPacePicker ? 'rotate-180 text-[#fc4c02]' : 'rotate-0'
            }`}
          />
        </button>
      </div>

      {/* Smooth Accordion Pace Drawer */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
          showPacePicker
            ? 'grid-rows-[1fr] opacity-100'
            : 'grid-rows-[0fr] opacity-0 pointer-events-none'
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <PaceControl
              paceSeconds={paceSeconds}
              onPaceChange={onPaceChange}
              unitSystem={unitSystem}
              isInteractive={showPacePicker}
            />
          </div>
        </div>
      </div>

      {/* Bottom Actions: Elevation & Export */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={onToggleElevation}
          aria-pressed={showElevation}
          className={`group flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border ui-btn-secondary ui-focus-ring ${
            showElevation
              ? 'bg-orange-50 dark:bg-orange-950/60 border-[#fc4c02] text-[#c93b00] dark:text-orange-300'
              : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
          }`}
        >
          <Mountain className="w-3.5 h-3.5 transition-transform duration-150 group-hover:scale-110" />
          <span>{showElevation ? 'Tutup Elevasi' : 'Lihat Elevasi'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          disabled={!routeData || routeData.coordinates.length < 2}
          className="group flex-1 py-2.5 px-3 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:pointer-events-none ui-btn-primary ui-focus-ring"
        >
          <Download className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-y-0.5" />
          <span>Ekspor GPX / JSON</span>
        </button>
      </div>
    </div>
  );
}
