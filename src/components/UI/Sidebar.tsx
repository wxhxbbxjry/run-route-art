'use client';

import React, { useState } from 'react';
import { RouteMode, LatLng, Waypoint, RouteData, GpsShapeKey } from '@/lib/types';
import ManualMode from './ManualMode';
import RandomLoopMode from './RandomLoopMode';
import GpsArtMode from './GpsArtMode';
import {
  MousePointerClick,
  Shuffle,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Route,
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
  onUndoWaypoint: () => void;
  onClearWaypoints: () => void;
  onCloseLoop: () => void;
  onReverseRoute: () => void;
  // Random Loop props
  startLocation: LatLng | null;
  targetDistanceKm: number;
  onTargetDistanceChange: (km: number) => void;
  onUseMyLocation: () => void;
  onGenerateLoop: () => void;
  onReRollLoop: () => void;
  // GPS Art props
  selectedShape: GpsShapeKey;
  onSelectShape: (shape: GpsShapeKey) => void;
  artCenterLocation: LatLng | null;
  artScaleKm: number;
  onArtScaleChange: (scale: number) => void;
  artRotationDeg: number;
  onArtRotationChange: (deg: number) => void;
  showBlueprint: boolean;
  onToggleBlueprint: (show: boolean) => void;
  onGenerateArt: () => void;
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
  onUndoWaypoint,
  onClearWaypoints,
  onCloseLoop,
  onReverseRoute,
  startLocation,
  targetDistanceKm,
  onTargetDistanceChange,
  onUseMyLocation,
  onGenerateLoop,
  onReRollLoop,
  selectedShape,
  onSelectShape,
  artCenterLocation,
  artScaleKm,
  onArtScaleChange,
  artRotationDeg,
  onArtRotationChange,
  showBlueprint,
  onToggleBlueprint,
  onGenerateArt,
  isLoading,
}: SidebarProps) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(true);

  return (
    <>
      {/* Desktop Floating Sidebar (Left Side) */}
      <aside className="hidden md:flex flex-col w-[400px] h-[calc(100vh-2rem)] my-4 ml-4 rounded-3xl glass-panel shadow-2xl border border-slate-700/60 z-30 overflow-hidden shrink-0">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-lime-400 to-emerald-500 flex items-center justify-center text-slate-950 shadow-[0_0_15px_rgba(163,230,53,0.5)]">
              <Route className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
                RunRoute <span className="text-lime-400 font-mono">ART</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">
                GPS Art & Smart Route Planner
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-lime-500/10 text-lime-400 border border-lime-500/30 font-semibold">
            100% FREE
          </span>
        </div>

        {/* Mode Navigation Tabs */}
        <div className="p-3 border-b border-slate-800/60 bg-slate-950/40">
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-slate-800">
            {/* Manual Tab */}
            <button
              onClick={() => onModeChange('manual')}
              className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition ${
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
              className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition ${
                currentMode === 'random'
                  ? 'bg-lime-500 text-slate-950 shadow-[0_0_12px_rgba(163,230,53,0.4)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Shuffle className="w-4 h-4" />
              <span>Random Loop</span>
            </button>

            {/* GPS Art Tab */}
            <button
              onClick={() => onModeChange('art')}
              className={`py-2 px-1 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition ${
                currentMode === 'art'
                  ? 'bg-cyan-400 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>GPS Art</span>
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
              onUndo={onUndoWaypoint}
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
              routeData={routeData}
              isLoading={isLoading}
            />
          )}

          {currentMode === 'art' && (
            <GpsArtMode
              selectedShape={selectedShape}
              onSelectShape={onSelectShape}
              centerLocation={artCenterLocation}
              onUseMyLocation={onUseMyLocation}
              scaleKm={artScaleKm}
              onScaleChange={onArtScaleChange}
              rotationDeg={artRotationDeg}
              onRotationChange={onArtRotationChange}
              showBlueprint={showBlueprint}
              onToggleBlueprint={onToggleBlueprint}
              snapToRoads={snapToRoads}
              onToggleSnap={onToggleSnap}
              onGenerateArt={onGenerateArt}
              routeData={routeData}
              isLoading={isLoading}
            />
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800/60 text-[10px] text-slate-500 text-center bg-slate-950/60">
          OSRM Foot Routing & OpenStreetMap Free Tiles &bull; Strava & Garmin Ready
        </div>
      </aside>

      {/* Mobile Collapsible Bottom Sheet Panel */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ease-out ${
          isMobileExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-3.5rem)]'
        }`}
      >
        <div className="glass-panel rounded-t-3xl border-t border-slate-700/70 shadow-2xl overflow-hidden max-h-[82vh] flex flex-col">
          {/* Pull Handle Header */}
          <div
            onClick={() => setIsMobileExpanded(!isMobileExpanded)}
            className="p-3 flex items-center justify-between cursor-pointer border-b border-slate-800 bg-slate-950/70"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-lime-400 flex items-center justify-center text-slate-950 font-black text-xs">
                R
              </div>
              <span className="font-bold text-xs text-white">
                RunRoute Art &bull;{' '}
                <span className="capitalize text-lime-400">{currentMode}</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">
                {isMobileExpanded ? 'Tutup Panel' : 'Buka Kontrol'}
              </span>
              {isMobileExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              )}
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1 p-2 bg-slate-950/90 border-b border-slate-800">
            <button
              onClick={() => onModeChange('manual')}
              className={`py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 ${
                currentMode === 'manual'
                  ? 'bg-lime-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              <span>Manual</span>
            </button>
            <button
              onClick={() => onModeChange('random')}
              className={`py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 ${
                currentMode === 'random'
                  ? 'bg-lime-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Random</span>
            </button>
            <button
              onClick={() => onModeChange('art')}
              className={`py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 ${
                currentMode === 'art'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>GPS Art</span>
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
                onUndo={onUndoWaypoint}
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
                routeData={routeData}
                isLoading={isLoading}
              />
            )}

            {currentMode === 'art' && (
              <GpsArtMode
                selectedShape={selectedShape}
                onSelectShape={onSelectShape}
                centerLocation={artCenterLocation}
                onUseMyLocation={onUseMyLocation}
                scaleKm={artScaleKm}
                onScaleChange={onArtScaleChange}
                rotationDeg={artRotationDeg}
                onRotationChange={onArtRotationChange}
                showBlueprint={showBlueprint}
                onToggleBlueprint={onToggleBlueprint}
                snapToRoads={snapToRoads}
                onToggleSnap={onToggleSnap}
                onGenerateArt={onGenerateArt}
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
