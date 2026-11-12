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
  Pencil,
} from 'lucide-react';

interface ManualModeProps {
  waypoints: Waypoint[];
  routeData: RouteData | null;
  isRouteClosed: boolean;
  onFinishRoute: () => void;
  onReopenRoute: () => void;
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
  isRouteClosed,
  onFinishRoute,
  onReopenRoute,
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
    <div className="space-y-3.5 ui-fade-slide-up">
      {/* Concise usage tip */}
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed px-0.5">
        {isRouteClosed
          ? 'Pemilihan rute selesai. Peta bebas digeser tanpa menambah titik — ekspor GPX atau lanjutkan edit kapan saja.'
          : 'Ketuk peta untuk membuat titik rute, seret titik untuk ubah jalur, atau klik titik untuk menghapus.'}
      </p>

      {/* Active Route Summary Card */}
      <div className="p-3.5 rounded-2xl cockpit-well space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden="true"
              className={`w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-200 ${
                isLoading
                  ? 'bg-[#fc4c02] animate-ping'
                  : isRouteClosed
                  ? 'bg-emerald-400'
                  : waypoints.length > 0
                  ? 'bg-[#fc4c02]'
                  : 'bg-slate-600'
              }`}
            />
            <span className="text-xs font-bold text-[var(--text-primary)] tabular-nums truncate">
              {waypoints.length === 0
                ? 'Belum ada titik dipilih'
                : `${waypoints.length} titik waypoint aktif`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isRouteClosed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--status-ok-bg)] text-[var(--status-ok-text)] border border-[var(--status-ok-border)] ui-fade-slide-up">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                <span>Rute Selesai</span>
              </span>
            )}
            {isLoopClosed && !isRouteClosed && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[var(--status-ok-bg)] text-[var(--status-ok-text)] border border-[var(--status-ok-border)] ui-fade-slide-up">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                <span>Loop Tertutup</span>
              </span>
            )}
          </div>
        </div>

        {routeData && (
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-muted)]">
              Jarak Rute Manual
            </span>
            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="font-display text-2xl font-extrabold text-[#fc4c02] leading-none">
                {routeData.distanceKm.toFixed(2)}
              </span>
              <span className="font-mono text-xs font-bold text-[var(--text-muted)]">KM</span>
            </div>
          </div>
        )}
      </div>

      {/* Finish / Reopen Manual Route CTA */}
      {isRouteClosed ? (
        <button
          type="button"
          onClick={onReopenRoute}
          className="group w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] hover:text-[var(--brand-ink)] border border-[var(--border-strong)] hover:border-[var(--brand-border)] font-bold text-sm flex items-center justify-center gap-2 ui-btn-secondary ui-focus-ring"
        >
          <Pencil
            className="w-4 h-4 text-[#fc4c02] transition-transform duration-150 group-hover:-rotate-12"
            aria-hidden="true"
          />
          <span>Lanjutkan Edit</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onFinishRoute}
          disabled={waypoints.length < 2}
          title="Selesaikan pemilihan titik agar peta bebas digeser tanpa menambah titik baru"
          className="group w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none ui-btn-primary ui-focus-ring"
        >
          <CheckCircle2
            className="w-4 h-4 transition-transform duration-150 group-hover:scale-110"
            aria-hidden="true"
          />
          <span>Tutup Rute</span>
        </button>
      )}

      {/* Action Buttons Grid (44px mobile hit targets) */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={waypoints.length === 0 || isRouteClosed || isLoading}
          className="group min-h-[44px] md:min-h-[40px] px-3 py-2 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--surface-well)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Undo2
            className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
          <span>Undo Titik</span>
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo || isRouteClosed || isLoading}
          className="group min-h-[44px] md:min-h-[40px] px-3 py-2 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--surface-well)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Redo2
            className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
          <span>Redo Titik</span>
        </button>

        <button
          type="button"
          onClick={onOutAndBack}
          disabled={waypoints.length < 2 || isLoopClosed || isRouteClosed || isLoading}
          title="Gandakan rute kembali ke titik start (Out & Back)"
          className="group min-h-[44px] md:min-h-[40px] px-3 py-2 rounded-xl bg-[var(--brand-tint)] hover:bg-orange-500/20 text-[var(--brand-ink)] border border-[var(--brand-border)] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <ArrowLeftRight
            className="w-3.5 h-3.5 text-[#fc4c02] transition-transform duration-150 group-hover:scale-110"
            aria-hidden="true"
          />
          <span>Out &amp; Back</span>
        </button>

        <button
          type="button"
          onClick={onCloseLoop}
          disabled={waypoints.length < 2 || isLoopClosed || isRouteClosed || isLoading}
          className="group min-h-[44px] md:min-h-[40px] px-3 py-2 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--surface-well)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Repeat
            className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-90"
            aria-hidden="true"
          />
          <span>Tutup Loop</span>
        </button>

        <button
          type="button"
          onClick={onReverse}
          disabled={waypoints.length < 2 || isLoading}
          className="group min-h-[44px] md:min-h-[40px] px-3 py-2 rounded-xl bg-[var(--surface-solid)] hover:bg-[var(--surface-well)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Compass
            className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-45"
            aria-hidden="true"
          />
          <span>Balik Arah</span>
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={waypoints.length === 0 || isLoading}
          className="group min-h-[44px] md:min-h-[40px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
        >
          <Trash2
            className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-rotate-12"
            aria-hidden="true"
          />
          <span>Hapus Semua</span>
        </button>
      </div>

      {isLoading && (
        <div className="space-y-1.5 pt-1 ui-fade-slide-up">
          <div className="flex items-center justify-center gap-1.5 text-xs text-[#fc4c02] font-bold">
            <Zap className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
            <span>Menghubungkan jalur aman...</span>
          </div>
          <div className="h-1 w-full rounded-full bg-orange-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-[#fc4c02] ui-loading-bar" />
          </div>
        </div>
      )}
    </div>
  );
}
