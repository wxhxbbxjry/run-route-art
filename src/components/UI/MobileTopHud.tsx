'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RouteData, UnitSystem } from '@/lib/types';
import { calculatePaceTime, calculateCalories, metersToFeet } from '@/lib/geo';
import { Timer, Flame, Mountain, Activity, ChevronDown } from 'lucide-react';
import PaceControl, { formatPaceValue } from './PaceControl';

interface MobileTopHudProps {
  routeData: RouteData | null;
  paceSeconds: number;
  onPaceChange: (seconds: number) => void;
  unitSystem?: UnitSystem;
}

export default function MobileTopHud({
  routeData,
  paceSeconds,
  onPaceChange,
  unitSystem = 'km',
}: MobileTopHudProps) {
  const [isPaceOpen, setIsPaceOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPaceOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsPaceOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPaceOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPaceOpen]);

  const isMiles = unitSystem === 'mi';
  const distanceKm = routeData ? routeData.distanceKm : 0;
  const timeInfo = calculatePaceTime(distanceKm, paceSeconds);
  const calories = calculateCalories(distanceKm, paceSeconds);
  const elevGain = routeData ? routeData.elevationGainM : 0;
  const elevDisplay = isMiles ? `+${metersToFeet(elevGain)}ft` : `+${elevGain}m`;

  const paceString = formatPaceValue(paceSeconds, unitSystem);
  const paceUnitLabel = isMiles ? '/MI' : '/KM';

  return (
    <div
      ref={containerRef}
      className="md:hidden fixed top-3 inset-x-3 z-30 pointer-events-none"
    >
      {/* Compact Always-Visible Telemetry + Pace Trigger Bar */}
      <div className="pointer-events-auto strava-card rounded-2xl px-2.5 sm:px-3 py-2 flex items-center justify-between gap-1.5 sm:gap-2 text-slate-900 dark:text-slate-100">
        {/* Compact Route Telemetry Strip */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 tabular-nums text-[11px]">
          <div className="flex items-center gap-1 min-w-0" title="Estimasi Waktu Tempuh">
            <Timer className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="font-mono font-extrabold text-slate-900 dark:text-white">
              {timeInfo.formatted}
            </span>
          </div>

          <span className="hidden min-[390px]:block h-3.5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

          <div className="flex items-center gap-1 min-w-0" title="Estimasi Kalori">
            <Flame className="w-3.5 h-3.5 text-[#fc4c02] shrink-0" />
            <span className="font-mono font-bold text-[#c93b00] dark:text-orange-400">
              ~{calories}
            </span>
          </div>

          <span className="hidden min-[390px]:block h-3.5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />

          <div className="flex items-center gap-1 min-w-0" title="Total Tanjakan">
            <Mountain className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
              {elevDisplay}
            </span>
          </div>
        </div>

        {/* High-Visibility Quick Pace Button */}
        <button
          type="button"
          onClick={() => setIsPaceOpen((open) => !open)}
          aria-expanded={isPaceOpen}
          aria-label="Atur Target Pace Lari"
          className={`group shrink-0 px-2 sm:px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 sm:gap-1.5 ui-btn-secondary ui-focus-ring ${
            isPaceOpen
              ? 'bg-[#fc4c02] border-[#fc4c02] text-white shadow-[0_2px_8px_rgba(252,76,2,0.3)]'
              : 'bg-orange-50/90 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/70 text-[#c93b00] dark:text-orange-300 border-orange-200 dark:border-orange-500/40'
          }`}
        >
          <Activity
            className={`w-3.5 h-3.5 shrink-0 ${
              isPaceOpen ? 'text-white' : 'text-[#fc4c02]'
            }`}
          />
          <span className="font-mono font-black tabular-nums whitespace-nowrap">
            {paceString} {paceUnitLabel}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
              isPaceOpen ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>
      </div>

      {/* Mobile Dropdown Atur Pace Panel */}
      {isPaceOpen && (
        <div className="pointer-events-auto mt-2 p-3 rounded-2xl strava-card shadow-2xl space-y-2 ui-dropdown-enter text-slate-900 dark:text-slate-100">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#fc4c02]" />
              Atur Target Pace
            </span>
            <button
              type="button"
              onClick={() => setIsPaceOpen(false)}
              className="text-[11px] font-bold text-[#c93b00] dark:text-orange-300 hover:underline px-1.5 py-0.5 rounded-lg ui-focus-ring"
            >
              Selesai
            </button>
          </div>

          <PaceControl
            paceSeconds={paceSeconds}
            onPaceChange={onPaceChange}
            unitSystem={unitSystem}
            isInteractive={isPaceOpen}
            estimatedTimeFormatted={distanceKm > 0 ? timeInfo.formatted : undefined}
          />
        </div>
      )}
    </div>
  );
}
