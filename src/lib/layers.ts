import type { StyleSpecification } from 'maplibre-gl';
import { TileLayerOption } from './types';

export const HEATMAP_PLANET_SOURCE_URL = 'https://tiles.openfreemap.org/planet';

export const TILE_LAYERS: Record<string, TileLayerOption> = {
  'strava-outdoor': {
    id: 'strava-outdoor',
    name: 'Strava Standard',
    description: 'Peta lari & outdoor terang tajam khas Strava (100% Free)',
    swatch: '#fc4c02',
    isDarkSurface: false,
    kind: 'vector',
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    attribution: '&copy; OpenFreeMap &copy; OpenStreetMap contributors',
    maxZoom: 21,
  },
  'strava-satellite': {
    id: 'strava-satellite',
    name: 'Satelit HD',
    description: 'Citra udara resolusi tinggi + nama jalan & batas wilayah',
    swatch: '#0ea5e9',
    isDarkSurface: true,
    kind: 'raster',
    rasterTiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    overlayTiles: [
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 21,
    maxNativeZoom: 18,
  },
  'strava-dark': {
    id: 'strava-dark',
    name: 'Strava Night',
    description: 'Mode peta malam kontras tinggi untuk lari malam & heatmap',
    swatch: '#1e293b',
    isDarkSurface: true,
    kind: 'vector',
    styleUrl: 'https://tiles.openfreemap.org/styles/dark',
    attribution: '&copy; OpenFreeMap &copy; OpenStreetMap contributors',
    maxZoom: 21,
  },
  'strava-trail': {
    id: 'strava-trail',
    name: 'Trail & Track',
    description: 'Jalur pedestrian, taman kota, lintasan lari & kontur (CyclOSM)',
    swatch: '#16a34a',
    isDarkSurface: false,
    kind: 'raster',
    rasterTiles: [
      'https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      'https://b.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
      'https://c.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    ],
    attribution: '&copy; OpenStreetMap contributors &bull; CyclOSM',
    maxZoom: 21,
    maxNativeZoom: 19,
  },
};

/**
 * Builds an inline MapLibre raster StyleSpecification for raster layers
 * with graceful overzoom up to z21 so no "Map data not yet available" ever renders.
 */
export function buildRasterMapStyle(layer: TileLayerOption): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    'base-raster': {
      type: 'raster',
      tiles: layer.rasterTiles || ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: layer.maxNativeZoom || 19,
      attribution: layer.attribution,
    },
  };

  const layers: StyleSpecification['layers'] = [
    {
      id: 'base-raster-layer',
      type: 'raster',
      source: 'base-raster',
      minzoom: 0,
      maxzoom: 22,
    },
  ];

  if (layer.overlayTiles && layer.overlayTiles.length > 0) {
    layer.overlayTiles.forEach((tileUrl, idx) => {
      const sourceId = `overlay-raster-${idx}`;
      sources[sourceId] = {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: 16,
      };
      layers.push({
        id: `overlay-raster-layer-${idx}`,
        type: 'raster',
        source: sourceId,
        minzoom: 0,
        maxzoom: 22,
        paint: {
          'raster-opacity': idx === 0 ? 0.72 : 0.92,
        },
      });
    });
  }

  return {
    version: 8,
    sources,
    layers,
  };
}

/**
 * Emergency fallback MapLibre style using standard OpenStreetMap tiles
 * so the map can never stay blank even if vector tiles fail to load.
 */
export function buildEmergencyOsmStyle(darkSurface: boolean): StyleSpecification {
  return {
    version: 8,
    sources: {
      'osm-fallback': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      },
    },
    layers: [
      {
        id: 'osm-fallback-layer',
        type: 'raster',
        source: 'osm-fallback',
        minzoom: 0,
        maxzoom: 22,
        paint: darkSurface
          ? {
              'raster-brightness-max': 0.52,
              'raster-contrast': 0.18,
              'raster-saturation': -0.45,
            }
          : {},
      },
    ],
  };
}

export const LIGHT_SHELL_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'shell-background-light',
      type: 'background',
      paint: {
        'background-color': '#f4f3ef',
      },
    },
  ],
};

export const DARK_SHELL_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'shell-background-dark',
      type: 'background',
      paint: {
        'background-color': '#111827',
      },
    },
  ],
};

/**
 * Restyles OpenFreeMap Liberty into a crisp Strava Standard Outdoor topo/street palette:
 * airy warm off-white terrain, fresh mint parks, sky-azure canals, white minor/secondary roads,
 * soft subtle arterial trunks (so the Strava orange route/heatmap pop cleanly), and terracotta footpaths.
 */
function applyStravaOutdoorPalette(rawStyle: StyleSpecification): StyleSpecification {
  const cloned: StyleSpecification = JSON.parse(JSON.stringify(rawStyle));

  if (Array.isArray(cloned.layers)) {
    cloned.layers = cloned.layers.map((layer) => {
      const nextLayer = { ...layer } as Record<string, unknown>;
      const paint = { ...((nextLayer.paint as Record<string, unknown>) || {}) };
      const layout = { ...((nextLayer.layout as Record<string, unknown>) || {}) };
      const id = String(nextLayer.id || '');

      switch (id) {
        case 'background':
          paint['background-color'] = '#f4f3ef';
          break;
        case 'landuse_residential':
          paint['fill-color'] = '#eeece6';
          paint['fill-opacity'] = 0.65;
          break;
        case 'park':
          paint['fill-color'] = '#d2ebc7';
          paint['fill-opacity'] = 0.85;
          paint['fill-outline-color'] = '#b6daa8';
          break;
        case 'park_outline':
          paint['line-color'] = '#b6daa8';
          break;
        case 'landcover_wood':
          paint['fill-color'] = '#c3e3b4';
          paint['fill-opacity'] = 0.58;
          break;
        case 'landcover_grass':
          paint['fill-color'] = '#d9efd1';
          paint['fill-opacity'] = 0.65;
          break;
        case 'landuse_pitch':
          paint['fill-color'] = '#cbe7be';
          break;
        case 'landuse_track':
          paint['fill-color'] = '#edd5c8';
          break;
        case 'water':
          paint['fill-color'] = '#9ed4f3';
          break;
        case 'waterway_river':
        case 'waterway_other':
          paint['line-color'] = '#8bc7eb';
          break;
        case 'building':
          paint['fill-color'] = '#e7e3db';
          paint['fill-outline-color'] = '#dbd6cc';
          break;
        case 'building-3d':
          paint['fill-extrusion-color'] = '#e2ded5';
          paint['fill-extrusion-opacity'] = 0.78;
          layout['visibility'] = 'none';
          break;
        case 'road_minor_casing':
        case 'bridge_street_casing':
        case 'tunnel_street_casing':
          paint['line-color'] = '#d7d3ca';
          break;
        case 'road_secondary_tertiary_casing':
        case 'bridge_secondary_tertiary_casing':
        case 'tunnel_secondary_tertiary_casing':
          paint['line-color'] = '#cfcbc1';
          break;
        case 'road_trunk_primary_casing':
        case 'bridge_trunk_primary_casing':
        case 'tunnel_trunk_primary_casing':
          paint['line-color'] = '#dfd2ad';
          break;
        case 'road_motorway_casing':
        case 'bridge_motorway_casing':
        case 'tunnel_motorway_casing':
          paint['line-color'] = '#debd87';
          break;
        case 'road_secondary_tertiary':
        case 'bridge_secondary_tertiary':
        case 'tunnel_secondary_tertiary':
          paint['line-color'] = '#ffffff';
          break;
        case 'road_trunk_primary':
        case 'bridge_trunk_primary':
        case 'tunnel_trunk_primary':
          paint['line-color'] = '#fbf2d4';
          break;
        case 'road_motorway':
        case 'bridge_motorway':
        case 'tunnel_motorway':
          paint['line-color'] = '#fbe3b5';
          break;
        case 'road_path_pedestrian':
        case 'bridge_path_pedestrian':
        case 'tunnel_path_pedestrian':
          paint['line-color'] = '#c96b4b';
          paint['line-dasharray'] = [1.4, 1.1];
          break;
        case 'highway-name-minor':
        case 'highway-name-major':
          paint['text-color'] = '#334155';
          paint['text-halo-color'] = '#ffffff';
          paint['text-halo-width'] = 1.4;
          break;
        case 'highway-name-path':
          paint['text-color'] = '#9a4f36';
          paint['text-halo-color'] = '#ffffff';
          paint['text-halo-width'] = 1.2;
          break;
        default:
          break;
      }

      nextLayer.paint = paint;
      nextLayer.layout = layout;
      return nextLayer as unknown as StyleSpecification['layers'][number];
    });
  }

  return cloned;
}

/**
 * Restyles OpenFreeMap Dark into a clean Strava Night palette.
 */
function applyStravaDarkPalette(rawStyle: StyleSpecification): StyleSpecification {
  const cloned: StyleSpecification = JSON.parse(JSON.stringify(rawStyle));

  if (Array.isArray(cloned.layers)) {
    cloned.layers = cloned.layers.map((layer) => {
      const nextLayer = { ...layer } as Record<string, unknown>;
      const paint = { ...((nextLayer.paint as Record<string, unknown>) || {}) };
      const id = String(nextLayer.id || '');

      switch (id) {
        case 'background':
          paint['background-color'] = '#111827';
          break;
        case 'water':
          paint['fill-color'] = '#122c46';
          break;
        case 'waterway':
          paint['line-color'] = '#173859';
          break;
        case 'landuse_residential':
          paint['fill-color'] = '#141c2b';
          paint['fill-opacity'] = 0.55;
          break;
        case 'landcover_wood':
          delete paint['fill-pattern'];
          delete paint['fill-translate'];
          paint['fill-color'] = '#132a26';
          paint['fill-opacity'] = 0.72;
          break;
        case 'landuse_park':
          paint['fill-color'] = '#15312c';
          break;
        case 'building':
          paint['fill-color'] = '#1a2436';
          paint['fill-outline-color'] = '#26344d';
          break;
        case 'highway_path':
          paint['line-color'] = '#4b5f7a';
          paint['line-opacity'] = 0.85;
          break;
        case 'highway_minor':
          paint['line-color'] = '#334155';
          paint['line-opacity'] = 0.95;
          break;
        case 'highway_major_subtle':
          paint['line-color'] = '#475569';
          break;
        case 'highway_major_casing':
          paint['line-color'] = '#556782';
          break;
        case 'highway_major_inner':
          paint['line-color'] = '#3c4d66';
          break;
        case 'highway_motorway_casing':
          paint['line-color'] = '#64748b';
          break;
        case 'highway_motorway_inner':
          paint['line-color'] = '#475975';
          break;
        case 'highway_motorway_subtle':
          paint['line-color'] = '#3f506b';
          break;
        case 'water_name':
          paint['text-color'] = '#38bdf8';
          paint['text-halo-color'] = '#111827';
          paint['text-halo-width'] = 1.3;
          break;
        case 'highway_name_other':
          paint['text-color'] = '#cbd5e1';
          paint['text-halo-color'] = '#111827';
          paint['text-halo-width'] = 1.4;
          break;
        case 'highway_name_motorway':
          paint['text-color'] = '#e2e8f0';
          paint['text-halo-color'] = '#111827';
          paint['text-halo-width'] = 1.5;
          break;
        case 'place_other':
        case 'place_suburb':
          paint['text-color'] = '#94a3b8';
          paint['text-halo-color'] = '#111827';
          paint['text-halo-width'] = 1.4;
          break;
        case 'place_village':
        case 'place_town':
        case 'place_city':
        case 'place_city_large':
        case 'place_state':
          paint['text-color'] = '#f8fafc';
          paint['text-halo-color'] = '#111827';
          paint['text-halo-width'] = 1.5;
          break;
        default:
          break;
      }

      nextLayer.paint = paint;
      return nextLayer as unknown as StyleSpecification['layers'][number];
    });

    const has3D = cloned.layers.some((l) => l.id === 'building-3d');
    const buildingIdx = cloned.layers.findIndex((l) => l.id === 'building');
    if (!has3D && buildingIdx !== -1 && (cloned.sources as Record<string, unknown>)?.openmaptiles) {
      cloned.layers.splice(buildingIdx + 1, 0, {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        layout: {
          visibility: 'none',
        },
        paint: {
          'fill-extrusion-color': '#1e293b',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.82,
        },
      } as unknown as StyleSpecification['layers'][number]);
    }
  }

  return cloned;
}

let cachedOutdoorStyle: StyleSpecification | null = null;
let outdoorStylePromise: Promise<StyleSpecification> | null = null;

export async function loadStravaOutdoorStyle(): Promise<StyleSpecification> {
  if (cachedOutdoorStyle) return cachedOutdoorStyle;
  if (outdoorStylePromise) return outdoorStylePromise;

  const baseUrl = TILE_LAYERS['strava-outdoor'].styleUrl || 'https://tiles.openfreemap.org/styles/liberty';

  outdoorStylePromise = fetch(baseUrl, { mode: 'cors' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StyleSpecification;
      const styled = applyStravaOutdoorPalette(json);
      cachedOutdoorStyle = styled;
      return styled;
    })
    .catch((err) => {
      console.warn('Strava Standard style load failed, using OSM fallback:', err);
      outdoorStylePromise = null;
      return buildEmergencyOsmStyle(false);
    });

  return outdoorStylePromise;
}

let cachedDarkStyle: StyleSpecification | null = null;
let darkStylePromise: Promise<StyleSpecification> | null = null;

export async function loadStravaDarkStyle(): Promise<StyleSpecification> {
  if (cachedDarkStyle) return cachedDarkStyle;
  if (darkStylePromise) return darkStylePromise;

  const baseUrl = TILE_LAYERS['strava-dark'].styleUrl || 'https://tiles.openfreemap.org/styles/dark';

  darkStylePromise = fetch(baseUrl, { mode: 'cors' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StyleSpecification;
      const styled = applyStravaDarkPalette(json);
      cachedDarkStyle = styled;
      return styled;
    })
    .catch((err) => {
      console.warn('Strava Night style load failed, using OSM dark fallback:', err);
      darkStylePromise = null;
      return buildEmergencyOsmStyle(true);
    });

  return darkStylePromise;
}
