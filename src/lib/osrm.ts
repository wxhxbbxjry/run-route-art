import {
  GeneratedRouteResult,
  LatLng,
  RouteData,
  Waypoint,
} from './types';
import {
  arePolylinesTooSimilar,
  calculatePolylineDistance,
  extractEditableAnchors,
  haversineDistance,
} from './geo';
import { OBVITNAS_ZONES, pushOutOfObvitnas, routeHasObvitnasViolation } from './obvitnas';
import {
  MvtRoadClass,
  scanRouteRestrictedRoadsMvt,
  snapCarRoadFromMvt,
} from './environment';

const VALHALLA_ROUTE_URL = 'https://valhalla1.openstreetmap.de/route';
const VALHALLA_LOCATE_URL = 'https://valhalla1.openstreetmap.de/locate';
const BROUTER_ROUTE_URL = 'https://brouter.de/brouter';
const OSRM_DRIVING_URLS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://router.project-osrm.org/route/v1/driving',
];
const OSRM_NEAREST_DRIVING_URL = 'https://router.project-osrm.org/nearest/v1/driving';

export interface RouteFetchResult {
  coordinates: LatLng[];
  distanceKm: number;
  isSnapped: boolean;
  source: 'valhalla' | 'brouter' | 'osrm' | 'direct';
  effectiveStart?: LatLng;
  snappedWaypoints?: LatLng[];
  error?: string;
}

type ValhallaRoadClass =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'unclassified'
  | 'residential'
  | 'service_other';

interface ValhallaLocateEdge {
  correlated_lat?: number;
  correlated_lon?: number;
  edge?: {
    classification?: {
      classification?: string;
      use?: string;
      surface?: string;
    };
    access?: {
      car?: boolean;
      motorcycle?: boolean;
    };
    speeds?: {
      default?: number;
    };
    lane_count?: number;
    toll?: boolean;
    deadend?: boolean;
    destination_only?: boolean;
  };
  edge_info?: {
    way_id?: number;
    names?: string[];
  };
}

interface ValhallaManeuver {
  type?: number;
  length?: number;
  begin_shape_index?: number;
  end_shape_index?: number;
  street_names?: string[];
  toll?: boolean;
  ferry?: boolean;
  roundabout_exit_count?: number;
}

interface ValhallaLeg {
  shape?: string;
  maneuvers?: ValhallaManeuver[];
  summary?: {
    length?: number;
  };
}

interface ValhallaTrip {
  legs?: ValhallaLeg[];
  summary?: {
    length?: number;
  };
}

interface VehicleAnchor {
  point: LatLng;
  minClass: ValhallaRoadClass;
  roadClass: ValhallaRoadClass;
  wasSnappedFromRestricted: boolean;
}

interface EvaluatedTrip {
  coordinates: LatLng[];
  distanceKm: number;
  gangPoints: LatLng[];
  tollCount: number;
  obvitnasCount: number;
  unnamedLenKm: number;
  scorePenalty: number;
}

// Strict car & motorcycle costing options on Valhalla (100% free public endpoint):
// Excludes tollways, highways/motorways, living_street (kampung alleys), tracks, unpaved paths,
// service roads, private access, driveways, alleys, and narrow ways < 2.2m wide.
const STRICT_VEHICLE_COSTING_OPTIONS = {
  auto: {
    use_highways: 0,
    use_tolls: 0,
    use_living_streets: 0,
    use_tracks: 0,
    use_ferry: 0,
    alley_factor: 500,
    driveway_factor: 1000,
    service_penalty: 2400,
    service_factor: 100,
    private_access_penalty: 2400,
    gate_penalty: 1200,
    exclude_unpaved: true,
    exclude_closures: true,
    width: 2.2,
  },
};

const CAR_ALLOWED_CLASSES = new Set<string>([
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
]);

const MAJOR_CLASSES = new Set<string>([
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
]);

// Regex detecting kampung alleys (Gang/Gg/Lorong/Setapak) and restricted toll/service corridors
const GANG_OR_ALLEY_REGEX =
  /(?:\b(?:gang|gg|lorong|lrg|setapak|bantaran|inspeksi)\b|\b(?:gang|gg|lrg)\d+\b)/i;
const TOLL_ROAD_REGEX = /(?:\b(?:tol|toll)\b|jalan\s+tol|bebas\s+hambatan)/i;

const anchorCache = new Map<string, VehicleAnchor>();
const valhallaTripCache = new Map<string, EvaluatedTrip[]>();
const brouterTripCache = new Map<string, EvaluatedTrip[]>();
const osrmTripCache = new Map<string, EvaluatedTrip[]>();

// Polite concurrency semaphore & circuit breaker for public Valhalla endpoint
const MAX_VALHALLA_IN_FLIGHT = 3;
let activeValhallaRequests = 0;
const valhallaWaitQueue: Array<() => void> = [];
let valhallaCooldownUntil = 0;
let consecutiveValhallaFailures = 0;

function isValhallaHealthy(): boolean {
  return Date.now() >= valhallaCooldownUntil;
}

function markValhallaSuccess(): void {
  consecutiveValhallaFailures = 0;
  valhallaCooldownUntil = 0;
}

function markValhallaFailure(isRateLimit: boolean = false): void {
  consecutiveValhallaFailures += 1;
  if (isRateLimit || consecutiveValhallaFailures >= 2) {
    valhallaCooldownUntil = Date.now() + (isRateLimit ? 90_000 : 75_000);
  }
}

async function withValhallaSlot<T>(
  fn: () => Promise<T>,
  abortSignal?: AbortSignal
): Promise<T | null> {
  if (!isValhallaHealthy() || abortSignal?.aborted) {
    return null;
  }

  if (activeValhallaRequests >= MAX_VALHALLA_IN_FLIGHT) {
    const acquired = await new Promise<boolean>((resolve) => {
      let settled = false;
      const release = () => {
        if (settled) return;
        settled = true;
        abortSignal?.removeEventListener('abort', onAbort);
        resolve(true);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        const idx = valhallaWaitQueue.indexOf(release);
        if (idx >= 0) valhallaWaitQueue.splice(idx, 1);
        resolve(false);
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });
      valhallaWaitQueue.push(release);
    });
    if (!acquired || !isValhallaHealthy() || abortSignal?.aborted) {
      return null;
    }
  }

  activeValhallaRequests += 1;
  try {
    return await fn();
  } finally {
    activeValhallaRequests = Math.max(0, activeValhallaRequests - 1);
    const next = valhallaWaitQueue.shift();
    if (next) next();
  }
}

// Concurrency semaphore & circuit breaker for BRouter car-eco engine
const MAX_BROUTER_IN_FLIGHT = 4;
let activeBRouterRequests = 0;
const brouterWaitQueue: Array<() => void> = [];
let brouterCooldownUntil = 0;
let consecutiveBRouterFailures = 0;

function isBRouterHealthy(): boolean {
  return Date.now() >= brouterCooldownUntil;
}

function markBRouterSuccess(): void {
  consecutiveBRouterFailures = 0;
  brouterCooldownUntil = 0;
}

function markBRouterFailure(isRateLimit: boolean = false): void {
  consecutiveBRouterFailures += 1;
  if (isRateLimit || consecutiveBRouterFailures >= 3) {
    brouterCooldownUntil = Date.now() + 45_000;
  }
}

async function withBRouterSlot<T>(
  fn: () => Promise<T>,
  abortSignal?: AbortSignal
): Promise<T | null> {
  if (!isBRouterHealthy() || abortSignal?.aborted) {
    return null;
  }

  if (activeBRouterRequests >= MAX_BROUTER_IN_FLIGHT) {
    const acquired = await new Promise<boolean>((resolve) => {
      let settled = false;
      const release = () => {
        if (settled) return;
        settled = true;
        abortSignal?.removeEventListener('abort', onAbort);
        resolve(true);
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        const idx = brouterWaitQueue.indexOf(release);
        if (idx >= 0) brouterWaitQueue.splice(idx, 1);
        resolve(false);
      };
      abortSignal?.addEventListener('abort', onAbort, { once: true });
      brouterWaitQueue.push(release);
    });
    if (!acquired || !isBRouterHealthy() || abortSignal?.aborted) {
      return null;
    }
  }

  activeBRouterRequests += 1;
  try {
    return await fn();
  } finally {
    activeBRouterRequests = Math.max(0, activeBRouterRequests - 1);
    const next = brouterWaitQueue.shift();
    if (next) next();
  }
}

function isRestrictedStreetName(name: string): boolean {
  return GANG_OR_ALLEY_REGEX.test(name) || TOLL_ROAD_REGEX.test(name);
}

/**
 * Decodes Google/Valhalla Polyline6 (1e6 precision) into LatLng coordinates.
 */
function decodePolyline6(encoded: string): LatLng[] {
  const coords: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dLng;

    coords.push({
      lat: lat / 1e6,
      lng: lng / 1e6,
    });
  }

  return coords;
}

function isValidCarMotorEdge(
  e: ValhallaLocateEdge,
  allowNamedResidential: boolean
): boolean {
  const cls = e.edge?.classification?.classification || '';
  const use = e.edge?.classification?.use || '';
  const surface = e.edge?.classification?.surface || '';

  if (!CAR_ALLOWED_CLASSES.has(cls)) return false;
  if (!allowNamedResidential && !MAJOR_CLASSES.has(cls)) return false;
  if (use !== 'road' && use !== 'ramp') return false;
  if (e.edge?.toll) return false;
  if (e.edge?.access?.car === false || e.edge?.access?.motorcycle === false) return false;
  if (surface === 'dirt' || surface === 'mud' || surface === 'sand') return false;

  const names = e.edge_info?.names || [];
  const joinedName = names.join(' ');
  if (joinedName && isRestrictedStreetName(joinedName)) return false;

  // In Indonesian OSM data, narrow unnamed kampung gangs are routinely tagged as
  // classification='residential' with names=[] and low speed (<=12) or deadend/destination_only.
  if (cls === 'residential') {
    if (names.length === 0) return false;
    if (e.edge?.destination_only || e.edge?.deadend) return false;
  }

  return (
    typeof e.correlated_lat === 'number' &&
    typeof e.correlated_lon === 'number'
  );
}

const OSRM_NEAREST_URLS = [
  'https://routing.openstreetmap.de/routed-car/nearest/v1/driving',
  OSRM_NEAREST_DRIVING_URL,
];

interface ValhallaLocateResult {
  edges: ValhallaLocateEdge[];
  failedNetwork: boolean;
}

interface ValhallaTripsResult {
  trips: EvaluatedTrip[];
  failedNetwork: boolean;
}

function linkAbortSignals(timeoutMs: number, externalSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onExtAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExtAbort, { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExtAbort);
    },
  };
}

async function queryValhallaLocate(
  pt: LatLng,
  radiusMeters: number,
  minRoadClass: ValhallaRoadClass,
  timeoutMs: number = 2400,
  externalSignal?: AbortSignal
): Promise<ValhallaLocateResult> {
  if (!isValhallaHealthy() || externalSignal?.aborted) {
    return { edges: [], failedNetwork: true };
  }

  const res = await withValhallaSlot(async () => {
    const linked = linkAbortSignals(timeoutMs, externalSignal);
    try {
      const response = await fetch(VALHALLA_LOCATE_URL, {
        method: 'POST',
        signal: linked.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          locations: [
            {
              lat: pt.lat,
              lon: pt.lng,
              radius: radiusMeters,
              search_filter: {
                min_road_class: minRoadClass,
                max_road_class: 'trunk',
                exclude_tunnel: true,
              },
            },
          ],
          costing: 'auto',
          verbose: true,
        }),
      });
      if (response.status === 429 || response.status >= 500) {
        markValhallaFailure(response.status === 429);
        return { edges: [], failedNetwork: true };
      }
      markValhallaSuccess();
      if (!response.ok) return { edges: [], failedNetwork: false };
      const data = await response.json();
      const edges = data?.[0]?.edges;
      return {
        edges: Array.isArray(edges) ? edges : [],
        failedNetwork: false,
      };
    } catch {
      if (!externalSignal?.aborted) {
        markValhallaFailure(false);
      }
      return { edges: [], failedNetwork: true };
    } finally {
      linked.cleanup();
    }
  }, externalSignal);

  return res ?? { edges: [], failedNetwork: true };
}

async function snapDrivingOsrmFallback(
  point: LatLng,
  externalSignal?: AbortSignal
): Promise<LatLng | null> {
  for (const nearestBase of OSRM_NEAREST_URLS) {
    if (externalSignal?.aborted) return null;
    const linked = linkAbortSignals(1600, externalSignal);
    try {
      const url = `${nearestBase}/${point.lng.toFixed(6)},${point.lat.toFixed(6)}?number=4`;
      const res = await fetch(url, {
        signal: linked.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.code !== 'Ok' || !Array.isArray(data.waypoints)) continue;

      for (const wp of data.waypoints) {
        const name = String(wp.name || '');
        if (isRestrictedStreetName(name)) continue;
        const [lng, lat] = wp.location;
        const candidate = { lat, lng };
        if (haversineDistance(point, candidate) <= 0.45) {
          return pushOutOfObvitnas(candidate);
        }
      }
    } catch {
      // try next OSRM car nearest endpoint
    } finally {
      linked.cleanup();
    }
  }
  return null;
}

function mapMvtClassToValhalla(cls: MvtRoadClass): ValhallaRoadClass {
  return cls === 'minor' ? 'residential' : cls;
}

/**
 * Resolves a clicked point onto a public road strictly passable by cars & motorcycles.
 * - Rejects unnamed residential alleys, Gang/Gg./Lorong, service_other, driveways, footways, motorcar=no, and Obvitnas.
 * - Uses cached OpenFreeMap z=14 vector roads in parallel so snapping succeeds in ~110ms even if Valhalla is unreachable.
 */
async function resolveVehicleSnapPoint(
  rawPoint: LatLng,
  mode: 'manual' | 'loop_start' | 'major_only',
  externalSignal?: AbortSignal
): Promise<VehicleAnchor> {
  const safePoint = pushOutOfObvitnas(rawPoint);
  const cacheKey = `${mode}:${safePoint.lat.toFixed(5)},${safePoint.lng.toFixed(5)}`;
  const cached = anchorCache.get(cacheKey);
  if (cached) return cached;

  const classBonus: Record<string, number> = {
    trunk: 18,
    primary: 16,
    secondary: 14,
    tertiary: 12,
    unclassified: 8,
    residential: 0,
  };

  const pickBestEdge = (
    edges: ValhallaLocateEdge[],
    allowNamedResidential: boolean,
    maxDistMeters: number
  ): { point: LatLng; cls: ValhallaRoadClass; distMeters: number } | null => {
    let best: { point: LatLng; cls: ValhallaRoadClass; distMeters: number } | null = null;
    let bestScore = -Infinity;

    for (const e of edges) {
      if (!isValidCarMotorEdge(e, allowNamedResidential)) continue;
      const candidate: LatLng = {
        lat: e.correlated_lat as number,
        lng: e.correlated_lon as number,
      };
      const distMeters = haversineDistance(safePoint, candidate) * 1000;
      if (distMeters > maxDistMeters) continue;

      const cls = (e.edge?.classification?.classification || 'unclassified') as ValhallaRoadClass;
      const lanes = e.edge?.lane_count || 1;
      const score =
        (classBonus[cls] ?? 0) +
        (lanes >= 2 ? 6 : 0) -
        distMeters * 0.45;

      if (score > bestScore) {
        bestScore = score;
        best = { point: candidate, cls, distMeters };
      }
    }
    return best;
  };

  const mvtSnapPromise = snapCarRoadFromMvt(
    safePoint,
    mode,
    mode === 'major_only' ? 680 : 780,
    externalSignal
  ).catch(() => null);

  let anchor: VehicleAnchor | null = null;

  if (isValhallaHealthy()) {
    if (mode === 'manual') {
      const localRes = await queryValhallaLocate(safePoint, 45, 'residential', 1600, externalSignal);
      const localHit = pickBestEdge(localRes.edges, true, 35);
      if (localHit) {
        const resolvedPt = pushOutOfObvitnas(localHit.point);
        anchor = {
          point: resolvedPt,
          minClass: localHit.cls === 'residential' ? 'residential' : 'unclassified',
          roadClass: localHit.cls,
          wasSnappedFromRestricted: false,
        };
      } else if (!localRes.failedNetwork && isValhallaHealthy()) {
        const wideMajor = await queryValhallaLocate(safePoint, 320, 'unclassified', 1800, externalSignal);
        const majorHit = pickBestEdge(wideMajor.edges, false, 320);
        if (majorHit) {
          anchor = {
            point: pushOutOfObvitnas(majorHit.point),
            minClass: 'unclassified',
            roadClass: majorHit.cls,
            wasSnappedFromRestricted: true,
          };
        } else if (!wideMajor.failedNetwork && isValhallaHealthy()) {
          const wideRes = await queryValhallaLocate(safePoint, 420, 'residential', 1800, externalSignal);
          const resHit = pickBestEdge(wideRes.edges, true, 420);
          if (resHit) {
            anchor = {
              point: pushOutOfObvitnas(resHit.point),
              minClass: resHit.cls === 'residential' ? 'residential' : 'unclassified',
              roadClass: resHit.cls,
              wasSnappedFromRestricted: true,
            };
          }
        }
      }
    } else {
      const fastRadius = mode === 'major_only' ? 140 : 75;
      const fastMinClass: ValhallaRoadClass = mode === 'major_only' ? 'tertiary' : 'unclassified';
      const fastRes = await queryValhallaLocate(safePoint, fastRadius, fastMinClass, 1600, externalSignal);
      const fastHit = pickBestEdge(fastRes.edges, false, fastRadius);

      if (fastHit) {
        const snappedPt = pushOutOfObvitnas(fastHit.point);
        anchor = {
          point: snappedPt,
          minClass: MAJOR_CLASSES.has(fastHit.cls) ? 'unclassified' : 'residential',
          roadClass: fastHit.cls,
          wasSnappedFromRestricted: haversineDistance(safePoint, snappedPt) > 0.035,
        };
      } else if (!fastRes.failedNetwork && isValhallaHealthy()) {
        const minClass: ValhallaRoadClass = mode === 'major_only' ? 'tertiary' : 'unclassified';
        const radiusM = mode === 'major_only' ? 450 : 280;
        const wideRes = await queryValhallaLocate(safePoint, radiusM, minClass, 1800, externalSignal);
        const hit = pickBestEdge(wideRes.edges, false, radiusM);
        if (hit) {
          const snappedPt = pushOutOfObvitnas(hit.point);
          anchor = {
            point: snappedPt,
            minClass: MAJOR_CLASSES.has(hit.cls) ? 'unclassified' : 'residential',
            roadClass: hit.cls,
            wasSnappedFromRestricted: haversineDistance(safePoint, snappedPt) > 0.035,
          };
        }
      }
    }
  }

  if (!anchor) {
    const mvtHit = await mvtSnapPromise;
    if (mvtHit) {
      const snappedPt = pushOutOfObvitnas(mvtHit.point);
      const vCls = mapMvtClassToValhalla(mvtHit.roadClass);
      anchor = {
        point: snappedPt,
        minClass: mvtHit.roadClass === 'minor' ? 'residential' : 'unclassified',
        roadClass: vCls,
        wasSnappedFromRestricted: mvtHit.distMeters > 35,
      };
    }
  }

  if (!anchor) {
    const osrmNearest = await snapDrivingOsrmFallback(safePoint, externalSignal);
    if (osrmNearest) {
      anchor = {
        point: osrmNearest,
        minClass: 'unclassified',
        roadClass: 'unclassified',
        wasSnappedFromRestricted: haversineDistance(safePoint, osrmNearest) > 0.035,
      };
    } else {
      anchor = {
        point: safePoint,
        minClass: 'unclassified',
        roadClass: 'unclassified',
        wasSnappedFromRestricted: false,
      };
    }
  }

  if (anchorCache.size > 400) {
    const firstKey = anchorCache.keys().next().value;
    if (firstKey) anchorCache.delete(firstKey);
  }
  anchorCache.set(cacheKey, anchor);
  return anchor;
}

/**
 * Evaluates a Valhalla trip for car/motor validity:
 * Detects gang/alley names, toll roads, Obvitnas violations, and long unnamed alley cuts.
 */
function evaluateValhallaTrip(trip: ValhallaTrip): EvaluatedTrip | null {
  if (!trip.legs || trip.legs.length === 0) return null;

  const fullCoords: LatLng[] = [];
  const gangPoints: LatLng[] = [];
  let tollCount = 0;
  let unnamedLenKm = 0;

  for (const leg of trip.legs) {
    if (!leg.shape) continue;
    const legCoords = decodePolyline6(leg.shape);
    if (legCoords.length === 0) continue;

    for (let i = 0; i < legCoords.length; i++) {
      const pt = legCoords[i];
      if (
        fullCoords.length > 0 &&
        haversineDistance(fullCoords[fullCoords.length - 1], pt) < 0.002
      ) {
        continue;
      }
      fullCoords.push(pt);
    }

    for (const m of leg.maneuvers || []) {
      const names = m.street_names || [];
      const joined = names.join(' ');
      const manLenKm = m.length || 0;

      if (m.toll || (joined && TOLL_ROAD_REGEX.test(joined))) {
        tollCount++;
      }

      if (joined && GANG_OR_ALLEY_REGEX.test(joined)) {
        const startIdx = m.begin_shape_index ?? 0;
        const endIdx = m.end_shape_index ?? startIdx;
        const midIdx = Math.min(legCoords.length - 1, Math.floor((startIdx + endIdx) / 2));
        if (legCoords[midIdx]) {
          gangPoints.push(legCoords[midIdx]);
        }
      } else if (
        names.length === 0 &&
        !m.roundabout_exit_count &&
        m.type !== 4 &&
        m.type !== 5 &&
        m.type !== 6 &&
        manLenKm > 0.11
      ) {
        unnamedLenKm += manLenKm;
      }
    }
  }

  if (fullCoords.length < 2) return null;

  const distanceKm = trip.summary?.length ?? calculatePolylineDistance(fullCoords);
  const obvCheck = routeHasObvitnasViolation(fullCoords);
  const obvitnasCount = obvCheck.violatedZones.length;

  const scorePenalty =
    obvitnasCount * 100000 +
    tollCount * 50000 +
    gangPoints.length * 25000 +
    unnamedLenKm * 800;

  return {
    coordinates: fullCoords,
    distanceKm,
    gangPoints,
    tollCount,
    obvitnasCount,
    unnamedLenKm,
    scorePenalty,
  };
}

async function fetchValhallaTrips(
  locations: Array<{
    point: LatLng;
    radiusMeters: number;
    minRoadClass: ValhallaRoadClass;
  }>,
  options: {
    alternates?: number;
    excludeLocations?: LatLng[];
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<ValhallaTripsResult> {
  const { alternates = 0, excludeLocations = [], timeoutMs = 3800, signal } = options;

  const cacheKey = `${locations
    .map((l) => `${l.point.lat.toFixed(4)},${l.point.lng.toFixed(4)},${l.radiusMeters},${l.minRoadClass}`)
    .join(';')}|alt=${alternates}|exc=${excludeLocations
    .map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
    .join(';')}`;

  const cached = valhallaTripCache.get(cacheKey);
  if (cached) {
    return { trips: cached, failedNetwork: false };
  }

  if (!isValhallaHealthy() || signal?.aborted) {
    return { trips: [], failedNetwork: true };
  }

  const slotResult = await withValhallaSlot(async () => {
    const linked = linkAbortSignals(timeoutMs, signal);
    try {
      const payload: Record<string, unknown> = {
        locations: locations.map((loc) => ({
          lat: loc.point.lat,
          lon: loc.point.lng,
          radius: loc.radiusMeters,
          search_filter: {
            min_road_class: loc.minRoadClass,
            max_road_class: 'trunk',
            exclude_tunnel: true,
          },
        })),
        costing: 'auto',
        costing_options: STRICT_VEHICLE_COSTING_OPTIONS,
        units: 'kilometers',
        language: 'en-US',
      };

      if (alternates > 0) {
        payload.alternates = alternates;
      }
      if (excludeLocations.length > 0) {
        payload.exclude_locations = excludeLocations.map((p) => ({
          lat: p.lat,
          lon: p.lng,
        }));
      }

      const res = await fetch(VALHALLA_ROUTE_URL, {
        method: 'POST',
        signal: linked.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 429 || res.status >= 500) {
        markValhallaFailure(res.status === 429);
        return { trips: [], failedNetwork: true };
      }

      markValhallaSuccess();
      if (!res.ok) {
        return { trips: [], failedNetwork: false };
      }

      const data = await res.json();
      const rawTrips: ValhallaTrip[] = [];
      if (data.trip) rawTrips.push(data.trip);
      if (Array.isArray(data.alternates)) {
        for (const alt of data.alternates) {
          if (alt?.trip) rawTrips.push(alt.trip);
        }
      }

      const evaluated: EvaluatedTrip[] = [];
      for (const t of rawTrips) {
        const ev = evaluateValhallaTrip(t);
        if (ev) evaluated.push(ev);
      }

      if (evaluated.length > 0) {
        if (valhallaTripCache.size >= 45) {
          const oldest = valhallaTripCache.keys().next().value;
          if (oldest) valhallaTripCache.delete(oldest);
        }
        valhallaTripCache.set(cacheKey, evaluated);
      }

      return { trips: evaluated, failedNetwork: false };
    } catch {
      if (!signal?.aborted) {
        markValhallaFailure(false);
      }
      return { trips: [], failedNetwork: true };
    } finally {
      linked.cleanup();
    }
  }, signal);

  return slotResult ?? { trips: [], failedNetwork: true };
}

function evaluateOsrmRouteObject(route: {
  geometry?: { coordinates?: [number, number][] };
  legs?: Array<{
    steps?: Array<{
      name?: string;
      distance?: number;
      maneuver?: { location?: [number, number] };
    }>;
  }>;
}): EvaluatedTrip | null {
  const rawCoords = route?.geometry?.coordinates;
  if (!rawCoords || rawCoords.length < 2) return null;

  const coords = rawCoords.map(([lng, lat]) => ({ lat, lng }));
  const gangPoints: LatLng[] = [];
  let tollCount = 0;
  let unnamedLenKm = 0;

  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      const name = String(step.name || '');
      const distM = typeof step.distance === 'number' ? step.distance : 0;
      const distKm = distM / 1000;

      if (TOLL_ROAD_REGEX.test(name)) tollCount++;
      if (GANG_OR_ALLEY_REGEX.test(name)) {
        const loc = step.maneuver?.location;
        if (Array.isArray(loc) && loc.length === 2) {
          gangPoints.push({ lat: loc[1], lng: loc[0] });
        }
      } else if (!name && distKm > 0.06) {
        unnamedLenKm += distKm;
      }
    }
  }

  const obv = routeHasObvitnasViolation(coords);
  const distanceKm = calculatePolylineDistance(coords);
  const scorePenalty =
    obv.violatedZones.length * 100000 +
    tollCount * 50000 +
    gangPoints.length * 25000 +
    unnamedLenKm * 5000;

  return {
    coordinates: coords,
    distanceKm,
    gangPoints,
    tollCount,
    obvitnasCount: obv.violatedZones.length,
    unnamedLenKm,
    scorePenalty,
  };
}

const BROUTER_MOTORWAY_REGEX = /\bhighway=(?:motorway|motorway_link)\b|\btoll=yes\b/i;
const BROUTER_RESTRICTED_WAY_REGEX =
  /\bhighway=(?:service|track|path|footway|steps|pedestrian|cycleway|living_street)\b|\b(?:access=private|motor_vehicle=no|motorcar=no)\b/i;

function getNearbyObvitnasNogos(center: LatLng): Array<{ point: LatLng; radiusMeters: number }> {
  const nogos: Array<{ point: LatLng; radiusMeters: number }> = [];
  for (const z of OBVITNAS_ZONES) {
    const zp = { lat: z.lat, lng: z.lng };
    if (haversineDistance(center, zp) <= 6.5) {
      nogos.push({
        point: zp,
        radiusMeters: Math.max(60, Math.round(z.radiusKm * 850)),
      });
    }
    if (nogos.length >= 6) break;
  }
  return nogos;
}

async function evaluateBRouterFeature(
  feature: {
    geometry?: { coordinates?: number[][] };
    properties?: {
      'track-length'?: string | number;
      messages?: string[][];
    };
  },
  signal?: AbortSignal
): Promise<EvaluatedTrip | null> {
  const rawCoords = feature?.geometry?.coordinates;
  if (!rawCoords || rawCoords.length < 2) return null;

  const coords: LatLng[] = [];
  for (const pt of rawCoords) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const nextPt = { lat: Number(pt[1]), lng: Number(pt[0]) };
    if (!Number.isFinite(nextPt.lat) || !Number.isFinite(nextPt.lng)) continue;
    if (
      coords.length > 0 &&
      haversineDistance(coords[coords.length - 1], nextPt) < 0.002
    ) {
      continue;
    }
    coords.push(nextPt);
  }
  if (coords.length < 2) return null;

  const gangPoints: LatLng[] = [];
  let tollCount = 0;
  let restrictedMeters = 0;

  const msgs = feature.properties?.messages;
  if (Array.isArray(msgs) && msgs.length > 1) {
    const header = msgs[0];
    const lonIdx = header.indexOf('Longitude');
    const latIdx = header.indexOf('Latitude');
    const distIdx = header.indexOf('Distance');
    const wayIdx = header.indexOf('WayTags');

    for (let i = 1; i < msgs.length; i++) {
      const row = msgs[i];
      if (!Array.isArray(row)) continue;
      const distM = distIdx >= 0 ? Number(row[distIdx] || 0) : 0;
      const wayTags = wayIdx >= 0 ? String(row[wayIdx] || '') : '';
      const rawLon = lonIdx >= 0 ? Number(row[lonIdx]) / 1e6 : NaN;
      const rawLat = latIdx >= 0 ? Number(row[latIdx]) / 1e6 : NaN;
      const validPt =
        Number.isFinite(rawLat) && Number.isFinite(rawLon) ? { lat: rawLat, lng: rawLon } : null;

      if (BROUTER_MOTORWAY_REGEX.test(wayTags)) {
        tollCount++;
      }
      if (BROUTER_RESTRICTED_WAY_REGEX.test(wayTags)) {
        restrictedMeters += distM;
        if (
          validPt &&
          gangPoints.length < 12 &&
          gangPoints.every((g) => haversineDistance(g, validPt) > 0.08)
        ) {
          gangPoints.push(validPt);
        }
      }
    }
  }

  // Cross-check against OpenFreeMap z=14 street names so unnamed BRouter edges never cross Gang/Tol
  const mvtScan = await scanRouteRestrictedRoadsMvt(coords, signal).catch(() => ({
    gangPoints: [],
    tollCount: 0,
  }));
  tollCount += mvtScan.tollCount;
  for (const gp of mvtScan.gangPoints) {
    if (gangPoints.length < 12 && gangPoints.every((g) => haversineDistance(g, gp) > 0.08)) {
      gangPoints.push(gp);
    }
  }

  const obv = routeHasObvitnasViolation(coords);
  const trackLenM = Number(feature.properties?.['track-length']);
  const distanceKm =
    Number.isFinite(trackLenM) && trackLenM > 0
      ? trackLenM / 1000
      : calculatePolylineDistance(coords);

  const scorePenalty =
    obv.violatedZones.length * 100000 +
    tollCount * 50000 +
    gangPoints.length * 25000 +
    (restrictedMeters / 1000) * 6000;

  return {
    coordinates: coords,
    distanceKm,
    gangPoints,
    tollCount,
    obvitnasCount: obv.violatedZones.length,
    unnamedLenKm: restrictedMeters / 1000,
    scorePenalty,
  };
}

async function fetchBRouterCarTrips(
  points: LatLng[],
  options: {
    alternativeIdx?: number;
    excludeLocations?: LatLng[];
    timeoutMs?: number;
    signal?: AbortSignal;
    allowIslandResnap?: boolean;
  } = {}
): Promise<EvaluatedTrip[]> {
  if (points.length < 2 || options.signal?.aborted || !isBRouterHealthy()) return [];

  const {
    alternativeIdx = 0,
    excludeLocations = [],
    timeoutMs = 3600,
    signal,
    allowIslandResnap = true,
  } = options;

  const allNogos = [
    ...getNearbyObvitnasNogos(points[0]),
    ...excludeLocations.slice(0, 6).map((pt) => ({ point: pt, radiusMeters: 110 })),
  ];

  const lonlatsStr = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join('|');
  const nogosStr = allNogos
    .map((n) => `${n.point.lng.toFixed(6)},${n.point.lat.toFixed(6)},${n.radiusMeters}`)
    .join('|');
  const cacheKey = `${lonlatsStr}|alt=${alternativeIdx}|nogo=${nogosStr}`;

  const cached = brouterTripCache.get(cacheKey);
  if (cached) return cached;

  const queryOnce = async (ptsStr: string): Promise<{ trips: EvaluatedTrip[]; hitIsland: boolean }> => {
    const res = await withBRouterSlot(async () => {
      const linked = linkAbortSignals(timeoutMs, signal);
      try {
        const params = new URLSearchParams({
          lonlats: ptsStr,
          profile: 'car-eco',
          'profile:avoid_motorways': '1',
          'profile:avoid_toll': '1',
          'profile:avoid_unpaved': '1',
          alternativeidx: String(alternativeIdx),
          format: 'geojson',
        });
        if (nogosStr) {
          params.set('nogos', nogosStr);
        }

        const response = await fetch(`${BROUTER_ROUTE_URL}?${params.toString()}`, {
          signal: linked.signal,
          headers: { Accept: 'application/json' },
        });

        if (response.status === 429 || response.status >= 500) {
          markBRouterFailure(response.status === 429);
          return { trips: [], hitIsland: false };
        }

        if (!response.ok) {
          const msg = await response.text().catch(() => '');
          markBRouterSuccess();
          return { trips: [], hitIsland: /island/i.test(msg) };
        }

        markBRouterSuccess();
        const data = await response.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        const evaluated = (
          await Promise.all(features.map((feat: Record<string, unknown>) => evaluateBRouterFeature(feat, signal)))
        ).filter((t): t is EvaluatedTrip => t !== null);

        return { trips: evaluated, hitIsland: false };
      } catch {
        if (!signal?.aborted) {
          markBRouterFailure(false);
        }
        return { trips: [], hitIsland: false };
      } finally {
        linked.cleanup();
      }
    }, signal);

    return res ?? { trips: [], hitIsland: false };
  };

  let attempt = await queryOnce(lonlatsStr);

  // If BRouter hit a disconnected cul-de-sac / island spur, snap all non-closed anchors strongly to major avenues and retry once
  if (attempt.hitIsland && allowIslandResnap && isBRouterHealthy() && !signal?.aborted) {
    const resnapped = await Promise.all(
      points.map(async (pt, idx) => {
        if (idx === points.length - 1 && haversineDistance(points[0], pt) < 0.015) {
          return null;
        }
        const mvt = await snapCarRoadFromMvt(pt, 'major_only', 850, signal).catch(() => null);
        return mvt ? pushOutOfObvitnas(mvt.point) : pt;
      })
    );
    const repaired = resnapped.map((pt, idx) => pt ?? (resnapped[0] || points[idx]));
    const repairedStr = repaired.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join('|');
    if (repairedStr !== lonlatsStr) {
      attempt = await queryOnce(repairedStr);
    }
  }

  if (attempt.trips.length > 0) {
    if (brouterTripCache.size >= 60) {
      const oldest = brouterTripCache.keys().next().value;
      if (oldest) brouterTripCache.delete(oldest);
    }
    brouterTripCache.set(cacheKey, attempt.trips);
  }

  return attempt.trips;
}

async function fetchOsrmDrivingMultiPoint(
  points: LatLng[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<EvaluatedTrip[]> {
  if (points.length < 2 || options.signal?.aborted) return [];

  const coordString = points
    .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
    .join(';');

  const cached = osrmTripCache.get(coordString);
  if (cached) return cached;

  const { signal, timeoutMs = 2500 } = options;

  for (const baseUrl of OSRM_DRIVING_URLS) {
    if (signal?.aborted) return [];
    const linked = linkAbortSignals(timeoutMs, signal);
    try {
      const url = `${baseUrl}/${coordString}?overview=full&geometries=geojson&steps=true&alternatives=true`;
      const res = await fetch(url, {
        signal: linked.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;

      const data = await res.json();
      if (data.code !== 'Ok' || !Array.isArray(data.routes)) continue;

      const evaluated: EvaluatedTrip[] = [];
      for (const r of data.routes) {
        const ev = evaluateOsrmRouteObject(r);
        if (ev) evaluated.push(ev);
      }

      if (evaluated.length > 0) {
        if (osrmTripCache.size >= 50) {
          const oldest = osrmTripCache.keys().next().value;
          if (oldest) osrmTripCache.delete(oldest);
        }
        osrmTripCache.set(coordString, evaluated);
        return evaluated;
      }
    } catch {
      // try next OSRM car endpoint
    } finally {
      linked.cleanup();
    }
  }

  return [];
}

async function fetchOsrmDrivingFallback(
  p1: LatLng,
  p2: LatLng,
  signal?: AbortSignal
): Promise<EvaluatedTrip | null> {
  const routes = await fetchOsrmDrivingMultiPoint([p1, p2], { signal, timeoutMs: 2500 });
  if (routes.length === 0) return null;

  let best: EvaluatedTrip | null = null;
  let bestCost = Infinity;
  for (const ev of routes) {
    const cost = ev.scorePenalty + ev.distanceKm * 100;
    if (cost < bestCost) {
      bestCost = cost;
      best = ev;
    }
  }
  return best;
}

/**
 * Fetches a single directional or bidirectional segment strictly on streets
 * passable by cars & motorcycles (never Gang/footpath/steps/alley).
 */
async function fetchStrictVehicleSegment(
  a1: VehicleAnchor,
  a2: VehicleAnchor,
  allowContraflow: boolean = true
): Promise<{
  coords: LatLng[];
  engine: 'valhalla' | 'brouter' | 'osrm';
} | null> {
  const queryDirection = async (
    from: VehicleAnchor,
    to: VehicleAnchor,
    reverseCoords: boolean
  ): Promise<EvaluatedTrip[]> => {
    if (!isValhallaHealthy()) return [];

    // Primary query uses strict class filters anchored on non-gang roads
    const primaryRes = await fetchValhallaTrips(
      [
        { point: from.point, radiusMeters: 160, minRoadClass: from.minClass },
        { point: to.point, radiusMeters: 160, minRoadClass: to.minClass },
      ],
      { alternates: 1, timeoutMs: 2600 }
    );

    let trips = primaryRes.trips;

    // Widen radius slightly ONLY if Valhalla actually responded (not network failure/timeout)
    if (trips.length === 0 && !primaryRes.failedNetwork && isValhallaHealthy()) {
      const wideRes = await fetchValhallaTrips(
        [
          { point: from.point, radiusMeters: 350, minRoadClass: 'residential' },
          { point: to.point, radiusMeters: 350, minRoadClass: 'residential' },
        ],
        { alternates: 1, timeoutMs: 2600 }
      );
      trips = wideRes.trips;
    }

    if (reverseCoords) {
      return trips.map((t) => ({
        ...t,
        coordinates: [...t.coordinates].reverse(),
      }));
    }
    return trips;
  };

  const candidates = isValhallaHealthy()
    ? allowContraflow
      ? (
          await Promise.all([
            queryDirection(a1, a2, false),
            queryDirection(a2, a1, true),
          ])
        ).flat()
      : await queryDirection(a1, a2, false)
    : [];

  const pickBest = (list: EvaluatedTrip[]): EvaluatedTrip | null => {
    let best: EvaluatedTrip | null = null;
    let bestTotal = Infinity;
    for (const c of list) {
      const total = c.scorePenalty + c.distanceKm * 100;
      if (total < bestTotal) {
        bestTotal = total;
        best = c;
      }
    }
    return best;
  };

  let best = pickBest(candidates);

  // If winning Valhalla route touched a street named "Gang"/"Gg."/"Lorong", auto-retry excluding those nodes
  if (best && best.gangPoints.length > 0 && isValhallaHealthy()) {
    const excludePts = best.gangPoints;
    const retryFetches = allowContraflow
      ? [
          fetchValhallaTrips(
            [
              { point: a1.point, radiusMeters: 220, minRoadClass: 'unclassified' },
              { point: a2.point, radiusMeters: 220, minRoadClass: 'unclassified' },
            ],
            { alternates: 1, excludeLocations: excludePts, timeoutMs: 2600 }
          ).then((r) => r.trips),
          fetchValhallaTrips(
            [
              { point: a2.point, radiusMeters: 220, minRoadClass: 'unclassified' },
              { point: a1.point, radiusMeters: 220, minRoadClass: 'unclassified' },
            ],
            { alternates: 1, excludeLocations: excludePts, timeoutMs: 2600 }
          ).then((r) =>
            r.trips.map((t) => ({ ...t, coordinates: [...t.coordinates].reverse() }))
          ),
        ]
      : [
          fetchValhallaTrips(
            [
              { point: a1.point, radiusMeters: 220, minRoadClass: 'unclassified' },
              { point: a2.point, radiusMeters: 220, minRoadClass: 'unclassified' },
            ],
            { alternates: 1, excludeLocations: excludePts, timeoutMs: 2600 }
          ).then((r) => r.trips),
        ];

    const retryBest = pickBest((await Promise.all(retryFetches)).flat());
    if (retryBest && retryBest.scorePenalty < best.scorePenalty) {
      best = retryBest;
    }
  }

  if (best && best.coordinates.length >= 2) {
    return {
      coords: best.coordinates,
      engine: 'valhalla',
    };
  }

  // Tier 2: BRouter car-eco engine (~650ms, provides WayTags street classes)
  if (isBRouterHealthy()) {
    const brouterCandidates = allowContraflow
      ? (
          await Promise.all([
            fetchBRouterCarTrips([a1.point, a2.point], { timeoutMs: 3200 }),
            fetchBRouterCarTrips([a2.point, a1.point], { timeoutMs: 3200 }).then((list) =>
              list.map((t) => ({
                ...t,
                coordinates: [...t.coordinates].reverse(),
              }))
            ),
          ])
        ).flat()
      : await fetchBRouterCarTrips([a1.point, a2.point], { timeoutMs: 3200 });

    const bestBRouter = pickBest(brouterCandidates);
    if (bestBRouter && bestBRouter.coordinates.length >= 2) {
      return {
        coords: bestBRouter.coordinates,
        engine: 'brouter',
      };
    }
  }

  // Tier 3: OSRM car-only driving endpoints (never foot or bike!)
  const carCandidates = allowContraflow
    ? await Promise.all([
        fetchOsrmDrivingFallback(a1.point, a2.point),
        fetchOsrmDrivingFallback(a2.point, a1.point).then((r) =>
          r ? { ...r, coordinates: [...r.coordinates].reverse() } : null
        ),
      ])
    : [await fetchOsrmDrivingFallback(a1.point, a2.point)];

  const validCar = carCandidates.filter((c): c is EvaluatedTrip => c !== null);
  const bestCar = pickBest(validCar);
  if (bestCar) {
    return {
      coords: bestCar.coordinates,
      engine: 'osrm',
    };
  }

  return null;
}

export async function snapWaypointToVehicleRoad(point: LatLng): Promise<LatLng> {
  const anchor = await resolveVehicleSnapPoint(point, 'manual');
  return anchor.point;
}

/**
 * Runner Bidirectional Car/Motorcycle Segment Router:
 * Finds routes strictly on streets passable by cars & motorcycles while allowing
 * runners to travel along either side of wide two-way/one-way corridors.
 */
export async function fetchBidirectionalSegment(
  p1: LatLng,
  p2: LatLng,
  allowContraflow: boolean = true,
  avoidSmallAlleys: boolean = true
): Promise<LatLng[]> {
  const [a1, a2] = await Promise.all([
    resolveVehicleSnapPoint(p1, avoidSmallAlleys ? 'manual' : 'major_only'),
    resolveVehicleSnapPoint(p2, avoidSmallAlleys ? 'manual' : 'major_only'),
  ]);
  const res = await fetchStrictVehicleSegment(a1, a2, allowContraflow);
  return res?.coords || [a1.point, a2.point];
}

/**
 * Smart Manual Route Builder:
 * Snaps waypoints out of Gang/alleys/parks onto passable car & motorcycle roads,
 * avoids Objek Vital Nasional, tolls, and unnamed shortcuts.
 */
export async function fetchSmartManualRoute(
  waypoints: LatLng[],
  snapToRoads: boolean = true,
  allowContraflow: boolean = true,
  avoidSmallAlleys: boolean = true
): Promise<RouteFetchResult> {
  if (waypoints.length < 2) {
    return {
      coordinates: waypoints,
      distanceKm: 0,
      isSnapped: false,
      source: 'direct',
    };
  }

  if (!snapToRoads) {
    const directDist = calculatePolylineDistance(waypoints);
    return {
      coordinates: waypoints,
      distanceKm: directDist,
      isSnapped: false,
      source: 'direct',
    };
  }

  // Resolve all waypoints onto valid car/motor roads in parallel (cached per coordinate)
  const anchors = await Promise.all(
    waypoints.map((wp) => resolveVehicleSnapPoint(wp, avoidSmallAlleys ? 'manual' : 'major_only'))
  );

  // Route every leg in parallel for fast responsiveness
  const segmentResults = await Promise.all(
    anchors.slice(0, -1).map(async (startAnchor, i) => {
      const endAnchor = anchors[i + 1];
      const directDistKm = haversineDistance(startAnchor.point, endAnchor.point);
      if (directDistKm < 0.015) {
        return {
          coords: [startAnchor.point, endAnchor.point],
          engine: 'direct' as const,
          isSnapped: false,
        };
      }

      const seg = await fetchStrictVehicleSegment(startAnchor, endAnchor, allowContraflow);
      if (seg && seg.coords.length > 1) {
        const segDistKm = calculatePolylineDistance(seg.coords);
        const maxAcceptableDetour = Math.max(directDistKm * 3.8, directDistKm + 0.9);
        if (segDistKm <= maxAcceptableDetour) {
          return {
            coords: seg.coords,
            engine: seg.engine,
            isSnapped: true,
          };
        }
      }

      return {
        coords: [startAnchor.point, endAnchor.point],
        engine: 'direct' as const,
        isSnapped: false,
      };
    })
  );

  const finalCoordinates: LatLng[] = [];
  const segmentEndCoords: LatLng[] = [];
  let hasAnySnapped = false;
  let usedValhalla = false;
  let usedBRouter = false;

  for (const seg of segmentResults) {
    if (seg.isSnapped) hasAnySnapped = true;
    if (seg.engine === 'valhalla') usedValhalla = true;
    if (seg.engine === 'brouter') usedBRouter = true;

    for (const pt of seg.coords) {
      if (
        finalCoordinates.length > 0 &&
        haversineDistance(finalCoordinates[finalCoordinates.length - 1], pt) < 0.004
      ) {
        continue;
      }
      finalCoordinates.push(pt);
    }

    if (finalCoordinates.length > 0) {
      segmentEndCoords.push({ ...finalCoordinates[finalCoordinates.length - 1] });
    } else {
      segmentEndCoords.push({ ...seg.coords[seg.coords.length - 1] });
    }
  }

  // If user requested Closed Loop or Out & Back, ensure endpoints meet identically
  const firstWp = waypoints[0];
  const lastWp = waypoints[waypoints.length - 1];
  const isClosedLoop =
    waypoints.length > 2 &&
    haversineDistance(firstWp, lastWp) < 0.015 &&
    finalCoordinates.length >= 2;
  if (isClosedLoop && haversineDistance(finalCoordinates[0], finalCoordinates[finalCoordinates.length - 1]) > 0.002) {
    finalCoordinates.push({ ...finalCoordinates[0] });
  }

  // Align every waypoint marker directly onto the routed car/motor road geometry
  const snappedWaypoints: LatLng[] = anchors.map((anchor, idx) => {
    if (finalCoordinates.length < 2) return anchor.point;
    if (idx === 0) return { ...finalCoordinates[0] };
    if (idx === anchors.length - 1) return { ...finalCoordinates[finalCoordinates.length - 1] };
    return segmentEndCoords[idx - 1] || anchor.point;
  });

  const totalDistance = calculatePolylineDistance(finalCoordinates);

  return {
    coordinates: finalCoordinates,
    distanceKm: totalDistance,
    isSnapped: hasAnySnapped,
    source: usedValhalla ? 'valhalla' : usedBRouter ? 'brouter' : hasAnySnapped ? 'osrm' : 'direct',
    snappedWaypoints,
  };
}

/**
 * High-Accuracy Car & Motorcycle Closed-Loop Generator:
 * Generates closed circuits strictly along collector/arterial/wide streets passable by cars & motors.
 * Automatically dodges Gang/Gg./Lorong, Tolls, and Objek Vital Nasional, calibrates distance accuracy,
 * and guarantees Start & Finish meet on a valid road.
 */
export async function generateAccurateLoop(
  start: LatLng,
  targetKm: number,
  headingDeg: number = 45,
  allowContraflow: boolean = true,
  avoidSmallAlleys: boolean = true
): Promise<RouteFetchResult> {
  const startAnchor = await resolveVehicleSnapPoint(start, 'loop_start');
  const effectiveStart = startAnchor.point;
  const kmPerLat = 111.139;
  const kmPerLng = kmPerLat * Math.cos((effectiveStart.lat * Math.PI) / 180) || 1;

  const buildAnchors = (rKm: number, hDeg: number, reverseOrder: boolean): LatLng[] => {
    const hRad = (hDeg * Math.PI) / 180;
    const cLat = effectiveStart.lat + (rKm * Math.cos(hRad)) / kmPerLat;
    const cLng = effectiveStart.lng + (rKm * Math.sin(hRad)) / kmPerLng;

    const a0 = hRad + Math.PI;
    const wp1Raw: LatLng = {
      lat: cLat + (rKm * Math.cos(a0 + (2 * Math.PI) / 3)) / kmPerLat,
      lng: cLng + (rKm * Math.sin(a0 + (2 * Math.PI) / 3)) / kmPerLng,
    };
    const wp2Raw: LatLng = {
      lat: cLat + (rKm * Math.cos(a0 + (4 * Math.PI) / 3)) / kmPerLat,
      lng: cLng + (rKm * Math.sin(a0 + (4 * Math.PI) / 3)) / kmPerLng,
    };

    const wp1 = pushOutOfObvitnas(wp1Raw);
    const wp2 = pushOutOfObvitnas(wp2Raw);

    return reverseOrder
      ? [effectiveStart, wp2, wp1, effectiveStart]
      : [effectiveStart, wp1, wp2, effectiveStart];
  };

  interface LoopCandidate {
    trip: EvaluatedTrip;
    rKm: number;
    heading: number;
    reverseOrder: boolean;
    loopScore: number;
  }

  const scoreLoopCandidate = (
    trip: EvaluatedTrip,
    heading: number,
    preferredHeading: number
  ): number => {
    const dev = Math.abs(trip.distanceKm - targetKm) / (targetKm || 1);
    const headingBonus = Math.abs(heading - preferredHeading) < 1 ? 0 : 12;
    return trip.scorePenalty + dev * 1000 + headingBonus;
  };

  const evaluateLoopBatch = async (
    specs: Array<{ rKm: number; heading: number; reverseOrder: boolean }>,
    minTurnClass: ValhallaRoadClass,
    excludeLocs: LatLng[] = []
  ): Promise<LoopCandidate[]> => {
    const results = await Promise.all(
      specs.map(async (spec) => {
        const pts = buildAnchors(spec.rKm, spec.heading, spec.reverseOrder);
        const startMinClass: ValhallaRoadClass =
          minTurnClass === 'tertiary' ? 'tertiary' : startAnchor.minClass;
        const { trips } = await fetchValhallaTrips(
          [
            { point: pts[0], radiusMeters: 260, minRoadClass: startMinClass },
            { point: pts[1], radiusMeters: 420, minRoadClass: minTurnClass },
            { point: pts[2], radiusMeters: 420, minRoadClass: minTurnClass },
            { point: pts[3], radiusMeters: 260, minRoadClass: startMinClass },
          ],
          { excludeLocations: excludeLocs, timeoutMs: 3800 }
        );

        return trips.map((trip) => ({
          trip,
          rKm: spec.rKm,
          heading: spec.heading,
          reverseOrder: spec.reverseOrder,
          loopScore: scoreLoopCandidate(trip, spec.heading, headingDeg),
        }));
      })
    );
    return results.flat();
  };

  const baseRadiusKm = targetKm / 12.8;

  // Pass 1: Parallel multi-heading + CW/CCW sweep on major (tertiary..trunk) car roads
  const pass1Specs = allowContraflow
    ? [
        { rKm: baseRadiusKm, heading: headingDeg, reverseOrder: false },
        { rKm: baseRadiusKm, heading: headingDeg, reverseOrder: true },
        { rKm: baseRadiusKm, heading: (headingDeg + 135) % 360, reverseOrder: false },
        { rKm: baseRadiusKm, heading: (headingDeg + 270) % 360, reverseOrder: true },
      ]
    : [
        { rKm: baseRadiusKm, heading: headingDeg, reverseOrder: false },
        { rKm: baseRadiusKm, heading: (headingDeg + 90) % 360, reverseOrder: false },
        { rKm: baseRadiusKm, heading: (headingDeg + 180) % 360, reverseOrder: false },
        { rKm: baseRadiusKm, heading: (headingDeg + 270) % 360, reverseOrder: false },
      ];

  const primaryTurnClass: ValhallaRoadClass = avoidSmallAlleys ? 'tertiary' : 'unclassified';
  let allCandidates = await evaluateLoopBatch(pass1Specs, primaryTurnClass);

  // If sparse rural area has no tertiary roads within 420m, widen turn anchors to unclassified
  if (allCandidates.length === 0 && primaryTurnClass !== 'unclassified') {
    allCandidates = await evaluateLoopBatch(pass1Specs, 'unclassified');
  }

  let best: LoopCandidate | null =
    allCandidates.sort((a, b) => a.loopScore - b.loopScore)[0] ?? null;

  // Pass 2: Distance calibration, Obvitnas sector rotation, and/or Gang-exclusion cleanup
  if (best) {
    const devRatio = Math.abs(best.trip.distanceKm - targetKm) / (targetKm || 1);
    const needsGangCleanup = best.trip.gangPoints.length > 0;
    const needsObvitnasRotation = best.trip.obvitnasCount > 0;
    const needsCalibration = devRatio > 0.08;

    if (needsGangCleanup || needsObvitnasRotation || needsCalibration) {
      const scaledRadius = needsCalibration
        ? best.rKm * Math.min(2.2, Math.max(0.55, targetKm / (best.trip.distanceKm || targetKm)))
        : best.rKm;

      const pass2Specs = needsObvitnasRotation
        ? [
            { rKm: scaledRadius, heading: (best.heading + 90) % 360, reverseOrder: false },
            { rKm: scaledRadius, heading: (best.heading + 135) % 360, reverseOrder: allowContraflow },
            { rKm: scaledRadius, heading: (best.heading + 225) % 360, reverseOrder: false },
            { rKm: scaledRadius, heading: (best.heading + 270) % 360, reverseOrder: allowContraflow },
          ]
        : allowContraflow
        ? [
            { rKm: scaledRadius, heading: best.heading, reverseOrder: best.reverseOrder },
            { rKm: scaledRadius, heading: best.heading, reverseOrder: !best.reverseOrder },
          ]
        : [{ rKm: scaledRadius, heading: best.heading, reverseOrder: false }];

      let pass2 = await evaluateLoopBatch(
        pass2Specs,
        primaryTurnClass,
        best.trip.gangPoints
      );

      // If strict tertiary exclusion left no path, retry with unclassified + gang exclusion
      if (pass2.length === 0) {
        pass2 = await evaluateLoopBatch(
          pass2Specs,
          'unclassified',
          best.trip.gangPoints
        );
      }

      for (const cand of pass2) {
        if (cand.loopScore < best.loopScore) {
          best = cand;
        }
      }
    }
  }

  if (best && best.trip.coordinates.length >= 2) {
    const coords = [...best.trip.coordinates];
    // Guarantee mathematically identical start & finish coordinates
    if (haversineDistance(coords[0], coords[coords.length - 1]) > 0.002) {
      coords.push({ ...coords[0] });
    } else {
      coords[coords.length - 1] = { ...coords[0] };
    }

    return {
      coordinates: coords,
      distanceKm: calculatePolylineDistance(coords),
      isSnapped: true,
      source: 'valhalla',
      effectiveStart: coords[0],
    };
  }

  // Fallback Tier 2: BRouter car-eco closed loop with MVT road-snapped anchors
  const fallbackAnchorPts = buildAnchors(baseRadiusKm, headingDeg, false);
  const [wp1Mvt, wp2Mvt] = await Promise.all([
    snapCarRoadFromMvt(fallbackAnchorPts[1], 'major_only', 700).catch(() => null),
    snapCarRoadFromMvt(fallbackAnchorPts[2], 'major_only', 700).catch(() => null),
  ]);
  const bWp1 = wp1Mvt ? pushOutOfObvitnas(wp1Mvt.point) : fallbackAnchorPts[1];
  const bWp2 = wp2Mvt ? pushOutOfObvitnas(wp2Mvt.point) : fallbackAnchorPts[2];
  const brTrips = await fetchBRouterCarTrips([effectiveStart, bWp1, bWp2, effectiveStart], {
    timeoutMs: 3600,
  });
  if (brTrips.length > 0 && brTrips[0].coordinates.length >= 2) {
    const coords = [...brTrips[0].coordinates];
    coords[coords.length - 1] = { ...coords[0] };
    return {
      coordinates: coords,
      distanceKm: calculatePolylineDistance(coords),
      isSnapped: true,
      source: 'brouter',
      effectiveStart: coords[0],
      error: 'Routing Valhalla sibuk, menggunakan jaringan jalan kendaraan BRouter.',
    };
  }

  // Emergency Tier 3 OSRM Car-Driving fallback if both Valhalla & BRouter are unreachable
  const wp1Anchor = await resolveVehicleSnapPoint(bWp1, 'major_only');
  const wp2Anchor = await resolveVehicleSnapPoint(bWp2, 'major_only');
  const carAnchors = [startAnchor, wp1Anchor, wp2Anchor, startAnchor];
  const fallbackCoords: LatLng[] = [];

  for (let i = 0; i < carAnchors.length - 1; i++) {
    const seg = await fetchOsrmDrivingFallback(carAnchors[i].point, carAnchors[i + 1].point);
    const pts = seg?.coordinates || [carAnchors[i].point, carAnchors[i + 1].point];
    for (const pt of pts) {
      if (
        fallbackCoords.length > 0 &&
        haversineDistance(fallbackCoords[fallbackCoords.length - 1], pt) < 0.004
      ) {
        continue;
      }
      fallbackCoords.push(pt);
    }
  }

  if (fallbackCoords.length >= 2) {
    fallbackCoords[fallbackCoords.length - 1] = { ...fallbackCoords[0] };
  }

  return {
    coordinates: fallbackCoords,
    distanceKm: calculatePolylineDistance(fallbackCoords),
    isSnapped: fallbackCoords.length > 4,
    source: fallbackCoords.length > 4 ? 'osrm' : 'direct',
    effectiveStart: fallbackCoords[0] || effectiveStart,
    error: 'Routing Valhalla sibuk, menggunakan jaringan jalan kendaraan OSRM fallback.',
  };
}

/**
 * Builds complete RouteData from a routing result.
 */
export function buildRouteData(
  waypoints: Waypoint[],
  routeResult: RouteFetchResult,
  mode: RouteData['mode'],
  targetDistanceKm?: number
): RouteData {
  return {
    coordinates: routeResult.coordinates,
    waypoints,
    distanceKm: routeResult.distanceKm,
    isSnapped: routeResult.isSnapped,
    source: routeResult.source,
    mode,
    targetDistanceKm,
  };
}

export interface GenerateBestRouteOptions {
  start: LatLng;
  targetKm: number;
  existingRoutes?: LatLng[][];
  seedOffset?: number;
  signal?: AbortSignal;
}

export interface GenerateBestRouteResponse {
  route: GeneratedRouteResult | null;
  effectiveStart: LatLng;
  usedFallback?: boolean;
}

interface RawRouteProposal {
  trip: EvaluatedTrip;
  anchors: LatLng[];
  rKm: number;
  heading: number;
  reverseOrder: boolean;
  quickScore: number;
}

function makeGeneratedRouteObject(params: {
  coords: LatLng[];
  distanceKm: number;
  targetKm: number;
  source: 'valhalla' | 'brouter' | 'osrm' | 'direct';
}): GeneratedRouteResult {
  const { coords, distanceKm, targetKm, source } = params;
  const { points: anchorPts, indices: anchorIndices } = extractEditableAnchors(coords, 14);

  const waypoints: Waypoint[] = [
    { id: 'start-point', lat: coords[0].lat, lng: coords[0].lng, name: 'Start / Finish' },
  ];

  const routeData: RouteData = {
    coordinates: coords,
    waypoints,
    distanceKm,
    isSnapped: source !== 'direct',
    source,
    mode: 'random',
    targetDistanceKm: targetKm,
  };

  return {
    id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    routeData,
    anchors: anchorPts,
    anchorIndices,
    isEdited: false,
    generatedAt: Date.now(),
  };
}

interface CompassSpec {
  rKm: number;
  heading: number;
  reverseOrder: boolean;
  spreadRad?: number;
}

function angularDiffDeg(a: number, b: number): number {
  const diff = Math.abs((a - b) % 360);
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Generates the single highest-accuracy Car & Motorcycle compliant running loop route
 * using multi-directional compass sweeps, distance accuracy calibration, and previous-route avoidance.
 */
export async function generateSingleBestRoute(
  options: GenerateBestRouteOptions
): Promise<GenerateBestRouteResponse> {
  const {
    start,
    targetKm,
    existingRoutes = [],
    seedOffset = 0,
    signal,
  } = options;

  const startAnchor = await resolveVehicleSnapPoint(start, 'loop_start', signal);
  if (signal?.aborted) {
    return { route: null, effectiveStart: startAnchor.point };
  }

  const effectiveStart = startAnchor.point;
  const kmPerLat = 111.139;
  const kmPerLng = kmPerLat * Math.cos((effectiveStart.lat * Math.PI) / 180) || 1;

  const buildLoopTriplet = (
    rKm: number,
    hDeg: number,
    reverseOrder: boolean,
    spreadRad: number = (2 * Math.PI) / 3
  ): LatLng[] => {
    const hRad = (hDeg * Math.PI) / 180;
    const cLat = effectiveStart.lat + (rKm * Math.cos(hRad)) / kmPerLat;
    const cLng = effectiveStart.lng + (rKm * Math.sin(hRad)) / kmPerLng;
    const a0 = hRad + Math.PI;

    const wp1Raw: LatLng = {
      lat: cLat + (rKm * Math.cos(a0 + spreadRad)) / kmPerLat,
      lng: cLng + (rKm * Math.sin(a0 + spreadRad)) / kmPerLng,
    };
    const wp2Raw: LatLng = {
      lat: cLat + (rKm * Math.cos(a0 + 2 * Math.PI - spreadRad)) / kmPerLat,
      lng: cLng + (rKm * Math.sin(a0 + 2 * Math.PI - spreadRad)) / kmPerLng,
    };

    const wp1 = pushOutOfObvitnas(wp1Raw);
    const wp2 = pushOutOfObvitnas(wp2Raw);

    return reverseOrder
      ? [effectiveStart, wp2, wp1, effectiveStart]
      : [effectiveStart, wp1, wp2, effectiveStart];
  };

  const baseAngle = (((seedOffset * 53 + 25) % 360) + 360) % 360;
  const primaryTurnClass: ValhallaRoadClass = 'tertiary';
  const baseRadiusKm = targetKm / 13.5;

  const pass1Specs: CompassSpec[] = [];
  const targetPass1Count = 5;
  const compassStep = 72;
  const radiusScales = seedOffset > 0 ? [1.0, 1.06, 0.94, 1.02, 0.96] : [1.0, 1.0, 1.0, 1.0, 1.0];
  const spreadAngles =
    seedOffset > 0
      ? [
          (2 * Math.PI) / 3,
          (Math.PI * 3) / 4,
          Math.PI / 2,
          (2 * Math.PI) / 3,
          (Math.PI * 7) / 12,
        ]
      : undefined;

  for (let i = 0; i < targetPass1Count; i++) {
    const heading = (baseAngle + i * compassStep) % 360;
    pass1Specs.push({
      rKm: baseRadiusKm * (radiusScales[i] ?? 1.0),
      heading,
      reverseOrder: (i + seedOffset) % 2 === 1,
      ...(spreadAngles ? { spreadRad: spreadAngles[i] } : {}),
    });
  }

  const makeProposal = (spec: CompassSpec, trip: EvaluatedTrip, pts: LatLng[]): RawRouteProposal => {
    const devRatio = Math.abs(trip.distanceKm - targetKm) / (targetKm || 1);
    return {
      trip,
      anchors: pts,
      rKm: spec.rKm,
      heading: spec.heading,
      reverseOrder: spec.reverseOrder,
      quickScore: trip.scorePenalty + devRatio * 1000,
    };
  };

  const snapSpecWaypoints = async (spec: CompassSpec): Promise<LatLng[]> => {
    const rawPts = buildLoopTriplet(spec.rKm, spec.heading, spec.reverseOrder, spec.spreadRad);

    const snapped = await Promise.all(
      rawPts.map(async (pt, idx) => {
        if (idx === 0 || idx === rawPts.length - 1) return pt;
        const hit = await snapCarRoadFromMvt(pt, 'major_only', 720, signal).catch(() => null);
        return hit ? pushOutOfObvitnas(hit.point) : pt;
      })
    );
    return snapped;
  };

  const evaluateValhallaSpecs = async (
    specs: CompassSpec[],
    minTurnClass: ValhallaRoadClass,
    excludeLocs: LatLng[] = []
  ): Promise<{ proposals: RawRouteProposal[]; anyFailedNetwork: boolean }> => {
    let anyFailedNetwork = false;
    const results = await Promise.all(
      specs.map(async (spec) => {
        if (signal?.aborted || !isValhallaHealthy()) {
          if (!isValhallaHealthy()) anyFailedNetwork = true;
          return [];
        }
        const pts = await snapSpecWaypoints(spec);
        if (signal?.aborted) return [];

        const startMinClass: ValhallaRoadClass =
          minTurnClass === 'tertiary' ? 'tertiary' : startAnchor.minClass;

        const valhallaLocs = pts.map((pt, idx) => ({
          point: pt,
          radiusMeters: idx === 0 || idx === pts.length - 1 ? 260 : 420,
          minRoadClass: idx === 0 || idx === pts.length - 1 ? startMinClass : minTurnClass,
        }));

        const res = await fetchValhallaTrips(valhallaLocs, {
          alternates: seedOffset > 0 ? 1 : 0,
          excludeLocations: excludeLocs,
          timeoutMs: 2600,
          signal,
        });
        if (res.failedNetwork) anyFailedNetwork = true;
        return res.trips.map((trip) => makeProposal(spec, trip, pts));
      })
    );
    return { proposals: results.flat(), anyFailedNetwork };
  };

  const evaluateBRouterSpecs = async (
    specs: CompassSpec[],
    excludeLocs: LatLng[] = []
  ): Promise<RawRouteProposal[]> => {
    if (!isBRouterHealthy()) return [];
    const results = await Promise.all(
      specs.map(async (spec, idx) => {
        if (signal?.aborted || !isBRouterHealthy()) return [];
        const pts = await snapSpecWaypoints(spec);
        if (signal?.aborted) return [];
        const altIdx = seedOffset > 0 && idx % 2 === 1 ? 1 : 0;
        const trips = await fetchBRouterCarTrips(pts, {
          alternativeIdx: altIdx,
          excludeLocations: excludeLocs,
          timeoutMs: 3600,
          signal,
        });
        return trips.map((trip) => makeProposal(spec, trip, pts));
      })
    );
    return results.flat();
  };

  const evaluateOsrmSpecs = async (
    specs: CompassSpec[]
  ): Promise<RawRouteProposal[]> => {
    const results = await Promise.all(
      specs.map(async (spec) => {
        if (signal?.aborted) return [];
        const pts = await snapSpecWaypoints(spec);
        if (signal?.aborted) return [];
        const trips = await fetchOsrmDrivingMultiPoint(pts, { signal, timeoutMs: 2600 });
        return trips.map((trip) => makeProposal(spec, trip, pts));
      })
    );
    return results.flat();
  };

  let rawPool: RawRouteProposal[] = [];
  let activeEngine: 'valhalla' | 'brouter' | 'osrm' = 'valhalla';
  let usedFallback = false;

  if (isValhallaHealthy()) {
    const p1 = await evaluateValhallaSpecs(pass1Specs, primaryTurnClass);
    rawPool = p1.proposals;

    if (rawPool.length === 0 && !p1.anyFailedNetwork && isValhallaHealthy() && !signal?.aborted) {
      const p1Wide = await evaluateValhallaSpecs(pass1Specs, 'unclassified');
      rawPool = p1Wide.proposals;
    }
  }

  if (signal?.aborted) {
    return { route: null, effectiveStart };
  }

  if (rawPool.length === 0 && isBRouterHealthy()) {
    activeEngine = 'brouter';
    usedFallback = true;
    rawPool = await evaluateBRouterSpecs(pass1Specs);
  }

  if (signal?.aborted) {
    return { route: null, effectiveStart };
  }

  if (rawPool.length === 0) {
    activeEngine = 'osrm';
    usedFallback = true;
    rawPool = await evaluateOsrmSpecs(pass1Specs);
  }

  if (signal?.aborted) {
    return { route: null, effectiveStart };
  }

  // Pass 2: Distance calibration & Gang/Obvitnas exclusion for top distinct headings
  rawPool.sort((a, b) => a.quickScore - b.quickScore);
  const needsPass2Specs: CompassSpec[] = [];
  const gangExcludes: LatLng[] = [];
  const pass2Headings: number[] = [];

  for (const cand of rawPool) {
    cand.trip.gangPoints.forEach((gp) => {
      if (gangExcludes.length < 8) gangExcludes.push(gp);
    });
    if (needsPass2Specs.length >= 2) continue;
    if (pass2Headings.some((h) => angularDiffDeg(h, cand.heading) < 40)) continue;

    // Prioritize headings not identical to already-shown routes when calibrating distance
    const isRepeat =
      existingRoutes.length > 0 &&
      existingRoutes.some((ref) =>
        arePolylinesTooSimilar(cand.trip.coordinates, ref, 0.72, 28, 22)
      );
    if (isRepeat && needsPass2Specs.length > 0) continue;

    const devRatio = Math.abs(cand.trip.distanceKm - targetKm) / (targetKm || 1);
    const hasPenalty = cand.trip.gangPoints.length > 0 || cand.trip.obvitnasCount > 0;
    if (devRatio > 0.08 || hasPenalty) {
      const ratio = targetKm / (cand.trip.distanceKm || targetKm);
      const scaledR = cand.rKm * Math.min(2.1, Math.max(0.55, ratio));
      pass2Headings.push(cand.heading);
      needsPass2Specs.push({
        rKm: scaledR,
        heading: hasPenalty ? (cand.heading + 38) % 360 : cand.heading,
        reverseOrder: cand.reverseOrder,
      });
    }
  }

  if (needsPass2Specs.length > 0 && !signal?.aborted) {
    if (activeEngine === 'valhalla' && isValhallaHealthy()) {
      const p2 = await evaluateValhallaSpecs(needsPass2Specs, primaryTurnClass, gangExcludes);
      if (p2.proposals.length > 0) {
        rawPool.push(...p2.proposals);
      } else if (!p2.anyFailedNetwork && isValhallaHealthy() && !signal?.aborted) {
        const p2Wide = await evaluateValhallaSpecs(needsPass2Specs, 'unclassified', gangExcludes);
        rawPool.push(...p2Wide.proposals);
      }
    } else if (activeEngine === 'brouter' && isBRouterHealthy()) {
      const p2Br = await evaluateBRouterSpecs(needsPass2Specs, gangExcludes);
      rawPool.push(...p2Br);
    } else {
      const p2Osrm = await evaluateOsrmSpecs(needsPass2Specs);
      rawPool.push(...p2Osrm);
    }
  }

  if (signal?.aborted) {
    return { route: null, effectiveStart };
  }

  const validPool = rawPool
    .filter((item) => item.trip.coordinates.length >= 2)
    .map((item) => {
      const coords = [...item.trip.coordinates];
      if (haversineDistance(coords[0], coords[coords.length - 1]) > 0.002) {
        coords.push({ ...coords[0] });
      } else {
        coords[coords.length - 1] = { ...coords[0] };
      }
      const closedDistKm = calculatePolylineDistance(coords);
      const closedDevRatio = Math.abs(closedDistKm - targetKm) / (targetKm || 1);
      return {
        ...item,
        quickScore: item.trip.scorePenalty + closedDevRatio * 1000,
        trip: {
          ...item.trip,
          coordinates: coords,
          distanceKm: closedDistKm,
        },
      };
    })
    .sort((a, b) => a.quickScore - b.quickScore);

  const hasCleanRoute = validPool.some((v) => v.trip.obvitnasCount === 0 && v.trip.tollCount === 0);
  const cleanPool = hasCleanRoute
    ? validPool.filter((v) => v.trip.obvitnasCount === 0 && v.trip.tollCount === 0)
    : validPool;

  // Prefer the best route not overlapping prior generated paths; fallback gracefully to least-similar if exhausted
  let winner = cleanPool.find(
    (cand) =>
      !existingRoutes.some((ref) => arePolylinesTooSimilar(cand.trip.coordinates, ref, 0.62, 32, 20))
  );

  if (!winner && cleanPool.length > 0) {
    const mostRecent = existingRoutes[existingRoutes.length - 1];
    winner =
      cleanPool.find(
        (cand) => !mostRecent || !arePolylinesTooSimilar(cand.trip.coordinates, mostRecent, 0.78, 30, 20)
      ) ?? cleanPool[0];
  }

  const route = winner
    ? makeGeneratedRouteObject({
        coords: winner.trip.coordinates,
        distanceKm: winner.trip.distanceKm,
        targetKm,
        source: activeEngine,
      })
    : null;

  return {
    route,
    effectiveStart: route?.routeData.coordinates[0] || effectiveStart,
    ...(usedFallback ? { usedFallback: true } : {}),
  };
}
