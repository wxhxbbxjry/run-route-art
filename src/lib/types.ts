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

export type UnitSystem = 'km' | 'mi';

export interface ElevationPoint {
  distanceKm: number;
  elevationM: number;
}

export interface RouteData {
  coordinates: LatLng[];
  waypoints: Waypoint[];
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  elevationProfile: ElevationPoint[];
  isSnapped: boolean;
  source: 'osrm' | 'direct';
  mode: RouteMode;
  targetDistanceKm?: number;
}

export type TileLayerId = 'dark' | 'standard' | 'midnight' | 'hot' | 'satellite';

export interface TileLayerOption {
  id: TileLayerId;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom?: number;
  subdomains?: string[];
}

export interface SavedRoute {
  id: string;
  name: string;
  createdAt: number;
  routeData: RouteData;
  paceSeconds: number;
}
