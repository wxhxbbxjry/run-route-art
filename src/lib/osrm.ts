import { LatLng, RouteData, Waypoint } from './types';
import { haversineDistance, calculatePolylineDistance, generateRealisticElevation } from './geo';
import { pushOutOfObvitnas, routeHasObvitnasViolation } from './obvitnas';

const VALHALLA_ROUTE_URL = 'https://valhalla1.openstreetmap.de/route';
const VALHALLA_LOCATE_URL = 'https://valhalla1.openstreetmap.de/locate';
const OSRM_DRIVING_URLS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://router.project-osrm.org/route/v1/driving',
];
const OSRM_NEAREST_DRIVING_URL = 'https://router.project-osrm.org/nearest/v1/driving';

export interface RouteFetchResult {
  coordinates: LatLng[];
  distanceKm: number;
  isSnapped: boolean;
  source: 'valhalla' | 'osrm' | 'direct';
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

async function queryValhallaLocate(
  pt: LatLng,
  radiusMeters: number,
  minRoadClass: ValhallaRoadClass,
  timeoutMs: number = 3500
): Promise<ValhallaLocateEdge[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(VALHALLA_LOCATE_URL, {
      method: 'POST',
      signal: controller.signal,
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
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    const data = await res.json();
    const edges = data?.[0]?.edges;
    return Array.isArray(edges) ? edges : [];
  } catch {
    return [];
  }
}

async function snapDrivingOsrmFallback(point: LatLng): Promise<LatLng | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const url = `${OSRM_NEAREST_DRIVING_URL}/${point.lng.toFixed(6)},${point.lat.toFixed(6)}?number=3`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !Array.isArray(data.waypoints)) return null;

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
    // ignore
  }
  return null;
}

/**
 * Resolves a clicked point onto a public road strictly passable by cars & motorcycles.
 * - Rejects unnamed residential alleys, Gang/Gg./Lorong, service_other, driveways, footways, motorcar=no, and Obvitnas.
 * - Preserves direct taps on legitimate named car-passable residential streets (e.g. complex/perumahan avenues).
 */
async function resolveVehicleSnapPoint(
  rawPoint: LatLng,
  mode: 'manual' | 'loop_start' | 'major_only'
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

  let anchor: VehicleAnchor | null = null;

  if (mode === 'manual') {
    // Pass 1: Fast local check (radius 45m) to see if tap is already on a genuine car road
    const localEdges = await queryValhallaLocate(safePoint, 45, 'residential', 2800);
    const localHit = pickBestEdge(localEdges, true, 35);
    if (localHit) {
      const resolvedPt = pushOutOfObvitnas(localHit.point);
      anchor = {
        point: resolvedPt,
        minClass: localHit.cls === 'residential' ? 'residential' : 'unclassified',
        roadClass: localHit.cls,
        wasSnappedFromRestricted: false,
      };
    } else {
      // Pass 2: Tap fell in a gang, park, deadend, or block interior -> snap out to real collector road
      const wideMajor = await queryValhallaLocate(safePoint, 320, 'unclassified', 3500);
      const majorHit = pickBestEdge(wideMajor, false, 320);
      if (majorHit) {
        anchor = {
          point: pushOutOfObvitnas(majorHit.point),
          minClass: 'unclassified',
          roadClass: majorHit.cls,
          wasSnappedFromRestricted: true,
        };
      } else {
        const wideRes = await queryValhallaLocate(safePoint, 420, 'residential', 3500);
        const resHit = pickBestEdge(wideRes, true, 420);
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
    // Loop start or loop turn anchors: try crisp 70m lookup first to avoid slow wide radius scans
    const fastRadius = mode === 'major_only' ? 140 : 75;
    const fastMinClass: ValhallaRoadClass = mode === 'major_only' ? 'tertiary' : 'unclassified';
    const fastEdges = await queryValhallaLocate(safePoint, fastRadius, fastMinClass, 2600);
    const fastHit = pickBestEdge(fastEdges, false, fastRadius);

    if (fastHit) {
      const snappedPt = pushOutOfObvitnas(fastHit.point);
      anchor = {
        point: snappedPt,
        minClass: MAJOR_CLASSES.has(fastHit.cls) ? 'unclassified' : 'residential',
        roadClass: fastHit.cls,
        wasSnappedFromRestricted: haversineDistance(safePoint, snappedPt) > 0.035,
      };
    } else {
      const minClass: ValhallaRoadClass = mode === 'major_only' ? 'tertiary' : 'unclassified';
      const radiusM = mode === 'major_only' ? 450 : 280;
      const edges = await queryValhallaLocate(safePoint, radiusM, minClass, 3500);
      const hit = pickBestEdge(edges, false, radiusM);
      if (hit) {
        const snappedPt = pushOutOfObvitnas(hit.point);
        anchor = {
          point: snappedPt,
          minClass: MAJOR_CLASSES.has(hit.cls) ? 'unclassified' : 'residential',
          roadClass: hit.cls,
          wasSnappedFromRestricted: haversineDistance(safePoint, snappedPt) > 0.035,
        };
      } else {
        const wider = await queryValhallaLocate(safePoint, 450, 'residential', 3500);
        const widerHit = pickBestEdge(wider, true, 450);
        if (widerHit) {
          const snappedPt = pushOutOfObvitnas(widerHit.point);
          anchor = {
            point: snappedPt,
            minClass: widerHit.cls === 'residential' ? 'residential' : 'unclassified',
            roadClass: widerHit.cls,
            wasSnappedFromRestricted: haversineDistance(safePoint, snappedPt) > 0.035,
          };
        }
      }
    }
  }

  if (!anchor) {
    const osrmNearest = await snapDrivingOsrmFallback(safePoint);
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
        // Long unnamed non-roundabout maneuver indicates possible unnamed alley shortcut
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
  } = {}
): Promise<EvaluatedTrip[]> {
  const { alternates = 0, excludeLocations = [], timeoutMs = 4500 } = options;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    clearTimeout(timeoutId);

    if (!res.ok) return [];
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
    return evaluated;
  } catch {
    return [];
  }
}

async function fetchOsrmDrivingFallback(
  p1: LatLng,
  p2: LatLng
): Promise<EvaluatedTrip | null> {
  const coordString = `${p1.lng.toFixed(6)},${p1.lat.toFixed(6)};${p2.lng.toFixed(6)},${p2.lat.toFixed(6)}`;

  for (const baseUrl of OSRM_DRIVING_URLS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3800);
      const url = `${baseUrl}/${coordString}?overview=full&geometries=geojson&steps=true&alternatives=true`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;

      const data = await res.json();
      if (data.code !== 'Ok' || !Array.isArray(data.routes)) continue;

      let best: EvaluatedTrip | null = null;
      let bestCost = Infinity;

      for (const route of data.routes) {
        const rawCoords: [number, number][] | undefined = route?.geometry?.coordinates;
        if (!rawCoords || rawCoords.length < 2) continue;
        const coords = rawCoords.map(([lng, lat]) => ({ lat, lng }));
        const gangPoints: LatLng[] = [];
        let tollCount = 0;
        let unnamedLenKm = 0;

        for (const leg of route.legs || []) {
          for (const step of leg.steps || []) {
            const name = String(step.name || '');
            const distKm = (step.distance || 0) / 1000;
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
        const totalCost = scorePenalty + distanceKm * 100;

        if (totalCost < bestCost) {
          bestCost = totalCost;
          best = {
            coordinates: coords,
            distanceKm,
            gangPoints,
            tollCount,
            obvitnasCount: obv.violatedZones.length,
            unnamedLenKm,
            scorePenalty,
          };
        }
      }

      if (best) return best;
    } catch {
      // try next OSRM car endpoint
    }
  }

  return null;
}

/**
 * Fetches a single directional or bidirectional segment strictly on streets
 * passable by cars & motorcycles (never Gang/footpath/steps/alley).
 */
async function fetchStrictVehicleSegment(
  a1: VehicleAnchor,
  a2: VehicleAnchor,
  allowContraflow: boolean = true
): Promise<{ coords: LatLng[]; usedValhalla: boolean } | null> {
  const queryDirection = async (
    from: VehicleAnchor,
    to: VehicleAnchor,
    reverseCoords: boolean
  ): Promise<EvaluatedTrip[]> => {
    // Primary query uses strict class filters anchored on non-gang roads
    let trips = await fetchValhallaTrips(
      [
        { point: from.point, radiusMeters: 160, minRoadClass: from.minClass },
        { point: to.point, radiusMeters: 160, minRoadClass: to.minClass },
      ],
      { alternates: 2, timeoutMs: 4200 }
    );

    // Widen radius slightly if needed in sparse rural areas
    if (trips.length === 0) {
      trips = await fetchValhallaTrips(
        [
          { point: from.point, radiusMeters: 350, minRoadClass: 'residential' },
          { point: to.point, radiusMeters: 350, minRoadClass: 'residential' },
        ],
        { alternates: 1, timeoutMs: 4200 }
      );
    }

    if (reverseCoords) {
      return trips.map((t) => ({
        ...t,
        coordinates: [...t.coordinates].reverse(),
      }));
    }
    return trips;
  };

  const candidates = allowContraflow
    ? (
        await Promise.all([
          queryDirection(a1, a2, false),
          queryDirection(a2, a1, true),
        ])
      ).flat()
    : await queryDirection(a1, a2, false);

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
  if (best && best.gangPoints.length > 0) {
    const excludePts = best.gangPoints;
    const retryFetches = allowContraflow
      ? [
          fetchValhallaTrips(
            [
              { point: a1.point, radiusMeters: 220, minRoadClass: 'unclassified' },
              { point: a2.point, radiusMeters: 220, minRoadClass: 'unclassified' },
            ],
            { alternates: 2, excludeLocations: excludePts, timeoutMs: 4200 }
          ),
          fetchValhallaTrips(
            [
              { point: a2.point, radiusMeters: 220, minRoadClass: 'unclassified' },
              { point: a1.point, radiusMeters: 220, minRoadClass: 'unclassified' },
            ],
            { alternates: 2, excludeLocations: excludePts, timeoutMs: 4200 }
          ).then((trips) =>
            trips.map((t) => ({ ...t, coordinates: [...t.coordinates].reverse() }))
          ),
        ]
      : [
          fetchValhallaTrips(
            [
              { point: a1.point, radiusMeters: 220, minRoadClass: 'unclassified' },
              { point: a2.point, radiusMeters: 220, minRoadClass: 'unclassified' },
            ],
            { alternates: 2, excludeLocations: excludePts, timeoutMs: 4200 }
          ),
        ];

    const retryBest = pickBest((await Promise.all(retryFetches)).flat());
    if (retryBest && retryBest.scorePenalty < best.scorePenalty) {
      best = retryBest;
    }
  }

  if (best && best.coordinates.length >= 2) {
    return { coords: best.coordinates, usedValhalla: true };
  }

  // Fallback to OSRM car-only endpoints (never foot or bike!)
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
    return { coords: bestCar.coordinates, usedValhalla: false };
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
          usedValhalla: false,
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
            usedValhalla: seg.usedValhalla,
            isSnapped: true,
          };
        }
      }

      return {
        coords: [startAnchor.point, endAnchor.point],
        usedValhalla: false,
        isSnapped: false,
      };
    })
  );

  const finalCoordinates: LatLng[] = [];
  const segmentEndCoords: LatLng[] = [];
  let hasAnySnapped = false;
  let usedValhalla = false;

  for (const seg of segmentResults) {
    if (seg.isSnapped) hasAnySnapped = true;
    if (seg.usedValhalla) usedValhalla = true;

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
    source: usedValhalla ? 'valhalla' : hasAnySnapped ? 'osrm' : 'direct',
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
        const trips = await fetchValhallaTrips(
          [
            { point: pts[0], radiusMeters: 260, minRoadClass: startMinClass },
            { point: pts[1], radiusMeters: 420, minRoadClass: minTurnClass },
            { point: pts[2], radiusMeters: 420, minRoadClass: minTurnClass },
            { point: pts[3], radiusMeters: 260, minRoadClass: startMinClass },
          ],
          { excludeLocations: excludeLocs, timeoutMs: 4800 }
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

  // Emergency OSRM Car-Driving fallback if Valhalla service is unreachable
  const fallbackAnchorPts = buildAnchors(baseRadiusKm, headingDeg, false);
  const wp1Anchor = await resolveVehicleSnapPoint(fallbackAnchorPts[1], 'major_only');
  const wp2Anchor = await resolveVehicleSnapPoint(fallbackAnchorPts[2], 'major_only');
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
 * Builds complete RouteData including realistic elevation profiles.
 */
export function buildRouteData(
  waypoints: Waypoint[],
  routeResult: RouteFetchResult,
  mode: RouteData['mode'],
  targetDistanceKm?: number
): RouteData {
  const { elevationGainM, elevationLossM, elevationProfile } = generateRealisticElevation(
    routeResult.coordinates,
    routeResult.distanceKm
  );

  return {
    coordinates: routeResult.coordinates,
    waypoints,
    distanceKm: routeResult.distanceKm,
    elevationGainM,
    elevationLossM,
    elevationProfile,
    isSnapped: routeResult.isSnapped,
    source: routeResult.source,
    mode,
    targetDistanceKm,
  };
}
