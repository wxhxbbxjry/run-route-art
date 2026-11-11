'use client';

import React from 'react';
import { Waypoint, RouteData } from '@/lib/types';
import {
  Undo2,
  Redo2,
  Trash2,
  Repeat,
  Compass,
  Route,
  Zap,
  MousePointerClick,
  CheckCircle2,
  Footprints,
  ArrowLeftRight,
  ShieldCheck,
  FolderOpen,
} from 'lucide-react';

interface ManualModeProps {
  waypoints: Waypoint[];
  routeData: RouteData | null;
  snapToRoads: boolean;
  onToggleSnap: (snap: boolean) => void;
  allowContraflow?: boolean;
  onToggleContraflow?: (allow: boolean) => void;
  avoidSmallAlleys?: boolean;
  onToggleAvoidAlleys?: (avoid: boolean) => void;
  onUndo: () => void;
  onRedo?: () => void;
  canRedo?: boolean;
  onOutAndBack?: () => void;
  onCloseLoop: () => void;
  onReverse: () => void;
  onClear: () => void;
  onOpenSavedRoutes?: () => void;
  isLoading: boolean;
}

export default function ManualMode({
  waypoints,
  routeData,
  snapToRoads,
  onToggleSnap,
  allowContraflow = true,
  onToggleContraflow,
  avoidSmallAlleys = true,
  onToggleAvoidAlleys,
  onUndo,
  onRedo,
  canRedo = false,
  onOutAndBack,
  onCloseLoop,
  onReverse,
  onClear,
  onOpenSavedRoutes,
  isLoading,
}: ManualModeProps) {
  const isLoopClosed =
    waypoints.length > 2 &&
    Math.abs(waypoints[0].lat - waypoints[waypoints.length - 1].lat) < 0.0001 &&
    Math.abs(waypoints[0].lng - waypoints[waypoints.length - 1].lng) < 0.0001;

  return (
    <div className="space-y-2.5">
      {/* Tap Instruction Banner */}
      <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200/80 flex items-start gap-2.5">
        <div className="p-1.5 rounded-lg bg-[#fc4c02] text-white mt-0.5 shrink-0">
          <MousePointerClick className="w-4 h-4" />
        </div>
        <div className="text-xs space-y-0.5">
          <p className="font-bold text-slate-900">Mode Manual: Tap-to-Route</p>
          <p className="text-[11px] text-slate-600 leading-snug">
            Ketuk peta untuk membuat jalur lari. Seret titik untuk mengubah rute, atau klik titik untuk menghapus.
          </p>
        </div>
      </div>

      {routeData && (
        <div className="text-xs text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 flex items-center justify-between">
          <span className="text-slate-500 font-medium">Jarak Rute Manual:</span>
          <span className="font-mono text-[#fc4c02] font-extrabold">{routeData.distanceKm.toFixed(2)} KM</span>
        </div>
      )}

      {/* Snap to Roads Toggle */}
      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg ${
              snapToRoads ? 'bg-orange-100 text-[#fc4c02]' : 'bg-slate-200 text-slate-500'
            }`}
          >
            <Route className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">
              {snapToRoads ? 'Smart Road Snap (Akurat)' : 'Garis Bebas (Direct Line)'}
            </p>
            <p className="text-[11px] text-slate-500 leading-tight">
              {snapToRoads
                ? 'Ikuti jalur lari & jalan terdekat secara presisi'
                : 'Mode bebas lurus untuk stadion atau track'}
            </p>
          </div>
        </div>

        <button
          onClick={() => onToggleSnap(!snapToRoads)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            snapToRoads ? 'bg-[#fc4c02]' : 'bg-slate-300'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              snapToRoads ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Runner Contraflow Toggle */}
      {snapToRoads && onToggleContraflow && (
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg ${
                allowContraflow ? 'bg-sky-100 text-sky-600' : 'bg-slate-200 text-slate-500'
              }`}
            >
              <Footprints className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Bebas Lawan Arah (Runner Friendly)
              </p>
              <p className="text-[11px] text-slate-500 leading-tight">
                {allowContraflow
                  ? 'Boleh lari di trotoar dua arah (abaikan satu arah mobil)'
                  : 'Patuhi arah rambu lalu lintas'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onToggleContraflow(!allowContraflow)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              allowContraflow ? 'bg-sky-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                allowContraflow ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Avoid Small Alleys & Obvitnas Toggle */}
      {snapToRoads && onToggleAvoidAlleys && (
        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg ${
                avoidSmallAlleys ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Hindari Gang Sempit &amp; Area Privat
              </p>
              <p className="text-[11px] text-slate-500 leading-tight">
                {avoidSmallAlleys
                  ? 'Prioritaskan jalan terbuka & bebas zona Obvitnas'
                  : 'Izinkan gang kecil & jalan setapak'}
              </p>
            </div>
          </div>

          <button
            onClick={() => onToggleAvoidAlleys(!avoidSmallAlleys)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              avoidSmallAlleys ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                avoidSmallAlleys ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      )}

      {/* Waypoints Counter */}
      <div className="flex items-center justify-between text-xs px-1 text-slate-500 font-medium">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#fc4c02] animate-pulse" />
          {waypoints.length === 0
            ? 'Belum ada titik dipilih'
            : `${waypoints.length} titik waypoint aktif`}
        </span>
        {isLoopClosed && (
          <span className="text-emerald-600 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Loop Tertutup
          </span>
        )}
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onUndo}
          disabled={waypoints.length === 0 || isLoading}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>Undo Titik</span>
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo || isLoading}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Redo2 className="w-3.5 h-3.5" />
          <span>Redo Titik</span>
        </button>

        <button
          onClick={onOutAndBack}
          disabled={waypoints.length < 2 || isLoopClosed || isLoading}
          title="Gandakan rute kembali ke titik start (Out & Back)"
          className="px-3 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#c93b00] border border-orange-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-[#fc4c02]" />
          <span>Out &amp; Back</span>
        </button>

        <button
          onClick={onCloseLoop}
          disabled={waypoints.length < 2 || isLoopClosed || isLoading}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Repeat className="w-3.5 h-3.5" />
          <span>Tutup Loop</span>
        </button>

        <button
          onClick={onReverse}
          disabled={waypoints.length < 2 || isLoading}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-950 border border-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Balik Arah</span>
        </button>

        <button
          onClick={onClear}
          disabled={waypoints.length === 0 || isLoading}
          className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-45 disabled:pointer-events-none"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Hapus Semua</span>
        </button>
      </div>

      {/* Saved Routes / GPX Manager Shortcut */}
      {onOpenSavedRoutes && (
        <button
          onClick={onOpenSavedRoutes}
          className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-sm"
        >
          <FolderOpen className="w-4 h-4 text-[#fc4c02]" />
          <span>Kelola Rute &amp; Impor File GPX</span>
        </button>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-xs text-[#fc4c02] py-1 font-bold">
          <Zap className="w-4 h-4 animate-bounce" />
          <span>Menghubungkan jalur rute via OSRM...</span>
        </div>
      )}
    </div>
  );
}
