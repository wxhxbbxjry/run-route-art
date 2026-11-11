'use client';

import React, { useState } from 'react';
import { RouteMode, LatLng, Waypoint, RouteData } from '@/lib/types';
import ManualMode from './ManualMode';
import RandomLoopMode from './RandomLoopMode';
import {
  MousePointerClick,
  Shuffle,
  ChevronUp,
  ChevronDown,
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
      <aside className="hidden md:flex flex-col w-[320px] lg:w-[400px] h-[calc(100vh-2rem)] my-4 ml-4 rounded-3xl sidebar-panel shadow-2xl z-30 overflow-hidden shrink-0 text-slate-900 dark:text-slate-100">
        {/* Brand Header */}
        <div className="px-3.5 py-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#fc4c02] flex items-center justify-center text-white shadow-[0_4px_12px_rgba(252,76,2,0.35)] shrink-0">
              <Route className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm lg:text-base font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-1 whitespace-nowrap">
                <span>RunRoute</span>
                <span className="text-[#fc4c02] font-mono">PRO</span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/60 font-bold">
                  FREE
                </span>
              </h1>
              <p className="text-[10px] lg:text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                Strava-Style Route Builder
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenSavedRoutes && (
              <button
                onClick={onOpenSavedRoutes}
                title="Kelola Rute Tersimpan & Impor File GPX"
                className="px-2.5 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/70 text-[#c93b00] dark:text-orange-300 text-xs font-bold flex items-center gap-1.5 border border-orange-200 dark:border-orange-500/40 whitespace-nowrap transition active:scale-95"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#fc4c02] shrink-0" />
                <span>Rute &amp; GPX</span>
              </button>
            )}

            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                title={isDarkTheme ? 'Aktifkan Tema Terang' : 'Aktifkan Tema Gelap'}
                aria-label={isDarkTheme ? 'Tema Terang' : 'Tema Gelap'}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-amber-300 border border-slate-200 dark:border-slate-700 flex items-center justify-center transition active:scale-95 shrink-0"
              >
                {isDarkTheme ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Mode Navigation Tabs (Manual Tap & Random Loop) */}
        <div className="px-3 py-2.5 border-b border-slate-200/70 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => onModeChange('manual')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                currentMode === 'manual'
                  ? 'bg-[#fc4c02] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <MousePointerClick className="w-4 h-4" />
              <span>Manual Tap</span>
            </button>

            <button
              onClick={() => onModeChange('random')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                currentMode === 'random'
                  ? 'bg-[#fc4c02] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <Shuffle className="w-4 h-4" />
              <span>Random Loop</span>
            </button>
          </div>
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-white dark:bg-slate-900">
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

        {/* Footer info */}
        <div className="px-3 py-2.5 border-t border-slate-200/80 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 text-center bg-slate-50 dark:bg-slate-900/90 font-medium">
          OpenFreeMap Vector &bull; OSRM Foot Routing &bull; Zona Steril Aktif
        </div>
      </aside>

      {/* Mobile Collapsible Bottom Sheet Panel */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
          isMobileExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-4rem)]'
        }`}
      >
        <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-3xl border-t border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[82vh] flex flex-col">
          {/* Mobile Docked Bar Header */}
          <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 select-none">
            <div
              onClick={() => setIsMobileExpanded(!isMobileExpanded)}
              className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
            >
              <div className="w-8 h-8 rounded-xl bg-[#fc4c02] flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm">
                {currentMode === 'random' ? 'L' : 'M'}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono font-black text-base text-[#fc4c02] leading-none">
                    {displayDist.toFixed(2)}
                  </span>
                  {onToggleUnit ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleUnit();
                      }}
                      className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-1 rounded border border-slate-200 dark:border-slate-700"
                    >
                      {unitLabel}
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{unitLabel}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold capitalize truncate">
                  {currentMode === 'random' ? 'Random Loop' : 'Manual Tap'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {currentMode === 'manual' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUndoWaypoint();
                  }}
                  disabled={waypoints.length === 0}
                  title="Undo Titik Terakhir"
                  className="w-7 h-7 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              )}

              {routeData && routeData.coordinates.length >= 2 && onToggleElevation && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleElevation();
                  }}
                  title="Lihat Grafik Elevasi"
                  className={`w-7 h-7 rounded-xl flex items-center justify-center transition active:scale-95 border ${
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenExport();
                  }}
                  title="Ekspor GPX / JSON"
                  className="w-7 h-7 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white flex items-center justify-center shadow transition active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}

              {onOpenSavedRoutes && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSavedRoutes();
                  }}
                  title="Kelola Rute & Impor GPX"
                  className="px-2 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/60 dark:hover:bg-orange-900/70 text-[#c93b00] dark:text-orange-300 border border-orange-200 dark:border-orange-500/40 text-[10px] font-bold flex items-center gap-1 transition active:scale-95 whitespace-nowrap"
                >
                  <FolderOpen className="w-3 h-3 text-[#fc4c02]" />
                  <span>Rute</span>
                </button>
              )}

              <button
                onClick={() => setIsMobileExpanded(!isMobileExpanded)}
                className="px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 text-[11px] font-bold flex items-center gap-1 transition"
              >
                <span>{isMobileExpanded ? 'Tutup' : 'Menu'}</span>
                {isMobileExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Mode Switcher + Dark Theme Toggle */}
          <div className="flex items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-1.5 flex-1">
              <button
                onClick={() => onModeChange('manual')}
                className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
                  currentMode === 'manual'
                    ? 'bg-[#fc4c02] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <MousePointerClick className="w-3.5 h-3.5" />
                <span>Manual Tap</span>
              </button>
              <button
                onClick={() => onModeChange('random')}
                className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
                  currentMode === 'random'
                    ? 'bg-[#fc4c02] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Random Loop</span>
              </button>
            </div>

            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                title={isDarkTheme ? 'Aktifkan Tema Terang' : 'Aktifkan Tema Gelap'}
                className="px-2.5 py-2 rounded-xl bg-white dark:bg-slate-700 text-slate-700 dark:text-amber-300 border border-slate-200 dark:border-slate-600 text-[11px] font-bold flex items-center gap-1 shrink-0 transition active:scale-95"
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
