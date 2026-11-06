'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  LatLng,
  Waypoint,
  RouteData,
  RouteMode,
  TileLayerId,
  GpsShapeKey,
} from '@/lib/types';
import { GPS_SHAPES } from '@/lib/shapes';
import { transformShapePoints } from '@/lib/geo';
import {
  fetchSmartManualRoute,
  generateAccurateLoop,
  generateGpsArtRoute,
  buildRouteData,
} from '@/lib/osrm';

import Sidebar from '@/components/UI/Sidebar';
import StatsHud from '@/components/UI/StatsHud';
import ElevationProfile from '@/components/UI/ElevationProfile';
import ExportModal from '@/components/UI/ExportModal';
import Toast, { ToastMessage } from '@/components/UI/Toast';

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
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);

  // 1. ISOLATED STATE: Manual Tap Mode
  const [manualWaypoints, setManualWaypoints] = useState<Waypoint[]>([]);
  const [manualRouteData, setManualRouteData] = useState<RouteData | null>(null);
  const [manualSnapToRoads, setManualSnapToRoads] = useState<boolean>(true);

  // 2. ISOLATED STATE: Random Loop Generator Mode
  const [loopStartLocation, setLoopStartLocation] = useState<LatLng | null>({
    lat: -6.2088,
    lng: 106.8456, // Central Jakarta default
  });
  const [targetDistanceKm, setTargetDistanceKm] = useState<number>(10);
  const [loopHeadingOffset, setLoopHeadingOffset] = useState<number>(45);
  const [loopWaypoints, setLoopWaypoints] = useState<Waypoint[]>([]);
  const [loopRouteData, setLoopRouteData] = useState<RouteData | null>(null);

  // 3. ISOLATED STATE: GPS Art Mode
  const [selectedShape, setSelectedShape] = useState<GpsShapeKey>('heart');
  const [artCenterLocation, setArtCenterLocation] = useState<LatLng | null>({
    lat: -6.2088,
    lng: 106.8456,
  });
  const [artScaleKm, setArtScaleKm] = useState<number>(3.0);
  const [artRotationDeg, setArtRotationDeg] = useState<number>(0);
  const [artSnapToRoads, setArtSnapToRoads] = useState<boolean>(false); // False = Pure recognizable shape
  const [showBlueprint, setShowBlueprint] = useState<boolean>(true);
  const [blueprintCoords, setBlueprintCoords] = useState<LatLng[] | null>(null);
  const [artWaypoints, setArtWaypoints] = useState<Waypoint[]>([]);
  const [artRouteData, setArtRouteData] = useState<RouteData | null>(null);

  // Stats & Pace HUD
  const [paceSeconds, setPaceSeconds] = useState<number>(360); // 6:00 / km
  const [showElevation, setShowElevation] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);

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

  // Update GPS Art Blueprint coordinates when shape, center, scale, or rotation changes
  useEffect(() => {
    if (!artCenterLocation) return;
    const shapeDef = GPS_SHAPES[selectedShape];
    if (!shapeDef) return;

    const transformed = transformShapePoints(
      shapeDef.points,
      artCenterLocation,
      artScaleKm,
      artRotationDeg
    );
    setBlueprintCoords(transformed);
  }, [selectedShape, artCenterLocation, artScaleKm, artRotationDeg]);

  // Handle Map Clicks based on active mode
  const handleMapClick = useCallback(
    async (clickedLatLng: LatLng) => {
      if (currentMode === 'manual') {
        const newWaypoint: Waypoint = {
          id: `wp-${Date.now()}-${manualWaypoints.length + 1}`,
          lat: clickedLatLng.lat,
          lng: clickedLatLng.lng,
          name: `Point ${manualWaypoints.length + 1}`,
        };

        const updatedWaypoints = [...manualWaypoints, newWaypoint];
        setManualWaypoints(updatedWaypoints);

        if (updatedWaypoints.length >= 2) {
          setIsLoadingRoute(true);
          const result = await fetchSmartManualRoute(updatedWaypoints, manualSnapToRoads);
          setIsLoadingRoute(false);

          const built = buildRouteData(
            updatedWaypoints,
            result,
            'manual',
            undefined,
            undefined
          );
          setManualRouteData(built);
        } else {
          setManualRouteData(null);
        }
      } else if (currentMode === 'random') {
        setLoopStartLocation(clickedLatLng);
        addToast(
          'info',
          'Titik Start Dipilih',
          `Lokasi diatur ke [${clickedLatLng.lat.toFixed(4)}, ${clickedLatLng.lng.toFixed(4)}]`
        );
      } else if (currentMode === 'art') {
        setArtCenterLocation(clickedLatLng);
        addToast(
          'info',
          'Pusat GPS Art Dipindahkan',
          `Titik tengah gambar diatur ke lokasi yang diklik.`
        );
      }
    },
    [currentMode, manualWaypoints, manualSnapToRoads, addToast]
  );

  // Manual Mode: Toggle Snap
  const handleToggleManualSnap = useCallback(
    async (newSnapState: boolean) => {
      setManualSnapToRoads(newSnapState);
      if (manualWaypoints.length >= 2) {
        setIsLoadingRoute(true);
        const result = await fetchSmartManualRoute(manualWaypoints, newSnapState);
        setIsLoadingRoute(false);
        setManualRouteData(buildRouteData(manualWaypoints, result, 'manual'));
      }
    },
    [manualWaypoints]
  );

  // Manual Mode: Undo
  const handleUndoManualWaypoint = useCallback(async () => {
    if (manualWaypoints.length === 0) return;
    const updated = manualWaypoints.slice(0, -1);
    setManualWaypoints(updated);

    if (updated.length >= 2) {
      setIsLoadingRoute(true);
      const result = await fetchSmartManualRoute(updated, manualSnapToRoads);
      setIsLoadingRoute(false);
      setManualRouteData(buildRouteData(updated, result, 'manual'));
    } else {
      setManualRouteData(null);
    }
  }, [manualWaypoints, manualSnapToRoads]);

  // Manual Mode: Clear
  const handleClearManualWaypoints = useCallback(() => {
    setManualWaypoints([]);
    setManualRouteData(null);
    addToast('info', 'Rute Manual Direset', 'Semua titik waypoint telah dihapus.');
  }, [addToast]);

  // Manual Mode: Close Loop
  const handleCloseManualLoop = useCallback(async () => {
    if (manualWaypoints.length < 2) return;
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
    const result = await fetchSmartManualRoute(closedWaypoints, manualSnapToRoads);
    setIsLoadingRoute(false);
    setManualRouteData(buildRouteData(closedWaypoints, result, 'manual'));
    addToast('success', 'Loop Berhasil Ditutup', 'Rute kembali ke titik awal!');
  }, [manualWaypoints, manualSnapToRoads, addToast]);

  // Manual Mode: Reverse Route
  const handleReverseManualRoute = useCallback(async () => {
    if (manualWaypoints.length < 2) return;
    const reversed = [...manualWaypoints].reverse();
    setManualWaypoints(reversed);
    setIsLoadingRoute(true);
    const result = await fetchSmartManualRoute(reversed, manualSnapToRoads);
    setIsLoadingRoute(false);
    setManualRouteData(buildRouteData(reversed, result, 'manual'));
    addToast('info', 'Arah Dibalik', 'Titik awal dan akhir rute telah ditukar.');
  }, [manualWaypoints, manualSnapToRoads, addToast]);

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
      const result = await generateAccurateLoop(loopStartLocation, targetDistanceKm, heading);
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
    [loopStartLocation, targetDistanceKm, loopHeadingOffset, addToast]
  );

  // Random Loop: Re-roll
  const handleReRollLoop = useCallback(() => {
    const nextHeading = (loopHeadingOffset + 60 + Math.random() * 30) % 360;
    setLoopHeadingOffset(nextHeading);
    handleGenerateLoop(nextHeading);
  }, [loopHeadingOffset, handleGenerateLoop]);

  // GPS Art: Generate
  const handleGenerateArt = useCallback(async () => {
    if (!artCenterLocation) {
      addToast('warning', 'Pusat Belum Dipilih', 'Klik peta untuk menentukan titik gambar.');
      return;
    }

    const shapeDef = GPS_SHAPES[selectedShape];
    if (!shapeDef) return;

    setIsLoadingRoute(true);
    const transformed = transformShapePoints(
      shapeDef.points,
      artCenterLocation,
      artScaleKm,
      artRotationDeg
    );
    setBlueprintCoords(transformed);

    const artWps: Waypoint[] = transformed.map((pt, idx) => ({
      id: `art-pt-${idx}`,
      lat: pt.lat,
      lng: pt.lng,
      name: `${shapeDef.name} #${idx + 1}`,
    }));
    setArtWaypoints(artWps);

    // Route calculation via smart GPS Art engine
    const result = await generateGpsArtRoute(transformed, artSnapToRoads);
    setIsLoadingRoute(false);

    const built = buildRouteData(artWps, result, 'art', artScaleKm, shapeDef.name);
    setArtRouteData(built);

    // Celebration confetti
    if (typeof window !== 'undefined') {
      try {
        const confetti = (await import('canvas-confetti')).default;
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.7 },
        });
      } catch {
        // ignore
      }
    }

    addToast(
      'success',
      `GPS Art ${shapeDef.name} Terbentuk!`,
      `Total lari: ${result.distanceKm.toFixed(2)} km. Bentuk presisi siap diekspor ke Strava!`
    );
  }, [
    artCenterLocation,
    selectedShape,
    artScaleKm,
    artRotationDeg,
    artSnapToRoads,
    addToast,
  ]);

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
        } else if (currentMode === 'art') {
          setArtCenterLocation(userLoc);
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

  // Mode-isolated active states
  const activeWaypoints =
    currentMode === 'manual'
      ? manualWaypoints
      : currentMode === 'random'
      ? loopWaypoints
      : artWaypoints;

  const activeRouteData =
    currentMode === 'manual'
      ? manualRouteData
      : currentMode === 'random'
      ? loopRouteData
      : artRouteData;

  // STRICT ISOLATION: GPS Art Blueprint ONLY renders in 'art' mode!
  const activeBlueprintCoords = currentMode === 'art' ? blueprintCoords : null;
  const isArtModeActive = currentMode === 'art';
  const activeCenterLocation =
    currentMode === 'art'
      ? artCenterLocation
      : currentMode === 'random'
      ? loopStartLocation
      : null;

  return (
    <main className="relative w-screen h-screen overflow-hidden flex bg-[#080c14]">
      {/* Interactive Fullscreen Map */}
      <div className="absolute inset-0 z-0">
        <RouteMap
          waypoints={activeWaypoints}
          routeData={activeRouteData}
          blueprintCoords={activeBlueprintCoords}
          showBlueprint={showBlueprint && isArtModeActive}
          selectedTile={selectedTile}
          onTileChange={setSelectedTile}
          onMapClick={handleMapClick}
          centerLocation={activeCenterLocation}
          isArtMode={isArtModeActive}
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
        snapToRoads={currentMode === 'art' ? artSnapToRoads : manualSnapToRoads}
        onToggleSnap={(snap) => {
          if (currentMode === 'art') {
            setArtSnapToRoads(snap);
          } else {
            handleToggleManualSnap(snap);
          }
        }}
        onUndoWaypoint={handleUndoManualWaypoint}
        onClearWaypoints={handleClearManualWaypoints}
        onCloseLoop={handleCloseManualLoop}
        onReverseRoute={handleReverseManualRoute}
        // Random loop props
        startLocation={loopStartLocation}
        targetDistanceKm={targetDistanceKm}
        onTargetDistanceChange={setTargetDistanceKm}
        onUseMyLocation={handleUseMyLocation}
        onGenerateLoop={() => handleGenerateLoop()}
        onReRollLoop={handleReRollLoop}
        // GPS Art props
        selectedShape={selectedShape}
        onSelectShape={setSelectedShape}
        artCenterLocation={artCenterLocation}
        artScaleKm={artScaleKm}
        onArtScaleChange={setArtScaleKm}
        artRotationDeg={artRotationDeg}
        onArtRotationChange={setArtRotationDeg}
        showBlueprint={showBlueprint}
        onToggleBlueprint={setShowBlueprint}
        onGenerateArt={handleGenerateArt}
        isLoading={isLoadingRoute}
      />

      {/* Floating Metrics HUD & Elevation Profile */}
      <div className="absolute right-4 bottom-4 md:bottom-6 z-30 max-w-sm w-full space-y-3 pointer-events-none">
        {showElevation && activeRouteData && (
          <div className="pointer-events-auto animate-in slide-in-from-bottom-3 fade-in duration-200">
            <ElevationProfile
              profile={activeRouteData.elevationProfile}
              gainM={activeRouteData.elevationGainM}
              lossM={activeRouteData.elevationLossM}
              distanceKm={activeRouteData.distanceKm}
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

      {/* Toast Notification Container */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </main>
  );
}
