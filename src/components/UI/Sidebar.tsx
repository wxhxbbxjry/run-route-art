'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  const isMobileExpandedRef = useRef(isMobileExpanded);
  isMobileExpandedRef.current = isMobileExpanded;

  const sheetRef = useRef<HTMLDivElement>(null);
  const dockHeaderRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const cleanupDragRef = useRef<(() => void) | null>(null);

  // Close expanded mobile Menu sheet cleanly on Escape
  useEffect(() => {
    if (!isMobileExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileExpanded]);

  // Helper: create a live 1:1 vertical drag tracker for the mobile Menu bottom sheet
  const createDragSession = useCallback((startY: number, startX: number) => {
    const sheet = sheetRef.current;
    const header = dockHeaderRef.current;
    if (!sheet || !header) return null;

    const sheetHeight = sheet.getBoundingClientRect().height;
    const headerHeight = header.getBoundingClientRect().height || 68;
    const maxOffset = Math.max(1, sheetHeight - headerHeight);
    const wasExpanded = isMobileExpandedRef.current;
    const startOffset = wasExpanded ? 0 : maxOffset;

    let lastY = startY;
    let lastTime = performance.now();
    let velocityY = 0;
    let currentOffset = startOffset;
    let activeDrag = false;

    const move = (clientY: number, clientX: number): 'pending' | 'dragging' | 'cancel' => {
      const dy = clientY - startY;
      const dx = clientX - startX;

      if (!activeDrag) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) {
          return 'pending';
        }
        if (Math.abs(dx) > Math.abs(dy) * 1.15) {
          return 'cancel';
        }
        activeDrag = true;
        suppressClickRef.current = true;
        sheet.style.transition = 'none';
        if (scrimRef.current) {
          scrimRef.current.style.transition = 'none';
        }
      }

      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      const instantVel = (clientY - lastY) / dt;
      velocityY = velocityY * 0.4 + instantVel * 0.6;
      lastY = clientY;
      lastTime = now;

      const raw = startOffset + dy;
      let clamped = raw;
      if (raw < 0) {
        clamped = Math.max(-18, raw * 0.16);
      } else if (raw > maxOffset) {
        clamped = Math.min(maxOffset + 12, maxOffset + (raw - maxOffset) * 0.16);
      }
      currentOffset = clamped;

      sheet.style.transform = `translate3d(0, ${clamped.toFixed(1)}px, 0)`;
      if (scrimRef.current) {
        const progress = Math.max(0, Math.min(1, 1 - clamped / maxOffset));
        scrimRef.current.style.opacity = progress.toFixed(3);
      }

      return 'dragging';
    };

    const end = (cancelled: boolean) => {
      if (!activeDrag) return;

      const threshold = Math.min(84, maxOffset * 0.25);
      let nextExpanded = wasExpanded;
      if (!cancelled) {
        if (velocityY < -0.32) {
          nextExpanded = true;
        } else if (velocityY > 0.32) {
          nextExpanded = false;
        } else if (wasExpanded) {
          nextExpanded = currentOffset <= threshold;
        } else {
          nextExpanded = currentOffset <= maxOffset - threshold;
        }
      }

      sheet.style.transition = '';
      if (scrimRef.current) {
        scrimRef.current.style.transition = '';
      }

      // Lock current dragged transform as transition start frame before restoring class state
      void sheet.offsetHeight;

      sheet.style.transform = '';
      if (scrimRef.current) {
        scrimRef.current.style.opacity = '';
      }

      setIsMobileExpanded(nextExpanded);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 90);
    };

    return { move, end };
  }, []);

  // Pointer drag on Handle / Header Bar / Mode Switcher bar
  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('input, textarea, select')) return;

      cleanupDragRef.current?.();
      const session = createDragSession(e.clientY, e.clientX);
      if (!session) return;

      const pointerId = e.pointerId;
      let finished = false;

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        if (cleanupDragRef.current === cleanup) {
          cleanupDragRef.current = null;
        }
      };

      const onPointerMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || finished) return;
        const status = session.move(ev.clientY, ev.clientX);
        if (status === 'cancel') {
          finished = true;
          cleanup();
        }
      };

      const onPointerUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || finished) return;
        finished = true;
        cleanup();
        session.end(false);
      };

      const onPointerCancel = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || finished) return;
        finished = true;
        cleanup();
        session.end(true);
      };

      cleanupDragRef.current = cleanup;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    },
    [createDragSession]
  );

  // Pull down smoothly from top of scrollable Menu body when scrolled to top
  useEffect(() => {
    const scrollEl = scrollContentRef.current;
    if (!scrollEl) return;

    let activeTouchId: number | null = null;
    let startY = 0;
    let startX = 0;
    let abandoned = false;
    let session: ReturnType<typeof createDragSession> = null;

    const findTouch = (touches: TouchList, id: number): Touch | null => {
      for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === id) return touches[i];
      }
      return null;
    };

    const onTouchStart = (ev: TouchEvent) => {
      if (!isMobileExpandedRef.current || ev.touches.length !== 1) return;
      const targetEl = ev.target as HTMLElement | null;
      if (targetEl?.closest('input, textarea, select')) return;
      if (scrollEl.scrollTop > 1) return;

      const touch = ev.touches[0];
      activeTouchId = touch.identifier;
      startY = touch.clientY;
      startX = touch.clientX;
      abandoned = false;
      session = null;
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (activeTouchId === null || abandoned) return;
      const touch = findTouch(ev.touches, activeTouchId);
      if (!touch) return;

      if (!session) {
        if (!isMobileExpandedRef.current || scrollEl.scrollTop > 1) {
          abandoned = true;
          return;
        }
        const dy = touch.clientY - startY;
        const dx = touch.clientX - startX;
        if (Math.abs(dy) < 7 && Math.abs(dx) < 7) return;
        if (dy < 0 || Math.abs(dx) > Math.abs(dy) * 1.15) {
          abandoned = true;
          return;
        }
        session = createDragSession(touch.clientY, touch.clientX);
        if (!session) {
          abandoned = true;
          return;
        }
      }

      const status = session.move(touch.clientY, touch.clientX);
      if (status === 'dragging' && ev.cancelable) {
        ev.preventDefault();
      } else if (status === 'cancel') {
        abandoned = true;
        session = null;
      }
    };

    const onTouchEndOrCancel = (ev: TouchEvent) => {
      if (activeTouchId === null) return;
      if (findTouch(ev.touches, activeTouchId)) return;
      activeTouchId = null;
      if (session) {
        session.end(ev.type === 'touchcancel');
        session = null;
      }
    };

    scrollEl.addEventListener('touchstart', onTouchStart, { passive: true });
    scrollEl.addEventListener('touchmove', onTouchMove, { passive: false });
    scrollEl.addEventListener('touchend', onTouchEndOrCancel, { passive: true });
    scrollEl.addEventListener('touchcancel', onTouchEndOrCancel, { passive: true });

    return () => {
      scrollEl.removeEventListener('touchstart', onTouchStart);
      scrollEl.removeEventListener('touchmove', onTouchMove);
      scrollEl.removeEventListener('touchend', onTouchEndOrCancel);
      scrollEl.removeEventListener('touchcancel', onTouchEndOrCancel);
    };
  }, [createDragSession]);

  useEffect(() => {
    return () => {
      cleanupDragRef.current?.();
    };
  }, []);

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
        <div className="flex-1 overflow-y-auto overscroll-y-contain scroll-smooth p-3.5 space-y-3 bg-white dark:bg-slate-900">
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

      {/* Mobile Scrim (Always mounted for smooth opacity fade + real-time drag sync) */}
      <div
        ref={scrimRef}
        aria-hidden="true"
        onClick={() => setIsMobileExpanded(false)}
        className={`md:hidden fixed inset-0 bg-slate-950/35 z-[35] ui-scrim-fade ${
          isMobileExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Mobile Collapsible & Slidable Bottom Sheet Panel */}
      <div
        ref={sheetRef}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 ui-sheet-slide ${
          isMobileExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-4.25rem)]'
        }`}
      >
        <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-t-2xl border-t border-slate-200 dark:border-slate-700 shadow-[0_-8px_30px_rgba(15,23,42,0.16)] dark:shadow-[0_-10px_32px_rgba(0,0,0,0.55)] overflow-hidden max-h-[82vh] flex flex-col">
          {/* Draggable Dock Header Wrapper (68px / 4.25rem) */}
          <div
            ref={dockHeaderRef}
            onPointerDown={handleHeaderPointerDown}
            className="touch-none select-none bg-white dark:bg-slate-900 cursor-grab active:cursor-grabbing shrink-0"
          >
            {/* Interactive Slide Handle Indicator */}
            <button
              type="button"
              onClick={() => setIsMobileExpanded((open) => !open)}
              aria-expanded={isMobileExpanded}
              aria-label={isMobileExpanded ? 'Geser atau ketuk untuk menutup menu' : 'Geser atau ketuk untuk membuka menu'}
              className="group w-full flex justify-center pt-2.5 pb-1 bg-white dark:bg-slate-900 ui-focus-ring"
            >
              <span className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 transition-all duration-150 group-hover:bg-[#fc4c02] group-active:w-12" />
            </button>

            {/* Mobile Docked Bar Header */}
            <div className="px-3 pb-2.5 pt-0.5 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
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
          </div>

          {/* Mobile Mode Switcher + Dark Theme Toggle */}
          <div
            onPointerDown={handleHeaderPointerDown}
            className="touch-none select-none flex items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 shrink-0"
          >
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
          <div
            ref={scrollContentRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scroll-smooth p-4 space-y-3"
          >
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
