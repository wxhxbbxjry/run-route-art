'use client';

import React, { useState, useRef, useEffect } from 'react';
import { RouteData, UnitSystem } from '@/lib/types';
import { calculatePaceTime, calculateCalories, kmToMiles } from '@/lib/geo';
import {
  Timer,
  Flame,
  Download,
  Activity,
  ChevronDown,
  X,
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

export default function StatsHud({
  routeData,
  paceSeconds,
  onPaceChange,
  onOpenExport,
  unitSystem = 'km',
  onToggleUnit,
}: StatsHudProps) {
  const [showPacePicker, setShowPacePicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPacePicker) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPacePicker(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPacePicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPacePicker]);

  const isMiles = unitSystem === 'mi';
  const distanceKm = routeData ? routeData.distanceKm : 0;
  const displayDist = isMiles ? kmToMiles(distanceKm) : distanceKm;
  const distUnitLabel = isMiles ? 'MI' : 'KM';

  const timeInfo = calculatePaceTime(distanceKm, paceSeconds);
  const calories = calculateCalories(distanceKm, paceSeconds);

  const paceString = formatPaceValue(paceSeconds, unitSystem);
  const paceUnitLabel = isMiles ? '/MI' : '/KM';

  return (
    <div ref={containerRef} className="relative pointer-events-auto w-fit max-w-full">
      {/* Horizontal Architectural Telemetry Pill Dock */}
      <div className="cockpit-card rounded-2xl px-3 xl:px-4 py-1.5 xl:py-2 flex items-center gap-2.5 xl:gap-4 text-[var(--text-primary)]">
        {/* Distance Hero KPI + KM/MI Unit Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)] leading-none">
              Jarak
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="font-display text-2xl xl:text-3xl font-extrabold tracking-tight text-[#fc4c02] tabular-nums leading-none">
                {displayDist.toFixed(2)}
              </span>
              {onToggleUnit ? (
                <button
                  type="button"
                  onClick={onToggleUnit}
                  title="Ganti satuan KM / Miles"
                  aria-label={`Satuan jarak ${distUnitLabel}, klik untuk mengganti`}
                  className="px-1.5 py-0.5 rounded-md bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] hover:text-[var(--brand-ink)] font-mono font-extrabold text-[10px] leading-none border border-[var(--border-subtle)] ui-btn-secondary ui-focus-ring"
                >
                  {distUnitLabel}
                </button>
              ) : (
                <span className="font-mono text-[10px] font-bold text-[var(--text-muted)]">
                  {distUnitLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        <span aria-hidden="true" className="h-7 w-px bg-[var(--border-subtle)] shrink-0" />

        {/* Est. Time */}
        <div className="flex flex-col shrink-0">
          <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)] flex items-center gap-1 leading-none">
            <Timer className="w-3 h-3 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <span>Waktu</span>
          </span>
          <span className="font-mono text-xs lg:text-sm xl:text-base font-extrabold text-[var(--text-primary)] tabular-nums leading-tight mt-1">
            {timeInfo.formatted}
          </span>
        </div>

        <span aria-hidden="true" className="h-7 w-px bg-[var(--border-subtle)] shrink-0" />

        {/* Calories */}
        <div className="flex flex-col shrink-0">
          <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-muted)] flex items-center gap-1 leading-none">
            <Flame className="w-3 h-3 text-[#fc4c02]" aria-hidden="true" />
            <span>Kalori</span>
          </span>
          <span className="font-mono text-xs lg:text-sm xl:text-base font-extrabold text-[var(--brand-ink)] tabular-nums leading-tight mt-1">
            ~{calories}
          </span>
        </div>

        <span aria-hidden="true" className="h-7 w-px bg-[var(--border-subtle)] shrink-0" />

        {/* Atur Pace Trigger Pill */}
        <button
          type="button"
          onClick={() => setShowPacePicker((open) => !open)}
          aria-expanded={showPacePicker}
          aria-label="Atur Target Pace Lari"
          className={`group min-h-[38px] xl:min-h-[40px] px-2.5 xl:px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 xl:gap-2 shrink-0 ui-btn-secondary ui-focus-ring ${
            showPacePicker
              ? 'bg-[#fc4c02] border-[#fc4c02] text-white shadow-[0_2px_10px_rgba(252,76,2,0.3)]'
              : 'bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] hover:text-[var(--brand-ink)] border-[var(--border-subtle)] hover:border-[var(--brand-border)]'
          }`}
        >
          <Activity
            className={`w-4 h-4 shrink-0 ${showPacePicker ? 'text-white' : 'text-[#fc4c02]'}`}
            aria-hidden="true"
          />
          <div className="text-left leading-none">
            <span
              className={`block text-[9px] uppercase tracking-wider font-bold ${
                showPacePicker ? 'text-orange-100' : 'text-[var(--text-muted)]'
              }`}
            >
              Atur Pace
            </span>
            <span className="font-mono text-xs font-extrabold tabular-nums">
              {paceString} {paceUnitLabel}
            </span>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
              showPacePicker ? 'rotate-180' : 'rotate-0'
            }`}
            aria-hidden="true"
          />
        </button>

        {/* Primary Export GPX Button */}
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!routeData || routeData.coordinates.length < 2}
          title="Ekspor GPX / GeoJSON"
          className="group min-h-[38px] xl:min-h-[40px] px-2.5 xl:px-3.5 py-2 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center gap-1.5 shrink-0 disabled:opacity-45 disabled:pointer-events-none ui-btn-primary ui-focus-ring"
        >
          <Download
            className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-y-0.5"
            aria-hidden="true"
          />
          <span className="whitespace-nowrap">
            Ekspor<span className="hidden xl:inline"> GPX</span>
          </span>
        </button>
      </div>

      {/* Expandable Pace Studio Popover */}
      {showPacePicker && (
        <div className="absolute right-0 top-full mt-2 w-[340px] rounded-2xl cockpit-card p-3.5 space-y-2.5 z-50 ui-dropdown-enter text-[var(--text-primary)]">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
            <span className="text-xs uppercase tracking-wider font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#fc4c02]" aria-hidden="true" />
              <span>Atur Target Pace</span>
            </span>
            <button
              type="button"
              onClick={() => setShowPacePicker(false)}
              aria-label="Tutup pengaturan pace"
              className="w-7 h-7 rounded-lg bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-muted)] hover:text-[var(--brand-ink)] flex items-center justify-center ui-btn-secondary ui-focus-ring"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <PaceControl
            paceSeconds={paceSeconds}
            onPaceChange={onPaceChange}
            unitSystem={unitSystem}
            isInteractive={showPacePicker}
            estimatedTimeFormatted={distanceKm > 0 ? timeInfo.formatted : undefined}
          />
        </div>
      )}
    </div>
  );
}
