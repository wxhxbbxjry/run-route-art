'use client';

import React, { useState } from 'react';
import { RouteMode, LatLng, Waypoint, RouteData } from '@/lib/types';
import ManualMode from './ManualMode';
import RandomLoopMode from './RandomLoopMode';
import {
  MousePointerClick,
  Shuffle,
  ChevronUp,
  Route,
  FolderOpen,
  Undo2,
  Mountain,
  Download,
  Moon,
  Sun,
} from 'lucide-react';

interface SidebarProps {
  currentMode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  // Manual mode props
  waypoints: Waypoint[];
  routeData: RouteData | null;
  onUndoWaypoint: () => void;
  onRedoWaypoint?: () => void;
  canRedo?: boolean;
  onOutAndBack?: () => void;
  onClearWaypoints: () => void;
  onCloseLoop: () => void;
  onReverseRoute: () => void;
  onOpenSavedRoutes?: () => void;
  unitSystem?: 'km' | 'mi';
  onToggleUnit?: () => void;
  showElevation?: boolean;
  onToggleElevation?: () => void;
  onOpenExport?: () => void;
  // Random Loop props
  startLocation: LatLng | null;
  targetDistanceKm: number;
  onTargetDistanceChange: (km: number) => void;
  onUseMyLocation: () => void;
  onGenerateLoop: () => void;
  onReRollLoop: () => void;
  onResetLoop: () => void;
  // Common
  isLoading: boolean;
}

export default function Sidebar({
  currentMode,
  onModeChange,
  theme = 'light',
  onToggleTheme,
  waypoints,
  routeData,
  onUndoWaypoint,
  onRedoWaypoint,
  canRedo,
  onOutAndBack,
  onClearWaypoints,
  onCloseLoop,
  onReverseRoute,
  onOpenSavedRoutes,
  unitSystem = 'km',
  onToggleUnit,
  showElevation = false,
  onToggleElevation,
  onOpenExport,
  startLocation,
  targetDistanceKm,
  onTargetDistanceChange,
  onUseMyLocation,
  onGenerateLoop,
  onReRollLoop,
  onResetLoop,
  isLoading,
}: SidebarProps) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  const distKm = routeData ? routeData.distanceKm : 0;
  const isMiles = unitSystem === 'mi';
  const displayDist = isMiles ? distKm * 0.621371 : distKm;
  const unitLabel = isMiles ? 'MI' : 'KM';
  const isDarkTheme = theme === 'dark';

  return (
    <>
      {/* Desktop Strava Route Builder Sidebar (Left Side) */}
      <aside className="hidden md:flex flex-col w-[320px] lg:w-[400px] h-[calc(100vh-2rem)] my-4 ml-4 rounded-2xl sidebar-panel z-30 overflow-hidden shrink-0 text-slate-900 dark:text-slate-100">
        {/* Brand Header */}
        <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2.5 min-w-0 group cursor-default">
            <div className="w-9 h-9 rounded-xl bg-[#fc4c02] flex items-center justify-center text-white shadow-[0_3px_10px_rgba(252,76,2,0.32)] shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105 group-hover:-rotate-3">
              <Route className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm lg:text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 whitespace-nowrap">
                <span>RunRoute</span>
                <span className="text-[#fc4c02] font-mono">PRO</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold leading-none">
                  FREE
                </span>
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                Strava-Style Route Builder
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenSavedRoutes && (
              <button
                type="button"
                onClick={onOpenSavedRoutes}
                title="Kelola Rute Tersimpan & Impor File GPX"
                className="group px-2.5 py-1.5 rounded-xl bg-orange-50/90 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/70 text-[#c93b00] dark:text-orange-300 text-xs font-bold flex items-center gap-1.5 border border-orange-200/90 dark:border-orange-500/40 whitespace-nowrap ui-btn-secondary ui-focus-ring"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#fc4c02] shrink-0 transition-transform duration-150 group-hover:-translate-y-0.5" />
                <span>Rute &amp; GPX</span>
              </button>
            )}

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                title={isDarkTheme ? 'Aktifkan Tema Terang' : 'Aktifkan Tema Gelap'}
                aria-label={isDarkTheme ? 'Aktifkan Tema Terang' : 'Aktifkan Tema Gelap'}
                className="group w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200/90 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 ui-btn-secondary ui-focus-ring"
              >
                {isDarkTheme ? (
                  <Sun className="w-4 h-4 transition-transform duration-200 group-hover:rotate-45" />
                ) : (
                  <Moon className="w-4 h-4 transition-transform duration-200 group-hover:-rotate-12" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mode Navigation Tabs (Sliding Animated Segmented Control) */}
        <div className="px-3.5 py-2.5 border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/80">
          <div
            role="tablist"
            aria-label="Mode Pembuatan Rute"
            className="relative grid grid-cols-2 p-1 rounded-xl bg-slate-200/75 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80"
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-[#fc4c02] shadow-[0_2px_8px_rgba(252,76,2,0.3)] transition-transform duration-[220ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
                currentMode === 'random' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />

            <button
              type="button"
              role="tab"
              aria-selected={currentMode === 'manual'}
              onClick={() => onModeChange('manual')}
              className={`group relative z-10 py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 ui-focus-ring active:scale-[0.97] ${
                currentMode === 'manual'
                  ? 'text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <MousePointerClick className="w-4 h-4 transition-transform duration-150 group-hover:scale-110" />
              <span>Manual Tap</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={currentMode === 'random'}
              onClick={() => onModeChange('random')}
              className={`group relative z-10 py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 ui-focus-ring active:scale-[0.97] ${
                currentMode === 'random'
                  ? 'text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <Shuffle className="w-4 h-4 transition-transform duration-150 group-hover:rotate-12" />
              <span>Random Loop</span>
            </button>
          </div>
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-white dark:bg-slate-900">
          {currentMode === 'manual' && (
            <ManualMode
              key="manual-panel"
              waypoints={waypoints}
              routeData={routeData}
              onUndo={onUndoWaypoint}
              onRedo={onRedoWaypoint}
              canRedo={canRedo}
              onOutAndBack={onOutAndBack}
              onClear={onClearWaypoints}
              onCloseLoop={onCloseLoop}
              onReverse={onReverseRoute}
              isLoading={isLoading}
            />
          )}

          {currentMode === 'random' && (
            <RandomLoopMode
              key="random-panel"
              startLocation={startLocation}
              targetDistanceKm={targetDistanceKm}
              onTargetDistanceChange={onTargetDistanceChange}
              onUseMyLocation={onUseMyLocation}
              onGenerateLoop={onGenerateLoop}
              onReRoll={onReRollLoop}
              onResetLoop={onResetLoop}
              routeData={routeData}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* Footer info */}
        <div className="px-3.5 py-2.5 border-t border-slate-200/80 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 text-center bg-slate-50/90 dark:bg-slate-900/95 font-medium">
          OpenFreeMap Vector &bull; Jalur Mobil &amp; Motor &bull; Zona Steril Aktif
        </div>
      </aside>

      {/* Mobile Scrim when Sheet Expanded */}
      {isMobileExpanded && (
        <div
          aria-hidden="true"
          onClick={() => setIsMobileExpanded(false)}
          className="md:hidden fixed inset-0 bg-slate-950/35 z-30 transition-opacity duration-200"
        />
      )}

      {/* Mobile Collapsible Bottom Sheet Panel */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-[240ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
          isMobileExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-4.25rem)]'
        }`}
      >
        <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-2xl border-t border-slate-200 dark:border-slate-700 shadow-[0_-8px_30px_rgba(15,23,42,0.16)] dark:shadow-[0_-10px_32px_rgba(0,0,0,0.55)] overflow-hidden max-h-[82vh] flex flex-col">
          {/* Subtle Sheet Drag Indicator */}
          <div className="flex justify-center pt-1.5 pb-0.5 bg-white dark:bg-slate-900">
            <span className="w-9 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
          </div>

          {/* Mobile Docked Bar Header */}
          <div className="px-3 pb-2.5 pt-1 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 select-none">
            <button
              type="button"
              onClick={() => setIsMobileExpanded(!isMobileExpanded)}
              aria-expanded={isMobileExpanded}
              className="flex items-center gap-2 flex-1 min-w-0 text-left rounded-xl py-0.5 ui-focus-ring active:scale-[0.98] transition-transform"
            >
              <div className="w-8 h-8 rounded-xl bg-[#fc4c02] flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                {currentMode === 'random' ? 'L' : 'M'}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono font-black text-base text-[#fc4c02] leading-none tabular-nums">
                    {displayDist.toFixed(2)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {unitLabel}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold capitalize truncate">
                  {currentMode === 'random' ? 'Random Loop' : 'Manual Tap'}
                </p>
              </div>
            </button>

            <div className="flex items-center gap-1 shrink-0">
              {onToggleUnit && (
                <button
                  type="button"
                  onClick={onToggleUnit}
                  title="Ganti satuan KM / Miles"
                  className="px-1.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 ui-btn-secondary ui-focus-ring"
                >
                  {unitLabel}
                </button>
              )}

              {currentMode === 'manual' && (
                <button
                  type="button"
                  onClick={onUndoWaypoint}
                  disabled={waypoints.length === 0}
                  title="Undo Titik Terakhir"
                  className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              )}

              {routeData && routeData.coordinates.length >= 2 && onToggleElevation && (
                <button
                  type="button"
                  onClick={onToggleElevation}
                  title="Lihat Grafik Elevasi"
                  className={`w-7 h-7 rounded-xl flex items-center justify-center border ui-btn-secondary ui-focus-ring ${
                    showElevation
                      ? 'bg-orange-50 dark:bg-orange-950/60 border-[#fc4c02] text-[#fc4c02]'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Mountain className="w-3.5 h-3.5" />
                </button>
              )}

              {routeData && routeData.coordinates.length >= 2 && onOpenExport && (
                <button
                  type="button"
                  onClick={onOpenExport}
                  title="Ekspor GPX / JSON"
                  className="w-7 h-7 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white flex items-center justify-center ui-btn-primary ui-focus-ring"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}

              {onOpenSavedRoutes && (
                <button
                  type="button"
                  onClick={onOpenSavedRoutes}
                  title="Kelola Rute & Impor GPX"
                  className="px-2 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/70 text-[#c93b00] dark:text-orange-300 border border-orange-200 dark:border-orange-500/40 text-[10px] font-bold flex items-center gap-1 whitespace-nowrap ui-btn-secondary ui-focus-ring"
                >
                  <FolderOpen className="w-3 h-3 text-[#fc4c02]" />
                  <span>Rute</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsMobileExpanded(!isMobileExpanded)}
                aria-expanded={isMobileExpanded}
                className="px-2 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 text-[11px] font-bold flex items-center gap-1 ui-btn-secondary ui-focus-ring"
              >
                <span>{isMobileExpanded ? 'Tutup' : 'Menu'}</span>
                <ChevronUp
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isMobileExpanded ? 'rotate-180' : 'rotate-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Mobile Mode Switcher + Dark Theme Toggle */}
          <div className="flex items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
            <div className="relative grid grid-cols-2 p-0.5 rounded-xl bg-slate-200/75 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 flex-1">
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-lg bg-[#fc4c02] shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  currentMode === 'random' ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              <button
                type="button"
                onClick={() => onModeChange('manual')}
                className={`relative z-10 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                  currentMode === 'manual'
                    ? 'text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <MousePointerClick className="w-3.5 h-3.5" />
                <span>Manual Tap</span>
              </button>
              <button
                type="button"
                onClick={() => onModeChange('random')}
                className={`relative z-10 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                  currentMode === 'random'
                    ? 'text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Random Loop</span>
              </button>
            </div>

            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                title={isDarkTheme ? 'Aktifkan Tema Terang' : 'Aktifkan Tema Gelap'}
                className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-amber-300 border border-slate-200 dark:border-slate-600 text-[11px] font-bold flex items-center gap-1 shrink-0 ui-btn-secondary ui-focus-ring"
              >
                {isDarkTheme ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{isDarkTheme ? 'Terang' : 'Gelap'}</span>
              </button>
            )}
          </div>

          {/* Mobile Scroll Content */}
          <div className="overflow-y-auto p-4 space-y-3 max-h-[60vh]">
            {currentMode === 'manual' && (
              <ManualMode
                waypoints={waypoints}
                routeData={routeData}
                onUndo={onUndoWaypoint}
                onRedo={onRedoWaypoint}
                canRedo={canRedo}
                onOutAndBack={onOutAndBack}
                onClear={onClearWaypoints}
                onCloseLoop={onCloseLoop}
                onReverse={onReverseRoute}
                isLoading={isLoading}
              />
            )}

            {currentMode === 'random' && (
              <RandomLoopMode
                startLocation={startLocation}
                targetDistanceKm={targetDistanceKm}
                onTargetDistanceChange={onTargetDistanceChange}
                onUseMyLocation={onUseMyLocation}
                onGenerateLoop={onGenerateLoop}
                onReRoll={onReRollLoop}
                onResetLoop={onResetLoop}
                routeData={routeData}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
