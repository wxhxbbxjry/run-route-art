'use client';

import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { UnitSystem } from '@/lib/types';

export const PACE_MIN_SEC = 210; // 3:30 /km
export const PACE_MAX_SEC = 660; // 11:00 /km
export const PACE_STEP_SEC = 5;

export const PACE_PRESETS = [
  { label: 'Cepat', pace: 255 },
  { label: 'Tempo', pace: 300 },
  { label: 'Sedang', pace: 360 },
  { label: 'Jogging', pace: 420 },
  { label: 'Jalan', pace: 600 },
] as const;

export function formatPaceValue(paceSecondsPerKm: number, unitSystem: UnitSystem = 'km'): string {
  const activeSeconds =
    unitSystem === 'mi' ? Math.round(paceSecondsPerKm * 1.609344) : paceSecondsPerKm;
  const mins = Math.floor(activeSeconds / 60);
  const secs = activeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface PaceControlProps {
  paceSeconds: number;
  onPaceChange: (seconds: number) => void;
  unitSystem?: UnitSystem;
  isInteractive?: boolean;
  estimatedTimeFormatted?: string;
}

export default function PaceControl({
  paceSeconds,
  onPaceChange,
  unitSystem = 'km',
  isInteractive = true,
  estimatedTimeFormatted,
}: PaceControlProps) {
  const isMiles = unitSystem === 'mi';
  const unitLabel = isMiles ? '/MI' : '/KM';
  const sliderProgress = Math.max(
    0,
    Math.min(100, ((paceSeconds - PACE_MIN_SEC) / (PACE_MAX_SEC - PACE_MIN_SEC)) * 100)
  );
  const tabIdx = isInteractive ? 0 : -1;

  const handleStep = (delta: number) => {
    const clamped = Math.max(PACE_MIN_SEC, Math.min(PACE_MAX_SEC, paceSeconds + delta));
    onPaceChange(clamped);
  };

  return (
    <div className="space-y-3">
      {/* Stepper + Current Pace Hero Readout */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          tabIndex={tabIdx}
          disabled={paceSeconds <= PACE_MIN_SEC}
          onClick={() => handleStep(-PACE_STEP_SEC)}
          title="Percepat pace 5 detik"
          aria-label="Percepat pace 5 detik"
          className="min-h-[44px] md:min-h-[36px] px-3 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] hover:text-[var(--brand-ink)] border border-[var(--border-subtle)] hover:border-[var(--brand-border)] flex items-center gap-1.5 text-xs font-bold disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Minus className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="tabular-nums font-mono">5s</span>
        </button>

        <div className="flex flex-col items-center text-center min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-display font-extrabold tracking-tight text-[#fc4c02] tabular-nums leading-none">
              {formatPaceValue(paceSeconds, unitSystem)}
            </span>
            <span className="text-[11px] font-bold text-[var(--text-muted)]">
              {unitLabel}
            </span>
          </div>
          {estimatedTimeFormatted && (
            <span className="text-[11px] text-[var(--text-muted)] font-medium tabular-nums mt-0.5">
              Est. Waktu:{' '}
              <strong className="text-[var(--text-primary)] font-mono">
                {estimatedTimeFormatted}
              </strong>
            </span>
          )}
        </div>

        <button
          type="button"
          tabIndex={tabIdx}
          disabled={paceSeconds >= PACE_MAX_SEC}
          onClick={() => handleStep(PACE_STEP_SEC)}
          title="Perlambat pace 5 detik"
          aria-label="Perlambat pace 5 detik"
          className="min-h-[44px] md:min-h-[36px] px-3 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] hover:text-[var(--brand-ink)] border border-[var(--border-subtle)] hover:border-[var(--brand-border)] flex items-center gap-1.5 text-xs font-bold disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="tabular-nums font-mono">5s</span>
        </button>
      </div>

      {/* Slider + Clear Min / Max Bounds */}
      <div className="space-y-1.5">
        <input
          type="range"
          min={PACE_MIN_SEC}
          max={PACE_MAX_SEC}
          step={PACE_STEP_SEC}
          value={paceSeconds}
          aria-label={`Target Pace Lari dalam satuan ${unitLabel}`}
          tabIndex={tabIdx}
          onChange={(e) => onPaceChange(parseInt(e.target.value, 10))}
          style={{ '--slider-progress': `${sliderProgress}%` } as React.CSSProperties}
          className="strava-slider"
        />
        <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-mono font-medium tabular-nums">
          <span>{formatPaceValue(PACE_MIN_SEC, unitSystem)} Cepat</span>
          <span>{formatPaceValue(PACE_MAX_SEC, unitSystem)} Santai</span>
        </div>
      </div>

      {/* 5-Column Preset Chips (with 44px mobile touch height) */}
      <div className="grid grid-cols-5 gap-1.5">
        {PACE_PRESETS.map((preset) => {
          const isActive = paceSeconds === preset.pace;
          return (
            <button
              type="button"
              key={preset.label}
              tabIndex={tabIdx}
              aria-pressed={isActive}
              onClick={() => onPaceChange(preset.pace)}
              className={`min-h-[44px] md:min-h-[40px] py-1.5 px-1 rounded-xl border text-center flex flex-col items-center justify-center ui-card-hover ui-focus-ring ${
                isActive
                  ? 'bg-[var(--brand-tint)] text-[var(--brand-ink)] border-[#fc4c02] shadow-[0_2px_8px_rgba(252,76,2,0.16)]'
                  : 'bg-[var(--surface-solid)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--brand-border)]'
              }`}
            >
              <span className="text-xs font-extrabold font-mono tabular-nums leading-tight">
                {formatPaceValue(preset.pace, unitSystem)}
              </span>
              <span
                className={`text-[10px] leading-tight mt-0.5 truncate max-w-full ${
                  isActive
                    ? 'font-bold text-[var(--brand-ink)]'
                    : 'text-[var(--text-muted)] font-medium'
                }`}
              >
                {preset.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
