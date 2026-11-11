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
import { buildGradientSegments, buildRouteMileposts, buildCirclePolygonCoords } from '@/lib/geo';
import { OBVITNAS_ZONES } from '@/lib/obvitnas';
import {
  Layers,
  Crosshair,
  Maximize2,
  Plus,
  Minus,
  Compass,
  ShieldAlert,
  Box,
  Flame,
  RotateCcw,
} from 'lucide-react';

interface RouteMapProps {
  waypoints: Waypoint[];
  routeData: RouteData | null;
  routeMode: RouteMode;
  selectedTile: TileLayerId;
  unitSystem?: UnitSystem;
  hasElevationOpen?: boolean;
  fitTrigger?: number;
  onTileChange: (tile: TileLayerId) => void;
  onMapClick: (latlng: LatLng) => void;
  onWaypointDrag?: (index: number, latlng: LatLng) => void;
  onWaypointDelete?: (index: number) => void;
  onResetMap?: () => void;
  hoverLocation?: LatLng | null;
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
  routeMode,
  selectedTile,
  unitSystem = 'km',
  hasElevationOpen = false,
  fitTrigger = 0,
  onTileChange,
  onMapClick,
  onWaypointDrag,
  onWaypointDelete,
  onResetMap,
  hoverLocation,
  flyToLocation,
}: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const scaleControlRef = useRef<maplibregl.ScaleControl | null>(null);
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const milepostMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const activePopupRef = useRef<maplibregl.Popup | null>(null);
  const obvitnasHoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const layerPickerContainerRef = useRef<HTMLDivElement>(null);

  const onMapClickRef = useRef(onMapClick);
  const routeDataRef = useRef(routeData);
  const waypointsRef = useRef(waypoints);
  const routeModeRef = useRef(routeMode);
  const selectedTileRef = useRef(selectedTile);
  const hasElevationRef = useRef(hasElevationOpen);
  const showLayerPickerRef = useRef(false);
  const showObvitnasRef = useRef(true);
  const showHeatmapRef = useRef(true);
  const is3DModeRef = useRef(false);
  const fallbackUsedRef = useRef<string | null>(null);
  const appliedTileRef = useRef<TileLayerId | null>(null);
  const styleReqSeqRef = useRef<number>(0);
  const previewRafRef = useRef<number | null>(null);

  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showObvitnas, setShowObvitnas] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(14);
  const [isRotatedOrTilted, setIsRotatedOrTilted] = useState<boolean>(false);
  const [is3DMode, setIs3DMode] = useState<boolean>(false);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    routeDataRef.current = routeData;
  }, [routeData]);

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
    hasElevationRef.current = hasElevationOpen;
  }, [hasElevationOpen]);

  useEffect(() => {
    showLayerPickerRef.current = showLayerPicker;
  }, [showLayerPicker]);

  useEffect(() => {
    showObvitnasRef.current = showObvitnas;
  }, [showObvitnas]);

  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
  }, [showHeatmap]);

  useEffect(() => {
    is3DModeRef.current = is3DMode;
  }, [is3DMode]);

  // Close layer picker on outside click
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
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showLayerPicker]);

  // Responsive viewport padding outside Sidebar, SearchBar, Right Dock & Bottom HUDs
  const getViewportPadding = useCallback((): PaddingOptions => {
    if (typeof window === 'undefined') {
      return { top: 76, bottom: 130, left: 436, right: 96 };
    }
    if (window.innerWidth >= 1024) {
      return {
        top: 76,
        bottom: hasElevationRef.current ? 240 : 140,
        left: 436,
        right: 110,
      };
    }
    if (window.innerWidth >= 768) {
      return {
        top: 76,
        bottom: hasElevationRef.current ? 230 : 130,
        left: 350,
        right: 96,
      };
    }
    return {
      top: 72,
      bottom: hasElevationRef.current ? 210 : 96,
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
          visibility: showObvitnasRef.current ? 'visible' : 'none',
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
          visibility: showObvitnasRef.current ? 'visible' : 'none',
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
            map.setStyle(styleSpec);
          }
        });
        return;
      }

      if (tileId === 'strava-dark') {
        loadStravaDarkStyle().then((styleSpec) => {
          if (mapRef.current === map && styleReqSeqRef.current === reqSeq) {
            map.setStyle(styleSpec);
          }
        });
        return;
      }

      map.setStyle(buildRasterMapStyle(cfg));
    },
    []
  );

  // Initialize MapLibre GL engine
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    maplibregl.setWorkerUrl('/maplibre-gl-worker.js');

    const initialCenter: [number, number] =
      waypoints.length > 0 ? [waypoints[0].lng, waypoints[0].lat] : DEFAULT_JAKARTA_CENTER;

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
            <span class="block text-[9px] text-rose-600 font-extrabold uppercase tracking-wider">Zona Steril Obvitnas</span>
            <span class="font-bold text-slate-900">${props.name || ''}</span>
            <span class="block text-[10px] text-slate-500 mt-0.5">${props.sectorName || ''}</span>
          </div>`
        )
        .addTo(map);
    });

    map.on('mouseleave', 'obvitnas-fill', () => {
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
      hoverMarkerRef.current?.remove();
      map.off('style.load', handleStyleLoad);
      map.setMissingStyleImageResolver(null);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update padding when elevation drawer opens/closes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ padding: getViewportPadding(), duration: 250 });
  }, [hasElevationOpen, getViewportPadding]);

  // Switch basemap cleanly when selectedTile changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedTileRef.current === selectedTile) return;
    applyTileStyle(map, selectedTile);
  }, [selectedTile, applyTileStyle]);

  // Toggle Obvitnas visual layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = showObvitnas ? 'visible' : 'none';
    if (map.getLayer('obvitnas-fill')) map.setLayoutProperty('obvitnas-fill', 'visibility', vis);
    if (map.getLayer('obvitnas-outline')) map.setLayoutProperty('obvitnas-outline', 'visibility', vis);
  }, [showObvitnas]);

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

  // Update gradient polyline + direction arrow source
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const segSrc = map.getSource('route-segments') as GeoJSONSource | undefined;
    const fullSrc = map.getSource('route-full-line') as GeoJSONSource | undefined;
    if (segSrc && fullSrc) {
      segSrc.setData(buildRouteGeoJson(routeData));
      fullSrc.setData(buildFullRouteLineGeoJson(routeData));
    } else if (map.isStyleLoaded()) {
      ensureCustomLayers(map);
    }
  }, [routeData, ensureCustomLayers]);

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
            <div class="text-[11px] font-bold text-slate-900 mb-0.5">${titleText}</div>
            <div class="text-[10px] text-slate-500 mb-2">Geser titik ke jalan lain</div>
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
  }, [waypoints, routeData, routeMode, onWaypointDrag, onWaypointDelete]);

  // Strava Orange Elevation Scrubbing Hover Beacon
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!hoverLocation) {
      if (hoverMarkerRef.current) {
        hoverMarkerRef.current.remove();
        hoverMarkerRef.current = null;
      }
      return;
    }

    if (hoverMarkerRef.current) {
      hoverMarkerRef.current.setLngLat([hoverLocation.lng, hoverLocation.lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center w-5 h-5 pointer-events-none';
      el.innerHTML = `
        <div class="absolute inset-0 rounded-full bg-[#fc4c02]/45 animate-ping"></div>
        <div class="w-3.5 h-3.5 rounded-full bg-[#fc4c02] border-2 border-white shadow-[0_0_12px_rgba(252,76,2,0.9)]"></div>
      `;
      hoverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([hoverLocation.lng, hoverLocation.lat])
        .addTo(map);
    }
  }, [hoverLocation]);

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
    if (fitTrigger > 0) {
      fitToRoute();
    }
  }, [fitTrigger, fitToRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToLocation) return;
    map.flyTo({
      center: [flyToLocation.lng, flyToLocation.lat],
      zoom: 15,
      padding: getViewportPadding(),
      duration: 1000,
      essential: true,
    });
  }, [flyToLocation, getViewportPadding]);

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
        const map = mapRef.current;
        if (map) {
          map.flyTo({
            center: [longitude, latitude],
            zoom: 15.5,
            padding: getViewportPadding(),
            duration: 1000,
          });
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
  }, [onMapClick, getViewportPadding]);

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
    setShowHeatmap(true);
    setShowObvitnas(true);
    setIs3DMode(false);
    onTileChange('strava-outdoor');
    setShowLayerPicker(false);

    if (map) {
      const targetCenter: [number, number] =
        waypoints.length > 0 ? [waypoints[0].lng, waypoints[0].lat] : DEFAULT_JAKARTA_CENTER;
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
  }, [onTileChange, waypoints, getViewportPadding, onResetMap]);

  const activeLayerCfg = TILE_LAYERS[selectedTile] || TILE_LAYERS['strava-outdoor'];

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${
        activeLayerCfg.isDarkSurface ? 'bg-[#111827]' : 'bg-[#f4f3ef]'
      } ${hasElevationOpen ? 'elevation-open-mobile' : ''}`}
    >
      {/* MapLibre Strava Style Container */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full z-0 ${routeMode === 'manual' ? 'manual-cursor-mode' : ''}`}
      />

      {/* Right Floating Strava Map Controls Dock */}
      <div className="absolute right-3 md:right-4 top-[68px] md:top-20 flex flex-col gap-2 z-40">
        {/* Map Settings, Basemap Switcher & Heatmap Toggle */}
        <div ref={layerPickerContainerRef} className="relative">
          <button
            onClick={() => setShowLayerPicker(!showLayerPicker)}
            title="Pengaturan Peta, Heatmap & Tema Strava"
            className={`w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center transition active:scale-95 relative ${
              showLayerPicker
                ? 'text-[#fc4c02] border-[#fc4c02] bg-orange-50'
                : 'text-slate-700 hover:text-[#fc4c02] hover:bg-white'
            }`}
          >
            <Layers className="w-4 h-4 md:w-5 md:h-5" />
            {showHeatmap && (
              <span
                title="Heatmap Lari Aktif"
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#fc4c02] border-2 border-white shadow-sm"
              />
            )}
          </button>

          {showLayerPicker && (
            <div className="absolute right-12 md:right-14 top-0 w-72 max-h-[calc(100vh-110px)] overflow-y-auto rounded-2xl strava-card p-2.5 shadow-2xl z-50 space-y-1.5 animate-in fade-in slide-in-from-right-3">
              <div className="flex items-center justify-between px-1 pb-1.5 border-b border-slate-100">
                <div>
                  <p className="text-[11px] uppercase font-extrabold tracking-wider text-slate-900">
                    Pengaturan Peta Strava
                  </p>
                  <p className="text-[10px] text-slate-500">100% Free &bull; Tanpa API Key</p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-orange-50 text-[#fc4c02] border border-orange-200 font-bold">
                  z{Math.round(zoomLevel)}
                </span>
              </div>

              {/* Basemap Grid Selector */}
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase px-1">Tipe Peta</p>
                {Object.values(TILE_LAYERS).map((layer) => {
                  const isActive = selectedTile === layer.id;
                  return (
                    <button
                      key={layer.id}
                      onClick={() => {
                        onTileChange(layer.id);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl flex items-start gap-2.5 transition ${
                        isActive
                          ? 'bg-orange-50 text-[#c93b00] border border-orange-200'
                          : 'text-slate-700 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/15 shrink-0 mt-0.5 shadow-sm"
                        style={{ backgroundColor: layer.swatch }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold leading-tight truncate">
                            {layer.name}
                          </span>
                          {isActive && (
                            <span className="w-2 h-2 rounded-full bg-[#fc4c02] shrink-0" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                          {layer.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Strava Layer Overlays */}
              <div className="pt-1.5 border-t border-slate-100 space-y-1.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase px-1">Layer &amp; Sistem</p>

                {/* Free Popular Running Heatmap Toggle */}
                <button
                  onClick={() => setShowHeatmap((v) => !v)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between gap-2 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <Flame
                      className={`w-4 h-4 shrink-0 ${
                        showHeatmap ? 'text-[#fc4c02]' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 leading-tight">
                        Heatmap Jalur Populer
                      </p>
                      <p className="text-[9px] text-slate-500 leading-tight">
                        Sorot jalur lari, taman &amp; trotoar (Free)
                      </p>
                    </div>
                  </div>
                  <span
                    className={`w-8 h-4 rounded-full p-0.5 transition flex items-center shrink-0 ${
                      showHeatmap ? 'bg-[#fc4c02] justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-white shadow" />
                  </span>
                </button>

                {/* Obvitnas Exclusion Buffer Overlay */}
                <button
                  onClick={() => setShowObvitnas((v) => !v)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-between gap-2 text-left transition"
                >
                  <div className="flex items-center gap-2">
                    <ShieldAlert
                      className={`w-4 h-4 shrink-0 ${
                        showObvitnas ? 'text-rose-600' : 'text-slate-400'
                      }`}
                    />
                    <div>
                      <p className="text-[11px] font-bold text-slate-800 leading-tight">
                        Zona Steril Obvitnas
                      </p>
                      <p className="text-[9px] text-slate-500 leading-tight">
                        Pemblokiran objek vital tetap aktif
                      </p>
                    </div>
                  </div>
                  <span
                    className={`w-8 h-4 rounded-full p-0.5 transition flex items-center shrink-0 ${
                      showObvitnas ? 'bg-rose-600 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-white shadow" />
                  </span>
                </button>

                {/* Reset All Map Settings Action */}
                <button
                  onClick={handleResetMapSettings}
                  className="w-full py-1.5 px-2.5 rounded-xl bg-white hover:bg-orange-50 text-slate-700 hover:text-[#fc4c02] border border-slate-200 hover:border-orange-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Settingan Map</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* GPS Locate Me */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          title="Gunakan Lokasi GPS Saya"
          className="w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center text-slate-700 hover:text-[#fc4c02] hover:bg-white transition active:scale-95"
        >
          <Crosshair
            className={`w-4 h-4 md:w-5 md:h-5 ${isLocating ? 'animate-spin text-[#fc4c02]' : ''}`}
          />
        </button>

        {/* Fit Route Bounds */}
        {(routeData || waypoints.length > 0) && (
          <button
            onClick={fitToRoute}
            title="Fokus ke Seluruh Rute"
            className="w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center text-slate-700 hover:text-[#fc4c02] hover:bg-white transition active:scale-95"
          >
            <Maximize2 className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        )}

        {/* 3D Pitch & Buildings Toggle */}
        {activeLayerCfg.kind === 'vector' && (
          <button
            onClick={handleToggle3D}
            title={is3DMode ? 'Kembali ke Peta 2D Strava' : 'Mode Peta 3D'}
            className={`w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center transition active:scale-95 ${
              is3DMode
                ? 'text-[#fc4c02] border-[#fc4c02] bg-orange-50'
                : 'text-slate-700 hover:text-[#fc4c02] hover:bg-white'
            }`}
          >
            <Box className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        )}

        {/* Compass Reset North (visible when tilted/rotated) */}
        {isRotatedOrTilted && (
          <button
            onClick={handleResetNorth}
            title="Hadap Utara (Reset Kamera)"
            className="w-10 h-10 md:w-11 md:h-11 rounded-xl strava-card flex items-center justify-center text-[#fc4c02] hover:bg-orange-50 transition active:scale-95"
          >
            <Compass className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        )}

        {/* Zoom Controls + Live Zoom Indicator */}
        <div className="flex flex-col rounded-xl strava-card overflow-hidden mt-0.5">
          <button
            onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
            title="Perbesar Peta"
            className="w-10 h-9 md:w-11 md:h-10 flex items-center justify-center text-slate-700 hover:text-[#fc4c02] hover:bg-slate-50 transition border-b border-slate-200/80"
          >
            <Plus className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <div
            title="Level Zoom Aktif"
            className="w-10 md:w-11 py-0.5 text-center text-[9px] font-mono font-extrabold text-[#fc4c02] bg-orange-50/70 border-b border-slate-200/80"
          >
            z{Math.round(zoomLevel)}
          </div>
          <button
            onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
            title="Perkecil Peta"
            className="w-10 h-9 md:w-11 md:h-10 flex items-center justify-center text-slate-700 hover:text-[#fc4c02] hover:bg-slate-50 transition"
          >
            <Minus className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
