'use client';

import React, { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  LatLng,
  Waypoint,
  RouteData,
  RouteMode,
  TileLayerId,
  UnitSystem,
} from '@/lib/types';
import { getCoordinateAtDistance } from '@/lib/geo';
import {
  fetchSmartManualRoute,
  generateAccurateLoop,
  buildRouteData,
} from '@/lib/osrm';
import { checkObvitnasViolation, pushOutOfObvitnas } from '@/lib/obvitnas';

import Sidebar from '@/components/UI/Sidebar';
import StatsHud from '@/components/UI/StatsHud';
import ElevationProfile from '@/components/UI/ElevationProfile';
import ExportModal from '@/components/UI/ExportModal';
import Toast, { ToastMessage } from '@/components/UI/Toast';
import SearchBar from '@/components/UI/SearchBar';
import SavedRoutesModal from '@/components/UI/SavedRoutesModal';

// Dynamically import Leaflet Map with SSR disabled
const RouteMap = dynamic(() => import('@/components/Map/RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#080c14] text-slate-400 gap-3">
      <div className="w-10 h-10 border-4 border-lime-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm font-semibold text-slate-300">
        Memuat Peta Interaktif & Engine Routing...
      </span>
    </div>
  ),
});

export default function HomePage() {
  // Navigation & Mode
  const [currentMode, setCurrentMode] = useState<RouteMode>('manual');
  const [selectedTile, setSelectedTile] = useState<TileLayerId>('dark');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('km');
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [hoverLocation, setHoverLocation] = useState<LatLng | null>(null);
  const [flyToLocation, setFlyToLocation] = useState<LatLng | null>(null);

  // 1. ISOLATED STATE: Manual Tap Mode
  const [manualWaypoints, setManualWaypoints] = useState<Waypoint[]>([]);
  const [manualRouteData, setManualRouteData] = useState<RouteData | null>(null);
  const [manualSnapToRoads, setManualSnapToRoads] = useState<boolean>(true);
  const [allowContraflow, setAllowContraflow] = useState<boolean>(true); // Default true: Runners can run against traffic
  const [avoidSmallAlleys, setAvoidSmallAlleys] = useState<boolean>(true); // Default true: Avoid tiny alleys, steps, private compounds
  const [manualRedoStack, setManualRedoStack] = useState<Waypoint[][]>([]);

  // 2. ISOLATED STATE: Random Loop Generator Mode
  const [loopStartLocation, setLoopStartLocation] = useState<LatLng | null>({
    lat: -6.2088,
    lng: 106.8456, // Central Jakarta default
  });
  const [targetDistanceKm, setTargetDistanceKm] = useState<number>(10);
  const [loopHeadingOffset, setLoopHeadingOffset] = useState<number>(45);
  const [loopWaypoints, setLoopWaypoints] = useState<Waypoint[]>([]);
  const [loopRouteData, setLoopRouteData] = useState<RouteData | null>(null);

  // Stats & Pace HUD
  const [paceSeconds, setPaceSeconds] = useState<number>(360); // 6:00 / km
  const [showElevation, setShowElevation] = useState<boolean>(false);
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

  // Handle Search Result from OSM Nominatim (OnTheGoMap search style)
  const handleSelectSearchResult = useCallback(
    (latlng: LatLng, name: string) => {
      setFlyToLocation(latlng);
      if (currentMode === 'random') {
        setLoopStartLocation(latlng);
      }
      addToast('info', 'Lokasi Ditemukan', name.split(',')[0]);
    },
    [currentMode, addToast]
  );

  // Handle Elevation Scrubbing Hover (OnTheGoMap cursor tracking)
  const handleHoverDistance = useCallback(
    (distKm: number | null) => {
      if (distKm === null || !activeRouteData || activeRouteData.coordinates.length < 2) {
        setHoverLocation(null);
        return;
      }
      const coord = getCoordinateAtDistance(activeRouteData.coordinates, distKm);
      setHoverLocation(coord);
    },
    [activeRouteData]
  );

  // Handle Map Clicks based on active mode
  const handleMapClick = useCallback(
    async (clickedLatLng: LatLng) => {
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
        setManualRedoStack([]); // Reset redo stack on new addition
        const newWaypoint: Waypoint = {
          id: `wp-${Date.now()}-${manualWaypoints.length + 1}`,
          lat: effectiveLatLng.lat,
          lng: effectiveLatLng.lng,
          name: `Point ${manualWaypoints.length + 1}`,
        };

        const updatedWaypoints = [...manualWaypoints, newWaypoint];
        setManualWaypoints(updatedWaypoints);

        if (updatedWaypoints.length >= 2) {
          setIsLoadingRoute(true);
          const result = await fetchSmartManualRoute(
            updatedWaypoints,
            manualSnapToRoads,
            allowContraflow,
            avoidSmallAlleys
          );
          setIsLoadingRoute(false);

          const built = buildRouteData(
            updatedWaypoints,
            result,
            'manual'
          );
          setManualRouteData(built);
        } else {
          setManualRouteData(null);
        }
      } else if (currentMode === 'random') {
        setLoopStartLocation(effectiveLatLng);
        addToast(
          'info',
          'Titik Start Dipilih',
          `Lokasi diatur ke [${effectiveLatLng.lat.toFixed(4)}, ${effectiveLatLng.lng.toFixed(4)}]`
        );
      }
    },
    [currentMode, manualWaypoints, manualSnapToRoads, allowContraflow, avoidSmallAlleys, addToast]
  );

  // Manual & Loop Mode: Drag Waypoint (Start, Finish, intermediate pins in all modes)
  const handleWaypointDrag = useCallback(
    async (index: number, newPos: LatLng) => {
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
        const updated = [...manualWaypoints];
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

        setManualWaypoints(updated);
        setManualRedoStack([]);

        if (updated.length >= 2) {
          setIsLoadingRoute(true);
          const result = await fetchSmartManualRoute(
            updated,
            manualSnapToRoads,
            allowContraflow,
            avoidSmallAlleys
          );
          setIsLoadingRoute(false);
          setManualRouteData(buildRouteData(updated, result, 'manual'));
        }
      } else if (currentMode === 'random') {
        // Dragging start pin in Random Loop mode: reposition start and regenerate loop
        setLoopStartLocation(effectivePos);
        addToast('info', 'Titik Start Dipindahkan', 'Menghitung rute loop baru di posisi baru...');
        setIsLoadingRoute(true);
        const result = await generateAccurateLoop(
          effectivePos,
          targetDistanceKm,
          loopHeadingOffset,
          allowContraflow,
          avoidSmallAlleys
        );
        setIsLoadingRoute(false);
        const loopWps = [{ id: 'start-point', lat: effectivePos.lat, lng: effectivePos.lng, name: 'Start / Finish' }];
        setLoopWaypoints(loopWps);
        setLoopRouteData(buildRouteData(loopWps, result, 'random', targetDistanceKm));
      }
    },
    [
      currentMode,
      manualWaypoints,
      manualSnapToRoads,
      allowContraflow,
      avoidSmallAlleys,
      targetDistanceKm,
      loopHeadingOffset,
      addToast,
    ]
  );

  // Manual Mode: Delete Single Waypoint (OnTheGoMap click/right-click delete)
  const handleWaypointDelete = useCallback(
    async (index: number) => {
      if (currentMode !== 'manual') return;
      setManualRedoStack((prev) => [...prev, manualWaypoints]);
      const updated = manualWaypoints.filter((_, idx) => idx !== index);
      setManualWaypoints(updated);

      if (updated.length >= 2) {
        setIsLoadingRoute(true);
        const result = await fetchSmartManualRoute(
          updated,
          manualSnapToRoads,
          allowContraflow,
          avoidSmallAlleys
        );
        setIsLoadingRoute(false);
        setManualRouteData(buildRouteData(updated, result, 'manual'));
      } else {
        setManualRouteData(null);
      }
      addToast('info', 'Waypoint Dihapus', `Waypoint #${index + 1} berhasil dihapus.`);
    },
    [currentMode, manualWaypoints, manualSnapToRoads, allowContraflow, avoidSmallAlleys, addToast]
  );

  // Manual Mode: Toggle Snap
  const handleToggleManualSnap = useCallback(
    async (newSnapState: boolean) => {
      setManualSnapToRoads(newSnapState);
      if (manualWaypoints.length >= 2) {
        setIsLoadingRoute(true);
        const result = await fetchSmartManualRoute(
          manualWaypoints,
          newSnapState,
          allowContraflow,
          avoidSmallAlleys
        );
        setIsLoadingRoute(false);
        setManualRouteData(buildRouteData(manualWaypoints, result, 'manual'));
      }
    },
    [manualWaypoints, allowContraflow, avoidSmallAlleys]
  );

  // Manual Mode: Toggle Contraflow (Lawan Arah)
  const handleToggleContraflow = useCallback(
    async (newContraflow: boolean) => {
      setAllowContraflow(newContraflow);
      if (manualWaypoints.length >= 2) {
        setIsLoadingRoute(true);
        const result = await fetchSmartManualRoute(
          manualWaypoints,
          manualSnapToRoads,
          newContraflow,
          avoidSmallAlleys
        );
        setIsLoadingRoute(false);
        setManualRouteData(buildRouteData(manualWaypoints, result, 'manual'));
      }
    },
    [manualWaypoints, manualSnapToRoads, avoidSmallAlleys]
  );

  // Toggle Avoid Small Alleys & Private Zones (Request 1)
  const handleToggleAvoidAlleys = useCallback(
    async (newAvoid: boolean) => {
      setAvoidSmallAlleys(newAvoid);
      if (currentMode === 'manual' && manualWaypoints.length >= 2) {
        setIsLoadingRoute(true);
        const result = await fetchSmartManualRoute(
          manualWaypoints,
          manualSnapToRoads,
          allowContraflow,
          newAvoid
        );
        setIsLoadingRoute(false);
        setManualRouteData(buildRouteData(manualWaypoints, result, 'manual'));
      }
      addToast(
        'info',
        newAvoid ? 'Hindari Gang Sempit: Aktif' : 'Semua Jalur: Diizinkan',
        newAvoid
          ? 'Rute diprioritaskan di jalan utama dan ruas terbuka.'
          : 'Rute boleh melewati gang kecil dan jalan setapak.'
      );
    },
    [currentMode, manualWaypoints, manualSnapToRoads, allowContraflow, addToast]
  );

  // Manual Mode: Undo
  const handleUndoManualWaypoint = useCallback(async () => {
    if (manualWaypoints.length === 0) return;
    setManualRedoStack((prev) => [...prev, manualWaypoints]);
    const updated = manualWaypoints.slice(0, -1);
    setManualWaypoints(updated);

    if (updated.length >= 2) {
      setIsLoadingRoute(true);
      const result = await fetchSmartManualRoute(
        updated,
        manualSnapToRoads,
        allowContraflow,
        avoidSmallAlleys
      );
      setIsLoadingRoute(false);
      setManualRouteData(buildRouteData(updated, result, 'manual'));
    } else {
      setManualRouteData(null);
    }
  }, [manualWaypoints, manualSnapToRoads, allowContraflow, avoidSmallAlleys]);

  // Manual Mode: Redo
  const handleRedoManualWaypoint = useCallback(async () => {
    if (manualRedoStack.length === 0) return;
    const nextWaypoints = manualRedoStack[manualRedoStack.length - 1];
    setManualRedoStack((prev) => prev.slice(0, -1));
    setManualWaypoints(nextWaypoints);

    if (nextWaypoints.length >= 2) {
      setIsLoadingRoute(true);
      const result = await fetchSmartManualRoute(
        nextWaypoints,
        manualSnapToRoads,
        allowContraflow,
        avoidSmallAlleys
      );
      setIsLoadingRoute(false);
      setManualRouteData(buildRouteData(nextWaypoints, result, 'manual'));
    } else {
      setManualRouteData(null);
    }
  }, [manualRedoStack, manualSnapToRoads, allowContraflow, avoidSmallAlleys]);

  // Manual Mode: Out & Back (OnTheGoMap signature feature - reverses and returns to start)
  const handleOutAndBack = useCallback(async () => {
    if (manualWaypoints.length < 2) return;
    setManualRedoStack((prev) => [...prev, manualWaypoints]);

    // Reverse intermediate points back to start
    const returnPoints = manualWaypoints
      .slice(0, -1)
      .reverse()
      .map((wp, idx) => ({
        id: `wp-return-${Date.now()}-${idx}`,
        lat: wp.lat,
        lng: wp.lng,
        name: `Return ${wp.name}`,
      }));

    const combined = [...manualWaypoints, ...returnPoints];
    setManualWaypoints(combined);
    setIsLoadingRoute(true);
    const result = await fetchSmartManualRoute(
      combined,
      manualSnapToRoads,
      allowContraflow,
      avoidSmallAlleys
    );
    setIsLoadingRoute(false);
    setManualRouteData(buildRouteData(combined, result, 'manual'));
    addToast('success', 'Rute Bolak-Balik Terbentuk', 'Rute digandakan kembali ke titik asal (Out & Back)!');
  }, [manualWaypoints, manualSnapToRoads, allowContraflow, avoidSmallAlleys, addToast]);

  // Manual Mode: Clear
  const handleClearManualWaypoints = useCallback(() => {
    if (manualWaypoints.length > 0) {
      setManualRedoStack((prev) => [...prev, manualWaypoints]);
    }
    setManualWaypoints([]);
    setManualRouteData(null);
    addToast('info', 'Rute Manual Direset', 'Semua titik waypoint telah dihapus.');
  }, [manualWaypoints, addToast]);

  // Manual Mode: Close Loop
  const handleCloseManualLoop = useCallback(async () => {
    if (manualWaypoints.length < 2) return;
    setManualRedoStack((prev) => [...prev, manualWaypoints]);
    const startPoint = manualWaypoints[0];
    const closedWaypoints = [
      ...manualWaypoints,
      {
        id: `wp-${Date.now()}-finish`,
        lat: startPoint.lat,
        lng: startPoint.lng,
        name: 'Finish Loop',
      },
    ];

    setManualWaypoints(closedWaypoints);
    setIsLoadingRoute(true);
    const result = await fetchSmartManualRoute(
      closedWaypoints,
      manualSnapToRoads,
      allowContraflow,
      avoidSmallAlleys
    );
    setIsLoadingRoute(false);
    setManualRouteData(buildRouteData(closedWaypoints, result, 'manual'));
    addToast('success', 'Loop Berhasil Ditutup', 'Rute kembali ke titik awal!');
  }, [manualWaypoints, manualSnapToRoads, allowContraflow, avoidSmallAlleys, addToast]);

  // Manual Mode: Reverse Route
  const handleReverseManualRoute = useCallback(async () => {
    if (manualWaypoints.length < 2) return;
    setManualRedoStack((prev) => [...prev, manualWaypoints]);
    const reversed = [...manualWaypoints].reverse();
    setManualWaypoints(reversed);
    setIsLoadingRoute(true);
    const result = await fetchSmartManualRoute(
      reversed,
      manualSnapToRoads,
      allowContraflow,
      avoidSmallAlleys
    );
    setIsLoadingRoute(false);
    setManualRouteData(buildRouteData(reversed, result, 'manual'));
    addToast('info', 'Arah Dibalik', 'Titik awal dan akhir rute telah ditukar.');
  }, [manualWaypoints, manualSnapToRoads, allowContraflow, avoidSmallAlleys, addToast]);

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
        allowContraflow,
        avoidSmallAlleys
      );
      setIsLoadingRoute(false);

      if (result.error) {
        addToast('warning', 'OSRM Fallback', result.error);
      }

      const loopWps: Waypoint[] = [
        {
          id: 'start-point',
          lat: loopStartLocation.lat,
          lng: loopStartLocation.lng,
          name: 'Start / Finish',
        },
      ];

      setLoopWaypoints(loopWps);
      const built = buildRouteData(loopWps, result, 'random', targetDistanceKm);
      setLoopRouteData(built);

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
    [loopStartLocation, targetDistanceKm, loopHeadingOffset, allowContraflow, avoidSmallAlleys, addToast]
  );

  // Random Loop: Re-roll
  const handleReRollLoop = useCallback(() => {
    const nextHeading = (loopHeadingOffset + 60 + Math.random() * 30) % 360;
    setLoopHeadingOffset(nextHeading);
    handleGenerateLoop(nextHeading);
  }, [loopHeadingOffset, handleGenerateLoop]);

  // Load Imported GPX or Saved Route
  const handleLoadRoute = useCallback(
    (loadedRoute: RouteData, name?: string) => {
      setCurrentMode('manual');
      setManualWaypoints(loadedRoute.waypoints);
      setManualRouteData(loadedRoute);
      if (loadedRoute.coordinates.length > 0) {
        setFlyToLocation(loadedRoute.coordinates[0]);
      }
      addToast(
        'success',
        'Rute Berhasil Dimuat',
        name ? `"${name}" ditampilkan di peta.` : 'Rute siap digunakan.'
      );
    },
    [addToast]
  );

  // Geolocation quick helper
  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      addToast('warning', 'GPS Tidak Tersedia', 'Browser tidak mendukung geolokasi.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (currentMode === 'random') {
          setLoopStartLocation(userLoc);
        }
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
  }, [currentMode, addToast]);

  return (
    <main className="relative w-screen h-screen overflow-hidden flex bg-[#080c14]">
      {/* Search Location Bar (Mobile-friendly width, leaves right room for map buttons) */}
      <div className="absolute top-3 left-3 right-16 md:left-1/2 md:right-auto md:-translate-x-1/2 z-20 w-auto md:w-full md:max-w-sm pointer-events-auto">
        <SearchBar onSelectLocation={handleSelectSearchResult} />
      </div>

      {/* Interactive Fullscreen Map */}
      <div className="absolute inset-0 z-0">
        <RouteMap
          waypoints={activeWaypoints}
          routeData={activeRouteData}
          selectedTile={selectedTile}
          onTileChange={setSelectedTile}
          onMapClick={handleMapClick}
          onWaypointDrag={handleWaypointDrag}
          onWaypointDelete={handleWaypointDelete}
          hoverLocation={hoverLocation}
          flyToLocation={flyToLocation}
        />
      </div>

      {/* Floating Control Sidebar */}
      <Sidebar
        currentMode={currentMode}
        onModeChange={(m) => {
          setCurrentMode(m);
        }}
        // Manual mode props
        waypoints={manualWaypoints}
        routeData={manualRouteData}
        snapToRoads={manualSnapToRoads}
        onToggleSnap={handleToggleManualSnap}
        onUndoWaypoint={handleUndoManualWaypoint}
        onRedoWaypoint={handleRedoManualWaypoint}
        canRedo={manualRedoStack.length > 0}
        onOutAndBack={handleOutAndBack}
        onClearWaypoints={handleClearManualWaypoints}
        onCloseLoop={handleCloseManualLoop}
        onReverseRoute={handleReverseManualRoute}
        allowContraflow={allowContraflow}
        onToggleContraflow={handleToggleContraflow}
        avoidSmallAlleys={avoidSmallAlleys}
        onToggleAvoidAlleys={handleToggleAvoidAlleys}
        onOpenSavedRoutes={() => setIsSavedRoutesOpen(true)}
        unitSystem={unitSystem}
        // Random loop props
        startLocation={loopStartLocation}
        targetDistanceKm={targetDistanceKm}
        onTargetDistanceChange={setTargetDistanceKm}
        onUseMyLocation={handleUseMyLocation}
        onGenerateLoop={() => handleGenerateLoop()}
        onReRollLoop={handleReRollLoop}
        isLoading={isLoadingRoute}
      />

      {/* Floating Metrics HUD (Desktop) */}
      <div className="hidden md:block absolute right-4 bottom-4 md:bottom-6 z-30 max-w-sm w-full space-y-3 pointer-events-none">
        {showElevation && activeRouteData && (
          <div className="pointer-events-auto animate-in slide-in-from-bottom-3 fade-in duration-200">
            <ElevationProfile
              profile={activeRouteData.elevationProfile}
              gainM={activeRouteData.elevationGainM}
              lossM={activeRouteData.elevationLossM}
              distanceKm={activeRouteData.distanceKm}
              unitSystem={unitSystem}
              onHoverDistance={handleHoverDistance}
            />
          </div>
        )}

        <div className="pointer-events-auto">
          <StatsHud
            routeData={activeRouteData}
            paceSeconds={paceSeconds}
            onPaceChange={setPaceSeconds}
            onOpenExport={() => setIsExportOpen(true)}
            showElevation={showElevation}
            onToggleElevation={() => setShowElevation(!showElevation)}
            unitSystem={unitSystem}
            onToggleUnit={() => setUnitSystem((u) => (u === 'km' ? 'mi' : 'km'))}
          />
        </div>
      </div>

      {/* Mobile Floating Elevation Profile (Compact, directly above docked mobile bar) */}
      {showElevation && activeRouteData && (
        <div className="md:hidden absolute inset-x-3 bottom-20 z-30 pointer-events-auto animate-in slide-in-from-bottom-2 fade-in">
          <ElevationProfile
            profile={activeRouteData.elevationProfile}
            gainM={activeRouteData.elevationGainM}
            lossM={activeRouteData.elevationLossM}
            distanceKm={activeRouteData.distanceKm}
            unitSystem={unitSystem}
            onHoverDistance={handleHoverDistance}
          />
        </div>
      )}

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
