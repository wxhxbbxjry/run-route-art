import { TileLayerOption } from './types';

export const TILE_LAYERS: Record<string, TileLayerOption> = {
  dark: {
    id: 'dark',
    name: 'Cyber Dark (Esri Canvas)',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 19,
    maxNativeZoom: 16,
  },
  standard: {
    id: 'standard',
    name: 'OpenStreetMap Standar',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  midnight: {
    id: 'midnight',
    name: 'OSM Midnight Invert',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  hot: {
    id: 'hot',
    name: 'OSM Humanitarian (HOT)',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors, Tiles &copy; <a href="https://www.hotosm.org/" target="_blank">HOT</a>',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
  },
  satellite: {
    id: 'satellite',
    name: 'Satelit Esri HD',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
};
