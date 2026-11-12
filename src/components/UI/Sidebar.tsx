'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  RouteMode,
  LatLng,
  Waypoint,
  RouteData,
} from '@/lib/types';
import ManualMode from './ManualMode';
import RandomLoopMode from './RandomLoopMode';
import {
  MousePointerClick,
  Shuffle,
  ChevronUp,
  Route,
  FolderOpen,
  Undo2,
  Download,
  CheckCircle2,
} from 'lucide-react';

interface SidebarProps {
  currentMode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  // Manual mode props
  waypoints: Waypoint[];
  routeData: RouteData | null;
  isManualRouteClosed?: boolean;
  onFinishManualRoute?: () => void;
  onReopenManualRoute?: () => void;
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
  onOpenExport?: () => void;
  // Single-route Generator props (Loop Memutar Only)
  startLocation: LatLng | null;
  targetDistanceKm: number;
  onTargetDistanceChange: (km: number) => void;
  onUseMyLocation: () => void;
  onGenerateLoop: () => void;
  onReRollLoop: () => void;
  onResetLoop: () => void;
  isEdited: boolean;
  canUndoEdit: boolean;
  onUndoRouteEdit: () => void;
  // Common
  isLoading: boolean;
}

export default function Sidebar({
  currentMode,
  onModeChange,
  waypoints,
  routeData,
  isManualRouteClosed = false,
  onFinishManualRoute,
  onReopenManualRoute,
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
  onOpenExport,
  startLocation,
  targetDistanceKm,
  onTargetDistanceChange,
  onUseMyLocation,
  onGenerateLoop,
  onReRollLoop,
  onResetLoop,
  isEdited,
  canUndoEdit,
  onUndoRouteEdit,
  isLoading,
}: SidebarProps) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [dragEndTick, setDragEndTick] = useState(0);
  const isMobileExpandedRef = useRef(isMobileExpanded);
  isMobileExpandedRef.current = isMobileExpanded;

  const sheetRef = useRef<HTMLDivElement>(null);
  const dockHeaderRef = useRef<HTMLDivElement>(null);
  const modeBarRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const suppressTimeoutRef = useRef<number | null>(null);
  const snapPendingRef = useRef<boolean>(false);
  const cleanupDragRef = useRef<(() => void) | null>(null);

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

  useLayoutEffect(() => {
    if (!snapPendingRef.current) return;
    snapPendingRef.current = false;

    const sheet = sheetRef.current;
    const scrim = scrimRef.current;
    if (!sheet) return;

    void sheet.offsetHeight;
    sheet.style.transition = '';
    if (scrim) {
      scrim.style.transition = '';
    }
    void sheet.offsetHeight;

    sheet.style.transform = '';
    if (scrim) {
      scrim.style.opacity = '';
    }
  }, [isMobileExpanded, dragEndTick]);

  const createDragSession = useCallback((startY: number, startX: number, thresholdPx = 4) => {
    const sheet = sheetRef.current;
    const header = dockHeaderRef.current;
    if (!sheet || !header) return null;

    const sheetHeight = sheet.getBoundingClientRect().height;
    const headerHeight = header.getBoundingClientRect().height || 72;
    const maxOffset = Math.max(1, sheetHeight - headerHeight);
    const wasExpanded = isMobileExpandedRef.current;
    const startOffset = wasExpanded ? 0 : maxOffset;

    const samples: Array<{ y: number; t: number }> = [{ y: startY, t: performance.now() }];
    let currentOffset = startOffset;
    let activeDrag = false;

    const move = (clientY: number, clientX: number): 'pending' | 'dragging' | 'cancel' => {
      const dy = clientY - startY;
      const dx = clientX - startX;

      if (!activeDrag) {
        if (Math.abs(dy) < thresholdPx && Math.abs(dx) < thresholdPx) {
          return 'pending';
        }
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          return 'cancel';
        }
        activeDrag = true;
        if (suppressTimeoutRef.current !== null) {
          window.clearTimeout(suppressTimeoutRef.current);
          suppressTimeoutRef.current = null;
        }
        suppressClickRef.current = true;
        sheet.style.transition = 'none';
        if (scrimRef.current) {
          scrimRef.current.style.transition = 'none';
        }
      }

      const now = performance.now();
      samples.push({ y: clientY, t: now });
      while (samples.length > 2 && now - samples[0].t > 90) {
        samples.shift();
      }

      const raw = startOffset + dy;
      let clamped = raw;
      if (raw < 0) {
        clamped = Math.max(-20, raw * 0.18);
      } else if (raw > maxOffset) {
        clamped = Math.min(maxOffset + 12, maxOffset + (raw - maxOffset) * 0.18);
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

      const oldest = samples[0];
      const latest = samples[samples.length - 1];
      const elapsed = Math.max(1, latest.t - oldest.t);
      const velocityY = (latest.y - oldest.y) / elapsed;

      const distanceThreshold = Math.min(48, maxOffset * 0.16);
      let nextExpanded = wasExpanded;
      if (!cancelled) {
        if (velocityY < -0.18) {
          nextExpanded = true;
        } else if (velocityY > 0.18) {
          nextExpanded = false;
        } else if (wasExpanded) {
          nextExpanded = currentOffset <= distanceThreshold;
        } else {
          nextExpanded = currentOffset <= maxOffset - distanceThreshold;
        }
      }

      snapPendingRef.current = true;
      setIsMobileExpanded(nextExpanded);
      setDragEndTick((t) => t + 1);

      suppressTimeoutRef.current = window.setTimeout(() => {
        suppressClickRef.current = false;
        suppressTimeoutRef.current = null;
      }, 120);
    };

    return { move, end, isDragging: () => activeDrag };
  }, []);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('input, textarea, select')) return;

      cleanupDragRef.current?.();
      const session = createDragSession(e.clientY, e.clientX, 5);
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

  useEffect(() => {
    const elements = [dockHeaderRef.current, modeBarRef.current].filter(Boolean) as HTMLDivElement[];
    if (elements.length === 0) return;

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
      if (ev.touches.length !== 1) return;
      const targetEl = ev.target as HTMLElement | null;
      if (targetEl?.closest('input, textarea, select')) return;

      if (suppressTimeoutRef.current !== null) {
        window.clearTimeout(suppressTimeoutRef.current);
        suppressTimeoutRef.current = null;
      }
      suppressClickRef.current = false;

      const touch = ev.touches[0];
      activeTouchId = touch.identifier;
      startY = touch.clientY;
      startX = touch.clientX;
      abandoned = false;
      session = createDragSession(startY, startX, 4);
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (activeTouchId === null || abandoned || !session) return;
      const touch = findTouch(ev.touches, activeTouchId);
      if (!touch) return;

      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if ((Math.abs(dy) >= 2 && Math.abs(dy) >= Math.abs(dx)) || session.isDragging()) {
        if (ev.cancelable) ev.preventDefault();
      }

      const status = session.move(touch.clientY, touch.clientX);
      if (status === 'cancel') {
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

    elements.forEach((el) => {
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEndOrCancel, { passive: true });
      el.addEventListener('touchcancel', onTouchEndOrCancel, { passive: true });
    });

    return () => {
      elements.forEach((el) => {
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', onTouchEndOrCancel);
        el.removeEventListener('touchcancel', onTouchEndOrCancel);
      });
    };
  }, [createDragSession]);

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
        const canScrollInternally = scrollEl.scrollHeight > scrollEl.clientHeight + 2;

        if (dy > 1 && Math.abs(dy) >= Math.abs(dx)) {
          if (ev.cancelable) ev.preventDefault();
        }

        if (Math.abs(dy) < 5 && Math.abs(dx) < 5) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.15) {
          abandoned = true;
          return;
        }
        if (canScrollInternally && dy < 0) {
          abandoned = true;
          return;
        }
        session = createDragSession(touch.clientY, touch.clientX, 0);
        if (!session) {
          abandoned = true;
          return;
        }
      }

      if (ev.cancelable) ev.preventDefault();
      const status = session.move(touch.clientY, touch.clientX);
      if (status === 'cancel') {
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
      if (suppressTimeoutRef.current !== null) {
        window.clearTimeout(suppressTimeoutRef.current);
      }
    };
  }, []);

  const distKm = routeData ? routeData.distanceKm : 0;
  const isMiles = unitSystem === 'mi';
  const displayDist = isMiles ? distKm * 0.621371 : distKm;
  const unitLabel = isMiles ? 'MI' : 'KM';
  const hasExportableRoute = Boolean(routeData && routeData.coordinates.length >= 2);

  return (
    <>
      {/* Desktop Floating Route Studio Rail (Left Side) */}
      <aside className="hidden md:flex flex-col w-[324px] xl:w-[388px] h-[calc(100vh-2rem)] my-4 ml-4 rounded-[22px] cockpit-panel z-30 overflow-hidden shrink-0 text-[var(--text-primary)]">
        {/* Top Kinetic Signal Accent Line */}
        <div
          aria-hidden="true"
          className="h-[3px] w-full bg-gradient-to-r from-[#fc4c02] via-[#ff7b3b] to-[#fc4c02] shrink-0"
        />

        {/* Brand Header */}
        <div className="px-3.5 xl:px-4 py-2.5 xl:py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-2 bg-[var(--surface-solid)]">
          <div className="flex items-center gap-2.5 min-w-0 group cursor-default">
            <div className="w-9 h-9 rounded-xl bg-[#fc4c02] flex items-center justify-center text-white shadow-[0_3px_10px_rgba(252,76,2,0.34)] shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 group-hover:-rotate-3">
              <Route className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg xl:text-xl font-extrabold tracking-tight text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap leading-none">
                <span>RunRoute</span>
                <span className="text-[#fc4c02]">PRO</span>
              </h1>
              <p className="text-[11px] text-[var(--text-muted)] font-medium truncate mt-0.5">
                Perencana Rute
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenSavedRoutes && (
              <button
                type="button"
                onClick={onOpenSavedRoutes}
                title="Kelola Rute Tersimpan & Impor File GPX"
                className="group min-h-[36px] xl:min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[var(--brand-tint)] hover:bg-orange-500/20 text-[var(--brand-ink)] text-xs font-bold flex items-center gap-1.5 border border-[var(--brand-border)] whitespace-nowrap ui-btn-secondary ui-focus-ring"
              >
                <FolderOpen
                  className="w-3.5 h-3.5 text-[#fc4c02] shrink-0 transition-transform duration-150 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
                <span>Rute &amp; GPX</span>
              </button>
            )}
          </div>
        </div>

        {/* Mode Navigation Rail */}
        <div className="px-3.5 xl:px-4 py-2 xl:py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
          <div
            role="tablist"
            aria-label="Mode Pembuatan Rute"
            className="relative grid grid-cols-2 p-1 rounded-xl bg-[var(--surface-well)] border border-[var(--border-subtle)]"
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-[#fc4c02] shadow-[0_2px_8px_rgba(252,76,2,0.32)] transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                currentMode === 'random' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />

            <button
              type="button"
              role="tab"
              aria-selected={currentMode === 'manual'}
              onClick={() => onModeChange('manual')}
              className={`group relative z-10 min-h-[38px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 ui-focus-ring active:scale-[0.97] ${
                currentMode === 'manual'
                  ? 'text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <MousePointerClick
                className="w-4 h-4 transition-transform duration-150 group-hover:scale-110"
                aria-hidden="true"
              />
              <span>Manual Tap</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={currentMode === 'random'}
              onClick={() => onModeChange('random')}
              className={`group relative z-10 min-h-[38px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors duration-150 ui-focus-ring active:scale-[0.97] ${
                currentMode === 'random'
                  ? 'text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Shuffle
                className="w-4 h-4 transition-transform duration-150 group-hover:rotate-12"
                aria-hidden="true"
              />
              <span>Random Loop</span>
            </button>
          </div>
        </div>

        {/* Scrollable Workspace Content */}
        <div className="flex-1 overflow-y-auto overscroll-y-contain scroll-smooth p-3.5 xl:p-4 bg-[var(--surface-solid)]">
          {currentMode === 'manual' && (
            <ManualMode
              key="manual-panel"
              waypoints={waypoints}
              routeData={routeData}
              isRouteClosed={isManualRouteClosed}
              onFinishRoute={onFinishManualRoute || (() => {})}
              onReopenRoute={onReopenManualRoute || (() => {})}
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
              isEdited={isEdited}
              canUndoEdit={canUndoEdit}
              onUndoRouteEdit={onUndoRouteEdit}
              isLoading={isLoading}
              routeData={routeData}
            />
          )}
        </div>

        {/* Compact Verification Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] text-center bg-[var(--surface-subtle)] font-medium">
          OpenFreeMap &bull; Jalur Mobil &amp; Motor &bull; Zona Steril Aktif
        </div>
      </aside>

      {/* Mobile Backdrop Scrim */}
      <div
        ref={scrimRef}
        aria-hidden="true"
        onClick={() => setIsMobileExpanded(false)}
        className={`md:hidden fixed inset-0 bg-slate-950/40 z-[35] ui-scrim-fade ${
          isMobileExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Mobile Smooth-Slidable Bottom Sheet Menu */}
      <div
        ref={sheetRef}
        onClickCapture={(e) => {
          if (suppressClickRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className={`md:hidden fixed inset-x-0 bottom-0 z-40 ui-sheet-slide ${
          isMobileExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-4.5rem)]'
        }`}
      >
        <div className="bg-[var(--surface-solid)] text-[var(--text-primary)] rounded-t-[24px] border-t border-[var(--border-subtle)] shadow-[0_-10px_36px_rgba(15,23,42,0.18)] dark:shadow-[0_-12px_40px_rgba(0,0,0,0.65)] overflow-hidden max-h-[84dvh] flex flex-col">
          {/* Draggable Dock Header (72px / 4.5rem) */}
          <div
            ref={dockHeaderRef}
            onPointerDown={handleHeaderPointerDown}
            className="touch-none [&_*]:touch-none select-none bg-[var(--surface-solid)] cursor-grab active:cursor-grabbing shrink-0"
          >
            {/* Interactive Slide Handle */}
            <button
              type="button"
              onClick={() => setIsMobileExpanded((open) => !open)}
              aria-expanded={isMobileExpanded}
              aria-label={
                isMobileExpanded
                  ? 'Geser ke bawah atau ketuk untuk menutup menu'
                  : 'Geser ke atas atau ketuk untuk membuka menu'
              }
              className="group w-full flex justify-center pt-2 pb-1 bg-[var(--surface-solid)] ui-focus-ring"
            >
              <span className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 transition-all duration-150 group-hover:bg-[#fc4c02] group-active:w-14" />
            </button>

            {/* Mobile Docked Action Bar (>= 44px touch targets & 8px gap) */}
            <div className="px-3 pb-2 pt-0.5 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-solid)]">
              <button
                type="button"
                onClick={() => setIsMobileExpanded((open) => !open)}
                aria-expanded={isMobileExpanded}
                className="flex items-center gap-2.5 flex-1 min-w-0 min-h-[44px] text-left rounded-xl py-0.5 ui-focus-ring active:scale-[0.98] transition-transform"
              >
                <div className="w-9 h-9 rounded-xl bg-[#fc4c02] flex items-center justify-center text-white font-display font-extrabold text-sm shrink-0 shadow-sm">
                  {currentMode === 'random' ? 'L' : 'M'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1">
                    <span className="font-display font-extrabold text-xl text-[#fc4c02] leading-none tabular-nums">
                      {displayDist.toFixed(2)}
                    </span>
                    <span className="font-mono text-[10px] font-bold text-[var(--text-muted)]">
                      {unitLabel}
                    </span>
                  </div>
                  <p
                    className={`text-[11px] font-semibold truncate mt-0.5 ${
                      currentMode === 'manual' && isManualRouteClosed
                        ? 'text-[var(--status-ok-text)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {currentMode === 'random'
                      ? 'Random Loop'
                      : isManualRouteClosed
                      ? 'Rute Selesai'
                      : 'Manual Tap'}
                  </p>
                </div>
              </button>

              <div className="flex items-center gap-1.5 shrink-0">
                {currentMode === 'manual' && !hasExportableRoute && (
                  <button
                    type="button"
                    onClick={onUndoWaypoint}
                    disabled={waypoints.length === 0}
                    aria-label="Undo Titik Terakhir"
                    title="Undo Titik Terakhir"
                    className="w-11 h-11 rounded-xl bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] flex items-center justify-center border border-[var(--border-subtle)] disabled:opacity-40 disabled:pointer-events-none ui-btn-secondary ui-focus-ring"
                  >
                    <Undo2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}

                {currentMode === 'manual' &&
                  hasExportableRoute &&
                  !isManualRouteClosed &&
                  onFinishManualRoute && (
                    <button
                      type="button"
                      onClick={onFinishManualRoute}
                      aria-label="Tutup Rute (Selesaikan Pemilihan)"
                      title="Tutup Rute (Selesaikan Pemilihan)"
                      className="w-11 h-11 rounded-xl bg-[#fc4c02] hover:bg-[#e34402] text-white flex items-center justify-center ui-btn-primary ui-focus-ring"
                    >
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

                {hasExportableRoute && onOpenExport && (
                  <button
                    type="button"
                    onClick={onOpenExport}
                    aria-label="Ekspor GPX atau JSON"
                    title="Ekspor GPX / JSON"
                    className={`w-11 h-11 rounded-xl flex items-center justify-center ui-focus-ring ${
                      currentMode === 'manual' && !isManualRouteClosed
                        ? 'bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] border border-[var(--border-subtle)] ui-btn-secondary'
                        : 'bg-[#fc4c02] hover:bg-[#e34402] text-white ui-btn-primary'
                    }`}
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}

                {onOpenSavedRoutes && (
                  <button
                    type="button"
                    onClick={onOpenSavedRoutes}
                    aria-label="Kelola Rute & Impor GPX"
                    title="Kelola Rute & Impor GPX"
                    className={`min-h-[44px] rounded-xl bg-[var(--brand-tint)] text-[var(--brand-ink)] border border-[var(--brand-border)] text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap ui-btn-secondary ui-focus-ring ${
                      currentMode === 'manual' && hasExportableRoute && !isManualRouteClosed
                        ? 'w-11'
                        : 'px-2.5'
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#fc4c02]" aria-hidden="true" />
                    {!(currentMode === 'manual' && hasExportableRoute && !isManualRouteClosed) && (
                      <span>Rute</span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsMobileExpanded((open) => !open)}
                  aria-expanded={isMobileExpanded}
                  className="min-h-[44px] px-3 rounded-xl bg-[var(--surface-well)] hover:bg-[var(--brand-tint)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-bold flex items-center gap-1 ui-btn-secondary ui-focus-ring"
                >
                  <span>{isMobileExpanded ? 'Tutup' : 'Menu'}</span>
                  <ChevronUp
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isMobileExpanded ? 'rotate-180' : 'rotate-0'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Expanded Header Controls (Mode Switcher + Unit) */}
          <div
            ref={modeBarRef}
            onPointerDown={handleHeaderPointerDown}
            className="touch-none [&_*]:touch-none select-none flex items-center gap-2 px-3 py-2.5 bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] shrink-0 cursor-grab active:cursor-grabbing"
          >
            <div className="relative grid grid-cols-2 p-0.5 rounded-xl bg-[var(--surface-well)] border border-[var(--border-subtle)] flex-1">
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-lg bg-[#fc4c02] shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  currentMode === 'random' ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              <button
                type="button"
                onClick={() => onModeChange('manual')}
                className={`relative z-10 min-h-[40px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                  currentMode === 'manual' ? 'text-white' : 'text-[var(--text-secondary)]'
                }`}
              >
                <MousePointerClick className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Manual Tap</span>
              </button>
              <button
                type="button"
                onClick={() => onModeChange('random')}
                className={`relative z-10 min-h-[40px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                  currentMode === 'random' ? 'text-white' : 'text-[var(--text-secondary)]'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Random Loop</span>
              </button>
            </div>

            {onToggleUnit && (
              <button
                type="button"
                onClick={onToggleUnit}
                title="Ganti satuan KM / Miles"
                aria-label={`Satuan jarak ${unitLabel}, ketuk untuk mengganti`}
                className="min-h-[40px] min-w-[44px] px-2.5 rounded-xl bg-[var(--surface-solid)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-mono font-extrabold shrink-0 ui-btn-secondary ui-focus-ring"
              >
                {unitLabel}
              </button>
            )}
          </div>

          {/* Mobile Scroll Content */}
          <div
            ref={scrollContentRef}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch' || !isMobileExpandedRef.current) return;
              const scrollEl = scrollContentRef.current;
              if (scrollEl) {
                if (scrollEl.scrollTop > 1) return;
                if (e.clientX >= scrollEl.getBoundingClientRect().right - 14) return;
              }
              handleHeaderPointerDown(e);
            }}
            className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain scroll-smooth p-4 pb-6 space-y-3"
          >
            {currentMode === 'manual' && (
              <ManualMode
                waypoints={waypoints}
                routeData={routeData}
                isRouteClosed={isManualRouteClosed}
                onFinishRoute={onFinishManualRoute || (() => {})}
                onReopenRoute={onReopenManualRoute || (() => {})}
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
                isEdited={isEdited}
                canUndoEdit={canUndoEdit}
                onUndoRouteEdit={onUndoRouteEdit}
                isLoading={isLoading}
                routeData={routeData}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
