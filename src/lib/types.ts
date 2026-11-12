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

export type EnvironmentPreference = 'any' | 'green' | 'water' | 'green_water';

export type TrafficPreference = 'any' | 'quiet';

export type FlowPreference = 'any' | 'few_turns';

export interface RoutePreferences {
  environment: EnvironmentPreference;
  traffic: TrafficPreference;
  flow: FlowPreference;
}

export const DEFAULT_ROUTE_PREFERENCES: RoutePreferences = {
  environment: 'any',
  traffic: 'any',
  flow: 'any',
};

export interface RouteScorePart {
  key: 'nature' | 'quiet' | 'signals' | 'flow' | 'overlap' | 'distance';
  label: string;
  points: number;
  max: number;
}

export interface RouteQualityMetrics {
  deviationPct: number;
  greenPct: number | null;
  waterPct: number | null;
  quietPct: number | null;
  signalsCount: number | null;
  signalsPerKm: number | null;
  turnsPerKm: number;
  selfOverlapRatio: number;
}

export interface RouteQualityScore {
  pct: number;
  parts: RouteScorePart[];
  metrics: RouteQualityMetrics;
  preferenceScore: number | null;
  weakestPreference: string | null;
}

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
  quality?: RouteQualityScore;
  signalPoints?: LatLng[];
}

export interface RouteCandidate {
  id: string;
  shape: GeneratorShape;
  routeData: RouteData;
  anchors: LatLng[];
  anchorIndices: number[];
  isEdited: boolean;
  quality: RouteQualityScore;
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
