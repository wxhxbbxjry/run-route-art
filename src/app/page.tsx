'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  LatLng,
  Waypoint,
  RouteData,
  RouteMode,
  TileLayerId,
  UnitSystem,
  GeneratedRouteResult,
} from '@/lib/types';
import { loadStravaDarkStyle } from '@/lib/layers';
import {
  fetchSmartManualRoute,
  buildRouteData,
  snapWaypointToVehicleRoad,
  generateSingleBestRoute,
} from '@/lib/osrm';
import {
  calculatePolylineDistance,
  findClosestPointOnPolyline,
  getInsertionIndexForSegment,
} from '@/lib/geo';
import {
  checkObvitnasViolation,
  pushOutOfObvitnas,
  routeHasObvitnasViolation,
} from '@/lib/obvitnas';

import Sidebar from '@/components/UI/Sidebar';
import StatsHud from '@/components/UI/StatsHud';
import ExportModal from '@/components/UI/ExportModal';
import Toast, { ToastMessage } from '@/components/UI/Toast';
import MobileTopHud from '@/components/UI/MobileTopHud';
import SavedRoutesModal from '@/components/UI/SavedRoutesModal';

// Dynamically import Vector/Raster Map with SSR disabled
const RouteMap = dynamic(() => import('@/components/Map/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-primary)] gap-3">
      <div className="w-10 h-10 border-[3px] border-[#fc4c02] border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-bold text-[var(--text-secondary)]">
        Memuat Peta &amp; Engine Routing...
      </span>
    </div>
  ),
});

const DEFAULT_CENTER: LatLng = {
  lat: -6.2088,
  lng: 106.822, // Sudirman - Semanggi - GBK runner corridor default
};

function makeGenKey(start: LatLng, distKm: number): string {
  return `${start.lat.toFixed(4)}:${start.lng.toFixed(4)}|${distKm}`;
}

export default function HomePage() {
  // Navigation & Night Map Defaults (Dark Mode Only)
  const [currentMode, setCurrentMode] = useState<RouteMode>('manual');
  const [selectedTile, setSelectedTile] = useState<TileLayerId>('strava-dark');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('km');
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [flyToLocation, setFlyToLocation] = useState<LatLng | null>(null);
  const [userGpsLocation, setUserGpsLocation] = useState<LatLng | null>(null);
  const [fitTrigger, setFitTrigger] = useState<number>(0);

  const hasManualLoopStartRef = useRef<boolean>(false);
  const hasUserMapInteractionRef = useRef<boolean>(false);

  // Prefetch Night View vector style immediately while MapLibre JS chunk initializes
  useEffect(() => {
    void loadStravaDarkStyle();
  }, []);

  // 1. ISOLATED STATE: Manual Tap Mode (Smart Road Snap, Contraflow & Alley/Private avoidance are always mandatory)
  const [manualWaypoints, setManualWaypoints] = useState<Waypoint[]>([]);
  const [manualRouteData, setManualRouteData] = useState<RouteData | null>(null);
  const [manualRedoStack, setManualRedoStack] = useState<Waypoint[][]>([]);
  const [isManualRouteClosed, setIsManualRouteClosed] = useState<boolean>(false);
  const manualWaypointsRef = useRef<Waypoint[]>([]);
  const manualRouteSeqRef = useRef<number>(0);

  const commitManualWaypoints = useCallback((wps: Waypoint[]) => {
    manualWaypointsRef.current = wps;
    setManualWaypoints(wps);
  }, []);

  // 2. ISOLATED STATE: Single-Route Generator Mode (Closed Loop Only)
  const [loopStartLocation, setLoopStartLocation] = useState<LatLng | null>(DEFAULT_CENTER);
  const [targetDistanceKm, setTargetDistanceKm] = useState<number>(10);
  const [generatedRoute, setGeneratedRoute] = useState<GeneratedRouteResult | null>(null);
  const [undoVersion, setUndoVersion] = useState<number>(0);

  const seedOffsetRef = useRef<number>(0);
  const generatorAbortRef = useRef<AbortController | null>(null);
  const shownFallbackNoticeRef = useRef<boolean>(false);
  const generationKeyRef = useRef<string>('');
  const anchorEditSeqRef = useRef<number>(0);
  const recentGeneratedCoordsRef = useRef<LatLng[][]>([]);
  const routeEditHistoryRef = useRef<
    Array<{
      anchors: LatLng[];
      anchorIndices: number[];
      routeData: RouteData;
      isEdited: boolean;
    }>
  >([]);

  // Cleanup active AbortController & toast timers on unmount
  useEffect(() => {
    return () => {
      generatorAbortRef.current?.abort();
    };
  }, []);

  // Reset history cache when target config changes
  useEffect(() => {
    recentGeneratedCoordsRef.current = [];
    seedOffsetRef.current = 0;
  }, [loopStartLocation, targetDistanceKm]);

  // Auto-detect GPS position silently on app startup
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const detected: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserGpsLocation(detected);
        if (!hasManualLoopStartRef.current) {
          setLoopStartLocation(detected);
        }
        if (!hasUserMapInteractionRef.current) {
          setFlyToLocation(detected);
        }
      },
      () => {
        // Fall back silently to default center when GPS is blocked or unavailable
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
    );
  }, []);

  // Stats & Pace HUD
  const [paceSeconds, setPaceSeconds] = useState<number>(360); // 6:00 / km
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isSavedRoutesOpen, setIsSavedRoutesOpen] = useState<boolean>(false);

  // Discrete non-intrusive notifications (max 2, deduped, auto-dismiss 2.6s-3.6s)
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((tid) => window.clearTimeout(tid));
      timers.clear();
    };
  }, []);

  const removeToast = useCallback((id: string) => {
    const tid = toastTimersRef.current.get(id);
    if (tid !== undefined) {
      window.clearTimeout(tid);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const durationMs = type === 'warning' || type === 'error' ? 4200 : 3500;

      setToasts((prev) => {
        const removed = prev.filter((t) => t.title === title);
        removed.forEach((t) => {
          const oldTid = toastTimersRef.current.get(t.id);
          if (oldTid !== undefined) {
            window.clearTimeout(oldTid);
            toastTimersRef.current.delete(t.id);
          }
        });
        const kept = prev.filter((t) => t.title !== title);
        if (kept.length >= 2) {
          const dropped = kept.slice(0, kept.length - 1);
          dropped.forEach((t) => {
            const oldTid = toastTimersRef.current.get(t.id);
            if (oldTid !== undefined) {
              window.clearTimeout(oldTid);
              toastTimersRef.current.delete(t.id);
            }
          });
          return [...kept.slice(-1), { id, type, title, description }];
        }
        return [...kept, { id, type, title, description }];
      });

      const timerId = window.setTimeout(() => {
        toastTimersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
      toastTimersRef.current.set(id, timerId);
    },
    []
  );

  // Mode-isolated active states (Manual Tap & Single-Route Generator)
  const activeWaypoints =
    currentMode === 'manual'
      ? manualWaypoints
      : generatedRoute
      ? generatedRoute.routeData.waypoints
      : loopStartLocation
      ? [
          {
            id: 'loop-preview-start',
            lat: loopStartLocation.lat,
            lng: loopStartLocation.lng,
            name: 'Start / Finish',
          },
        ]
      : [];

  const activeRouteData =
    currentMode === 'manual'
      ? manualRouteData
      : generatedRoute
      ? generatedRoute.routeData
      : null;

  const activeEditableAnchors =
    currentMode === 'random' && generatedRoute ? generatedRoute.anchors : [];

  const canUndoEdit =
    undoVersion >= 0 && Boolean(generatedRoute && routeEditHistoryRef.current.length > 0);

  const recomputeManualRoute = useCallback(
    async (nextWaypoints: Waypoint[]) => {
      const seq = ++manualRouteSeqRef.current;

      if (nextWaypoints.length === 0) {
        setIsLoadingRoute(false);
        setManualRouteData(null);
        return;
      }

      if (nextWaypoints.length === 1) {
        setManualRouteData(null);
        const snapped = await snapWaypointToVehicleRoad(nextWaypoints[0]);
        if (manualRouteSeqRef.current !== seq) return;
        const aligned = [{ ...nextWaypoints[0], lat: snapped.lat, lng: snapped.lng }];
        commitManualWaypoints(aligned);
        return;
      }

      setIsLoadingRoute(true);
      const result = await fetchSmartManualRoute(nextWaypoints, true, true, true);
      if (manualRouteSeqRef.current !== seq) return;
      setIsLoadingRoute(false);

      const alignedWaypoints =
        result.snappedWaypoints && result.snappedWaypoints.length === nextWaypoints.length
          ? nextWaypoints.map((wp, idx) => ({
              ...wp,
              lat: result.snappedWaypoints![idx].lat,
              lng: result.snappedWaypoints![idx].lng,
            }))
          : nextWaypoints;

      commitManualWaypoints(alignedWaypoints);
      setManualRouteData(buildRouteData(alignedWaypoints, result, 'manual'));
    },
    [commitManualWaypoints]
  );

  // Cancel any in-flight route generation
  const cancelAllGeneratorWork = useCallback(() => {
    if (generatorAbortRef.current) {
      generatorAbortRef.current.abort();
      generatorAbortRef.current = null;
    }
  }, []);

  // Handle Map Clicks based on active mode
  const handleMapClick = useCallback(
    async (clickedLatLng: LatLng) => {
      hasUserMapInteractionRef.current = true;

      if (currentMode === 'manual' && isManualRouteClosed) {
        return;
      }

      // Check Objek Vital Nasional violation
      const obvCheck = checkObvitnasViolation(clickedLatLng);
      let effectiveLatLng = clickedLatLng;
      if (obvCheck.isRestricted && obvCheck.zone) {
        addToast(
          'error',
          'Objek Vital Nasional',
          `${obvCheck.zone.name} (${obvCheck.zone.sectorName}) adalah area steril terbatas. Titik otomatis dialihkan ke ring luar jalan umum.`
        );
        effectiveLatLng = pushOutOfObvitnas(clickedLatLng);
      }

      if (currentMode === 'manual') {
        const curWaypoints = manualWaypointsRef.current;
        setManualRedoStack([]);
        const newWaypoint: Waypoint = {
          id: `wp-${Date.now()}-${curWaypoints.length + 1}`,
          lat: effectiveLatLng.lat,
          lng: effectiveLatLng.lng,
          name: `Point ${curWaypoints.length + 1}`,
        };

        const updatedWaypoints = [...curWaypoints, newWaypoint];
        commitManualWaypoints(updatedWaypoints);
        await recomputeManualRoute(updatedWaypoints);
      } else if (currentMode === 'random') {
        hasManualLoopStartRef.current = true;
        cancelAllGeneratorWork();
        routeEditHistoryRef.current = [];
        recentGeneratedCoordsRef.current = [];
        setGeneratedRoute(null);
        setUndoVersion((v) => v + 1);
        setLoopStartLocation(effectiveLatLng);
      }
    },
    [
      currentMode,
      isManualRouteClosed,
      commitManualWaypoints,
      recomputeManualRoute,
      cancelAllGeneratorWork,
      addToast,
    ]
  );

  // Generator: Generate 1 highest-accuracy Car/Motor compliant loop route
  const handleGenerateRoute = useCallback(
    async (overrideStart?: LatLng, explicitSeedOffset?: number) => {
      const start = overrideStart ?? loopStartLocation;
      if (!start) {
        addToast('warning', 'Pilih Lokasi Awal', 'Klik pada peta untuk menentukan titik start.');
        return;
      }

      cancelAllGeneratorWork();

      const isReRoll = explicitSeedOffset !== undefined;
      const seed = isReRoll ? explicitSeedOffset : 0;
      seedOffsetRef.current = seed;

      if (!isReRoll) {
        recentGeneratedCoordsRef.current = [];
      }

      const key = makeGenKey(start, targetDistanceKm);
      generationKeyRef.current = key;

      const controller = new AbortController();
      generatorAbortRef.current = controller;

      setIsLoadingRoute(true);

      try {
        const res = await generateSingleBestRoute({
          start,
          targetKm: targetDistanceKm,
          existingRoutes: isReRoll ? recentGeneratedCoordsRef.current : [],
          seedOffset: seed,
          signal: controller.signal,
        });

        if (controller.signal.aborted || generationKeyRef.current !== key) return;

        setIsLoadingRoute(false);
        routeEditHistoryRef.current = [];
        setUndoVersion((v) => v + 1);
        setGeneratedRoute(res.route);
        setFitTrigger((n) => n + 1);

        if (res.usedFallback) {
          if (!shownFallbackNoticeRef.current) {
            shownFallbackNoticeRef.current = true;
            addToast(
              'info',
              'Mode Routing Cadangan Aktif',
              'Valhalla sibuk, memakai jaringan jalan kendaraan cadangan.'
            );
          }
        } else {
          shownFallbackNoticeRef.current = false;
        }

        if (res.route) {
          recentGeneratedCoordsRef.current = [
            ...recentGeneratedCoordsRef.current.slice(-3),
            res.route.routeData.coordinates,
          ];
        } else {
          addToast(
            'warning',
            'Rute Tidak Ditemukan',
            'Geser titik start ke jalan raya terdekat atau ubah target jarak.'
          );
        }
      } catch {
        if (!controller.signal.aborted) {
          setIsLoadingRoute(false);
          addToast('error', 'Gagal Menghitung Rute', 'Periksa koneksi atau coba beberapa saat lagi.');
        }
      }
    },
    [
      loopStartLocation,
      targetDistanceKm,
      cancelAllGeneratorWork,
      addToast,
    ]
  );

  // Helper: surgically re-route only the edited adjacent legs (2-3 anchors)
  const spliceGeneratedSubroute = useCallback(
    async (
      current: GeneratedRouteResult,
      params: {
        subWaypoints: LatLng[];
        leftAnchorIdx: number;
        rightAnchorIdx: number;
        nextAnchors: LatLng[];
        midSlotInNext: number | null;
        mode: 'drag' | 'insert' | 'delete';
      }
    ) => {
      const {
        subWaypoints,
        leftAnchorIdx,
        rightAnchorIdx,
        nextAnchors,
        midSlotInNext,
        mode,
      } = params;

      const seq = ++anchorEditSeqRef.current;

      const snapshot = {
        anchors: current.anchors,
        anchorIndices: current.anchorIndices,
        routeData: current.routeData,
        isEdited: current.isEdited,
      };

      const coords = current.routeData.coordinates;
      const oldIndices = current.anchorIndices;
      const startCoordIdx = Math.max(
        0,
        Math.min(coords.length - 1, oldIndices[leftAnchorIdx] ?? 0)
      );
      const endCoordIdx = Math.max(
        startCoordIdx,
        Math.min(coords.length - 1, oldIndices[rightAnchorIdx] ?? coords.length - 1)
      );

      setIsLoadingRoute(true);
      const res = await fetchSmartManualRoute(subWaypoints, true, true, true);
      if (anchorEditSeqRef.current !== seq) return;
      setIsLoadingRoute(false);

      if (res.coordinates.length < 2) {
        addToast('warning', 'Edit Rute Gagal', 'Jalur kendaraan tidak ditemukan pada titik tersebut.');
        return;
      }

      if (routeHasObvitnasViolation(res.coordinates).hasViolation) {
        addToast(
          'warning',
          'Dekat Zona Steril Obvitnas',
          'Geser titik sedikit keluar agar tetap berada di jalan umum.'
        );
      }

      const alignedAnchors = [...nextAnchors];
      if (midSlotInNext !== null && res.snappedWaypoints && res.snappedWaypoints.length >= 2) {
        alignedAnchors[midSlotInNext] = res.snappedWaypoints[1];
      }

      const prefix = startCoordIdx > 0 ? coords.slice(0, startCoordIdx) : [];
      const mid = res.coordinates;
      const suffix = endCoordIdx + 1 < coords.length ? coords.slice(endCoordIdx + 1) : [];
      const stitchedCoords = [...prefix, ...mid, ...suffix];

      const newSpanEndIdx = prefix.length + mid.length - 1;
      const shiftAfterRight = newSpanEndIdx - endCoordIdx;
      const nextRightIdx =
        mode === 'delete'
          ? leftAnchorIdx + 1
          : rightAnchorIdx + (mode === 'insert' ? 1 : 0);

      const newAnchorIndices: number[] = alignedAnchors.map((_, k) => {
        if (k < leftAnchorIdx) return oldIndices[k] ?? 0;
        if (k === leftAnchorIdx) return prefix.length;
        if (midSlotInNext !== null && k === midSlotInNext) {
          const hit = findClosestPointOnPolyline(mid, alignedAnchors[midSlotInNext]);
          const localIdx = hit
            ? Math.max(1, Math.min(mid.length - 2, hit.segmentIndex))
            : Math.floor(mid.length / 2);
          return prefix.length + localIdx;
        }
        if (k === nextRightIdx) return newSpanEndIdx;
        const origIdx = mode === 'insert' ? k - 1 : mode === 'delete' ? k + 1 : k;
        return Math.max(
          0,
          Math.min(stitchedCoords.length - 1, (oldIndices[origIdx] ?? endCoordIdx) + shiftAfterRight)
        );
      });

      for (let i = 1; i < newAnchorIndices.length; i++) {
        if (newAnchorIndices[i] <= newAnchorIndices[i - 1]) {
          newAnchorIndices[i] = Math.min(stitchedCoords.length - 1, newAnchorIndices[i - 1] + 1);
        }
      }

      const stitchedDistanceKm = calculatePolylineDistance(stitchedCoords);

      const updatedWaypoints: Waypoint[] = [
        {
          id: 'start-point',
          lat: stitchedCoords[0].lat,
          lng: stitchedCoords[0].lng,
          name: 'Start / Finish',
        },
      ];

      const updatedRouteData = buildRouteData(
        updatedWaypoints,
        {
          ...res,
          coordinates: stitchedCoords,
          distanceKm: stitchedDistanceKm,
        },
        'random',
        targetDistanceKm
      );

      routeEditHistoryRef.current.push(snapshot);
      setUndoVersion((v) => v + 1);

      setGeneratedRoute((prev) =>
        prev && prev.id === current.id
          ? {
              ...prev,
              anchors: alignedAnchors,
              anchorIndices: newAnchorIndices,
              routeData: updatedRouteData,
              isEdited: true,
            }
          : prev
      );
    },
    [targetDistanceKm, addToast]
  );

  // Interactive Anchor Drag in Generator Mode
  const handleAnchorDrag = useCallback(
    async (index: number, newPos: LatLng) => {
      hasUserMapInteractionRef.current = true;
      const obvCheck = checkObvitnasViolation(newPos);
      let effectivePos = newPos;
      if (obvCheck.isRestricted && obvCheck.zone) {
        addToast(
          'error',
          'Objek Vital Nasional',
          `Titik berada di zona ${obvCheck.zone.name}. Dialihkan ke jalan luar.`
        );
        effectivePos = pushOutOfObvitnas(newPos);
      }

      if (index === 0 || !generatedRoute || generatedRoute.anchors.length < 3) {
        hasManualLoopStartRef.current = true;
        setLoopStartLocation(effectivePos);
        await handleGenerateRoute(effectivePos);
        return;
      }

      const anchors = generatedRoute.anchors;
      const safeIdx = Math.min(anchors.length - 2, Math.max(1, index));
      const nextAnchors = anchors.map((a, i) => (i === safeIdx ? effectivePos : a));
      await spliceGeneratedSubroute(generatedRoute, {
        subWaypoints: [anchors[safeIdx - 1], effectivePos, anchors[safeIdx + 1]],
        leftAnchorIdx: safeIdx - 1,
        rightAnchorIdx: safeIdx + 1,
        nextAnchors,
        midSlotInNext: safeIdx,
        mode: 'drag',
      });
    },
    [generatedRoute, handleGenerateRoute, spliceGeneratedSubroute, addToast]
  );

  // Click route line in Generator Mode -> insert new anchor at segment & bend path
  const handleAnchorInsert = useCallback(
    async (clickedLatLng: LatLng) => {
      if (!generatedRoute || generatedRoute.anchors.length < 2) return;
      hasUserMapInteractionRef.current = true;
      const obvCheck = checkObvitnasViolation(clickedLatLng);
      const effectivePos = obvCheck.isRestricted
        ? pushOutOfObvitnas(clickedLatLng)
        : clickedLatLng;

      const hit = findClosestPointOnPolyline(
        generatedRoute.routeData.coordinates,
        effectivePos
      );
      if (!hit) return;

      const rawInsertAt = getInsertionIndexForSegment(
        generatedRoute.anchorIndices,
        hit.segmentIndex
      );
      const insertAt = Math.max(
        1,
        Math.min(generatedRoute.anchors.length - 1, rawInsertAt)
      );

      const anchors = generatedRoute.anchors;
      const nextAnchors = [
        ...anchors.slice(0, insertAt),
        effectivePos,
        ...anchors.slice(insertAt),
      ];
      await spliceGeneratedSubroute(generatedRoute, {
        subWaypoints: [anchors[insertAt - 1], effectivePos, anchors[insertAt]],
        leftAnchorIdx: insertAt - 1,
        rightAnchorIdx: insertAt,
        nextAnchors,
        midSlotInNext: insertAt,
        mode: 'insert',
      });
    },
    [generatedRoute, spliceGeneratedSubroute]
  );

  // Click/Right-click intermediate anchor dot in Generator Mode -> remove anchor
  const handleAnchorDelete = useCallback(
    async (index: number) => {
      if (!generatedRoute) return;
      const anchors = generatedRoute.anchors;
      if (index <= 0 || index >= anchors.length - 1 || anchors.length <= 3) {
        return;
      }
      const nextAnchors = anchors.filter((_, i) => i !== index);
      await spliceGeneratedSubroute(generatedRoute, {
        subWaypoints: [anchors[index - 1], anchors[index + 1]],
        leftAnchorIdx: index - 1,
        rightAnchorIdx: index + 1,
        nextAnchors,
        midSlotInNext: null,
        mode: 'delete',
      });
    },
    [generatedRoute, spliceGeneratedSubroute]
  );

  // Undo Edit on generated route
  const handleUndoRouteEdit = useCallback(() => {
    if (!generatedRoute) return;
    const stack = routeEditHistoryRef.current;
    if (stack.length === 0) return;

    const prevSnap = stack.pop()!;
    setUndoVersion((v) => v + 1);

    setGeneratedRoute((prev) =>
      prev
        ? {
            ...prev,
            anchors: prevSnap.anchors,
            anchorIndices: prevSnap.anchorIndices,
            routeData: prevSnap.routeData,
            isEdited: prevSnap.isEdited,
          }
        : prev
    );
  }, [generatedRoute]);

  // Manual & Preview Start Pin Drag
  const handleWaypointDrag = useCallback(
    async (index: number, newPos: LatLng) => {
      hasUserMapInteractionRef.current = true;

      if (currentMode === 'manual' && isManualRouteClosed) {
        return;
      }

      // Check Objek Vital Nasional violation
      const obvCheck = checkObvitnasViolation(newPos);
      let effectivePos = newPos;
      if (obvCheck.isRestricted && obvCheck.zone) {
        addToast(
          'error',
          'Objek Vital Nasional',
          `Titik berada di dalam zona ${obvCheck.zone.name}. Dialihkan ke batas jalan luar.`
        );
        effectivePos = pushOutOfObvitnas(newPos);
      }

      if (currentMode === 'manual') {
        const curWaypoints = manualWaypointsRef.current;
        const updated = [...curWaypoints];
        const isClosed =
          updated.length > 2 &&
          Math.abs(updated[0].lat - updated[updated.length - 1].lat) < 0.0001 &&
          Math.abs(updated[0].lng - updated[updated.length - 1].lng) < 0.0001;

        if (index === 0 && isClosed) {
          updated[0] = { ...updated[0], lat: effectivePos.lat, lng: effectivePos.lng };
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            lat: effectivePos.lat,
            lng: effectivePos.lng,
          };
        } else {
          updated[index] = {
            ...updated[index],
            lat: effectivePos.lat,
            lng: effectivePos.lng,
          };
        }

        commitManualWaypoints(updated);
        setManualRedoStack([]);
        await recomputeManualRoute(updated);
      } else if (currentMode === 'random') {
        hasManualLoopStartRef.current = true;
        setLoopStartLocation(effectivePos);
        await handleGenerateRoute(effectivePos);
      }
    },
    [
      currentMode,
      isManualRouteClosed,
      commitManualWaypoints,
      recomputeManualRoute,
      handleGenerateRoute,
      addToast,
    ]
  );

  // Manual Mode: Delete Single Waypoint
  const handleWaypointDelete = useCallback(
    async (index: number) => {
      if (currentMode !== 'manual' || isManualRouteClosed) return;
      const curWaypoints = manualWaypointsRef.current;
      setManualRedoStack((prev) => [...prev, curWaypoints]);
      const updated = curWaypoints.filter((_, idx) => idx !== index);
      commitManualWaypoints(updated);
      await recomputeManualRoute(updated);
    },
    [currentMode, isManualRouteClosed, commitManualWaypoints, recomputeManualRoute]
  );

  // Manual Mode: Undo
  const handleUndoManualWaypoint = useCallback(async () => {
    if (isManualRouteClosed) return;
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length === 0) return;
    setManualRedoStack((prev) => [...prev, curWaypoints]);
    const updated = curWaypoints.slice(0, -1);
    commitManualWaypoints(updated);
    await recomputeManualRoute(updated);
  }, [isManualRouteClosed, commitManualWaypoints, recomputeManualRoute]);

  // Manual Mode: Redo
  const handleRedoManualWaypoint = useCallback(async () => {
    if (isManualRouteClosed || manualRedoStack.length === 0) return;
    const nextWaypoints = manualRedoStack[manualRedoStack.length - 1];
    setManualRedoStack((prev) => prev.slice(0, -1));
    commitManualWaypoints(nextWaypoints);
    await recomputeManualRoute(nextWaypoints);
  }, [isManualRouteClosed, manualRedoStack, commitManualWaypoints, recomputeManualRoute]);

  // Manual Mode: Out & Back
  const handleOutAndBack = useCallback(async () => {
    if (isManualRouteClosed) return;
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length < 2) return;
    setManualRedoStack((prev) => [...prev, curWaypoints]);

    const returnPoints = curWaypoints
      .slice(0, -1)
      .reverse()
      .map((wp, idx) => ({
        id: `wp-return-${Date.now()}-${idx}`,
        lat: wp.lat,
        lng: wp.lng,
        name: `Return ${wp.name}`,
      }));

    const combined = [...curWaypoints, ...returnPoints];
    commitManualWaypoints(combined);
    await recomputeManualRoute(combined);
  }, [isManualRouteClosed, commitManualWaypoints, recomputeManualRoute]);

  // Manual Mode: Finish / Close Route Selection
  const handleFinishManualRoute = useCallback(() => {
    if (manualWaypointsRef.current.length < 2) return;
    setIsManualRouteClosed(true);
  }, []);

  // Manual Mode: Reopen Route Selection to continue editing
  const handleReopenManualRoute = useCallback(() => {
    setIsManualRouteClosed(false);
  }, []);

  // Manual Mode: Clear
  const handleClearManualWaypoints = useCallback(() => {
    manualRouteSeqRef.current++;
    setIsLoadingRoute(false);
    setIsManualRouteClosed(false);
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length > 0) {
      setManualRedoStack((prev) => [...prev, curWaypoints]);
    }
    commitManualWaypoints([]);
    setManualRouteData(null);
  }, [commitManualWaypoints]);

  // Manual Mode: Close Loop
  const handleCloseManualLoop = useCallback(async () => {
    if (isManualRouteClosed) return;
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length < 2) return;
    setManualRedoStack((prev) => [...prev, curWaypoints]);
    const startPoint = curWaypoints[0];
    const closedWaypoints = [
      ...curWaypoints,
      {
        id: `wp-${Date.now()}-finish`,
        lat: startPoint.lat,
        lng: startPoint.lng,
        name: 'Finish Loop',
      },
    ];

    commitManualWaypoints(closedWaypoints);
    await recomputeManualRoute(closedWaypoints);
  }, [isManualRouteClosed, commitManualWaypoints, recomputeManualRoute]);

  // Manual Mode: Reverse Route
  const handleReverseManualRoute = useCallback(async () => {
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length < 2) return;
    setManualRedoStack((prev) => [...prev, curWaypoints]);
    const reversed = [...curWaypoints].reverse();
    commitManualWaypoints(reversed);
    await recomputeManualRoute(reversed);
  }, [commitManualWaypoints, recomputeManualRoute]);

  // Generator: Re-roll (shift seedOffset to discover a non-overlapping fresh corridor)
  const handleReRollLoop = useCallback(() => {
    const nextSeed = seedOffsetRef.current + 1;
    void handleGenerateRoute(undefined, nextSeed);
  }, [handleGenerateRoute]);

  // Generator: Reset active route & target defaults
  const handleResetLoop = useCallback(() => {
    cancelAllGeneratorWork();
    seedOffsetRef.current = 0;
    generationKeyRef.current = '';
    recentGeneratedCoordsRef.current = [];
    routeEditHistoryRef.current = [];
    setUndoVersion((v) => v + 1);
    setGeneratedRoute(null);
    setIsLoadingRoute(false);
    setTargetDistanceKm(10);
    hasManualLoopStartRef.current = false;
    setLoopStartLocation(userGpsLocation || DEFAULT_CENTER);
  }, [cancelAllGeneratorWork, userGpsLocation]);

  // Load Imported GPX or Saved Route
  const handleLoadRoute = useCallback(
    (loadedRoute: RouteData) => {
      manualRouteSeqRef.current++;
      setIsLoadingRoute(false);
      hasUserMapInteractionRef.current = true;
      setCurrentMode('manual');
      setIsManualRouteClosed(loadedRoute.waypoints.length >= 2);
      commitManualWaypoints(loadedRoute.waypoints);
      setManualRouteData(loadedRoute);
      setFitTrigger((n) => n + 1);
    },
    [commitManualWaypoints]
  );

  // Geolocation quick helper (Random Loop panel button)
  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      addToast('warning', 'GPS Tidak Tersedia', 'Browser tidak mendukung geolokasi.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        hasUserMapInteractionRef.current = true;
        hasManualLoopStartRef.current = true;
        cancelAllGeneratorWork();
        routeEditHistoryRef.current = [];
        recentGeneratedCoordsRef.current = [];
        setGeneratedRoute(null);
        setUndoVersion((v) => v + 1);
        setUserGpsLocation(userLoc);
        setLoopStartLocation(userLoc);
        setFlyToLocation(userLoc);
      },
      (err) => {
        addToast('warning', 'Gagal Mengambil GPS', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [cancelAllGeneratorWork, addToast]);

  // GPS locate button callback from RouteMap right dock
  const handleMapLocateDetected = useCallback(
    (detected: LatLng) => {
      hasUserMapInteractionRef.current = true;
      setUserGpsLocation(detected);
      if (currentMode === 'random') {
        hasManualLoopStartRef.current = true;
        cancelAllGeneratorWork();
        routeEditHistoryRef.current = [];
        recentGeneratedCoordsRef.current = [];
        setGeneratedRoute(null);
        setUndoVersion((v) => v + 1);
        setLoopStartLocation(detected);
      }
    },
    [currentMode, cancelAllGeneratorWork]
  );

  return (
    <main className="dark relative w-screen h-[100dvh] overflow-hidden flex bg-[#070b14]">
      {/* Mobile Quick Telemetry & Pace Control Bar */}
      <MobileTopHud
        routeData={activeRouteData}
        paceSeconds={paceSeconds}
        onPaceChange={setPaceSeconds}
        unitSystem={unitSystem}
      />

      {/* Interactive Fullscreen Strava-Style Map */}
      <div className="absolute inset-0">
        <RouteMap
          waypoints={activeWaypoints}
          routeData={activeRouteData}
          editableAnchors={activeEditableAnchors}
          requestedStartLocation={currentMode === 'random' ? loopStartLocation : null}
          routeMode={currentMode}
          isManualLocked={isManualRouteClosed}
          selectedTile={selectedTile}
          unitSystem={unitSystem}
          fitTrigger={fitTrigger}
          userLocation={userGpsLocation}
          onTileChange={setSelectedTile}
          onMapClick={handleMapClick}
          onUserLocationDetected={handleMapLocateDetected}
          onLocationError={(msg) => addToast('warning', 'Gagal Mengambil GPS', msg)}
          onWaypointDrag={handleWaypointDrag}
          onWaypointDelete={handleWaypointDelete}
          onAnchorDrag={handleAnchorDrag}
          onAnchorInsert={handleAnchorInsert}
          onAnchorDelete={handleAnchorDelete}
          flyToLocation={flyToLocation}
        />
      </div>

      {/* Floating Route Studio Sidebar & Mobile Bottom Sheet */}
      <Sidebar
        currentMode={currentMode}
        onModeChange={(m) => {
          setCurrentMode(m);
        }}
        waypoints={activeWaypoints}
        routeData={activeRouteData}
        isManualRouteClosed={isManualRouteClosed}
        onFinishManualRoute={handleFinishManualRoute}
        onReopenManualRoute={handleReopenManualRoute}
        onUndoWaypoint={handleUndoManualWaypoint}
        onRedoWaypoint={handleRedoManualWaypoint}
        canRedo={manualRedoStack.length > 0}
        onOutAndBack={handleOutAndBack}
        onClearWaypoints={handleClearManualWaypoints}
        onCloseLoop={handleCloseManualLoop}
        onReverseRoute={handleReverseManualRoute}
        onOpenSavedRoutes={() => setIsSavedRoutesOpen(true)}
        unitSystem={unitSystem}
        onToggleUnit={() => setUnitSystem((u) => (u === 'km' ? 'mi' : 'km'))}
        onOpenExport={() => setIsExportOpen(true)}
        startLocation={loopStartLocation}
        targetDistanceKm={targetDistanceKm}
        onTargetDistanceChange={setTargetDistanceKm}
        onUseMyLocation={handleUseMyLocation}
        onGenerateLoop={() => {
          void handleGenerateRoute();
        }}
        onReRollLoop={handleReRollLoop}
        onResetLoop={handleResetLoop}
        isEdited={Boolean(generatedRoute?.isEdited)}
        canUndoEdit={canUndoEdit}
        onUndoRouteEdit={handleUndoRouteEdit}
        isLoading={isLoadingRoute}
      />

      {/* Top-Center Floating Telemetry Capsule (Desktop) */}
      <div className="hidden md:flex fixed top-4 left-[352px] xl:left-[418px] right-[74px] z-30 justify-center pointer-events-none">
        <StatsHud
          routeData={activeRouteData}
          paceSeconds={paceSeconds}
          onPaceChange={setPaceSeconds}
          onOpenExport={() => setIsExportOpen(true)}
          unitSystem={unitSystem}
          onToggleUnit={() => setUnitSystem((u) => (u === 'km' ? 'mi' : 'km'))}
        />
      </div>

      {/* Export GPX / GeoJSON Modal */}
      {activeRouteData && (
        <ExportModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          routeData={activeRouteData}
          paceSeconds={paceSeconds}
        />
      )}

      {/* Saved Routes & GPX Import Manager Modal */}
      <SavedRoutesModal
        isOpen={isSavedRoutesOpen}
        onClose={() => setIsSavedRoutesOpen(false)}
        currentRouteData={activeRouteData}
        paceSeconds={paceSeconds}
        unitSystem={unitSystem}
        onLoadRoute={handleLoadRoute}
        onAddToast={addToast}
      />

      {/* Toast Notification Container */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </main>
  );
}
