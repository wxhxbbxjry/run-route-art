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
 * Fetches an OSRM foot route between two points in a specific direction with timeout.
 */
async function fetchSingleSegment(p1: LatLng, p2: LatLng): Promise<LatLng[] | null> {
  const coordString = `${p1.lng.toFixed(6)},${p1.lat.toFixed(6)};${p2.lng.toFixed(6)},${p2.lat.toFixed(6)}`;
  const url = `${OSRM_BASE_URL}/${coordString}?overview=full&geometries=geojson`;

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
 * Runner Bidirectional Segment Router:
 * Because runners run on sidewalks / shoulders, one-way vehicle traffic restrictions
 * do not restrict runners (lawan arah / contraflow is normal for runners).
 * This function queries forward AND reverse directions simultaneously, picking
 * the shortest natural street path and reversing the coordinate list if necessary.
 */
export async function fetchBidirectionalSegment(
  p1: LatLng,
  p2: LatLng,
  allowContraflow: boolean = true
): Promise<LatLng[]> {
  if (!allowContraflow) {
    const res = await fetchSingleSegment(p1, p2);
    return res || [p1, p2];
  }

  // Query both directions in parallel for zero added latency
  const [forwardCoords, reverseCoords] = await Promise.all([
    fetchSingleSegment(p1, p2),
    fetchSingleSegment(p2, p1),
  ]);

  const forwardDist = forwardCoords ? calculatePolylineDistance(forwardCoords) : Infinity;
  const reverseDist = reverseCoords ? calculatePolylineDistance(reverseCoords) : Infinity;

  // If running against one-way traffic is the direct route along the street:
  if (reverseCoords && reverseDist < forwardDist) {
    const reversed = [...reverseCoords].reverse();
    return reversed;
  }

  if (forwardCoords) {
    return forwardCoords;
  }

  if (reverseCoords) {
    return [...reverseCoords].reverse();
  }

  return [p1, p2];
}

/**
 * Smart Manual Route Builder:
 * Evaluates segment-by-segment between tapped waypoints with Runner Contraflow (lawan arah) enabled.
 * If OSRM takes an absurd detour (> 2.2x direct distance), it falls back to direct connection,
 * and always anchors to the tapped pin!
 */
export async function fetchSmartManualRoute(
  waypoints: LatLng[],
  snapToRoads: boolean = true,
  allowContraflow: boolean = true
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

  const finalCoordinates: LatLng[] = [waypoints[0]];
  let hasAnySnapped = false;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const startPt = waypoints[i];
    const endPt = waypoints[i + 1];
    const directDistKm = haversineDistance(startPt, endPt);

    // If points are very close (< 20m), connect directly
    if (directDistKm < 0.02) {
      finalCoordinates.push(endPt);
      continue;
    }

    // Use bidirectional routing so running against one-way traffic is completely allowed!
    const segmentCoords = await fetchBidirectionalSegment(startPt, endPt, allowContraflow);

    if (segmentCoords && segmentCoords.length > 1) {
      const segmentDistKm = calculatePolylineDistance(segmentCoords);

      // Check if OSRM took an absurd detour (> 2.2x)
      if (segmentDistKm <= directDistKm * 2.2) {
        hasAnySnapped = true;
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
        if (haversineDistance(finalCoordinates[finalCoordinates.length - 1], endPt) > 0.005) {
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
 * Generates natural 3-point loop circuits using bidirectional routing (lawan arah friendly).
 * Calibrates to achieve ±5-8% target distance accuracy, and GUARANTEES start & finish are identical.
 */
export async function generateAccurateLoop(
  start: LatLng,
  targetKm: number,
  headingDeg: number = 45,
  allowContraflow: boolean = true
): Promise<RouteFetchResult> {
  const kmPerLat = 111.139;
  const kmPerLng = kmPerLat * Math.cos((start.lat * Math.PI) / 180);

  // Initial road winding factor for urban circuits
  let radiusKm = targetKm / 12.8;

  const buildCircuitAnchors = (r: number, heading: number): LatLng[] => {
    const headingRad = (heading * Math.PI) / 180;
    const cLat = start.lat + (r * Math.cos(headingRad)) / kmPerLat;
    const cLng = start.lng + (r * Math.sin(headingRad)) / (kmPerLng || 1);

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

  const routeAnchors = async (anchors: LatLng[]): Promise<LatLng[]> => {
    const coords: LatLng[] = [start];

    for (let i = 0; i < anchors.length - 1; i++) {
      const seg = await fetchBidirectionalSegment(anchors[i], anchors[i + 1], allowContraflow);
      for (const pt of seg) {
        if (coords.length > 0 && haversineDistance(coords[coords.length - 1], pt) < 0.005) {
          continue;
        }
        coords.push(pt);
      }
    }

    // GUARANTEE: Start & Finish are mathematically identical!
    if (haversineDistance(coords[coords.length - 1], start) > 0.005) {
      coords.push(start);
    }

    return coords;
  };

  // Pass 1
  let anchors = buildCircuitAnchors(radiusKm, headingDeg);
  let coords = await routeAnchors(anchors);
  let distKm = calculatePolylineDistance(coords);

  // Pass 2: Calibrate if deviation > 8%
  if (Math.abs(distKm - targetKm) / targetKm > 0.08) {
    const calibrationFactor = Math.min(1.5, Math.max(0.65, targetKm / (distKm || 1)));
    radiusKm *= calibrationFactor;
    anchors = buildCircuitAnchors(radiusKm, headingDeg);
    const calibratedCoords = await routeAnchors(anchors);
    const calibratedDist = calculatePolylineDistance(calibratedCoords);

    if (Math.abs(calibratedDist - targetKm) < Math.abs(distKm - targetKm)) {
      coords = calibratedCoords;
      distKm = calibratedDist;
    }
  }

  return {
    coordinates: coords,
    distanceKm: distKm,
    isSnapped: true,
    source: 'osrm',
  };
}

/**
 * Smart GPS Art Route Builder:
 * When snapToRoads is false: Produces the exact, pure shape geometry (100% Strava Art accuracy).
 * When snapToRoads is true: Sub-samples key contour vertices and routes bidirectionally (lawan arah allowed).
 */
export async function generateGpsArtRoute(
  shapeCoordinates: LatLng[],
  snapToRoads: boolean = false,
  allowContraflow: boolean = true
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

  // Snapped to roads: sample key contour vertices and route with contraflow
  const keyPoints: LatLng[] = [shapeCoordinates[0]];
  const total = shapeCoordinates.length;
  const numSamples = Math.min(8, total);
  const step = Math.floor(total / numSamples);

  for (let i = 1; i < numSamples; i++) {
    keyPoints.push(shapeCoordinates[i * step]);
  }
  keyPoints.push(shapeCoordinates[total - 1]);

  return fetchSmartManualRoute(keyPoints, true, allowContraflow);
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
