export interface LatLng {
  lat: number;
  lng: number;
}

export interface Waypoint extends LatLng {
  id: string;
  name?: string;
  isCustom?: boolean;
}

export type RouteMode = 'manual' | 'random';

export type GeneratorShape = 'loop' | 'out_and_back';

export type UnitSystem = 'km' | 'mi';

export interface RouteData {
  coordinates: LatLng[];
  waypoints: Waypoint[];
  distanceKm: number;
  isSnapped: boolean;
  source: 'valhalla' | 'brouter' | 'osrm' | 'direct';
  mode: RouteMode;
  targetDistanceKm?: number;
  shape?: GeneratorShape;
}

export interface RouteCandidate {
  id: string;
  shape: GeneratorShape;
  routeData: RouteData;
  anchors: LatLng[];
  anchorIndices: number[];
  isEdited: boolean;
  generatedAt: number;
}

export type TileLayerId = 'strava-outdoor' | 'strava-satellite' | 'strava-dark' | 'strava-trail';

export interface TileLayerOption {
  id: TileLayerId;
  name: string;
  description: string;
  swatch: string;
  isDarkSurface: boolean;
  kind: 'vector' | 'raster';
  styleUrl?: string;
  rasterTiles?: string[];
  overlayTiles?: string[];
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
}

export interface SavedRoute {
  id: string;
  name: string;
  createdAt: number;
  routeData: RouteData;
  paceSeconds: number;
}
