'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RouteData, UnitSystem } from '@/lib/types';
import { calculatePaceTime, calculateCalories } from '@/lib/geo';
import { Timer, Flame, Activity, ChevronDown } from 'lucide-react';
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
      if (e.key === 'Escape') {
        setIsPaceOpen(false);
      }
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

  const paceString = formatPaceValue(paceSeconds, unitSystem);
  const paceUnitLabel = isMiles ? '/MI' : '/KM';

  return (
    <div
      ref={containerRef}
      className="md:hidden fixed top-3 inset-x-3 z-30 pointer-events-none"
    >
      {/* Compact High-Visibility Mobile Telemetry + Quick Pace Capsule */}
      <div className="pointer-events-auto cockpit-card rounded-2xl px-3 py-1.5 min-h-[54px] flex items-center justify-between gap-2 text-[var(--text-primary)]">
        {/* Telemetry Readouts (Waktu & Kalori) */}
        <div className="flex items-center gap-3 min-w-0 tabular-nums">
          <div className="flex flex-col min-w-0" title="Estimasi Waktu Tempuh">
            <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)] flex items-center gap-1 leading-none">
              <Timer className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" aria-hidden="true" />
              <span>Waktu</span>
            </span>
            <span className="font-mono text-xs font-extrabold text-[var(--text-primary)] mt-0.5 leading-tight">
              {timeInfo.formatted}
            </span>
          </div>

          <span aria-hidden="true" className="h-6 w-px bg-[var(--border-subtle)] shrink-0" />

          <div className="flex flex-col min-w-0" title="Estimasi Kalori">
            <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--text-muted)] flex items-center gap-1 leading-none">
              <Flame className="w-3 h-3 text-[#fc4c02] shrink-0" aria-hidden="true" />
              <span>Kalori</span>
            </span>
            <span className="font-mono text-xs font-extrabold text-[var(--brand-ink)] mt-0.5 leading-tight">
              ~{calories} kcal
            </span>
          </div>
        </div>

        {/* High-Visibility Quick Pace Button (>= 44px touch target) */}
        <button
          type="button"
          onClick={() => setIsPaceOpen((open) => !open)}
          aria-expanded={isPaceOpen}
          aria-label="Atur Target Pace Lari"
          className={`group shrink-0 min-h-[44px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ui-btn-secondary ui-focus-ring ${
            isPaceOpen
              ? 'bg-[#fc4c02] border-[#fc4c02] text-white shadow-[0_2px_10px_rgba(252,76,2,0.32)]'
              : 'bg-[var(--brand-tint)] hover:bg-orange-500/20 text-[var(--brand-ink)] border-[var(--brand-border)]'
          }`}
        >
          <Activity
            className={`w-4 h-4 shrink-0 ${isPaceOpen ? 'text-white' : 'text-[#fc4c02]'}`}
            aria-hidden="true"
          />
          <span className="font-mono font-extrabold tabular-nums whitespace-nowrap">
            {paceString} {paceUnitLabel}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
              isPaceOpen ? 'rotate-180' : 'rotate-0'
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Mobile Dropdown Atur Pace Studio */}
      {isPaceOpen && (
        <div className="pointer-events-auto mt-2 p-3.5 rounded-2xl cockpit-card space-y-2.5 ui-dropdown-enter text-[var(--text-primary)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <span className="text-xs uppercase tracking-wider font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#fc4c02]" aria-hidden="true" />
              <span>Atur Target Pace</span>
            </span>
            <button
              type="button"
              onClick={() => setIsPaceOpen(false)}
              className="min-h-[36px] text-xs font-bold text-[var(--brand-ink)] hover:underline px-2.5 py-1 rounded-xl hover:bg-[var(--brand-tint)] ui-focus-ring"
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
