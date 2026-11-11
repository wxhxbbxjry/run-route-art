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
} from 'lucide-react';

interface SidebarProps {
  currentMode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  // Manual mode props
  waypoints: Waypoint[];
  routeData: RouteData | null;
  snapToRoads: boolean;
  onToggleSnap: (snap: boolean) => void;
  allowContraflow?: boolean;
  onToggleContraflow?: (allow: boolean) => void;
  avoidSmallAlleys?: boolean;
  onToggleAvoidAlleys?: (avoid: boolean) => void;
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
  // Common
  isLoading: boolean;
}

export default function Sidebar({
  currentMode,
  onModeChange,
  waypoints,
  routeData,
  snapToRoads,
  onToggleSnap,
  allowContraflow,
  onToggleContraflow,
  avoidSmallAlleys,
  onToggleAvoidAlleys,
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
  isLoading,
}: SidebarProps) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  const distKm = routeData ? routeData.distanceKm : 0;
  const isMiles = unitSystem === 'mi';
  const displayDist = isMiles ? distKm * 0.621371 : distKm;
  const unitLabel = isMiles ? 'MI' : 'KM';

  return (
    <>
      {/* Desktop Strava Route Builder Sidebar (Left Side) */}
      <aside className="hidden md:flex flex-col w-[320px] lg:w-[400px] h-[calc(100vh-2rem)] my-4 ml-4 rounded-3xl sidebar-panel shadow-2xl z-30 overflow-hidden shrink-0 text-slate-900">
        {/* Brand Header */}
        <div className="p-3.5 border-b border-slate-200/80 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#fc4c02] flex items-center justify-center text-white shadow-[0_4px_12px_rgba(252,76,2,0.35)]">
              <Route className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-slate-900 flex items-center gap-1">
                RunRoute <span className="text-[#fc4c02] font-mono">PRO</span>
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Strava-Style Route Builder
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenSavedRoutes && (
              <button
                onClick={onOpenSavedRoutes}
                title="Buka Rute Tersimpan & Impor GPX"
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition active:scale-95"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#fc4c02]" />
                <span>Rute &amp; GPX</span>
              </button>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
              FREE
            </span>
          </div>
        </div>

        {/* Mode Navigation Tabs (Manual Tap & Random Loop) */}
        <div className="px-3 py-2.5 border-b border-slate-200/70 bg-slate-50/80">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-200/70 border border-slate-200">
            <button
              onClick={() => onModeChange('manual')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                currentMode === 'manual'
                  ? 'bg-[#fc4c02] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
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
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Shuffle className="w-4 h-4" />
              <span>Random Loop</span>
            </button>
          </div>
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-white">
          {currentMode === 'manual' && (
            <ManualMode
              waypoints={waypoints}
              routeData={routeData}
              snapToRoads={snapToRoads}
              onToggleSnap={onToggleSnap}
              allowContraflow={allowContraflow}
              onToggleContraflow={onToggleContraflow}
              avoidSmallAlleys={avoidSmallAlleys}
              onToggleAvoidAlleys={onToggleAvoidAlleys}
              onUndo={onUndoWaypoint}
              onRedo={onRedoWaypoint}
              canRedo={canRedo}
              onOutAndBack={onOutAndBack}
              onClear={onClearWaypoints}
              onCloseLoop={onCloseLoop}
              onReverse={onReverseRoute}
              onOpenSavedRoutes={onOpenSavedRoutes}
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
              routeData={routeData}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* Footer info */}
        <div className="px-3 py-2.5 border-t border-slate-200/80 text-[10px] text-slate-500 text-center bg-slate-50 font-medium">
          OpenFreeMap Vector &bull; OSRM Foot Routing &bull; 100% Free Strava Ready
        </div>
      </aside>

      {/* Mobile Collapsible Bottom Sheet Panel */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
          isMobileExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-4rem)]'
        }`}
      >
        <div className="bg-white text-slate-900 rounded-t-3xl border-t border-slate-200 shadow-2xl overflow-hidden max-h-[82vh] flex flex-col">
          {/* Mobile Docked Bar Header */}
          <div className="p-3 flex items-center justify-between border-b border-slate-200 bg-white select-none">
            <div
              onClick={() => setIsMobileExpanded(!isMobileExpanded)}
              className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
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
                      className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1 rounded border border-slate-200"
                    >
                      {unitLabel}
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500">{unitLabel}</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 font-semibold capitalize truncate">
                  {currentMode === 'random' ? 'Random Loop' : 'Manual Tap'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {currentMode === 'manual' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUndoWaypoint();
                  }}
                  disabled={waypoints.length === 0}
                  title="Undo Titik Terakhir"
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition active:scale-95 disabled:opacity-40"
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
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition active:scale-95 border ${
                    showElevation
                      ? 'bg-orange-50 border-[#fc4c02] text-[#fc4c02]'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
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
                  className="w-8 h-8 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white flex items-center justify-center shadow transition active:scale-95"
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
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#fc4c02] flex items-center justify-center transition active:scale-95"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={() => setIsMobileExpanded(!isMobileExpanded)}
                className="px-2.5 py-1.5 rounded-xl bg-orange-50 text-[#fc4c02] border border-orange-200 text-[11px] font-bold flex items-center gap-1 transition"
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

          {/* Mobile Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 border-b border-slate-200">
            <button
              onClick={() => onModeChange('manual')}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
                currentMode === 'manual'
                  ? 'bg-[#fc4c02] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
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
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Random Loop</span>
            </button>
          </div>

          {/* Mobile Scroll Content */}
          <div className="overflow-y-auto p-4 space-y-3 max-h-[60vh]">
            {currentMode === 'manual' && (
              <ManualMode
                waypoints={waypoints}
                routeData={routeData}
                snapToRoads={snapToRoads}
                onToggleSnap={onToggleSnap}
                allowContraflow={allowContraflow}
                onToggleContraflow={onToggleContraflow}
                avoidSmallAlleys={avoidSmallAlleys}
                onToggleAvoidAlleys={onToggleAvoidAlleys}
                onUndo={onUndoWaypoint}
                onRedo={onRedoWaypoint}
                canRedo={canRedo}
                onOutAndBack={onOutAndBack}
                onClear={onClearWaypoints}
                onCloseLoop={onCloseLoop}
                onReverse={onReverseRoute}
                onOpenSavedRoutes={onOpenSavedRoutes}
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
