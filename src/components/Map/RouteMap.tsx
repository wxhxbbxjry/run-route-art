'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { LatLng, Waypoint, RouteData, TileLayerId } from '@/lib/types';
import { TILE_LAYERS } from '@/lib/layers';
import {
  Layers,
  Crosshair,
  Maximize2,
  Plus,
  Minus,
} from 'lucide-react';

interface RouteMapProps {
  waypoints: Waypoint[];
  routeData: RouteData | null;
  blueprintCoords: LatLng[] | null;
  showBlueprint: boolean;
  selectedTile: TileLayerId;
  onTileChange: (tile: TileLayerId) => void;
  onMapClick: (latlng: LatLng) => void;
  onWaypointDrag?: (index: number, latlng: LatLng) => void;
  centerLocation?: LatLng | null;
  isArtMode?: boolean;
}

export default function RouteMap({
  waypoints,
  routeData,
  blueprintCoords,
  showBlueprint,
  selectedTile,
  onTileChange,
  onMapClick,
  onWaypointDrag,
  centerLocation,
  isArtMode = false,
}: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const routeGlowPolylineRef = useRef<L.Polyline | null>(null);
  const blueprintPolylineRef = useRef<L.Polyline | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Initialize Map on mount
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center: Jakarta (-6.2088, 106.8456) or user initial location
    const initialCenter: [number, number] = centerLocation
      ? [centerLocation.lat, centerLocation.lng]
      : [-6.2088, 106.8456];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false, // custom zoom controls
      attributionControl: true,
    });

    mapInstanceRef.current = map;

    // Initialize Tile Layer
    const tileConfig = TILE_LAYERS[selectedTile] || TILE_LAYERS.dark;
    const tileLayer = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
      subdomains: tileConfig.subdomains || ['a', 'b', 'c'],
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Markers layer group
    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    // Handle map click
    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // Handle resize
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Update base tile layer when selectedTile changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tileConfig = TILE_LAYERS[selectedTile] || TILE_LAYERS.dark;
    const newTileLayer = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
      subdomains: tileConfig.subdomains || ['a', 'b', 'c'],
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
    newTileLayer.bringToBack();
  }, [selectedTile]);

  // Update blueprint polyline (GPS Art target wireframe)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (blueprintPolylineRef.current) {
      map.removeLayer(blueprintPolylineRef.current);
      blueprintPolylineRef.current = null;
    }

    if (blueprintCoords && blueprintCoords.length > 1 && showBlueprint) {
      const latlngs = blueprintCoords.map((c) => [c.lat, c.lng] as [number, number]);
      const blueprint = L.polyline(latlngs, {
        color: '#06b6d4', // neon cyan
        weight: 3.5,
        opacity: 0.85,
        dashArray: '8, 8',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      blueprintPolylineRef.current = blueprint;
    }
  }, [blueprintCoords, showBlueprint]);

  // Update routed polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean previous polylines
    if (routeGlowPolylineRef.current) {
      map.removeLayer(routeGlowPolylineRef.current);
      routeGlowPolylineRef.current = null;
    }
    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    if (routeData && routeData.coordinates.length > 1) {
      const latlngs = routeData.coordinates.map((c) => [c.lat, c.lng] as [number, number]);

      // Glow effect background polyline
      const glowPolyline = L.polyline(latlngs, {
        color: routeData.isSnapped ? '#a3e635' : '#f97316', // neon lime if snapped, orange if direct
        weight: 10,
        opacity: 0.35,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      routeGlowPolylineRef.current = glowPolyline;

      // Crisp foreground polyline
      const polyline = L.polyline(latlngs, {
        color: routeData.isSnapped ? '#a3e635' : '#f97316',
        weight: 4.5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      routePolylineRef.current = polyline;
    }
  }, [routeData]);

  // Update Markers (Start, Finish, Waypoints, Art Center)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    // Render center marker for art mode
    if (isArtMode && centerLocation) {
      const centerIcon = L.divIcon({
        className: 'custom-pin-center-wrapper',
        html: `
          <div class="custom-pin-center" title="Pusat GPS Art">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3"></path>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker([centerLocation.lat, centerLocation.lng], { icon: centerIcon })
        .addTo(markersGroup)
        .bindPopup('<b class="text-slate-900 font-sans">Titik Pusat Gambar GPS Art</b>');
    }

    // Render waypoints
    waypoints.forEach((wp, idx) => {
      const isStart = idx === 0;
      const isFinish = idx === waypoints.length - 1 && waypoints.length > 1;

      let iconHtml = '';
      let iconClass = '';
      let size: [number, number] = [22, 22];
      let anchor: [number, number] = [11, 11];

      if (isStart) {
        iconClass = 'custom-pin-start';
        iconHtml = 'S';
        size = [30, 30];
        anchor = [15, 15];
      } else if (isFinish && (Math.abs(wp.lat - waypoints[0].lat) > 0.0001 || Math.abs(wp.lng - waypoints[0].lng) > 0.0001)) {
        iconClass = 'custom-pin-finish';
        iconHtml = 'F';
        size = [30, 30];
        anchor = [15, 15];
      } else {
        iconClass = 'custom-pin-waypoint';
        iconHtml = `${idx + 1}`;
        size = [22, 22];
        anchor = [11, 11];
      }

      const customIcon = L.divIcon({
        className: 'custom-pin-container',
        html: `<div class="${iconClass}" title="Waypoint ${idx + 1}">${iconHtml}</div>`,
        iconSize: size,
        iconAnchor: anchor,
      });

      const marker = L.marker([wp.lat, wp.lng], {
        icon: customIcon,
        draggable: !!onWaypointDrag,
      }).addTo(markersGroup);

      if (onWaypointDrag) {
        marker.on('dragend', (e) => {
          const target = e.target as L.Marker;
          const pos = target.getLatLng();
          onWaypointDrag(idx, { lat: pos.lat, lng: pos.lng });
        });
      }
    });
  }, [waypoints, isArtMode, centerLocation, onWaypointDrag]);

  // Center or Fit Bounds
  const fitToRoute = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routePolylineRef.current && routeData && routeData.coordinates.length > 1) {
      map.fitBounds(routePolylineRef.current.getBounds(), {
        padding: [60, 60],
        maxZoom: 16,
      });
    } else if (waypoints.length > 0) {
      const bounds = L.latLngBounds(waypoints.map((w) => [w.lat, w.lng]));
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 });
    } else if (centerLocation) {
      map.setView([centerLocation.lat, centerLocation.lng], 14, { animate: true });
    }
  }, [routeData, waypoints, centerLocation]);

  // Handle Current Location
  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolokasi tidak didukung oleh browser Anda.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        const map = mapInstanceRef.current;
        if (map) {
          map.setView([latitude, longitude], 15, { animate: true });
        }
        onMapClick({ lat: latitude, lng: longitude });
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        alert('Gagal mengambil lokasi perangkat. Pastikan izin GPS aktif.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [onMapClick]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Leaflet container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full z-0 cursor-crosshair ${
          selectedTile === 'dark' ? 'dark-map-mode' : ''
        }`}
      />

      {/* Map Control Buttons (Floating Right) */}
      <div className="absolute right-4 top-20 flex flex-col gap-2 z-20">
        {/* Layer Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowLayerPicker(!showLayerPicker)}
            title="Ganti Tampilan Peta"
            className="w-11 h-11 rounded-xl glass-pill flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/90 shadow-lg transition active:scale-95"
          >
            <Layers className="w-5 h-5" />
          </button>

          {showLayerPicker && (
            <div className="absolute right-14 top-0 w-44 rounded-xl glass-panel p-2 shadow-2xl z-30 border border-slate-700/60 animate-in fade-in slide-in-from-right-3">
              <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-2 py-1">
                Pilih Base Map
              </p>
              {Object.values(TILE_LAYERS).map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => {
                    onTileChange(layer.id);
                    setShowLayerPicker(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition ${
                    selectedTile === layer.id
                      ? 'bg-lime-500/20 text-lime-400 border border-lime-500/40'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  <span>{layer.name}</span>
                  {selectedTile === layer.id && (
                    <span className="w-1.5 h-1.5 rounded-full bg-lime-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Locate Me Button */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          title="Gunakan Lokasi Saya"
          className="w-11 h-11 rounded-xl glass-pill flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/90 shadow-lg transition active:scale-95"
        >
          <Crosshair
            className={`w-5 h-5 ${isLocating ? 'animate-spin text-lime-400' : ''}`}
          />
        </button>

        {/* Fit Route Bounds Button */}
        {(routeData || waypoints.length > 0) && (
          <button
            onClick={fitToRoute}
            title="Fokus ke Seluruh Rute"
            className="w-11 h-11 rounded-xl glass-pill flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/90 shadow-lg transition active:scale-95"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        )}

        {/* Zoom Controls */}
        <div className="flex flex-col rounded-xl glass-pill overflow-hidden shadow-lg mt-2">
          <button
            onClick={() => mapInstanceRef.current?.zoomIn()}
            title="Perbesar"
            className="w-11 h-10 flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/90 transition border-b border-slate-700/50"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            onClick={() => mapInstanceRef.current?.zoomOut()}
            title="Perkecil"
            className="w-11 h-10 flex items-center justify-center text-slate-200 hover:text-white hover:bg-slate-800/90 transition"
          >
            <Minus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
