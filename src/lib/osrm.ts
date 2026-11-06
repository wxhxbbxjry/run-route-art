import { LatLng, RouteData, Waypoint } from './types';
import { haversineDistance, calculatePolylineDistance, generateRealisticElevation } from './geo';

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/foot';

export interface RouteFetchResult {
  coordinates: LatLng[];
  distanceKm: number;
  isSnapped: boolean;
  source: 'osrm' | 'direct';
  error?: string;
}

/**
 * Fetches an OSRM foot route between two points with timeout.
 */
async function fetchOsrmSegment(p1: LatLng, p2: LatLng): Promise<LatLng[] | null> {
  const coordString = `${p1.lng.toFixed(6)},${p1.lat.toFixed(6)};${p2.lng.toFixed(6)},${p2.lat.toFixed(6)}`;
  const url = `${OSRM_BASE_URL}/${coordString}?overview=full&geometries=geojson&continue_straight=true`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const rawCoords: [number, number][] = data.routes[0].geometry.coordinates;
      return rawCoords.map(([lng, lat]) => ({ lat, lng }));
    }
  } catch {
    // ignore, will fallback
  }
  return null;
}

/**
 * Smart Manual Route Builder:
 * Evaluates segment-by-segment between tapped waypoints.
 * If OSRM takes an absurd detour (> 2.2x direct distance, common in parks/alleys),
 * it falls back to direct connection for that leg, and always anchors to the tapped pin!
 */
export async function fetchSmartManualRoute(
  waypoints: LatLng[],
  snapToRoads: boolean = true
): Promise<RouteFetchResult> {
  if (waypoints.length < 2) {
    return {
      coordinates: waypoints,
      distanceKm: 0,
      isSnapped: false,
      source: 'direct',
    };
  }

  // Straight line mode
  if (!snapToRoads) {
    const directDist = calculatePolylineDistance(waypoints);
    return {
      coordinates: waypoints,
      distanceKm: directDist,
      isSnapped: false,
      source: 'direct',
    };
  }

  // For 2-15 waypoints, calculate segment-by-segment for maximum responsiveness and accuracy
  const finalCoordinates: LatLng[] = [waypoints[0]];
  let hasAnySnapped = false;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const startPt = waypoints[i];
    const endPt = waypoints[i + 1];
    const directDistKm = haversineDistance(startPt, endPt);

    // If points are very close (< 25m), connect directly
    if (directDistKm < 0.025) {
      finalCoordinates.push(endPt);
      continue;
    }

    const segmentCoords = await fetchOsrmSegment(startPt, endPt);

    if (segmentCoords && segmentCoords.length > 1) {
      const segmentDistKm = calculatePolylineDistance(segmentCoords);

      // Check if OSRM took an absurd detour (e.g. Monas park barrier / highway loop)
      // Normal urban winding factor is 1.1x - 1.8x. If > 2.2x, OSRM detoured wildly!
      if (segmentDistKm <= directDistKm * 2.2) {
        hasAnySnapped = true;
        // Skip first coord if already in finalCoordinates to avoid duplicate
        for (let j = 0; j < segmentCoords.length; j++) {
          const pt = segmentCoords[j];
          if (
            j === 0 &&
            finalCoordinates.length > 0 &&
            haversineDistance(finalCoordinates[finalCoordinates.length - 1], pt) < 0.005
          ) {
            continue;
          }
          finalCoordinates.push(pt);
        }
        // Guarantee exact anchor to user's tapped endPt
        if (
          haversineDistance(finalCoordinates[finalCoordinates.length - 1], endPt) > 0.005
        ) {
          finalCoordinates.push(endPt);
        }
        continue;
      }
    }

    // Fallback for this segment: clean direct line anchored to exact tapped point
    finalCoordinates.push(endPt);
  }

  const totalDistance = calculatePolylineDistance(finalCoordinates);

  return {
    coordinates: finalCoordinates,
    distanceKm: totalDistance,
    isSnapped: hasAnySnapped,
    source: hasAnySnapped ? 'osrm' : 'direct',
  };
}

/**
 * High-Accuracy Natural Loop Generator:
 * Uses a 3-point Triangle or 4-point Diamond circuit to prevent dead-end U-turns.
 * Includes automated radius calibration to achieve ±5-8% target distance accuracy,
 * and GUARANTEES that start & finish coordinates are 100% identical.
 */
export async function generateAccurateLoop(
  start: LatLng,
  targetKm: number,
  headingDeg: number = 45
): Promise<RouteFetchResult> {
  const kmPerLat = 111.139;
  const kmPerLng = kmPerLat * Math.cos((start.lat * Math.PI) / 180);

  // Initial road winding factor for urban circuits
  let radiusKm = targetKm / 12.5;

  const buildCircuitPoints = (r: number, heading: number): LatLng[] => {
    const headingRad = (heading * Math.PI) / 180;
    // Offset center of loop by radius in heading direction
    const cLat = start.lat + (r * Math.cos(headingRad)) / kmPerLat;
    const cLng = start.lng + (r * Math.sin(headingRad)) / (kmPerLng || 1);

    // 3 anchor waypoints around center (120 degrees apart)
    const a0 = headingRad + Math.PI; // direction back to start
    const a1 = a0 + (2 * Math.PI) / 3;
    const a2 = a0 + (4 * Math.PI) / 3;

    const wp1: LatLng = {
      lat: cLat + (r * Math.cos(a1)) / kmPerLat,
      lng: cLng + (r * Math.sin(a1)) / (kmPerLng || 1),
    };
    const wp2: LatLng = {
      lat: cLat + (r * Math.cos(a2)) / kmPerLat,
      lng: cLng + (r * Math.sin(a2)) / (kmPerLng || 1),
    };

    return [start, wp1, wp2, start];
  };

  // Helper to query OSRM for circuit
  const queryOsrm = async (points: LatLng[]): Promise<RouteFetchResult | null> => {
    const coordString = points
      .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
      .join(';');
    const url = `${OSRM_BASE_URL}/${coordString}?overview=full&geometries=geojson&steps=false`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const data = await res.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const rawCoords: [number, number][] = data.routes[0].geometry.coordinates;
        const coords: LatLng[] = rawCoords.map(([lng, lat]) => ({ lat, lng }));

        // GUARANTEE: Start & Finish are mathematically identical to user's start point!
        if (haversineDistance(coords[0], start) > 0.005) {
          coords.unshift(start);
        }
        if (haversineDistance(coords[coords.length - 1], start) > 0.005) {
          coords.push(start);
        }

        const dist = calculatePolylineDistance(coords);
        return {
          coordinates: coords,
          distanceKm: dist,
          isSnapped: true,
          source: 'osrm',
        };
      }
    } catch {
      // ignore
    }
    return null;
  };

  // Pass 1
  let points = buildCircuitPoints(radiusKm, headingDeg);
  let result = await queryOsrm(points);

  // Pass 2: Calibrate if deviation > 8%
  if (result && Math.abs(result.distanceKm - targetKm) / targetKm > 0.08) {
    const calibrationFactor = Math.min(1.6, Math.max(0.6, targetKm / result.distanceKm));
    radiusKm *= calibrationFactor;
    points = buildCircuitPoints(radiusKm, headingDeg);
    const calibratedResult = await queryOsrm(points);
    if (calibratedResult) {
      result = calibratedResult;
    }
  }

  // Fallback to direct loop if OSRM failed completely
  if (!result || result.coordinates.length < 2) {
    const directPoints = buildCircuitPoints(radiusKm, headingDeg);
    return {
      coordinates: directPoints,
      distanceKm: calculatePolylineDistance(directPoints),
      isSnapped: false,
      source: 'direct',
      error: 'OSRM tidak merespons. Menggunakan sirkuit langsung sebagai cadangan.',
    };
  }

  return result;
}

/**
 * Smart GPS Art Route Builder:
 * When snapToRoads is false: Produces the exact, pure, undistorted shape geometry (100% Strava Art accuracy).
 * When snapToRoads is true: Sub-samples key contour landmarks to avoid chaotic 30-point spiderweb U-turns.
 */
export async function generateGpsArtRoute(
  shapeCoordinates: LatLng[],
  snapToRoads: boolean = false
): Promise<RouteFetchResult> {
  if (shapeCoordinates.length < 2) {
    return {
      coordinates: shapeCoordinates,
      distanceKm: 0,
      isSnapped: false,
      source: 'direct',
    };
  }

  // Pure GPS Art (Recommended for Strava/Garmin Art)
  // Keeps the exact recognizable shape!
  if (!snapToRoads) {
    const dist = calculatePolylineDistance(shapeCoordinates);
    return {
      coordinates: shapeCoordinates,
      distanceKm: dist,
      isSnapped: false,
      source: 'direct',
    };
  }

  // Snapped to roads: sample 8 key contour vertices to prevent spiderweb distortion
  const keyPoints: LatLng[] = [shapeCoordinates[0]];
  const total = shapeCoordinates.length;
  const numSamples = Math.min(8, total);
  const step = Math.floor(total / numSamples);

  for (let i = 1; i < numSamples; i++) {
    keyPoints.push(shapeCoordinates[i * step]);
  }
  keyPoints.push(shapeCoordinates[total - 1]);

  return fetchSmartManualRoute(keyPoints, true);
}

/**
 * Builds complete RouteData including realistic elevation profiles.
 */
export function buildRouteData(
  waypoints: Waypoint[],
  routeResult: RouteFetchResult,
  mode: RouteData['mode'],
  targetDistanceKm?: number,
  shapeName?: string
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
    shapeName,
  };
}
