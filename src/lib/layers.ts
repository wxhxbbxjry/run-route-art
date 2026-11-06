import { TileLayerOption } from './types';

export const TILE_LAYERS: Record<string, TileLayerOption> = {
  dark: {
    id: 'dark',
    name: 'Cyber Dark (Free OSM)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  standard: {
    id: 'standard',
    name: 'OpenStreetMap Standar',
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
    name: 'Satellite Esri',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
};
