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
  GeneratorShape,
  GeneratedRouteResult,
} from '@/lib/types';
import { loadStravaOutdoorStyle } from '@/lib/layers';
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

const THEME_STORAGE_KEY = 'runroute_theme_v1';

function makeGenKey(
  start: LatLng,
  distKm: number,
  shape: GeneratorShape
): string {
  return `${start.lat.toFixed(4)}:${start.lng.toFixed(4)}|${distKm}|${shape}`;
}

export default function HomePage() {
  // Navigation & Theme Defaults
  const [currentMode, setCurrentMode] = useState<RouteMode>('manual');
  const [selectedTile, setSelectedTile] = useState<TileLayerId>('strava-outdoor');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('km');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [flyToLocation, setFlyToLocation] = useState<LatLng | null>(null);
  const [userGpsLocation, setUserGpsLocation] = useState<LatLng | null>(null);
  const [fitTrigger, setFitTrigger] = useState<number>(0);

  const hasManualLoopStartRef = useRef<boolean>(false);
  const hasUserMapInteractionRef = useRef<boolean>(false);

  // Sync persisted theme preference & root html dark class
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        setTheme(saved);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  }, []);

  // Prefetch Strava Standard Outdoor vector style immediately while MapLibre JS chunk initializes
  useEffect(() => {
    void loadStravaOutdoorStyle();
  }, []);

  // 1. ISOLATED STATE: Manual Tap Mode (Smart Road Snap, Contraflow & Alley/Private avoidance are always mandatory)
  const [manualWaypoints, setManualWaypoints] = useState<Waypoint[]>([]);
  const [manualRouteData, setManualRouteData] = useState<RouteData | null>(null);
  const [manualRedoStack, setManualRedoStack] = useState<Waypoint[][]>([]);
  const manualWaypointsRef = useRef<Waypoint[]>([]);
  const manualRouteSeqRef = useRef<number>(0);

  const commitManualWaypoints = useCallback((wps: Waypoint[]) => {
    manualWaypointsRef.current = wps;
    setManualWaypoints(wps);
  }, []);

  // 2. ISOLATED STATE: Single-Route Generator Mode (Car/Motor Compliant, Zero Elevation, Zero Saran Rute)
  const [loopStartLocation, setLoopStartLocation] = useState<LatLng | null>(DEFAULT_CENTER);
  const [targetDistanceKm, setTargetDistanceKm] = useState<number>(10);
  const [routeShape, setRouteShape] = useState<GeneratorShape>('loop');
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

  // Cleanup active AbortController on unmount
  useEffect(() => {
    return () => {
      generatorAbortRef.current?.abort();
    };
  }, []);

  // Reset history cache when target config changes
  useEffect(() => {
    recentGeneratedCoordsRef.current = [];
    seedOffsetRef.current = 0;
  }, [loopStartLocation, targetDistanceKm, routeShape]);

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

  // Toasts Feedback
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
        addToast(
          'info',
          'Titik Start Dipilih',
          `Lokasi diatur ke [${effectiveLatLng.lat.toFixed(4)}, ${effectiveLatLng.lng.toFixed(4)}]. Klik Generate Rute.`
        );
      }
    },
    [currentMode, commitManualWaypoints, recomputeManualRoute, cancelAllGeneratorWork, addToast]
  );

  // Generator: Generate 1 highest-accuracy Car/Motor compliant route
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

      const key = makeGenKey(start, targetDistanceKm, routeShape);
      generationKeyRef.current = key;

      const controller = new AbortController();
      generatorAbortRef.current = controller;

      setIsLoadingRoute(true);

      try {
        const res = await generateSingleBestRoute({
          start,
          targetKm: targetDistanceKm,
          shape: routeShape,
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
              'Valhalla sedang sibuk/offline, rute dialihkan cepat ke jaringan jalan mobil & motor cadangan.'
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
          const shapeName = routeShape === 'out_and_back' ? 'Pergi-Pulang' : 'Loop';
          const devPct =
            targetDistanceKm > 0
              ? ((res.route.routeData.distanceKm - targetDistanceKm) / targetDistanceKm) * 100
              : 0;
          const acc = Math.max(0, 100 - Math.abs(devPct)).toFixed(1);
          addToast(
            'success',
            `Rute ${shapeName} Siap!`,
            `${res.route.routeData.distanceKm.toFixed(2)} km (Akurasi ${acc}%)`
          );
        } else {
          addToast(
            'warning',
            'Rute Tidak Ditemukan',
            'Coba geser titik start ke jalan raya terdekat atau sesuaikan target jarak.'
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
      routeShape,
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
        targetDistanceKm,
        {
          shape: current.shape,
        }
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
      addToast('info', 'Anchor Dihapus', `Titik anchor #${index} dihapus dari jalur.`);
    },
    [generatedRoute, spliceGeneratedSubroute, addToast]
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
    addToast('info', 'Edit Dibatalkan', 'Jalur rute dikembalikan ke kondisi sebelumnya.');
  }, [generatedRoute, addToast]);

  // Manual & Preview Start Pin Drag
  const handleWaypointDrag = useCallback(
    async (index: number, newPos: LatLng) => {
      hasUserMapInteractionRef.current = true;

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
    [currentMode, commitManualWaypoints, recomputeManualRoute, handleGenerateRoute, addToast]
  );

  // Manual Mode: Delete Single Waypoint
  const handleWaypointDelete = useCallback(
    async (index: number) => {
      if (currentMode !== 'manual') return;
      const curWaypoints = manualWaypointsRef.current;
      setManualRedoStack((prev) => [...prev, curWaypoints]);
      const updated = curWaypoints.filter((_, idx) => idx !== index);
      commitManualWaypoints(updated);
      addToast('info', 'Waypoint Dihapus', `Waypoint #${index + 1} berhasil dihapus.`);
      await recomputeManualRoute(updated);
    },
    [currentMode, commitManualWaypoints, recomputeManualRoute, addToast]
  );

  // Manual Mode: Undo
  const handleUndoManualWaypoint = useCallback(async () => {
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length === 0) return;
    setManualRedoStack((prev) => [...prev, curWaypoints]);
    const updated = curWaypoints.slice(0, -1);
    commitManualWaypoints(updated);
    await recomputeManualRoute(updated);
  }, [commitManualWaypoints, recomputeManualRoute]);

  // Manual Mode: Redo
  const handleRedoManualWaypoint = useCallback(async () => {
    if (manualRedoStack.length === 0) return;
    const nextWaypoints = manualRedoStack[manualRedoStack.length - 1];
    setManualRedoStack((prev) => prev.slice(0, -1));
    commitManualWaypoints(nextWaypoints);
    await recomputeManualRoute(nextWaypoints);
  }, [manualRedoStack, commitManualWaypoints, recomputeManualRoute]);

  // Manual Mode: Out & Back
  const handleOutAndBack = useCallback(async () => {
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
    addToast('success', 'Rute Bolak-Balik Terbentuk', 'Rute digandakan kembali ke titik asal (Out & Back)!');
  }, [commitManualWaypoints, recomputeManualRoute, addToast]);

  // Manual Mode: Clear
  const handleClearManualWaypoints = useCallback(() => {
    manualRouteSeqRef.current++;
    setIsLoadingRoute(false);
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length > 0) {
      setManualRedoStack((prev) => [...prev, curWaypoints]);
    }
    commitManualWaypoints([]);
    setManualRouteData(null);
    addToast('info', 'Rute Manual Direset', 'Semua titik waypoint telah dihapus.');
  }, [commitManualWaypoints, addToast]);

  // Manual Mode: Close Loop
  const handleCloseManualLoop = useCallback(async () => {
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
    addToast('success', 'Loop Berhasil Ditutup', 'Rute kembali ke titik awal!');
  }, [commitManualWaypoints, recomputeManualRoute, addToast]);

  // Manual Mode: Reverse Route
  const handleReverseManualRoute = useCallback(async () => {
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length < 2) return;
    setManualRedoStack((prev) => [...prev, curWaypoints]);
    const reversed = [...curWaypoints].reverse();
    commitManualWaypoints(reversed);
    await recomputeManualRoute(reversed);
    addToast('info', 'Arah Dibalik', 'Titik awal dan akhir rute telah ditukar.');
  }, [commitManualWaypoints, recomputeManualRoute, addToast]);

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
    setRouteShape('loop');
    hasManualLoopStartRef.current = false;
    setLoopStartLocation(userGpsLocation || DEFAULT_CENTER);
    addToast('info', 'Generator Direset', 'Rute dihapus dan target jarak dikembalikan ke default.');
  }, [cancelAllGeneratorWork, userGpsLocation, addToast]);

  // Load Imported GPX or Saved Route
  const handleLoadRoute = useCallback(
    (loadedRoute: RouteData, name?: string) => {
      manualRouteSeqRef.current++;
      setIsLoadingRoute(false);
      hasUserMapInteractionRef.current = true;
      setCurrentMode('manual');
      commitManualWaypoints(loadedRoute.waypoints);
      setManualRouteData(loadedRoute);
      setFitTrigger((n) => n + 1);
      addToast(
        'success',
        'Rute Berhasil Dimuat',
        name ? `"${name}" ditampilkan di peta.` : 'Rute siap digunakan.'
      );
    },
    [commitManualWaypoints, addToast]
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
        addToast(
          'success',
          'Lokasi GPS Terdeteksi',
          `Koordinat [${userLoc.lat.toFixed(4)}, ${userLoc.lng.toFixed(4)}]`
        );
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
      addToast(
        'success',
        'Lokasi GPS Terdeteksi',
        `Koordinat [${detected.lat.toFixed(4)}, ${detected.lng.toFixed(4)}]`
      );
    },
    [currentMode, cancelAllGeneratorWork, addToast]
  );

  const handleResetMap = useCallback(() => {
    addToast(
      'info',
      'Settingan Map Direset',
      'Kembali ke Map Standar, 2D & Heatmap Nonaktif.'
    );
  }, [addToast]);

  return (
    <main
      className={`relative w-screen h-[100dvh] overflow-hidden flex ${
        theme === 'dark' ? 'dark bg-[#0f172a]' : 'bg-[#f8fafc]'
      }`}
    >
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
          onResetMap={handleResetMap}
          flyToLocation={flyToLocation}
        />
      </div>

      {/* Floating Route Studio Sidebar & Mobile Bottom Sheet */}
      <Sidebar
        currentMode={currentMode}
        onModeChange={(m) => {
          setCurrentMode(m);
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        waypoints={activeWaypoints}
        routeData={activeRouteData}
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
        routeShape={routeShape}
        onRouteShapeChange={(shape) => {
          anchorEditSeqRef.current++;
          setIsLoadingRoute(false);
          setRouteShape(shape);
        }}
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
