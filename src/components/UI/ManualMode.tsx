'use client';

import React from 'react';
import { Waypoint, RouteData } from '@/lib/types';
import {
  Undo2,
  Redo2,
  Trash2,
  Repeat,
  Compass,
  Zap,
  CheckCircle2,
  ArrowLeftRight,
} from 'lucide-react';

interface ManualModeProps {
  waypoints: Waypoint[];
  routeData: RouteData | null;
  onUndo: () => void;
  onRedo?: () => void;
  canRedo?: boolean;
  onOutAndBack?: () => void;
  onCloseLoop: () => void;
  onReverse: () => void;
  onClear: () => void;
  isLoading: boolean;
}

export default function ManualMode({
  waypoints,
  routeData,
  onUndo,
  onRedo,
  canRedo = false,
  onOutAndBack,
  onCloseLoop,
  onReverse,
  onClear,
  isLoading,
}: ManualModeProps) {
  const isLoopClosed =
    waypoints.length > 2 &&
    Math.abs(waypoints[0].lat - waypoints[waypoints.length - 1].lat) < 0.0001 &&
    Math.abs(waypoints[0].lng - waypoints[waypoints.length - 1].lng) < 0.0001;

  return (
    <div className="space-y-3">
      {/* Concise usage line */}
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed px-0.5">
        Ketuk peta untuk membuat titik rute, seret titik untuk ubah jalur, atau klik titik untuk menghapus.
      </p>

      {routeData && (
        <div className="text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400 font-medium">Jarak Rute Manual:</span>
          <span className="font-mono text-[#fc4c02] font-extrabold">{routeData.distanceKm.toFixed(2)} KM</span>
        </div>
      )}

      {/* Waypoints Counter */}
      <div className="flex items-center justify-between text-xs px-0.5 text-slate-600 dark:text-slate-300 font-medium">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#fc4c02] animate-pulse" />
          {waypoints.length === 0
            ? 'Belum ada titik dipilih'
            : `${waypoints.length} titik waypoint aktif`}
        </span>
        {isLoopClosed && (
          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Loop Tertutup
          </span>
        )}
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onUndo}
          disabled={waypoints.length === 0 || isLoading}
          className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>Undo Titik</span>
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo || isLoading}
          className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Redo2 className="w-3.5 h-3.5" />
          <span>Redo Titik</span>
        </button>

        <button
          onClick={onOutAndBack}
          disabled={waypoints.length < 2 || isLoopClosed || isLoading}
          title="Gandakan rute kembali ke titik start (Out & Back)"
          className="px-3 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/50 dark:hover:bg-orange-900/60 text-[#c93b00] dark:text-orange-300 border border-orange-200 dark:border-orange-500/40 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-[#fc4c02]" />
          <span>Out &amp; Back</span>
        </button>

        <button
          onClick={onCloseLoop}
          disabled={waypoints.length < 2 || isLoopClosed || isLoading}
          className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>Tutup Loop</span>
        </button>

        <button
          onClick={onReverse}
          disabled={waypoints.length < 2 || isLoading}
          className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Balik Arah</span>
        </button>

        <button
          onClick={onClear}
          disabled={waypoints.length === 0 || isLoading}
          className="px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/40 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Semua</span>
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-[#fc4c02] py-1 font-bold">
          <Zap className="w-4 h-4 animate-bounce" />
          <span>Menghubungkan jalur rute...</span>
        </div>
      )}
    </div>
  );
}
