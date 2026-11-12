'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, PaddingOptions } from 'maplibre-gl';
import { LatLng, Waypoint, RouteData, RouteMode, TileLayerId, UnitSystem } from '@/lib/types';
import {
  TILE_LAYERS,
  HEATMAP_PLANET_SOURCE_URL,
  LIGHT_SHELL_STYLE,
  DARK_SHELL_STYLE,
  buildRasterMapStyle,
  loadStravaOutdoorStyle,
  loadStravaDarkStyle,
} from '@/lib/layers';
import {
  buildGradientSegments,
  buildRouteMileposts,
  buildCirclePolygonCoords,
  haversineDistance,
} from '@/lib/geo';
import { OBVITNAS_ZONES } from '@/lib/obvitnas';
import {
  Layers,
  Crosshair,
  Maximize2,
  Plus,
  Minus,
  Compass,
  Box,
  Flame,
  RotateCcw,
} from 'lucide-react';

interface RouteMapProps {
  waypoints: Waypoint[];
  routeData: RouteData | null;
  peekRouteData?: RouteData | null;
  editableAnchors?: LatLng[];
  requestedStartLocation?: LatLng | null;
  routeMode: RouteMode;
  selectedTile: TileLayerId;
  unitSystem?: UnitSystem;
  fitTrigger?: number;
  userLocation?: LatLng | null;
  onTileChange: (tile: TileLayerId) => void;
  onMapClick: (latlng: LatLng) => void;
  onUserLocationDetected?: (latlng: LatLng) => void;
  onLocationError?: (message: string) => void;
  onWaypointDrag?: (index: number, latlng: LatLng) => void;
  onWaypointDelete?: (index: number) => void;
  onAnchorDrag?: (index: number, latlng: LatLng) => void;
  onAnchorInsert?: (latlng: LatLng) => void;
  onAnchorDelete?: (index: number) => void;
  onResetMap?: () => void;
  flyToLocation?: LatLng | null;
}

// Sudirman - Bundaran HI - GBK Senayan runner corridor
const DEFAULT_JAKARTA_CENTER: [number, number] = [106.822, -6.2088];

function buildObvitnasGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: OBVITNAS_ZONES.map((zone) => ({
      type: 'Feature' as const,
      properties: {
        id: zone.id,
        name: zone.name,
        sector: zone.sector,
        sectorName: zone.sectorName,
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [buildCirclePolygonCoords(zone.lat, zone.lng, zone.radiusKm, 48)],
      },
    })),
  };
}

function buildRouteGeoJson(routeData: RouteData | null) {
  if (!routeData || routeData.coordinates.length < 2) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }

  const segments = buildGradientSegments(routeData.coordinates, 60);
  return {
    type: 'FeatureCollection' as const,
    features: segments.map((seg, idx) => ({
      type: 'Feature' as const,
      properties: {
        idx,
        color: seg.color,
        fraction: seg.fraction,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: seg.coordinates.map((c) => [c.lng, c.lat] as [number, number]),
      },
    })),
  };
}

function buildFullRouteLineGeoJson(routeData: RouteData | null) {
  if (!routeData || routeData.coordinates.length < 2) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: routeData.coordinates.map((c) => [c.lng, c.lat] as [number, number]),
        },
      },
    ],
  };
}

function buildStartConnectorGeoJson(
  requestedStart: LatLng | null,
  routeData: RouteData | null
) {
  if (!requestedStart || !routeData || routeData.coordinates.length === 0) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }
  const actualStart = routeData.coordinates[0];
  if (haversineDistance(requestedStart, actualStart) <= 0.012) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [requestedStart.lng, requestedStart.lat] as [number, number],
            [actualStart.lng, actualStart.lat] as [number, number],
          ],
        },
      },
    ],
  };
}

function buildSignalsGeoJson(routeData: RouteData | null) {
  const pts = routeData?.signalPoints;
  if (!pts || pts.length === 0) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }
  return {
    type: 'FeatureCollection' as const,
    features: pts.map((pt, idx) => ({
      type: 'Feature' as const,
      properties: { idx },
      geometry: {
        type: 'Point' as const,
        coordinates: [pt.lng, pt.lat] as [number, number],
      },
    })),
  };
}

function buildPreviewGeoJson(from: LatLng | null, to: LatLng | null) {
  if (!from || !to) {
    return {
      type: 'FeatureCollection' as const,
      features: [],
    };
  }
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [from.lng, from.lat] as [number, number],
            [to.lng, to.lat] as [number, number],
          ],
        },
      },
    ],
  };
}

function registerStravaArrowImage(map: maplibregl.Map) {
  if (map.hasImage('strava-arrow')) return;

  const size = 24;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Subtle dark outer stroke so chevron stays crisp on any color
  ctx.beginPath();
  ctx.moveTo(8, 5);
  ctx.lineTo(16.5, 12);
  ctx.lineTo(8, 19);
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
  ctx.lineWidth = 4.6;
  ctx.stroke();

  // Crisp bright white directional arrow core
  ctx.beginPath();
  ctx.moveTo(8, 5);
  ctx.lineTo(16.5, 12);
  ctx.lineTo(8, 19);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.4;
  ctx.stroke();

  const imgData = ctx.getImageData(0, 0, size, size);
  map.addImage('strava-arrow', { width: size, height: size, data: imgData.data });
}

function findFirstSymbolLayerId(map: maplibregl.Map): string | undefined {
  const layers = map.getStyle()?.layers;
  if (!layers) return undefined;
  for (const layer of layers) {
    if (
      layer.type === 'symbol' &&
      (layer.id.includes('name') || layer.id.includes('place') || layer.id.includes('poi'))
    ) {
      return layer.id;
    }
  }
  return undefined;
}

export default function RouteMap({
  waypoints,
  routeData,
  peekRouteData = null,
  editableAnchors = [],
  requestedStartLocation = null,
  routeMode,
  selectedTile,
  unitSystem = 'km',
  fitTrigger = 0,
  userLocation = null,
  onTileChange,
  onMapClick,
  onUserLocationDetected,
  onLocationError,
  onWaypointDrag,
  onWaypointDelete,
  onAnchorDrag,
  onAnchorInsert,
  onAnchorDelete,
  onResetMap,
  flyToLocation,
}: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const scaleControlRef = useRef<maplibregl.ScaleControl | null>(null);
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const milepostMarkersRef = useRef<maplibregl.Marker[]>([]);
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const obvitnasHoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const layerPickerContainerRef = useRef<HTMLDivElement>(null);

  const onMapClickRef = useRef(onMapClick);
  const onUserLocationDetectedRef = useRef(onUserLocationDetected);
  const onAnchorInsertRef = useRef(onAnchorInsert);
  const routeDataRef = useRef(routeData);
  const peekRouteDataRef = useRef(peekRouteData);
  const editableAnchorsRef = useRef(editableAnchors);
  const requestedStartLocationRef = useRef(requestedStartLocation);
  const waypointsRef = useRef(waypoints);
  const routeModeRef = useRef(routeMode);
  const selectedTileRef = useRef(selectedTile);
  const showLayerPickerRef = useRef(false);
  const showHeatmapRef = useRef(false);
  const is3DModeRef = useRef(false);
  const fallbackUsedRef = useRef<string | null>(null);
  const appliedTileRef = useRef<TileLayerId | null>(null);
  const styleReqSeqRef = useRef<number>(0);
  const previewRafRef = useRef<number | null>(null);
  const lastFlyTargetRef = useRef<LatLng | null>(null);
  const lastFitTriggerRef = useRef<number>(fitTrigger);

  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(14);
  const [isRotatedOrTilted, setIsRotatedOrTilted] = useState<boolean>(false);
  const [is3DMode, setIs3DMode] = useState<boolean>(false);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onUserLocationDetectedRef.current = onUserLocationDetected;
  }, [onUserLocationDetected]);

  useEffect(() => {
    onAnchorInsertRef.current = onAnchorInsert;
  }, [onAnchorInsert]);

  useEffect(() => {
    routeDataRef.current = routeData;
  }, [routeData]);

  useEffect(() => {
    peekRouteDataRef.current = peekRouteData;
  }, [peekRouteData]);

  useEffect(() => {
    editableAnchorsRef.current = editableAnchors;
  }, [editableAnchors]);

  useEffect(() => {
    requestedStartLocationRef.current = requestedStartLocation;
  }, [requestedStartLocation]);

  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    routeModeRef.current = routeMode;
  }, [routeMode]);

  useEffect(() => {
    selectedTileRef.current = selectedTile;
  }, [selectedTile]);

  useEffect(() => {
    showLayerPickerRef.current = showLayerPicker;
  }, [showLayerPicker]);

  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
  }, [showHeatmap]);

  useEffect(() => {
    is3DModeRef.current = is3DMode;
  }, [is3DMode]);

  // Close layer picker on outside click or Escape key
  useEffect(() => {
    if (!showLayerPicker) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        layerPickerContainerRef.current &&
        !layerPickerContainerRef.current.contains(e.target as Node)
      ) {
        setShowLayerPicker(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLayerPicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLayerPicker]);

  // Responsive viewport padding outside Sidebar, MobileTopHud, Right Dock & Bottom HUDs
  const getViewportPadding = useCallback((): PaddingOptions => {
    if (typeof window === 'undefined') {
      return { top: 24, bottom: 130, left: 436, right: 96 };
    }
    if (window.innerWidth >= 1024) {
      return {
        top: 24,
        bottom: 140,
        left: 436,
        right: 110,
      };
    }
    if (window.innerWidth >= 768) {
      return {
        top: 24,
        bottom: 130,
        left: 350,
        right: 96,
      };
    }
    return {
      top: 72,
      bottom: 96,
      left: 16,
      right: 64,
    };
  }, []);

  // Ensure Heatmap + Obvitnas + Preview + Route GeoJSON + Direction Arrows exist in active style
  const ensureCustomLayers = useCallback((map: maplibregl.Map, forceAdd: boolean = false) => {
    if (!forceAdd && !map.isStyleLoaded()) return;
    if (!map.getStyle()) return;

    registerStravaArrowImage(map);

    const tileCfg = TILE_LAYERS[selectedTileRef.current] || TILE_LAYERS['strava-outdoor'];
    const casingColor = tileCfg.isDarkSurface ? '#0b1120' : '#1e293b';
    const casingOpacity = tileCfg.isDarkSurface ? 0.92 : 0.72;
    const glowOpacity = tileCfg.isDarkSurface ? 0.34 : 0.16;
    const beforeSymbolId = findFirstSymbolLayerId(map);
    const beforeHeatmapId =
      beforeSymbolId ||
      (map.getLayer('obvitnas-fill')
        ? 'obvitnas-fill'
        : map.getLayer('route-glow')
        ? 'route-glow'
        : undefined);

    // Sync 3D building visibility on styles with building-3d
    if (map.getLayer('building-3d')) {
      map.setLayoutProperty('building-3d', 'visibility', is3DModeRef.current ? 'visible' : 'none');
    }

    // 1. Free Strava-Style "Heatmap Jalur Lari Populer" Layer using OSM Vector Corridor Classes
    const hasNativeVectorSource = Boolean(map.getSource('openmaptiles'));
    const heatSourceId = hasNativeVectorSource ? 'openmaptiles' : 'strava-heat-tiles';

    if (!hasNativeVectorSource && showHeatmapRef.current && !map.getSource('strava-heat-tiles')) {
      map.addSource('strava-heat-tiles', {
        type: 'vector',
        url: HEATMAP_PLANET_SOURCE_URL,
      });
    }

    const canMountHeatmap = Boolean(map.getSource(heatSourceId));
    const heatVis = showHeatmapRef.current && canMountHeatmap ? 'visible' : 'none';

    if (canMountHeatmap) {
      if (!map.getLayer('strava-heatmap-arterial')) {
        map.addLayer(
          {
            id: 'strava-heatmap-arterial',
            type: 'line',
            source: heatSourceId,
            'source-layer': 'transportation',
            minzoom: 11,
            filter: [
              'all',
              ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
              ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary'], true, false],
            ],
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
              visibility: heatVis,
            },
            paint: {
              'line-color': '#fc4c02',
              'line-opacity': tileCfg.isDarkSurface ? 0.28 : 0.16,
              'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.0, 14, 2.4, 18, 4.8],
              'line-blur': 1.1,
            },
          },
          beforeHeatmapId
        );
      }

      if (!map.getLayer('strava-heatmap-hot')) {
        map.addLayer(
          {
            id: 'strava-heatmap-hot',
            type: 'line',
            source: heatSourceId,
            'source-layer': 'transportation',
            minzoom: 11,
            filter: [
              'all',
              ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
              ['match', ['get', 'class'], ['path', 'pedestrian', 'track'], true, false],
            ],
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
              visibility: heatVis,
            },
            paint: {
              'line-color': '#fc4c02',
              'line-opacity': tileCfg.isDarkSurface ? 0.58 : 0.36,
              'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.4, 14, 3.6, 18, 6.2],
              'line-blur': 1.2,
            },
          },
          beforeHeatmapId
        );
      }

      if (!map.getLayer('strava-heatmap-core')) {
        map.addLayer(
          {
            id: 'strava-heatmap-core',
            type: 'line',
            source: heatSourceId,
            'source-layer': 'transportation',
            minzoom: 12,
            filter: [
              'all',
              ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
              ['match', ['get', 'class'], ['path', 'pedestrian', 'track'], true, false],
            ],
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
              visibility: heatVis,
            },
            paint: {
              'line-color': tileCfg.isDarkSurface ? '#fed7aa' : '#ff7733',
              'line-opacity': tileCfg.isDarkSurface ? 0.68 : 0.48,
              'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 14, 1.3, 18, 2.4],
            },
          },
          beforeHeatmapId
        );
      }
    }

    // 2. Objek Vital Nasional Sterile Zones
    if (!map.getSource('obvitnas-zones')) {
      map.addSource('obvitnas-zones', {
        type: 'geojson',
        data: buildObvitnasGeoJson(),
      });
    }

    if (!map.getLayer('obvitnas-fill')) {
      map.addLayer({
        id: 'obvitnas-fill',
        type: 'fill',
        source: 'obvitnas-zones',
        minzoom: 10.5,
        layout: {
          visibility: 'visible',
        },
        paint: {
          'fill-color': '#e11d48',
          'fill-opacity': 0.1,
        },
      });
    }

    if (!map.getLayer('obvitnas-outline')) {
      map.addLayer({
        id: 'obvitnas-outline',
        type: 'line',
        source: 'obvitnas-zones',
        minzoom: 10.5,
        layout: {
          visibility: 'visible',
        },
        paint: {
          'line-color': '#e11d48',
          'line-width': 1.5,
          'line-opacity': 0.72,
          'line-dasharray': [3, 3],
        },
      });
    }

    // 3. Manual Tap Dashed Rubberband Preview
    if (!map.getSource('route-preview')) {
      map.addSource('route-preview', {
        type: 'geojson',
        data: buildPreviewGeoJson(null, null),
      });
    }

    if (!map.getLayer('route-preview-line')) {
      map.addLayer({
        id: 'route-preview-line',
        type: 'line',
        source: 'route-preview',
        layout: {
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#fc4c02',
          'line-width': 2.2,
          'line-opacity': 0.75,
          'line-dasharray': [2.5, 2.5],
        },
      });
    }

    // 3b. RunCulture Candidate Hover-Peek Ghost Layer (Dashed Sky-Blue)
    if (!map.getSource('route-peek')) {
      map.addSource('route-peek', {
        type: 'geojson',
        data: buildFullRouteLineGeoJson(peekRouteDataRef.current),
      });
    } else {
      const peekSrc = map.getSource('route-peek') as GeoJSONSource | undefined;
      peekSrc?.setData(buildFullRouteLineGeoJson(peekRouteDataRef.current));
    }

    if (!map.getLayer('route-peek-line')) {
      map.addLayer({
        id: 'route-peek-line',
        type: 'line',
        source: 'route-peek',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#0ea5e9',
          'line-width': 3.6,
          'line-opacity': 0.88,
          'line-dasharray': [2.2, 2.2],
        },
      });
    }

    // 3c. Snap Connector Line (requestedStartLocation -> actual vehicle road start if > 12m)
    if (!map.getSource('route-start-connector')) {
      map.addSource('route-start-connector', {
        type: 'geojson',
        data: buildStartConnectorGeoJson(requestedStartLocationRef.current, routeDataRef.current),
      });
    } else {
      const connSrc = map.getSource('route-start-connector') as GeoJSONSource | undefined;
      connSrc?.setData(
        buildStartConnectorGeoJson(requestedStartLocationRef.current, routeDataRef.current)
      );
    }

    if (!map.getLayer('route-start-connector-line')) {
      map.addLayer({
        id: 'route-start-connector-line',
        type: 'line',
        source: 'route-start-connector',
        layout: {
          'line-cap': 'round',
        },
        paint: {
          'line-color': tileCfg.isDarkSurface ? '#94a3b8' : '#475569',
          'line-width': 2.0,
          'line-opacity': 0.72,
          'line-dasharray': [1.6, 1.8],
        },
      });
    }

    // 4. Route Polyline Layers (Slim Distance Gradient + High-Contrast Casing + Directional Chevrons)
    if (!map.getSource('route-segments')) {
      map.addSource('route-segments', {
        type: 'geojson',
        data: buildRouteGeoJson(routeDataRef.current),
      });
    } else {
      const src = map.getSource('route-segments') as GeoJSONSource | undefined;
      src?.setData(buildRouteGeoJson(routeDataRef.current));
    }

    if (!map.getSource('route-full-line')) {
      map.addSource('route-full-line', {
        type: 'geojson',
        data: buildFullRouteLineGeoJson(routeDataRef.current),
      });
    } else {
      const fullSrc = map.getSource('route-full-line') as GeoJSONSource | undefined;
      fullSrc?.setData(buildFullRouteLineGeoJson(routeDataRef.current));
    }

    if (!map.getLayer('route-glow')) {
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route-segments',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 7,
          'line-opacity': glowOpacity,
          'line-blur': 2.2,
        },
      });
    }

    if (!map.getLayer('route-casing')) {
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route-segments',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': casingColor,
          'line-width': 4.8,
          'line-opacity': casingOpacity,
        },
      });
    } else {
      map.setPaintProperty('route-casing', 'line-color', casingColor);
      map.setPaintProperty('route-casing', 'line-opacity', casingOpacity);
    }

    if (!map.getLayer('route-core')) {
      map.addLayer({
        id: 'route-core',
        type: 'line',
        source: 'route-segments',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3.0,
          'line-opacity': 1,
        },
      });
    }

    if (!map.getLayer('route-arrows')) {
      map.addLayer({
        id: 'route-arrows',
        type: 'symbol',
        source: 'route-full-line',
        minzoom: 11.5,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 90,
          'icon-image': 'strava-arrow',
          'icon-size': 0.56,
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }

    // 4b. Wide invisible hit-target along route line for easy click-to-insert anchor in Generator mode
    if (!map.getLayer('route-hit-area')) {
      map.addLayer({
        id: 'route-hit-area',
        type: 'line',
        source: 'route-full-line',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': 18,
          'line-opacity': 0.001,
        },
      });
    }

    // 5. Traffic Signal Markers along Route (RunCulture Intersection Signals)
    if (!map.getSource('route-signals')) {
      map.addSource('route-signals', {
        type: 'geojson',
        data: buildSignalsGeoJson(routeDataRef.current),
      });
    } else {
      const sigSrc = map.getSource('route-signals') as GeoJSONSource | undefined;
      sigSrc?.setData(buildSignalsGeoJson(routeDataRef.current));
    }

    if (!map.getLayer('route-signals-circle')) {
      map.addLayer({
        id: 'route-signals-circle',
        type: 'circle',
        source: 'route-signals',
        minzoom: 12.5,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12.5, 3.2, 16, 5.2],
          'circle-color': '#f59e0b',
          'circle-stroke-color': tileCfg.isDarkSurface ? '#0f172a' : '#ffffff',
          'circle-stroke-width': 1.6,
          'circle-opacity': 0.95,
        },
      });
    } else {
      map.setPaintProperty(
        'route-signals-circle',
        'circle-stroke-color',
        tileCfg.isDarkSurface ? '#0f172a' : '#ffffff'
      );
    }
  }, []);

  // Resolve synchronous placeholder or raster spec
  const getSyncStyleForTile = useCallback((tileId: TileLayerId) => {
    const cfg = TILE_LAYERS[tileId] || TILE_LAYERS['strava-outdoor'];
    if (tileId === 'strava-outdoor') return LIGHT_SHELL_STYLE;
    if (tileId === 'strava-dark') return DARK_SHELL_STYLE;
    return buildRasterMapStyle(cfg);
  }, []);

  // Apply selected Strava style safely with async sequence guard
  const applyTileStyle = useCallback(
    (map: maplibregl.Map, tileId: TileLayerId) => {
      const reqSeq = ++styleReqSeqRef.current;
      appliedTileRef.current = tileId;
      fallbackUsedRef.current = null;

      const cfg = TILE_LAYERS[tileId] || TILE_LAYERS['strava-outdoor'];
      map.setMaxZoom(cfg.maxZoom);

      if (tileId === 'strava-outdoor') {
        loadStravaOutdoorStyle().then((styleSpec) => {
          if (mapRef.current === map && styleReqSeqRef.current === reqSeq) {
            map.setStyle(styleSpec, { diff: false });
          }
        });
        return;
      }

      if (tileId === 'strava-dark') {
        loadStravaDarkStyle().then((styleSpec) => {
          if (mapRef.current === map && styleReqSeqRef.current === reqSeq) {
            map.setStyle(styleSpec, { diff: false });
          }
        });
        return;
      }

      map.setStyle(buildRasterMapStyle(cfg), { diff: false });
    },
    []
  );

  // Initialize MapLibre GL engine
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    maplibregl.setWorkerUrl('/maplibre-gl-worker.js');

    const initialCenter: [number, number] =
      waypoints.length > 0
        ? [waypoints[0].lng, waypoints[0].lat]
        : flyToLocation
        ? [flyToLocation.lng, flyToLocation.lat]
        : userLocation
        ? [userLocation.lng, userLocation.lat]
        : DEFAULT_JAKARTA_CENTER;

    if (flyToLocation && waypoints.length === 0) {
      lastFlyTargetRef.current = flyToLocation;
    }

    const initialConfig = TILE_LAYERS[selectedTile] || TILE_LAYERS['strava-outdoor'];
    appliedTileRef.current = selectedTile;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getSyncStyleForTile(selectedTile),
      center: initialCenter,
      zoom: 14,
      maxZoom: initialConfig.maxZoom,
      minZoom: 2,
      attributionControl: false,
      pitchWithRotate: true,
    });

    mapRef.current = map;

    if (selectedTile === 'strava-outdoor' || selectedTile === 'strava-dark') {
      applyTileStyle(map, selectedTile);
    }

    const attribControl = new maplibregl.AttributionControl({
      compact: true,
    });
    map.addControl(attribControl, 'bottom-left');

    const scaleControl = new maplibregl.ScaleControl({
      maxWidth: 110,
      unit: unitSystem === 'mi' ? 'imperial' : 'metric',
    });
    scaleControlRef.current = scaleControl;
    map.addControl(scaleControl, 'bottom-left');

    const initialPadding = getViewportPadding();
    map.setPadding(initialPadding);
    map.jumpTo({ center: initialCenter, zoom: 14, padding: initialPadding });

    const handleStyleLoad = () => {
      ensureCustomLayers(map, true);
    };
    map.on('style.load', handleStyleLoad);

    const missingImgPlaceholder = new Uint8Array([0, 0, 0, 0]);
    map.setMissingStyleImageResolver((id: string) => {
      if (id && !map.hasImage(id)) {
        map.addImage(id, { width: 1, height: 1, data: missingImgPlaceholder });
      }
    });

    const handleCameraSync = () => {
      const z = Math.round(map.getZoom() * 10) / 10;
      setZoomLevel(z);
      const bearing = Math.abs(map.getBearing());
      const pitch = map.getPitch();
      setIsRotatedOrTilted(bearing > 1.5 || pitch > 2);
      setIs3DMode(pitch > 10);
    };
    map.on('zoom', handleCameraSync);
    map.on('rotate', handleCameraSync);
    map.on('pitch', handleCameraSync);

    // Live dashed preview line from last manual waypoint to mouse cursor
    map.on('mousemove', (e: maplibregl.MapMouseEvent) => {
      if (routeModeRef.current !== 'manual' || waypointsRef.current.length === 0) {
        return;
      }
      const lastWp = waypointsRef.current[waypointsRef.current.length - 1];
      if (!lastWp) return;

      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
      previewRafRef.current = requestAnimationFrame(() => {
        const previewSrc = map.getSource('route-preview') as GeoJSONSource | undefined;
        previewSrc?.setData(buildPreviewGeoJson(lastWp, { lat: e.lngLat.lat, lng: e.lngLat.lng }));
      });
    });

    map.on('mouseout', () => {
      const previewSrc = map.getSource('route-preview') as GeoJSONSource | undefined;
      previewSrc?.setData(buildPreviewGeoJson(null, null));
    });

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const origTarget = e.originalEvent?.target as HTMLElement | null;
      if (origTarget?.closest('.maplibregl-marker') || origTarget?.closest('.maplibregl-popup')) {
        return;
      }

      if (showLayerPickerRef.current) {
        setShowLayerPicker(false);
        return;
      }

      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }

      if (
        routeModeRef.current === 'random' &&
        onAnchorInsertRef.current &&
        editableAnchorsRef.current.length >= 2 &&
        map.getLayer('route-hit-area')
      ) {
        const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
          [e.point.x - 8, e.point.y - 8],
          [e.point.x + 8, e.point.y + 8],
        ];
        const hits = map.queryRenderedFeatures(bbox, { layers: ['route-hit-area'] });
        if (hits.length > 0) {
          onAnchorInsertRef.current({ lat: e.lngLat.lat, lng: e.lngLat.lng });
          return;
        }
      }

      onMapClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
    });
    obvitnasHoverPopupRef.current = hoverPopup;

    map.on('mousemove', 'obvitnas-fill', (e: maplibregl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      map.getCanvas().style.cursor = 'help';
      const props = feat.properties || {};
      hoverPopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-xs leading-snug">
            <span class="block text-[9px] text-rose-600 dark:text-rose-400 font-extrabold uppercase tracking-wider">Zona Steril Obvitnas</span>
            <span class="font-bold text-slate-900 dark:text-slate-100">${props.name || ''}</span>
            <span class="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">${props.sectorName || ''}</span>
          </div>`
        )
        .addTo(map);
    });

    map.on('mouseleave', 'obvitnas-fill', () => {
      map.getCanvas().style.cursor = '';
      hoverPopup.remove();
    });

    map.on('mousemove', 'route-hit-area', () => {
      if (
        routeModeRef.current === 'random' &&
        editableAnchorsRef.current.length >= 2 &&
        onAnchorInsertRef.current
      ) {
        map.getCanvas().style.cursor = 'copy';
      }
    });

    map.on('mouseleave', 'route-hit-area', () => {
      if (routeModeRef.current === 'random') {
        map.getCanvas().style.cursor = '';
      }
    });

    map.on('mousemove', 'route-signals-circle', (e: maplibregl.MapLayerMouseEvent) => {
      const feat = e.features?.[0];
      if (!feat) return;
      map.getCanvas().style.cursor = 'pointer';
      hoverPopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-[11px] font-bold text-slate-900 dark:text-slate-100 leading-tight">
            Lampu Lalu Lintas
            <span class="block text-[9px] font-normal text-slate-500 dark:text-slate-400">Simpang bersinyal di sepanjang rute</span>
          </div>`
        )
        .addTo(map);
    });

    map.on('mouseleave', 'route-signals-circle', () => {
      map.getCanvas().style.cursor = '';
      hoverPopup.remove();
    });

    const containerEl = mapContainerRef.current;
    const handleResize = () => {
      map.resize();
      map.setPadding(getViewportPadding());
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerEl);
    window.addEventListener('resize', handleResize);

    return () => {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      obvitnasHoverPopupRef.current?.remove();
      activePopupRef.current?.remove();
      userLocationMarkerRef.current?.remove();
      map.off('style.load', handleStyleLoad);
      map.setMissingStyleImageResolver(null);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch basemap cleanly when selectedTile changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedTileRef.current === selectedTile) return;
    applyTileStyle(map, selectedTile);
  }, [selectedTile, applyTileStyle]);

  // Toggle Free Strava Popular Corridors Heatmap Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getStyle()) return;

    if (showHeatmap && !map.getSource('openmaptiles') && !map.getSource('strava-heat-tiles')) {
      ensureCustomLayers(map, true);
      return;
    }

    const vis = showHeatmap ? 'visible' : 'none';
    ['strava-heatmap-arterial', 'strava-heatmap-hot', 'strava-heatmap-core'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', vis);
      }
    });
  }, [showHeatmap, ensureCustomLayers]);

  // Toggle 3D Buildings extrusion cleanly alongside pitch
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getStyle()) return;
    if (map.getLayer('building-3d')) {
      map.setLayoutProperty('building-3d', 'visibility', is3DMode ? 'visible' : 'none');
    }
  }, [is3DMode]);

  // Sync ScaleControl unit system
  useEffect(() => {
    if (scaleControlRef.current) {
      scaleControlRef.current.setUnit(unitSystem === 'mi' ? 'imperial' : 'metric');
    }
  }, [unitSystem]);

  // Clear preview line when mode switches or waypoints clear
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeMode !== 'manual' || waypoints.length === 0) {
      const previewSrc = map.getSource('route-preview') as GeoJSONSource | undefined;
      previewSrc?.setData(buildPreviewGeoJson(null, null));
    }
  }, [routeMode, waypoints]);

  // Update ghost hover-peek route immediately when hovering candidates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const peekSrc = map.getSource('route-peek') as GeoJSONSource | undefined;
    peekSrc?.setData(buildFullRouteLineGeoJson(peekRouteData));
  }, [peekRouteData]);

  // Update gradient polyline + direction arrow + connector + signal markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const segSrc = map.getSource('route-segments') as GeoJSONSource | undefined;
    const fullSrc = map.getSource('route-full-line') as GeoJSONSource | undefined;
    const connSrc = map.getSource('route-start-connector') as GeoJSONSource | undefined;
    const sigSrc = map.getSource('route-signals') as GeoJSONSource | undefined;
    if (segSrc && fullSrc) {
      segSrc.setData(buildRouteGeoJson(routeData));
      fullSrc.setData(buildFullRouteLineGeoJson(routeData));
      connSrc?.setData(buildStartConnectorGeoJson(requestedStartLocation, routeData));
      sigSrc?.setData(buildSignalsGeoJson(routeData));
    } else if (map.isStyleLoaded()) {
      ensureCustomLayers(map);
    }
  }, [routeData, requestedStartLocation, ensureCustomLayers]);

  const zoomBucket = Math.floor(zoomLevel * 2) / 2;

  // Render Kilometer / Milepost Markers scaled cleanly by zoom level
  useEffect(() => {
    const map = mapRef.current;
    milepostMarkersRef.current.forEach((m) => m.remove());
    milepostMarkersRef.current = [];

    if (!map || !routeData || routeData.coordinates.length < 2) return;

    const allPosts = buildRouteMileposts(routeData.coordinates, unitSystem);
    if (allPosts.length === 0) return;

    let step = 1;
    if (zoomBucket < 11.5) step = 5;
    else if (zoomBucket < 13) step = 2;
    else if (allPosts.length > 30) step = Math.ceil(allPosts.length / 25);

    const visiblePosts = allPosts.filter((p) => p.value % step === 0);

    visiblePosts.forEach((mp) => {
      const el = document.createElement('div');
      el.className = 'milepost-badge';
      el.textContent = mp.label;

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([mp.lng, mp.lat])
        .addTo(map);

      milepostMarkersRef.current.push(marker);
    });
  }, [routeData, unitSystem, zoomBucket]);

  // Render Strava-style Start, Finish, S/F Loop, and Draggable Waypoint Nodes
  useEffect(() => {
    const map = mapRef.current;
    waypointMarkersRef.current.forEach((m) => m.remove());
    waypointMarkersRef.current = [];

    if (!map) return;

    const isRandomEditable =
      routeMode === 'random' &&
      editableAnchors.length >= 2 &&
      routeData &&
      routeData.coordinates.length >= 2;

    if (isRandomEditable) {
      const lastIdx = editableAnchors.length - 1;
      const endsMeet =
        haversineDistance(editableAnchors[0], editableAnchors[lastIdx]) < 0.025;

      editableAnchors.forEach((anchor, idx) => {
        if (endsMeet && idx === lastIdx && lastIdx > 0) {
          return;
        }

        const isStart = idx === 0;
        const el = document.createElement('div');
        el.setAttribute('role', 'button');

        if (isStart) {
          el.className = 'custom-pin-closed';
          el.textContent = 'S / F';
          el.title = 'Titik Start & Finish • Geser untuk memindahkan start rute';
        } else {
          el.className = 'custom-pin-waypoint';
          el.textContent = '';
          el.title = `Anchor #${idx} • Geser untuk mengubah jalur atau klik untuk hapus`;
        }

        const marker = new maplibregl.Marker({
          element: el,
          draggable: Boolean(isStart ? onAnchorDrag || onWaypointDrag : onAnchorDrag),
          anchor: 'center',
        })
          .setLngLat([anchor.lng, anchor.lat])
          .addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLngLat();
          const latlng = { lat: pos.lat, lng: pos.lng };
          if (onAnchorDrag) {
            onAnchorDrag(idx, latlng);
          } else if (isStart && onWaypointDrag) {
            onWaypointDrag(0, latlng);
          }
        });

        if (!isStart && onAnchorDelete && editableAnchors.length > 3) {
          el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            activePopupRef.current?.remove();
            onAnchorDelete(idx);
          });

          el.addEventListener('click', (e) => {
            e.stopPropagation();
            activePopupRef.current?.remove();

            const popupDiv = document.createElement('div');
            popupDiv.className = 'text-center font-sans min-w-[140px]';
            popupDiv.innerHTML = `
              <div class="text-[11px] font-bold text-slate-900 dark:text-slate-100 mb-0.5">Titik Anchor #${idx}</div>
              <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-2">Geser untuk ubah lekukan rute</div>
              <button class="w-full px-2.5 py-1 bg-[#fc4c02] hover:bg-[#e34402] active:scale-95 text-white font-bold text-[10px] rounded-lg transition shadow-sm">
                Hapus Anchor
              </button>
            `;

            const deleteBtn = popupDiv.querySelector('button');
            deleteBtn?.addEventListener('click', (ev) => {
              ev.stopPropagation();
              popup.remove();
              activePopupRef.current = null;
              onAnchorDelete(idx);
            });

            const popup = new maplibregl.Popup({
              closeButton: false,
              offset: 16,
            })
              .setLngLat([anchor.lng, anchor.lat])
              .setDOMContent(popupDiv)
              .addTo(map);

            activePopupRef.current = popup;
          });
        }

        waypointMarkersRef.current.push(marker);
      });
      return;
    }

    const isClosedManualLoop =
      waypoints.length > 2 &&
      Math.abs(waypoints[0].lat - waypoints[waypoints.length - 1].lat) < 0.00015 &&
      Math.abs(waypoints[0].lng - waypoints[waypoints.length - 1].lng) < 0.00015;

    const isRandomActiveLoop =
      routeMode === 'random' && waypoints.length === 1 && routeData && routeData.coordinates.length > 2;

    waypoints.forEach((wp, idx) => {
      if (isClosedManualLoop && idx === waypoints.length - 1) {
        return;
      }

      const isStart = idx === 0;
      const isFinish = idx === waypoints.length - 1 && waypoints.length > 1 && !isClosedManualLoop;
      const isCombinedClosed = isStart && (isClosedManualLoop || isRandomActiveLoop);

      const el = document.createElement('div');
      el.setAttribute('role', 'button');

      if (isCombinedClosed) {
        el.className = 'custom-pin-closed';
        el.textContent = 'S / F';
        el.title = 'Titik Start & Finish (Closed Loop) • Geser ke jalan baru';
      } else if (isStart) {
        el.className = 'custom-pin-start';
        el.textContent = 'S';
        el.title = 'Titik Start • Geser untuk memindahkan awal rute';
      } else if (isFinish) {
        el.className = 'custom-pin-finish';
        el.textContent = 'F';
        el.title = 'Titik Finish • Geser untuk memindahkan akhir rute';
      } else {
        el.className = 'custom-pin-waypoint';
        el.textContent = '';
        el.title = `Waypoint #${idx + 1} • Geser untuk ubah jalur atau klik untuk hapus`;
      }

      const marker = new maplibregl.Marker({
        element: el,
        draggable: !!onWaypointDrag,
        anchor: 'center',
      })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map);

      if (onWaypointDrag) {
        marker.on('dragend', () => {
          const pos = marker.getLngLat();
          onWaypointDrag(idx, { lat: pos.lat, lng: pos.lng });
        });
      }

      if (onWaypointDelete && routeMode === 'manual') {
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          activePopupRef.current?.remove();
          onWaypointDelete(idx);
        });

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          activePopupRef.current?.remove();

          const popupDiv = document.createElement('div');
          popupDiv.className = 'text-center font-sans min-w-[140px]';
          const titleText = isCombinedClosed
            ? 'Start & Finish (Loop)'
            : isStart
            ? 'Titik Awal (Start)'
            : isFinish
            ? 'Titik Akhir (Finish)'
            : `Waypoint #${idx + 1}`;

          popupDiv.innerHTML = `
            <div class="text-[11px] font-bold text-slate-900 dark:text-slate-100 mb-0.5">${titleText}</div>
            <div class="text-[10px] text-slate-500 dark:text-slate-400 mb-2">Geser titik ke jalan lain</div>
            <button class="w-full px-2.5 py-1 bg-[#fc4c02] hover:bg-[#e34402] active:scale-95 text-white font-bold text-[10px] rounded-lg transition shadow-sm">
              Hapus Titik
            </button>
          `;

          const deleteBtn = popupDiv.querySelector('button');
          deleteBtn?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            popup.remove();
            activePopupRef.current = null;
            onWaypointDelete(idx);
          });

          const popup = new maplibregl.Popup({
            closeButton: false,
            offset: 16,
          })
            .setLngLat([wp.lng, wp.lat])
            .setDOMContent(popupDiv)
            .addTo(map);

          activePopupRef.current = popup;
        });
      }

      waypointMarkersRef.current.push(marker);
    });
  }, [
    waypoints,
    routeData,
    routeMode,
    editableAnchors,
    onWaypointDrag,
    onWaypointDelete,
    onAnchorDrag,
    onAnchorDelete,
  ]);

  // Live User GPS Location Pulsing Blue Beacon
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLocation) {
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove();
        userLocationMarkerRef.current = null;
      }
      return;
    }

    if (userLocationMarkerRef.current) {
      userLocationMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'gps-user-beacon relative flex items-center justify-center w-6 h-6 pointer-events-none';
      el.title = 'Lokasi GPS Anda Saat Ini';
      el.innerHTML = `
        <div class="absolute inset-0 rounded-full bg-sky-500/35 animate-ping"></div>
        <div class="w-3.5 h-3.5 rounded-full bg-sky-500 border-[2.5px] border-white shadow-[0_0_12px_rgba(14,165,233,0.85)]"></div>
      `;
      userLocationMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
    }
  }, [userLocation]);

  // Fit Bounds into unobstructed map area
  const fitToRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const padding = getViewportPadding();

    if (routeData && routeData.coordinates.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      routeData.coordinates.forEach((c) => bounds.extend([c.lng, c.lat]));
      map.fitBounds(bounds, {
        padding,
        maxZoom: 16.5,
        duration: 850,
      });
    } else if (waypoints.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      waypoints.forEach((w) => bounds.extend([w.lng, w.lat]));
      map.fitBounds(bounds, {
        padding,
        maxZoom: 16,
        duration: 750,
      });
    }
  }, [routeData, waypoints, getViewportPadding]);

  useEffect(() => {
    if (fitTrigger > 0 && fitTrigger !== lastFitTriggerRef.current) {
      lastFitTriggerRef.current = fitTrigger;
      fitToRoute();
    }
  }, [fitTrigger, fitToRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToLocation) return;
    if (lastFlyTargetRef.current === flyToLocation) return;
    lastFlyTargetRef.current = flyToLocation;

    const cur = map.getCenter();
    const delta = Math.hypot(cur.lat - flyToLocation.lat, cur.lng - flyToLocation.lng);
    if (delta > 0.25) {
      map.jumpTo({
        center: [flyToLocation.lng, flyToLocation.lat],
        zoom: 14.5,
        padding: getViewportPadding(),
      });
    } else {
      map.flyTo({
        center: [flyToLocation.lng, flyToLocation.lat],
        zoom: 15,
        padding: getViewportPadding(),
        duration: 900,
        essential: true,
      });
    }
  }, [flyToLocation, getViewportPadding]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      onLocationError?.('Geolokasi tidak didukung oleh browser Anda.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const detected = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const map = mapRef.current;
        if (map) {
          const cur = map.getCenter();
          const delta = Math.hypot(cur.lat - detected.lat, cur.lng - detected.lng);
          if (delta > 0.25) {
            map.jumpTo({
              center: [detected.lng, detected.lat],
              zoom: 15,
              padding: getViewportPadding(),
            });
          } else {
            map.flyTo({
              center: [detected.lng, detected.lat],
              zoom: 15.5,
              padding: getViewportPadding(),
              duration: 900,
              essential: true,
            });
          }
        }
        onUserLocationDetectedRef.current?.(detected);
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        onLocationError?.('Gagal mengambil lokasi perangkat. Pastikan izin GPS aktif.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [getViewportPadding, onLocationError]);

  const handleToggle3D = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextPitch = map.getPitch() > 10 ? 0 : 45;
    setIs3DMode(nextPitch > 10);
    map.easeTo({
      pitch: nextPitch,
      duration: 450,
    });
  }, []);

  const handleResetNorth = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setIs3DMode(false);
    map.easeTo({
      bearing: 0,
      pitch: 0,
      duration: 450,
    });
  }, []);

  const handleResetMapSettings = useCallback(() => {
    const map = mapRef.current;
    const isSwitchingStyle = selectedTileRef.current !== 'strava-outdoor';
    showHeatmapRef.current = false;
    is3DModeRef.current = false;
    setShowHeatmap(false);
    setIs3DMode(false);
    onTileChange('strava-outdoor');
    setShowLayerPicker(false);

    if (map) {
      const targetCenter: [number, number] =
        waypoints.length > 0
          ? [waypoints[0].lng, waypoints[0].lat]
          : userLocation
          ? [userLocation.lng, userLocation.lat]
          : DEFAULT_JAKARTA_CENTER;
      if (isSwitchingStyle) {
        map.jumpTo({
          center: targetCenter,
          zoom: 14,
          bearing: 0,
          pitch: 0,
          padding: getViewportPadding(),
        });
      } else {
        map.easeTo({
          center: targetCenter,
          zoom: 14,
          bearing: 0,
          pitch: 0,
          padding: getViewportPadding(),
          duration: 500,
        });
      }
    }

    onResetMap?.();
  }, [onTileChange, waypoints, userLocation, getViewportPadding, onResetMap]);

  const activeLayerCfg = TILE_LAYERS[selectedTile] || TILE_LAYERS['strava-outdoor'];

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${
        activeLayerCfg.isDarkSurface ? 'bg-[#0f172a]' : 'bg-[#f1f5f9]'
      }`}
    >
      {/* MapLibre Strava Style Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full z-0 ${routeMode === 'manual' ? 'manual-cursor-mode' : ''}`}
      />

      {/* Right Floating Strava Map Controls Dock */}
      <div className="absolute right-3 md:right-4 top-[70px] md:top-4 flex flex-col gap-2 z-20 md:z-40">
        {/* Map Settings, Basemap Switcher & Heatmap Toggle */}
        <div ref={layerPickerContainerRef} className="relative">
          <button
            type="button"
            onClick={() => setShowLayerPicker(!showLayerPicker)}
            aria-expanded={showLayerPicker}
            aria-label="Pengaturan Peta & Layer"
            title="Pengaturan Peta & Layer"
            className={`group w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center relative ui-card-hover ui-focus-ring ${
              showLayerPicker
                ? 'text-[#fc4c02] border-[#fc4c02] bg-orange-50 dark:bg-orange-950/60'
                : 'text-slate-700 dark:text-slate-200 hover:text-[#fc4c02] hover:bg-white dark:hover:bg-slate-800 hover:border-orange-300 dark:hover:border-orange-500/40'
            }`}
          >
            <Layers className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-150 group-hover:scale-110" />
            {showHeatmap && (
              <span
                title="Heatmap Lari Aktif"
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#fc4c02] border-2 border-white dark:border-slate-900 shadow-sm"
              />
            )}
          </button>

          {showLayerPicker && (
            <div className="absolute right-12 md:right-14 top-0 w-72 max-h-[calc(100vh-156px)] md:max-h-[calc(100vh-110px)] overflow-y-auto rounded-2xl strava-card p-2.5 shadow-2xl z-50 space-y-2 ui-popover-right-enter text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between px-1 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-[11px] uppercase font-extrabold tracking-wider text-slate-900 dark:text-white">
                    Pengaturan Peta
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">100% Free &bull; Tanpa API Key</p>
                </div>
                <span className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-lg bg-orange-50 dark:bg-orange-950/60 text-[#fc4c02] border border-orange-200 dark:border-orange-500/40 font-bold">
                  z{Math.round(zoomLevel)}
                </span>
              </div>

              {/* Basemap Grid Selector */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase px-1">Tipe Peta</p>
                {Object.values(TILE_LAYERS).map((layer) => {
                  const isActive = selectedTile === layer.id;
                  return (
                    <button
                      type="button"
                      key={layer.id}
                      onClick={() => {
                        onTileChange(layer.id);
                      }}
                      className={`group w-full text-left px-2.5 py-2 rounded-xl flex items-start gap-2.5 ui-card-hover ui-focus-ring border ${
                        isActive
                          ? 'bg-orange-50/90 dark:bg-orange-950/50 text-[#c93b00] dark:text-orange-300 border-orange-300 dark:border-orange-500/50'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/15 dark:border-white/25 shrink-0 mt-0.5 shadow-sm transition-transform duration-150 group-hover:scale-110"
                        style={{ backgroundColor: layer.swatch }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold leading-tight truncate">
                            {layer.name}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`w-2 h-2 rounded-full bg-[#fc4c02] shrink-0 transition-transform duration-200 ${
                              isActive ? 'scale-100' : 'scale-0'
                            }`}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                          {layer.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Strava Layer Overlays */}
              <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase px-1">Layer &amp; Sistem</p>

                {/* Free Popular Running Heatmap Toggle (Default OFF) */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={showHeatmap}
                  onClick={() => setShowHeatmap((v) => !v)}
                  className="group w-full px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2 text-left ui-card-hover ui-focus-ring"
                >
                  <div className="flex items-center gap-2">
                    <Flame
                      className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                        showHeatmap ? 'text-[#fc4c02]' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-tight">
                        Heatmap Jalur Populer
                      </p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
                        Sorot jalur lari, taman &amp; trotoar (Free)
                      </p>
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`relative w-8 h-4 rounded-full p-0.5 transition-colors duration-200 flex items-center shrink-0 ${
                      showHeatmap ? 'bg-[#fc4c02]' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                        showHeatmap ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </span>
                </button>

                {/* Reset All Map Settings Action */}
                <button
                  type="button"
                  onClick={handleResetMapSettings}
                  className="group w-full py-2 px-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-orange-950/50 text-slate-700 dark:text-slate-200 hover:text-[#c93b00] dark:hover:text-orange-300 border border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-500/40 text-[11px] font-bold flex items-center justify-center gap-1.5 ui-btn-secondary ui-focus-ring"
                >
                  <RotateCcw className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-rotate-90" />
                  <span>Reset Settingan Map</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* GPS Locate Me */}
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={isLocating}
          aria-label="Gunakan Lokasi GPS Saya"
          title="Gunakan Lokasi GPS Saya"
          className="group w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-[#fc4c02] hover:bg-white dark:hover:bg-slate-800 hover:border-orange-300 dark:hover:border-orange-500/40 ui-card-hover ui-focus-ring"
        >
          <Crosshair
            className={`w-4 h-4 md:w-5 md:h-5 transition-transform duration-200 ${
              isLocating ? 'animate-spin text-[#fc4c02]' : 'group-hover:rotate-45'
            }`}
          />
        </button>

        {/* Fit Route Bounds */}
        {(routeData || waypoints.length > 0) && (
          <button
            type="button"
            onClick={fitToRoute}
            aria-label="Fokus ke Seluruh Rute"
            title="Fokus ke Seluruh Rute"
            className="group w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-[#fc4c02] hover:bg-white dark:hover:bg-slate-800 hover:border-orange-300 dark:hover:border-orange-500/40 ui-card-hover ui-focus-ring ui-fade-slide-up"
          >
            <Maximize2 className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-150 group-hover:scale-110" />
          </button>
        )}

        {/* 3D Pitch & Buildings Toggle */}
        {activeLayerCfg.kind === 'vector' && (
          <button
            type="button"
            onClick={handleToggle3D}
            aria-pressed={is3DMode}
            aria-label={is3DMode ? 'Kembali ke Peta 2D' : 'Mode Peta 3D'}
            title={is3DMode ? 'Kembali ke Peta 2D' : 'Mode Peta 3D'}
            className={`group w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center ui-card-hover ui-focus-ring ${
              is3DMode
                ? 'text-[#fc4c02] border-[#fc4c02] bg-orange-50 dark:bg-orange-950/60'
                : 'text-slate-700 dark:text-slate-200 hover:text-[#fc4c02] hover:bg-white dark:hover:bg-slate-800 hover:border-orange-300 dark:hover:border-orange-500/40'
            }`}
          >
            <Box className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-150 group-hover:scale-110" />
          </button>
        )}

        {/* Compass Reset North (visible when tilted/rotated) */}
        {isRotatedOrTilted && (
          <button
            type="button"
            onClick={handleResetNorth}
            aria-label="Hadap Utara (Reset Kamera)"
            title="Hadap Utara (Reset Kamera)"
            className="group w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center text-[#fc4c02] hover:bg-orange-50 dark:hover:bg-orange-950/60 border-orange-200 dark:border-orange-500/40 ui-card-hover ui-focus-ring ui-fade-slide-up"
          >
            <Compass className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-200 group-hover:-rotate-45" />
          </button>
        )}

        {/* Zoom Controls + Live Zoom Indicator */}
        <div className="flex flex-col rounded-xl strava-card overflow-hidden mt-0.5">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
            aria-label="Perbesar Peta"
            title="Perbesar Peta"
            className="group w-10 h-9 md:w-11 md:h-10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-[#fc4c02] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-200/80 dark:border-slate-700/80 active:scale-90 ui-focus-ring"
          >
            <Plus className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-150 group-hover:scale-110" />
          </button>
          <div
            title="Level Zoom Aktif"
            className="w-10 md:w-11 py-0.5 text-center text-[9px] font-mono tabular-nums font-extrabold text-[#fc4c02] bg-orange-50/70 dark:bg-orange-950/60 border-b border-slate-200/80 dark:border-slate-700/80"
          >
            z{Math.round(zoomLevel)}
          </div>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
            aria-label="Perkecil Peta"
            title="Perkecil Peta"
            className="group w-10 h-9 md:w-11 md:h-10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-[#fc4c02] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors active:scale-90 ui-focus-ring"
          >
            <Minus className="w-4 h-4 md:w-5 md:h-5 transition-transform duration-150 group-hover:scale-110" />
          </button>
        </div>
      </div>
    </div>
  );
}
