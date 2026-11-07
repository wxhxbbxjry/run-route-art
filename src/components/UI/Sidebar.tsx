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
  startLocation,
  targetDistanceKm,
  onTargetDistanceChange,
  onUseMyLocation,
  onGenerateLoop,
  onReRollLoop,
  isLoading,
}: SidebarProps) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false); // Default collapsed on mobile for maximum map view!

  const distKm = routeData ? routeData.distanceKm : 0;
  const isMiles = unitSystem === 'mi';
  const displayDist = isMiles ? distKm * 0.621371 : distKm;
  const unitLabel = isMiles ? 'MI' : 'KM';

  return (
    <>
      {/* Desktop Floating Sidebar (Left Side) */}
      <aside className="hidden md:flex flex-col w-[400px] h-[calc(100vh-2rem)] my-4 ml-4 rounded-3xl glass-panel shadow-2xl border border-slate-700/60 z-30 overflow-hidden shrink-0">
        {/* Brand Header with Saved Routes Shortcut */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center text-slate-950 shadow-[0_0_15px_rgba(163,230,53,0.5)]">
              <Route className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
                RunRoute <span className="text-lime-400 font-mono">PRO</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">
                Smart Running Route & Loop Planner
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSavedRoutes && (
              <button
                onClick={onOpenSavedRoutes}
                title="Buka Rute Tersimpan & Impor GPX"
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition active:scale-95"
              >
                <FolderOpen className="w-3.5 h-3.5 text-lime-400" />
                <span>Rute & GPX</span>
              </button>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-lime-500/10 text-lime-400 border border-lime-500/30 font-semibold">
              100% FREE
            </span>
          </div>
        </div>

        {/* Mode Navigation Tabs (Manual Tap & Random Loop) */}
        <div className="p-3 border-b border-slate-800/60 bg-slate-950/40">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-900/90 border border-slate-800">
            {/* Manual Tab */}
            <button
              onClick={() => onModeChange('manual')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                currentMode === 'manual'
                  ? 'bg-lime-500 text-slate-950 shadow-[0_0_12px_rgba(163,230,53,0.4)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <MousePointerClick className="w-4 h-4" />
              <span>Manual Tap</span>
            </button>

            {/* Random Loop Tab */}
            <button
              onClick={() => onModeChange('random')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                currentMode === 'random'
                  ? 'bg-lime-500 text-slate-950 shadow-[0_0_12px_rgba(163,230,53,0.4)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Shuffle className="w-4 h-4" />
              <span>Random Loop</span>
            </button>
          </div>
        </div>

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
        <div className="p-3 border-t border-slate-800/60 text-[10px] text-slate-500 text-center bg-slate-950/60">
          OSRM Routing & OpenStreetMap Free Lifetime Tiles &bull; Strava Ready
        </div>
      </aside>

      {/* Mobile Collapsible Bottom Sheet Panel (Optimized for Handhelds) */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
          isMobileExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-4rem)]'
        }`}
      >
        <div className="glass-panel rounded-t-3xl border-t border-slate-700/80 shadow-2xl overflow-hidden max-h-[82vh] flex flex-col">
          {/* Mobile Docked Bar Header */}
          <div className="p-3 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 select-none">
            {/* Left: Mode Badge & Live Distance */}
            <div
              onClick={() => setIsMobileExpanded(!isMobileExpanded)}
              className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0"
            >
              <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center text-slate-950 font-black text-xs shrink-0 shadow-[0_0_10px_rgba(163,230,53,0.5)]">
                {currentMode === 'random' ? 'L' : 'M'}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono font-black text-base text-lime-400 leading-none">
                    {displayDist.toFixed(2)}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">{unitLabel}</span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium capitalize truncate">
                  {currentMode === 'random' ? 'Random Loop' : 'Manual Tap'}
                </p>
              </div>
            </div>

            {/* Center-Right Quick Actions (Undo, GPX, Expand) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {currentMode === 'manual' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUndoWaypoint();
                  }}
                  disabled={waypoints.length === 0}
                  title="Undo Titik Terakhir"
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition active:scale-95 disabled:opacity-40"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
              )}

              {onOpenSavedRoutes && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSavedRoutes();
                  }}
                  title="Kelola Rute & Impor GPX"
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-lime-400 flex items-center justify-center transition active:scale-95"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={() => setIsMobileExpanded(!isMobileExpanded)}
                className="px-2.5 py-1.5 rounded-xl bg-lime-500/10 text-lime-400 border border-lime-500/30 text-[11px] font-bold flex items-center gap-1 transition"
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

          {/* Mode Switcher Tabs (2 Modes) */}
          <div className="grid grid-cols-2 gap-2 p-2 bg-slate-950/90 border-b border-slate-800">
            <button
              onClick={() => onModeChange('manual')}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
                currentMode === 'manual'
                  ? 'bg-lime-500 text-slate-950 shadow-[0_0_10px_rgba(163,230,53,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              <span>Manual Tap</span>
            </button>
            <button
              onClick={() => onModeChange('random')}
              className={`py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition ${
                currentMode === 'random'
                  ? 'bg-lime-500 text-slate-950 shadow-[0_0_10px_rgba(163,230,53,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Random Loop</span>
            </button>
          </div>

          {/* Mobile Content */}
          <div className="overflow-y-auto p-4 space-y-4 max-h-[60vh]">
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
