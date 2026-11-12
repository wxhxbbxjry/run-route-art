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
  RouteCandidate,
} from '@/lib/types';
import { loadStravaOutdoorStyle } from '@/lib/layers';
import {
  fetchSmartManualRoute,
  buildRouteData,
  snapWaypointToVehicleRoad,
  generateRouteCandidates,
  generateNextCandidate,
} from '@/lib/osrm';
import {
  arePolylinesTooSimilar,
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
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#f1f5f9] dark:bg-[#0f172a] text-slate-700 dark:text-slate-200 gap-3">
      <div className="w-10 h-10 border-[3px] border-[#fc4c02] border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        Memuat Peta Strava Style &amp; Engine Routing (100% Free)...
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

  // 2. ISOLATED STATE: RunCulture-Style Multi-Candidate Generator Mode (Car/Motor Compliant, Zero Elevation)
  const [loopStartLocation, setLoopStartLocation] = useState<LatLng | null>(DEFAULT_CENTER);
  const [targetDistanceKm, setTargetDistanceKm] = useState<number>(10);
  const [routeShape, setRouteShape] = useState<GeneratorShape>('loop');
  const [candidates, setCandidates] = useState<RouteCandidate[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [peekCandidateId, setPeekCandidateId] = useState<string | null>(null);
  const [exhaustedUnique, setExhaustedUnique] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasPrefetchedNext, setHasPrefetchedNext] = useState<boolean>(false);
  const [undoVersion, setUndoVersion] = useState<number>(0);

  const seedOffsetRef = useRef<number>(0);
  const generatorAbortRef = useRef<AbortController | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchTimerRef = useRef<number | null>(null);
  const shownFallbackNoticeRef = useRef<boolean>(false);
  const generationKeyRef = useRef<string>('');
  const anchorEditSeqRef = useRef<number>(0);
  const prefetchedRef = useRef<{
    key: string;
    candidate: RouteCandidate | null;
    exhausted: boolean;
  } | null>(null);
  const candidateHistoryRef = useRef<
    Record<
      string,
      Array<{
        anchors: LatLng[];
        anchorIndices: number[];
        routeData: RouteData;
        isEdited: boolean;
      }>
    >
  >({});

  // Cleanup active AbortControllers and background prefetch timer on unmount
  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current !== null) {
        window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
      generatorAbortRef.current?.abort();
      prefetchAbortRef.current?.abort();
    };
  }, []);

  // Invalidate background prefetch whenever target config changes
  useEffect(() => {
    if (prefetchTimerRef.current !== null) {
      window.clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    if (prefetchAbortRef.current) {
      prefetchAbortRef.current.abort();
      prefetchAbortRef.current = null;
    }
    prefetchedRef.current = null;
    setHasPrefetchedNext(false);
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

  // Mode-isolated active states (Manual Tap & RunCulture Generator)
  const activeCandidate = candidates.find((c) => c.id === activeCandidateId) ?? null;
  const peekCandidate =
    peekCandidateId && peekCandidateId !== activeCandidateId
      ? candidates.find((c) => c.id === peekCandidateId) ?? null
      : null;

  const activeWaypoints =
    currentMode === 'manual'
      ? manualWaypoints
      : activeCandidate
      ? activeCandidate.routeData.waypoints
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
      : activeCandidate
      ? activeCandidate.routeData
      : null;

  const activePeekRouteData =
    currentMode === 'random' && peekCandidate ? peekCandidate.routeData : null;

  const activeEditableAnchors =
    currentMode === 'random' && activeCandidate ? activeCandidate.anchors : [];

  const canUndoEdit =
    undoVersion >= 0 &&
    Boolean(activeCandidate && (candidateHistoryRef.current[activeCandidate.id]?.length ?? 0) > 0);

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
        setManualRedoStack([]); // Reset redo stack on new addition
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
        if (prefetchTimerRef.current !== null) {
          window.clearTimeout(prefetchTimerRef.current);
          prefetchTimerRef.current = null;
        }
        generatorAbortRef.current?.abort();
        prefetchAbortRef.current?.abort();
        prefetchedRef.current = null;
        setHasPrefetchedNext(false);
        setCandidates([]);
        setActiveCandidateId(null);
        setPeekCandidateId(null);
        setExhaustedUnique(false);
        setLoopStartLocation(effectiveLatLng);
        addToast(
          'info',
          'Titik Start Dipilih',
          `Lokasi diatur ke [${effectiveLatLng.lat.toFixed(4)}, ${effectiveLatLng.lng.toFixed(4)}]. Klik Generate Rute untuk saran baru.`
        );
      }
    },
    [currentMode, commitManualWaypoints, recomputeManualRoute, addToast]
  );

  // Cancel all pending RunCulture candidate requests
  const cancelAllGeneratorWork = useCallback(() => {
    if (prefetchTimerRef.current !== null) {
      window.clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
    if (generatorAbortRef.current) {
      generatorAbortRef.current.abort();
      generatorAbortRef.current = null;
    }
    if (prefetchAbortRef.current) {
      prefetchAbortRef.current.abort();
      prefetchAbortRef.current = null;
    }
    prefetchedRef.current = null;
    setHasPrefetchedNext(false);
  }, []);

  // Silent background +1 candidate prefetch (delayed 1.2s so immediate map/card edits never contend)
  const startBackgroundPrefetch = useCallback(
    (
      key: string,
      start: LatLng,
      distKm: number,
      shape: GeneratorShape,
      existingCoords: LatLng[][],
      nextSeed: number
    ) => {
      if (existingCoords.length === 0 || existingCoords.length >= 6) return;
      if (prefetchTimerRef.current !== null) {
        window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
      if (prefetchAbortRef.current) {
        prefetchAbortRef.current.abort();
        prefetchAbortRef.current = null;
      }

      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      prefetchTimerRef.current = window.setTimeout(() => {
        prefetchTimerRef.current = null;
        if (controller.signal.aborted || generationKeyRef.current !== key) return;

        void generateNextCandidate({
          start,
          targetKm: distKm,
          shape,
          existingRoutes: existingCoords,
          seedOffset: nextSeed,
          signal: controller.signal,
        })
          .then((res) => {
            if (controller.signal.aborted || generationKeyRef.current !== key) return;
            prefetchedRef.current = {
              key,
              candidate: res.candidate,
              exhausted: res.exhaustedUnique,
            };
            setHasPrefetchedNext(Boolean(res.candidate));
          })
          .catch(() => {
            // Non-critical background prefetch
          });
      }, 1200);
    },
    []
  );

  // RunCulture Generator: Generate up to 3 spatially unique car/motor compliant routes
  const handleGenerateBatch = useCallback(
    async (overrideStart?: LatLng, explicitSeedOffset?: number) => {
      const start = overrideStart ?? loopStartLocation;
      if (!start) {
        addToast('warning', 'Pilih Lokasi Awal', 'Klik pada peta untuk menentukan titik start.');
        return;
      }

      cancelAllGeneratorWork();

      const seed = explicitSeedOffset !== undefined ? explicitSeedOffset : 0;
      seedOffsetRef.current = seed;
      const key = makeGenKey(start, targetDistanceKm, routeShape);
      generationKeyRef.current = key;

      const controller = new AbortController();
      generatorAbortRef.current = controller;

      setIsLoadingRoute(true);
      setIsLoadingMore(false);
      setExhaustedUnique(false);
      setPeekCandidateId(null);

      try {
        const res = await generateRouteCandidates({
          start,
          targetKm: targetDistanceKm,
          shape: routeShape,
          maxCandidates: 3,
          existingRoutes: [],
          seedOffset: seed,
          signal: controller.signal,
        });

        if (controller.signal.aborted || generationKeyRef.current !== key) return;

        setIsLoadingRoute(false);
        candidateHistoryRef.current = {};
        setUndoVersion((v) => v + 1);
        setCandidates(res.candidates);
        setActiveCandidateId(res.candidates[0]?.id ?? null);
        setExhaustedUnique(res.exhaustedUnique);
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

        const top = res.candidates[0];
        if (top) {
          const shapeName = routeShape === 'out_and_back' ? 'Pergi-Pulang' : 'Loop';
          const devPct =
            targetDistanceKm > 0
              ? ((top.routeData.distanceKm - targetDistanceKm) / targetDistanceKm) * 100
              : 0;
          const acc = Math.max(0, 100 - Math.abs(devPct)).toFixed(1);
          addToast(
            'success',
            `${res.candidates.length} Saran Rute ${shapeName} Siap!`,
            `Terbaik #1: ${top.routeData.distanceKm.toFixed(2)} km (Akurasi ${acc}%)`
          );

          startBackgroundPrefetch(
            key,
            start,
            targetDistanceKm,
            routeShape,
            res.candidates.map((c) => c.routeData.coordinates),
            seed + 1
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
      startBackgroundPrefetch,
      addToast,
    ]
  );

  // RunCulture Generator: Add 1 more unique suggestion (consumes prefetched route instantaneously!)
  const handleGenerateMore = useCallback(async () => {
    const start = loopStartLocation;
    if (!start || isLoadingRoute || isLoadingMore || candidates.length >= 6 || exhaustedUnique) {
      return;
    }

    const key = makeGenKey(start, targetDistanceKm, routeShape);
    generationKeyRef.current = key;

    const cached = prefetchedRef.current;
    if (cached && cached.key === key) {
      prefetchedRef.current = null;
      setHasPrefetchedNext(false);

      if (cached.candidate) {
        const isDuplicate = candidates.some((c) =>
          arePolylinesTooSimilar(
            c.routeData.coordinates,
            cached.candidate!.routeData.coordinates,
            0.62,
            32,
            20
          )
        );
        if (!isDuplicate) {
          const nextList = [...candidates, cached.candidate];
          setCandidates(nextList);
          setActiveCandidateId(cached.candidate.id);
          setPeekCandidateId(null);
          setFitTrigger((n) => n + 1);
          seedOffsetRef.current += 1;
          const devPct =
            targetDistanceKm > 0
              ? ((cached.candidate.routeData.distanceKm - targetDistanceKm) / targetDistanceKm) * 100
              : 0;
          const acc = Math.max(0, 100 - Math.abs(devPct)).toFixed(0);
          addToast(
            'success',
            `Saran #${nextList.length} Ditambahkan!`,
            `${cached.candidate.routeData.distanceKm.toFixed(2)} km • Akurasi ${acc}%`
          );
          startBackgroundPrefetch(
            key,
            start,
            targetDistanceKm,
            routeShape,
            nextList.map((c) => c.routeData.coordinates),
            seedOffsetRef.current + 1
          );
          return;
        }
      }

      if (cached.exhausted) {
        setExhaustedUnique(true);
        addToast('info', 'Variasi Habis', 'Semua variasi rute unik di sekitar lokasi sudah ditampilkan.');
        return;
      }
    }

    setIsLoadingMore(true);
    if (prefetchAbortRef.current) {
      prefetchAbortRef.current.abort();
      prefetchAbortRef.current = null;
    }
    const controller = new AbortController();
    prefetchAbortRef.current = controller;

    try {
      const nextSeed = seedOffsetRef.current + 1;
      seedOffsetRef.current = nextSeed;
      const res = await generateNextCandidate({
        start,
        targetKm: targetDistanceKm,
        shape: routeShape,
        existingRoutes: candidates.map((c) => c.routeData.coordinates),
        seedOffset: nextSeed,
        signal: controller.signal,
      });

      if (controller.signal.aborted || generationKeyRef.current !== key) return;
      setIsLoadingMore(false);

      if (res.candidate) {
        const nextList = [...candidates, res.candidate];
        setCandidates(nextList);
        setActiveCandidateId(res.candidate.id);
        setPeekCandidateId(null);
        setFitTrigger((n) => n + 1);
        const devPct =
          targetDistanceKm > 0
            ? ((res.candidate.routeData.distanceKm - targetDistanceKm) / targetDistanceKm) * 100
            : 0;
        const acc = Math.max(0, 100 - Math.abs(devPct)).toFixed(0);
        addToast(
          'success',
          `Saran #${nextList.length} Ditambahkan!`,
          `${res.candidate.routeData.distanceKm.toFixed(2)} km • Akurasi ${acc}%`
        );
        startBackgroundPrefetch(
          key,
          start,
          targetDistanceKm,
          routeShape,
          nextList.map((c) => c.routeData.coordinates),
          nextSeed + 1
        );
      } else {
        setExhaustedUnique(true);
        addToast('info', 'Variasi Maksimal', 'Tidak ada variasi koridor unik tambahan di sekitar sini.');
      }
    } catch {
      if (!controller.signal.aborted) {
        setIsLoadingMore(false);
      }
    }
  }, [
    loopStartLocation,
    isLoadingRoute,
    isLoadingMore,
    candidates,
    exhaustedUnique,
    targetDistanceKm,
    routeShape,
    startBackgroundPrefetch,
    addToast,
  ]);

  // Helper: surgically re-route only the edited adjacent legs (2-3 anchors -> ~0.7s instead of 9s!)
  const spliceCandidateSubroute = useCallback(
    async (
      candidate: RouteCandidate,
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
      // Pause/cancel background prefetch so anchor edit gets 100% routing bandwidth
      if (prefetchTimerRef.current !== null) {
        window.clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
      if (prefetchAbortRef.current) {
        prefetchAbortRef.current.abort();
        prefetchAbortRef.current = null;
      }

      const snapshot = {
        anchors: candidate.anchors,
        anchorIndices: candidate.anchorIndices,
        routeData: candidate.routeData,
        isEdited: candidate.isEdited,
      };

      const coords = candidate.routeData.coordinates;
      const oldIndices = candidate.anchorIndices;
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
      const nextRightIdx = mode === 'delete' ? leftAnchorIdx + 1 : rightAnchorIdx + (mode === 'insert' ? 1 : 0);

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
        return Math.max(0, Math.min(stitchedCoords.length - 1, (oldIndices[origIdx] ?? endCoordIdx) + shiftAfterRight));
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
          shape: candidate.shape,
        }
      );

      if (!candidateHistoryRef.current[candidate.id]) {
        candidateHistoryRef.current[candidate.id] = [];
      }
      candidateHistoryRef.current[candidate.id].push(snapshot);
      setUndoVersion((v) => v + 1);

      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candidate.id
            ? {
                ...c,
                anchors: alignedAnchors,
                anchorIndices: newAnchorIndices,
                routeData: updatedRouteData,
                isEdited: true,
              }
            : c
        )
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

      if (index === 0 || !activeCandidate || activeCandidate.anchors.length < 3) {
        hasManualLoopStartRef.current = true;
        setLoopStartLocation(effectivePos);
        await handleGenerateBatch(effectivePos, 0);
        return;
      }

      const anchors = activeCandidate.anchors;
      const safeIdx = Math.min(anchors.length - 2, Math.max(1, index));
      const nextAnchors = anchors.map((a, i) => (i === safeIdx ? effectivePos : a));
      await spliceCandidateSubroute(activeCandidate, {
        subWaypoints: [anchors[safeIdx - 1], effectivePos, anchors[safeIdx + 1]],
        leftAnchorIdx: safeIdx - 1,
        rightAnchorIdx: safeIdx + 1,
        nextAnchors,
        midSlotInNext: safeIdx,
        mode: 'drag',
      });
    },
    [activeCandidate, handleGenerateBatch, spliceCandidateSubroute, addToast]
  );

  // Click route line in Generator Mode -> insert new anchor at segment & bend path
  const handleAnchorInsert = useCallback(
    async (clickedLatLng: LatLng) => {
      if (!activeCandidate || activeCandidate.anchors.length < 2) return;
      hasUserMapInteractionRef.current = true;
      const obvCheck = checkObvitnasViolation(clickedLatLng);
      const effectivePos = obvCheck.isRestricted
        ? pushOutOfObvitnas(clickedLatLng)
        : clickedLatLng;

      const hit = findClosestPointOnPolyline(
        activeCandidate.routeData.coordinates,
        effectivePos
      );
      if (!hit) return;

      const rawInsertAt = getInsertionIndexForSegment(
        activeCandidate.anchorIndices,
        hit.segmentIndex
      );
      const insertAt = Math.max(
        1,
        Math.min(activeCandidate.anchors.length - 1, rawInsertAt)
      );

      const anchors = activeCandidate.anchors;
      const nextAnchors = [
        ...anchors.slice(0, insertAt),
        effectivePos,
        ...anchors.slice(insertAt),
      ];
      await spliceCandidateSubroute(activeCandidate, {
        subWaypoints: [anchors[insertAt - 1], effectivePos, anchors[insertAt]],
        leftAnchorIdx: insertAt - 1,
        rightAnchorIdx: insertAt,
        nextAnchors,
        midSlotInNext: insertAt,
        mode: 'insert',
      });
    },
    [activeCandidate, spliceCandidateSubroute]
  );

  // Click/Right-click intermediate anchor dot in Generator Mode -> remove anchor
  const handleAnchorDelete = useCallback(
    async (index: number) => {
      if (!activeCandidate) return;
      const anchors = activeCandidate.anchors;
      if (index <= 0 || index >= anchors.length - 1 || anchors.length <= 3) {
        return;
      }
      const nextAnchors = anchors.filter((_, i) => i !== index);
      await spliceCandidateSubroute(activeCandidate, {
        subWaypoints: [anchors[index - 1], anchors[index + 1]],
        leftAnchorIdx: index - 1,
        rightAnchorIdx: index + 1,
        nextAnchors,
        midSlotInNext: null,
        mode: 'delete',
      });
      addToast('info', 'Anchor Dihapus', `Titik anchor #${index} dihapus dari jalur.`);
    },
    [activeCandidate, spliceCandidateSubroute, addToast]
  );

  // Per-candidate Undo Edit
  const handleUndoCandidateEdit = useCallback(() => {
    if (!activeCandidate) return;
    const stack = candidateHistoryRef.current[activeCandidate.id];
    if (!stack || stack.length === 0) return;

    const prevSnap = stack.pop()!;
    setUndoVersion((v) => v + 1);

    setCandidates((prev) =>
      prev.map((c) =>
        c.id === activeCandidate.id
          ? {
              ...c,
              anchors: prevSnap.anchors,
              anchorIndices: prevSnap.anchorIndices,
              routeData: prevSnap.routeData,
              isEdited: prevSnap.isEdited,
            }
          : c
      )
    );
    addToast('info', 'Edit Dibatalkan', 'Jalur saran rute dikembalikan ke kondisi sebelumnya.');
  }, [activeCandidate, addToast]);

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
          // If start of a closed loop is dragged, also drag finish to maintain closed loop
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
        await handleGenerateBatch(effectivePos, 0);
      }
    },
    [currentMode, commitManualWaypoints, recomputeManualRoute, handleGenerateBatch, addToast]
  );

  // Manual Mode: Delete Single Waypoint (OnTheGoMap click/right-click delete)
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

  // Manual Mode: Out & Back (OnTheGoMap signature feature - reverses and returns to start)
  const handleOutAndBack = useCallback(async () => {
    const curWaypoints = manualWaypointsRef.current;
    if (curWaypoints.length < 2) return;
    setManualRedoStack((prev) => [...prev, curWaypoints]);

    // Reverse intermediate points back to start
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

  // Generator: Re-roll (shift seedOffset to discover fresh corridors)
  const handleReRollLoop = useCallback(() => {
    const nextSeed = seedOffsetRef.current + 3;
    void handleGenerateBatch(undefined, nextSeed);
  }, [handleGenerateBatch]);

  // Generator: Reset all candidates & defaults
  const handleResetLoop = useCallback(() => {
    cancelAllGeneratorWork();
    seedOffsetRef.current = 0;
    generationKeyRef.current = '';
    candidateHistoryRef.current = {};
    setUndoVersion((v) => v + 1);
    setCandidates([]);
    setActiveCandidateId(null);
    setPeekCandidateId(null);
    setExhaustedUnique(false);
    setIsLoadingRoute(false);
    setIsLoadingMore(false);
    setTargetDistanceKm(10);
    setRouteShape('loop');
    hasManualLoopStartRef.current = false;
    setLoopStartLocation(userGpsLocation || DEFAULT_CENTER);
    addToast('info', 'Generator Direset', 'Semua saran rute dihapus dan target dikembalikan ke default.');
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
        setCandidates([]);
        setActiveCandidateId(null);
        setPeekCandidateId(null);
        setExhaustedUnique(false);
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
        setCandidates([]);
        setActiveCandidateId(null);
        setPeekCandidateId(null);
        setExhaustedUnique(false);
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
      className={`relative w-screen h-screen overflow-hidden flex ${
        theme === 'dark' ? 'dark bg-[#0f172a]' : 'bg-[#f1f5f9]'
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
          peekRouteData={activePeekRouteData}
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

      {/* Floating Control Sidebar */}
      <Sidebar
        currentMode={currentMode}
        onModeChange={(m) => {
          setCurrentMode(m);
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        // Active mode route & waypoints
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
        // RunCulture Generator props
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
          void handleGenerateBatch();
        }}
        onReRollLoop={handleReRollLoop}
        onResetLoop={handleResetLoop}
        onGenerateMore={() => {
          void handleGenerateMore();
        }}
        candidates={candidates}
        activeCandidateId={activeCandidateId}
        onSelectCandidate={(id) => {
          setActiveCandidateId(id);
          setPeekCandidateId(null);
          setFitTrigger((n) => n + 1);
        }}
        onPeekCandidate={setPeekCandidateId}
        canUndoEdit={canUndoEdit}
        onUndoCandidateEdit={handleUndoCandidateEdit}
        hasPrefetchedNext={hasPrefetchedNext}
        exhaustedUnique={exhaustedUnique}
        isLoadingMore={isLoadingMore}
        isLoading={isLoadingRoute}
      />

      {/* Floating Metrics HUD (Desktop) */}
      <div className="hidden md:block absolute right-4 bottom-4 md:bottom-6 z-30 md:max-w-[300px] lg:max-w-sm w-full space-y-3 pointer-events-none">
        <div className="pointer-events-auto">
          <StatsHud
            routeData={activeRouteData}
            paceSeconds={paceSeconds}
            onPaceChange={setPaceSeconds}
            onOpenExport={() => setIsExportOpen(true)}
            unitSystem={unitSystem}
            onToggleUnit={() => setUnitSystem((u) => (u === 'km' ? 'mi' : 'km'))}
          />
        </div>
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
