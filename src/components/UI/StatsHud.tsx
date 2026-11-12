'use client';

import React, { useState } from 'react';
import { RouteData, UnitSystem } from '@/lib/types';
import { calculatePaceTime, calculateCalories, kmToMiles } from '@/lib/geo';
import {
  Timer,
  Flame,
  Download,
  Activity,
  Sliders,
  ChevronDown,
  Award,
} from 'lucide-react';
import PaceControl, { formatPaceValue } from './PaceControl';

interface StatsHudProps {
  routeData: RouteData | null;
  paceSeconds: number;
  onPaceChange: (seconds: number) => void;
  onOpenExport: () => void;
  unitSystem?: UnitSystem;
  onToggleUnit?: () => void;
}

function getScoreTextBadge(pct: number): string {
  if (pct >= 75) {
    return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-600/40';
  }
  if (pct >= 55) {
    return 'bg-orange-50 dark:bg-orange-950/60 text-[#c93b00] dark:text-orange-300 border-orange-200 dark:border-orange-500/40';
  }
  return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
}

export default function StatsHud({
  routeData,
  paceSeconds,
  onPaceChange,
  onOpenExport,
  unitSystem = 'km',
  onToggleUnit,
}: StatsHudProps) {
  const [showPacePicker, setShowPacePicker] = useState(false);
  const [showScoreDetail, setShowScoreDetail] = useState(false);

  const quality = routeData?.quality || null;

  const isMiles = unitSystem === 'mi';
  const distanceKm = routeData ? routeData.distanceKm : 0;
  const displayDist = isMiles ? kmToMiles(distanceKm) : distanceKm;
  const distUnitLabel = isMiles ? 'MI' : 'KM';

  const timeInfo = calculatePaceTime(distanceKm, paceSeconds);
  const calories = calculateCalories(distanceKm, paceSeconds);

  const paceString = formatPaceValue(paceSeconds, unitSystem);
  const paceUnitLabel = isMiles ? '/MI' : '/KM';

  return (
    <div className="strava-card rounded-2xl p-3.5 space-y-2.5 text-slate-900 dark:text-slate-100">
      {/* Top Main Metrics Row */}
      <div className="grid grid-cols-3 gap-1 items-center text-center">
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

      {/* RunCulture Route Quality Score Breakdown (Zero Elevation) */}
      {quality && (
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 overflow-hidden ui-fade-slide-up">
          <button
            type="button"
            onClick={() => setShowScoreDetail((prev) => !prev)}
            aria-expanded={showScoreDetail}
            className="w-full px-2.5 py-2 flex items-center justify-between gap-2 text-xs hover:bg-slate-100/70 dark:hover:bg-slate-800 transition-colors ui-focus-ring"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Award className="w-4 h-4 text-[#fc4c02] shrink-0" />
              <span className="font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                Skor Rute
              </span>
              <span
                className={`font-mono font-black text-[11px] px-2 py-0.5 rounded-lg border tabular-nums ${getScoreTextBadge(
                  quality.pct
                )}`}
              >
                {quality.pct}%
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate hidden lg:inline">
                {quality.metrics.greenPct !== null && `Hijau ${quality.metrics.greenPct}%`}
                {quality.metrics.signalsCount !== null && ` • ${quality.metrics.signalsCount} lampu`}
              </span>
            </div>

            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
              <span>{showScoreDetail ? 'Tutup' : 'Detail'}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  showScoreDetail ? 'rotate-180 text-[#fc4c02]' : 'rotate-0'
                }`}
              />
            </span>
          </button>

          <div
            className={`grid transition-[grid-template-rows,opacity] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
              showScoreDetail
                ? 'grid-rows-[1fr] opacity-100'
                : 'grid-rows-[0fr] opacity-0 pointer-events-none'
            }`}
          >
            <div className="overflow-hidden">
              <div className="px-3 pb-3 pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {quality.parts.map((part) => {
                    const fillPct = part.max > 0 ? Math.min(100, Math.round((part.points / part.max) * 100)) : 0;
                    return (
                      <div key={part.key} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px] tabular-nums">
                          <span className="font-semibold text-slate-600 dark:text-slate-300 truncate">
                            {part.label}
                          </span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                            {part.points}/{part.max}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#fc4c02] transition-[width] duration-300"
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {quality.metrics.greenPct !== null && (
                    <span>Hijau: <strong className="text-slate-700 dark:text-slate-200">{quality.metrics.greenPct}%</strong></span>
                  )}
                  {quality.metrics.waterPct !== null && quality.metrics.waterPct > 0 && (
                    <span>Air: <strong className="text-slate-700 dark:text-slate-200">{quality.metrics.waterPct}%</strong></span>
                  )}
                  {quality.metrics.quietPct !== null && (
                    <span>Tenang: <strong className="text-slate-700 dark:text-slate-200">{quality.metrics.quietPct}%</strong></span>
                  )}
                  {quality.metrics.signalsCount !== null && (
                    <span>Lampu: <strong className="text-slate-700 dark:text-slate-200">{quality.metrics.signalsCount}</strong></span>
                  )}
                  <span>Belok: <strong className="text-slate-700 dark:text-slate-200">{quality.metrics.turnsPerKm}/km</strong></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Action: Export */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!routeData || routeData.coordinates.length < 2}
          className="group w-full py-2.5 px-3 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:pointer-events-none ui-btn-primary ui-focus-ring"
        >
          <Download className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-y-0.5" />
          <span>Ekspor GPX / JSON</span>
        </button>
      </div>
    </div>
  );
}
