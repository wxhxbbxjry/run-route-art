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
} from '@/lib/types';
import { loadStravaOutdoorStyle } from '@/lib/layers';
import {
  fetchSmartManualRoute,
  generateAccurateLoop,
  buildRouteData,
  snapWaypointToVehicleRoad,
} from '@/lib/osrm';
import { checkObvitnasViolation, pushOutOfObvitnas } from '@/lib/obvitnas';

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

  // 2. ISOLATED STATE: Random Loop Generator Mode
  const [loopStartLocation, setLoopStartLocation] = useState<LatLng | null>(DEFAULT_CENTER);
  const [targetDistanceKm, setTargetDistanceKm] = useState<number>(10);
  const [loopHeadingOffset, setLoopHeadingOffset] = useState<number>(45);
  const [loopWaypoints, setLoopWaypoints] = useState<Waypoint[]>([]);
  const [loopRouteData, setLoopRouteData] = useState<RouteData | null>(null);

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

  // Mode-isolated active states (Manual Tap & Random Loop)
  const activeWaypoints = currentMode === 'manual' ? manualWaypoints : loopWaypoints;
  const activeRouteData = currentMode === 'manual' ? manualRouteData : loopRouteData;

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
        setLoopStartLocation(effectiveLatLng);
        addToast(
          'info',
          'Titik Start Dipilih',
          `Lokasi diatur ke [${effectiveLatLng.lat.toFixed(4)}, ${effectiveLatLng.lng.toFixed(4)}]`
        );
      }
    },
    [currentMode, commitManualWaypoints, recomputeManualRoute, addToast]
  );

  // Manual & Loop Mode: Drag Waypoint (Start, Finish, intermediate pins in all modes)
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
        // Dragging start pin in Random Loop mode: reposition start and regenerate loop
        setLoopStartLocation(effectivePos);
        addToast('info', 'Titik Start Dipindahkan', 'Menghitung rute loop baru di posisi baru...');
        setIsLoadingRoute(true);
        const result = await generateAccurateLoop(
          effectivePos,
          targetDistanceKm,
          loopHeadingOffset,
          true,
          true
        );
        setIsLoadingRoute(false);
        const pinPos = result.effectiveStart || effectivePos;
        const loopWps = [
          { id: 'start-point', lat: pinPos.lat, lng: pinPos.lng, name: 'Start / Finish' },
        ];
        setLoopWaypoints(loopWps);
        setLoopRouteData(buildRouteData(loopWps, result, 'random', targetDistanceKm));
        setFitTrigger((n) => n + 1);
      }
    },
    [currentMode, targetDistanceKm, loopHeadingOffset, commitManualWaypoints, recomputeManualRoute, addToast]
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

  // Random Loop: Generate Loop
  const handleGenerateLoop = useCallback(
    async (offsetHeading?: number) => {
      if (!loopStartLocation) {
        addToast('warning', 'Pilih Lokasi Awal', 'Klik pada peta untuk menentukan titik start.');
        return;
      }

      setIsLoadingRoute(true);
      const heading = offsetHeading !== undefined ? offsetHeading : loopHeadingOffset;
      setLoopHeadingOffset(heading);

      // High-accuracy natural loop generator
      const result = await generateAccurateLoop(
        loopStartLocation,
        targetDistanceKm,
        heading,
        true,
        true
      );
      setIsLoadingRoute(false);

      if (result.error) {
        addToast('warning', 'Routing Fallback', result.error);
      }

      const pinLoc = result.effectiveStart || loopStartLocation;
      const loopWps: Waypoint[] = [
        {
          id: 'start-point',
          lat: pinLoc.lat,
          lng: pinLoc.lng,
          name: 'Start / Finish',
        },
      ];

      setLoopWaypoints(loopWps);
      const built = buildRouteData(loopWps, result, 'random', targetDistanceKm);
      setLoopRouteData(built);
      setFitTrigger((n) => n + 1);

      const accuracy = (
        (1 - Math.abs(result.distanceKm - targetDistanceKm) / targetDistanceKm) *
        100
      ).toFixed(1);

      addToast(
        'success',
        `Random Loop ${targetDistanceKm}K Siap!`,
        `Jarak: ${result.distanceKm.toFixed(2)} km (Akurasi ${accuracy}%). Start & Finish 100% bertemu!`
      );
    },
    [loopStartLocation, targetDistanceKm, loopHeadingOffset, addToast]
  );

  // Random Loop: Re-roll
  const handleReRollLoop = useCallback(() => {
    const nextHeading = (loopHeadingOffset + 60 + Math.random() * 30) % 360;
    setLoopHeadingOffset(nextHeading);
    handleGenerateLoop(nextHeading);
  }, [loopHeadingOffset, handleGenerateLoop]);

  // Random Loop: Reset Loop
  const handleResetLoop = useCallback(() => {
    setLoopWaypoints([]);
    setLoopRouteData(null);
    setTargetDistanceKm(10);
    setLoopHeadingOffset(45);
    hasManualLoopStartRef.current = false;
    setLoopStartLocation(userGpsLocation || DEFAULT_CENTER);
    addToast('info', 'Random Loop Direset', 'Rute loop dihapus dan jarak dikembalikan ke 10 KM.');
  }, [userGpsLocation, addToast]);

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
  }, [addToast]);

  // GPS locate button callback from RouteMap right dock
  const handleMapLocateDetected = useCallback(
    (detected: LatLng) => {
      hasUserMapInteractionRef.current = true;
      setUserGpsLocation(detected);
      if (currentMode === 'random') {
        hasManualLoopStartRef.current = true;
        setLoopStartLocation(detected);
      }
      addToast(
        'success',
        'Lokasi GPS Terdeteksi',
        `Koordinat [${detected.lat.toFixed(4)}, ${detected.lng.toFixed(4)}]`
      );
    },
    [currentMode, addToast]
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
        // Random loop props
        startLocation={loopStartLocation}
        targetDistanceKm={targetDistanceKm}
        onTargetDistanceChange={setTargetDistanceKm}
        onUseMyLocation={handleUseMyLocation}
        onGenerateLoop={() => handleGenerateLoop()}
        onReRollLoop={handleReRollLoop}
        onResetLoop={handleResetLoop}
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
