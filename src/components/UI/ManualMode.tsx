'use client';

import React from 'react';
import { Waypoint, RouteData } from '@/lib/types';
import {
  Undo2,
  Trash2,
  Repeat,
  Compass,
  Route,
  Zap,
  MousePointerClick,
  CheckCircle2,
  Footprints,
} from 'lucide-react';

interface ManualModeProps {
  waypoints: Waypoint[];
  routeData: RouteData | null;
  snapToRoads: boolean;
  onToggleSnap: (snap: boolean) => void;
  allowContraflow?: boolean;
  onToggleContraflow?: (allow: boolean) => void;
  onUndo: () => void;
  onClear: () => void;
  onCloseLoop: () => void;
  onReverse: () => void;
  isLoading: boolean;
}

export default function ManualMode({
  waypoints,
  routeData,
  snapToRoads,
  onToggleSnap,
  allowContraflow = true,
  onToggleContraflow,
  onUndo,
  onClear,
  onCloseLoop,
  onReverse,
  isLoading,
}: ManualModeProps) {
  const isLoopClosed =
    waypoints.length > 2 &&
    Math.abs(waypoints[0].lat - waypoints[waypoints.length - 1].lat) < 0.0001 &&
    Math.abs(waypoints[0].lng - waypoints[waypoints.length - 1].lng) < 0.0001;

  return (
    <div className="space-y-4">
      {/* Tap Instruction Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-lime-500/10 text-lime-400 mt-0.5 shrink-0">
          <MousePointerClick className="w-4 h-4" />
        </div>
        <div className="text-xs space-y-1">
          <p className="font-semibold text-slate-200">Mode Manual: Tap-to-Route</p>
          <p className="text-slate-400 leading-relaxed">
            Klik atau ketuk sembarang area pada peta untuk meletakkan titik awal dan waypoint lari Anda berikutnya.
          </p>
        </div>
      </div>

      {routeData && (
        <div className="text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400">Jarak Rute Manual:</span>
          <span className="font-mono text-lime-400 font-bold">{routeData.distanceKm.toFixed(2)} KM</span>
        </div>
      )}

      {/* Snap to Roads Toggle */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg ${
              snapToRoads ? 'bg-lime-500/20 text-lime-400' : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Route className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">
              {snapToRoads ? 'Smart Road Snap (Akurat)' : 'Garis Bebas (Direct Line)'}
            </p>
            <p className="text-[11px] text-slate-400 leading-tight">
              {snapToRoads
                ? 'Ikuti jalan terdekat (mencegah detour memutar di taman/gang)'
                : 'Presisi lurus bebas untuk lapangan, stadion, atau pantai'}
            </p>
          </div>
        </div>

        <button
          onClick={() => onToggleSnap(!snapToRoads)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            snapToRoads ? 'bg-lime-500' : 'bg-slate-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
              snapToRoads ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Runner Contraflow / Bebas Lawan Arah Toggle */}
      {snapToRoads && onToggleContraflow && (
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg ${
                allowContraflow ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Footprints className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">
                Bebas Lawan Arah (Runner Friendly)
              </p>
              <p className="text-[11px] text-slate-400 leading-tight">
                {allowContraflow
                  ? 'Boleh lari di trotoar dua arah (abaikan satu arah mobil)'
                  : 'Patuhi arah rambu satu arah kendaraan'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onToggleContraflow(!allowContraflow)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              allowContraflow ? 'bg-cyan-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                allowContraflow ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Waypoints Counter & Status */}
      <div className="flex items-center justify-between text-xs px-1 text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
          {waypoints.length === 0
            ? 'Belum ada titik dipilih'
            : `${waypoints.length} titik waypoint aktif`}
        </span>
        {isLoopClosed && (
          <span className="text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Loop Tertutup
          </span>
        )}
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={onUndo}
          disabled={waypoints.length === 0 || isLoading}
          className="px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/60 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>Undo Titik</span>
        </button>

        <button
          onClick={onCloseLoop}
          disabled={waypoints.length < 2 || isLoopClosed || isLoading}
          className="px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/60 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>Tutup Loop</span>
        </button>

        <button
          onClick={onReverse}
          disabled={waypoints.length < 2 || isLoading}
          className="px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/60 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Balik Arah</span>
        </button>

        <button
          onClick={onClear}
          disabled={waypoints.length === 0 || isLoading}
          className="px-3 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-medium text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Semua</span>
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-lime-400 py-1 font-medium">
          <Zap className="w-4 h-4 animate-bounce" />
          <span>Menghubungkan jalur rute via OSRM...</span>
        </div>
      )}
    </div>
  );
}
