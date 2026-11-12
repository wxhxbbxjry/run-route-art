'use client';

import React, { useState } from 'react';
import {
  GeneratorShape,
  LatLng,
  RouteCandidate,
  RouteData,
  RoutePreferences,
} from '@/lib/types';
import {
  Crosshair,
  Shuffle,
  Compass,
  Zap,
  RotateCcw,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Repeat,
  ArrowLeftRight,
  SlidersHorizontal,
  ChevronDown,
  Trees,
  Waves,
  Sparkles,
  Plus,
  Undo2,
  TrafficCone,
  CornerUpRight,
} from 'lucide-react';

interface RandomLoopModeProps {
  startLocation: LatLng | null;
  targetDistanceKm: number;
  onTargetDistanceChange: (km: number) => void;
  routeShape: GeneratorShape;
  onRouteShapeChange: (shape: GeneratorShape) => void;
  preferences: RoutePreferences;
  onPreferencesChange: React.Dispatch<React.SetStateAction<RoutePreferences>>;
  onUseMyLocation: () => void;
  onGenerateLoop: () => void;
  onReRoll: () => void;
  onResetLoop: () => void;
  onGenerateMore: () => void;
  candidates: RouteCandidate[];
  activeCandidateId: string | null;
  onSelectCandidate: (id: string) => void;
  onPeekCandidate: (id: string | null) => void;
  canUndoEdit: boolean;
  onUndoCandidateEdit: () => void;
  hasPrefetchedNext: boolean;
  exhaustedUnique: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  routeData: RouteData | null;
}

const PRESET_DISTANCES = [
  { label: '5K', value: 5, tag: 'Easy / Fun' },
  { label: '10K', value: 10, tag: 'Standard' },
  { label: '21K', value: 21.1, tag: 'Half Marathon' },
  { label: '42K', value: 42.2, tag: 'Marathon' },
];

function getScoreBadgeClasses(pct: number): string {
  if (pct >= 75) {
    return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-600/40';
  }
  if (pct >= 55) {
    return 'bg-orange-50 dark:bg-orange-950/60 text-[#c93b00] dark:text-orange-300 border-orange-200 dark:border-orange-500/40';
  }
  return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
}

export default function RandomLoopMode({
  startLocation,
  targetDistanceKm,
  onTargetDistanceChange,
  routeShape,
  onRouteShapeChange,
  preferences,
  onPreferencesChange,
  onUseMyLocation,
  onGenerateLoop,
  onReRoll,
  onResetLoop,
  onGenerateMore,
  candidates,
  activeCandidateId,
  onSelectCandidate,
  onPeekCandidate,
  canUndoEdit,
  onUndoCandidateEdit,
  hasPrefetchedNext,
  exhaustedUnique,
  isLoading,
  isLoadingMore,
  routeData,
}: RandomLoopModeProps) {
  const [showPrefs, setShowPrefs] = useState(false);

  const currentDist = routeData?.distanceKm || 0;
  const deviation =
    routeData && currentDist > 0
      ? Math.abs(((currentDist - targetDistanceKm) / targetDistanceKm) * 100)
      : null;

  const sliderProgress = Math.max(0, Math.min(100, ((targetDistanceKm - 1) / (50 - 1)) * 100));
  const activePrefsCount =
    (preferences.environment !== 'any' ? 1 : 0) +
    (preferences.traffic !== 'any' ? 1 : 0) +
    (preferences.flow !== 'any' ? 1 : 0);

  return (
    <div className="space-y-2.5 ui-fade-slide-up">
      {/* Route Shape Segmented Selector (Loop vs Pergi-Pulang PP) */}
      <div className="space-y-1">
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block px-0.5">
          Bentuk Rute
        </span>
        <div
          role="radiogroup"
          aria-label="Bentuk Rute Generator"
          className="relative grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700"
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white dark:bg-slate-700 shadow-sm border border-slate-200/80 dark:border-slate-600 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
              routeShape === 'out_and_back' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            role="radio"
            aria-checked={routeShape === 'loop'}
            onClick={() => onRouteShapeChange('loop')}
            className={`relative z-10 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ui-focus-ring ${
              routeShape === 'loop'
                ? 'text-[#fc4c02] dark:text-orange-300'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Loop Memutar</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={routeShape === 'out_and_back'}
            onClick={() => onRouteShapeChange('out_and_back')}
            className={`relative z-10 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ui-focus-ring ${
              routeShape === 'out_and_back'
                ? 'text-[#fc4c02] dark:text-orange-300'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Pergi-Pulang</span>
          </button>
        </div>
      </div>

      {/* Origin Point Info & GPS Button */}
      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/75 border border-slate-200 dark:border-slate-700 space-y-1.5 ui-card-hover">
        <div className="flex items-center justify-between text-xs gap-2">
          <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-[#fc4c02] shrink-0" />
            <span>Titik Start &amp; Finish</span>
          </span>
          <button
            type="button"
            onClick={onUseMyLocation}
            className="group text-[11px] font-bold text-[#fc4c02] hover:text-[#e34402] flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/50 transition-colors ui-focus-ring active:scale-95"
          >
            <Crosshair className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-45" />
            <span>GPS Saya</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
          {startLocation ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                {startLocation.lat.toFixed(5)}, {startLocation.lng.toFixed(5)}
              </span>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-bold shrink-0">
                <CheckCircle className="w-3 h-3" /> Jalan Umum
              </span>
            </div>
          ) : (
            <p className="text-amber-700 dark:text-amber-400 italic">
              Klik pada peta untuk memilih titik start/finish.
            </p>
          )}
        </div>
      </div>

      {/* Preset Distances */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
          Preset Jarak Cepat
        </label>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_DISTANCES.map((preset) => {
            const isSelected = Math.abs(targetDistanceKm - preset.value) < 0.2;
            return (
              <button
                type="button"
                key={preset.label}
                onClick={() => onTargetDistanceChange(preset.value)}
                aria-pressed={isSelected}
                className={`group relative py-2 px-1.5 rounded-xl border text-center flex flex-col items-center justify-center ui-card-hover ui-focus-ring ${
                  isSelected
                    ? 'bg-orange-50/90 dark:bg-orange-950/60 border-[#fc4c02] text-[#c93b00] dark:text-orange-300 shadow-[0_2px_10px_rgba(252,76,2,0.14)]'
                    : 'bg-slate-50 dark:bg-slate-800/75 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 hover:border-orange-300 dark:hover:border-orange-500/40'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#fc4c02] transition-transform duration-200 ${
                    isSelected ? 'scale-100' : 'scale-0'
                  }`}
                />
                <span className="text-sm font-black tabular-nums transition-transform duration-150 group-hover:scale-105">
                  {preset.label}
                </span>
                <span
                  className={`text-[9px] leading-tight ${
                    isSelected
                      ? 'text-[#c93b00] dark:text-orange-300 font-semibold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {preset.tag}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Distance Slider */}
      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/75 border border-slate-200 dark:border-slate-700 space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-600 dark:text-slate-300 font-semibold">Jarak Kustom Target</span>
          <span className="text-sm font-black font-mono text-[#c93b00] dark:text-orange-300 tabular-nums bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5 rounded-lg border border-orange-200/80 dark:border-orange-500/30">
            {targetDistanceKm.toFixed(1)} KM
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="50"
          step="0.5"
          value={targetDistanceKm}
          aria-label="Jarak Kustom Target dalam Kilometer"
          onChange={(e) => onTargetDistanceChange(parseFloat(e.target.value))}
          style={{ '--slider-progress': `${sliderProgress}%` } as React.CSSProperties}
          className="strava-slider"
        />
        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono font-medium tabular-nums">
          <span>1 KM</span>
          <span>15 KM</span>
          <span>30 KM</span>
          <span>50 KM</span>
        </div>
      </div>

      {/* RunCulture-Style Collapsible Preferensi Rute (Zero Elevation, Car/Motor Safe) */}
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/75 border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPrefs((prev) => !prev)}
          aria-expanded={showPrefs}
          className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800 transition-colors ui-focus-ring"
        >
          <span className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#fc4c02]" />
            <span>Preferensi Rute</span>
            {activePrefsCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono font-black bg-[#fc4c02] text-white leading-none">
                {activePrefsCount}
              </span>
            )}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
              showPrefs ? 'rotate-180 text-[#fc4c02]' : 'rotate-0'
            }`}
          />
        </button>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
            showPrefs ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
          }`}
        >
          <div className="overflow-hidden">
            <div className="px-3 pb-3 pt-1.5 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
              {/* Lingkungan */}
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">
                  Suasana Koridor
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { value: 'any', label: 'Bebas', icon: Sparkles },
                      { value: 'green', label: 'Hijau / Taman', icon: Trees },
                      { value: 'water', label: 'Tepi Sungai/Danau', icon: Waves },
                      { value: 'green_water', label: 'Taman & Air', icon: Trees },
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = preferences.environment === opt.value;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() =>
                          onPreferencesChange((prev) => ({ ...prev, environment: opt.value }))
                        }
                        className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-colors ui-focus-ring ${
                          active
                            ? 'bg-orange-50 dark:bg-orange-950/60 border-[#fc4c02] text-[#c93b00] dark:text-orange-300'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-orange-300'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#fc4c02]' : 'text-slate-400'}`} />
                        <span className="truncate">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lalu Lintas & Minim Belokan */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onPreferencesChange((prev) => ({
                      ...prev,
                      traffic: prev.traffic === 'quiet' ? 'any' : 'quiet',
                    }))
                  }
                  aria-pressed={preferences.traffic === 'quiet'}
                  className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ui-focus-ring ${
                    preferences.traffic === 'quiet'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-300'
                  }`}
                >
                  <TrafficCone className="w-3.5 h-3.5 shrink-0" />
                  <span>Jalan Tenang</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onPreferencesChange((prev) => ({
                      ...prev,
                      flow: prev.flow === 'few_turns' ? 'any' : 'few_turns',
                    }))
                  }
                  aria-pressed={preferences.flow === 'few_turns'}
                  className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors ui-focus-ring ${
                    preferences.flow === 'few_turns'
                      ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-500 text-sky-700 dark:text-sky-300'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-sky-300'
                  }`}
                >
                  <CornerUpRight className="w-3.5 h-3.5 shrink-0" />
                  <span>Minim Belokan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Generator Action Row */}
      <div className="space-y-1.5 pt-0.5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onGenerateLoop}
            disabled={!startLocation || isLoading}
            className="group py-2.5 px-3 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:pointer-events-none ui-btn-primary ui-focus-ring"
          >
            {isLoading ? (
              <Zap className="w-4 h-4 animate-spin" />
            ) : (
              <Shuffle className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" />
            )}
            <span>
              {isLoading
                ? 'Menghitung...'
                : routeShape === 'out_and_back'
                ? 'Generate PP'
                : 'Generate Rute'}
            </span>
          </button>

          <button
            type="button"
            onClick={onReRoll}
            disabled={!startLocation || isLoading}
            title="Cari 3 variasi saran rute baru"
            className="group py-2.5 px-3 rounded-xl bg-white hover:bg-orange-50/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 hover:text-[#c93b00] dark:hover:text-orange-300 border border-slate-300 dark:border-slate-600 hover:border-[#fc4c02] font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-45 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
          >
            <RotateCcw
              className={`w-4 h-4 text-[#fc4c02] transition-transform duration-200 ${
                isLoading ? 'animate-spin' : 'group-hover:-rotate-90'
              }`}
            />
            <span>Buat Ulang</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onResetLoop}
          disabled={
            isLoading ||
            (candidates.length === 0 && !routeData && Math.abs(targetDistanceKm - 10) < 0.01)
          }
          title="Hapus semua saran rute dan reset target ke default"
          className="group w-full py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/40 font-bold text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Trash2 className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-rotate-12" />
          <span>Reset Rute</span>
        </button>
      </div>

      {/* Candidates List (RunCulture Multi-Candidate Selector + Hover Peek + Interactive Edit) */}
      {candidates.length > 0 && (
        <div className="space-y-2 pt-1 ui-fade-slide-up">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-700 dark:text-slate-200">
              Saran Rute ({candidates.length})
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Hover intip &bull; Klik pilih
            </span>
          </div>

          <div className="space-y-1.5">
            {candidates.map((cand, idx) => {
              const isSelected = cand.id === activeCandidateId;
              const acc = Math.max(0, 100 - Math.abs(cand.quality.metrics.deviationPct));
              const { greenPct, waterPct, signalsCount, turnsPerKm } = cand.quality.metrics;

              return (
                <div
                  key={cand.id}
                  onMouseEnter={() => onPeekCandidate(isSelected ? null : cand.id)}
                  onMouseLeave={() => onPeekCandidate(null)}
                  onClick={() => onSelectCandidate(cand.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectCandidate(cand.id);
                    }
                  }}
                  aria-pressed={isSelected}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ui-card-hover ui-focus-ring ${
                    isSelected
                      ? 'bg-orange-50/90 dark:bg-orange-950/45 border-[#fc4c02] shadow-[0_2px_10px_rgba(252,76,2,0.16)]'
                      : 'bg-slate-50 dark:bg-slate-800/75 border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 hover:border-orange-300 dark:hover:border-orange-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-xs font-extrabold truncate ${
                          isSelected
                            ? 'text-[#c93b00] dark:text-orange-300'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        Saran #{idx + 1}
                      </span>
                      {idx === 0 && !cand.isEdited && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-[#fc4c02] text-white leading-none">
                          Terbaik
                        </span>
                      )}
                      {cand.isEdited && (
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-amber-500 text-white leading-none">
                          Diedit
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-black text-xs text-slate-900 dark:text-white tabular-nums">
                        {cand.routeData.distanceKm.toFixed(2)} km
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md border text-[10px] font-mono font-extrabold tabular-nums leading-none ${getScoreBadgeClasses(
                          cand.quality.pct
                        )}`}
                      >
                        {cand.quality.pct}%
                      </span>
                    </div>
                  </div>

                  {/* Quick RunCulture metric chips (no elevation!) */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px] text-slate-600 dark:text-slate-300 tabular-nums">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      Akurasi {acc.toFixed(0)}%
                    </span>
                    {greenPct !== null && greenPct > 0 && (
                      <span>&bull; Hijau {greenPct}%</span>
                    )}
                    {waterPct !== null && waterPct > 0 && (
                      <span>&bull; Air {waterPct}%</span>
                    )}
                    {signalsCount !== null && (
                      <span>&bull; {signalsCount} lampu merah</span>
                    )}
                    <span>&bull; {turnsPerKm}/km belok</span>
                  </div>

                  {cand.quality.weakestPreference && (
                    <p className="mt-1 text-[9px] text-amber-700 dark:text-amber-400 font-semibold leading-tight">
                      Preferensi terbatas di area ini: {cand.quality.weakestPreference}
                    </p>
                  )}

                  {isSelected && cand.isEdited && canUndoEdit && (
                    <div className="mt-2 pt-1.5 border-t border-orange-200/70 dark:border-orange-500/30 flex items-center justify-between">
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                        Jalur kustom aktif
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUndoCandidateEdit();
                        }}
                        className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:text-[#fc4c02] flex items-center gap-1 ui-btn-secondary ui-focus-ring"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Undo Edit</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* + Tambah Saran Rute (instant when prefetched!) */}
          <button
            type="button"
            onClick={onGenerateMore}
            disabled={!startLocation || isLoading || isLoadingMore || candidates.length >= 6 || exhaustedUnique}
            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-orange-50/70 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-[#c93b00] dark:hover:text-orange-300 border border-dashed border-slate-300 dark:border-slate-600 hover:border-[#fc4c02] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-45 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
          >
            {isLoadingMore ? (
              <Zap className="w-3.5 h-3.5 animate-spin text-[#fc4c02]" />
            ) : (
              <Plus className="w-3.5 h-3.5 text-[#fc4c02]" />
            )}
            <span>
              {exhaustedUnique
                ? 'Semua Variasi Sekitar Sudah Tampil'
                : isLoadingMore
                ? 'Mencari Variasi Unik...'
                : hasPrefetchedNext
                ? 'Tambah Saran Rute (Siap!)'
                : 'Tambah Saran Rute'}
            </span>
          </button>

          <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center px-1 leading-snug">
            Tip: Geser titik putih-oranye atau klik langsung garis rute di peta untuk mengedit jalur.
          </p>
        </div>
      )}

      {/* Distance accuracy summary */}
      {deviation !== null && (
        <div
          className={`p-2 rounded-xl border text-[11px] flex items-center gap-2 ui-fade-slide-up ${
            deviation <= 10
              ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-700/60 text-emerald-800 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-700/60 text-amber-800 dark:text-amber-300'
          }`}
        >
          {deviation <= 10 ? (
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="leading-snug tabular-nums">
            <span className="font-bold">Akurasi {(100 - deviation).toFixed(1)}%</span> &bull; Target{' '}
            {targetDistanceKm.toFixed(1)} km &rarr; {currentDist.toFixed(2)} km
          </div>
        </div>
      )}
    </div>
  );
}
