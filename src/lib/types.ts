export interface LatLng {
  lat: number;
  lng: number;
}

export interface Waypoint extends LatLng {
  id: string;
  name?: string;
  isCustom?: boolean;
}

export type RouteMode = 'manual' | 'random' | 'art';

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
  shapeName?: string;
}

export type GpsShapeKey = 'heart' | 'star' | 'cube' | 'cat' | 'dog' | 'crown';

export interface GpsShape {
  id: GpsShapeKey;
  name: string;
  category: string;
  description: string;
  iconName: string;
  points: [number, number][]; // normalized coordinates in range [-0.5, 0.5]
}

export type TileLayerId = 'dark' | 'standard' | 'hot' | 'satellite';

export interface TileLayerOption {
  id: TileLayerId;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  subdomains?: string[];
}
