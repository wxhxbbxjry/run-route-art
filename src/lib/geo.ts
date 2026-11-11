import { LatLng, ElevationPoint } from './types';

const EARTH_RADIUS_KM = 6371;

/**
 * Calculates haversine distance between two points in kilometers.
 */
export function haversineDistance(p1: LatLng, p2: LatLng): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculates total distance of a polyline in kilometers.
 */
export function calculatePolylineDistance(points: LatLng[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(points[i], points[i + 1]);
  }
  return total;
}

/**
 * Transforms normalized 2D shape points [-0.5, 0.5] to real geographic coordinates.
 * Sized in kilometers and rotated by rotationDeg.
 */
export function transformShapePoints(
  shapePoints: [number, number][],
  center: LatLng,
  sizeKm: number,
  rotationDeg: number = 0
): LatLng[] {
  const rad = (rotationDeg * Math.PI) / 180;
  const cosRot = Math.cos(rad);
  const sinRot = Math.sin(rad);

  // 1 degree latitude ~ 111.139 km
  const kmPerLat = 111.139;
  // 1 degree longitude ~ 111.139 * cos(lat)
  const centerLatRad = (center.lat * Math.PI) / 180;
  const kmPerLng = kmPerLat * Math.cos(centerLatRad);

  return shapePoints.map(([u, v]) => {
    // Rotate point in 2D plane
    const rotX = u * cosRot - v * sinRot;
    const rotY = u * sinRot + v * cosRot;

    // Convert to kilometer offset
    const dxKm = rotX * sizeKm;
    const dyKm = rotY * sizeKm;

    // Convert to lat/lng offset
    const dLat = dyKm / kmPerLat;
    const dLng = dxKm / (kmPerLng || 1);

    return {
      lat: center.lat + dLat,
      lng: center.lng + dLng,
    };
  });
}

/**
 * Generates an intelligent closed-loop set of waypoints around a start location.
 * Uses a street tortuosity factor (~1.28) so the routed road distance matches targetKm.
 */
export function generateLoopWaypoints(
  start: LatLng,
  targetKm: number,
  options: {
    headingOffsetDeg?: number;
    numVertices?: number;
    jitterFactor?: number;
  } = {}
): LatLng[] {
  const {
    headingOffsetDeg = Math.random() * 360,
    numVertices = 7,
    jitterFactor = 0.12,
  } = options;

  // Road circuit winding factor: real roads add ~25-30% extra distance over geometric perimeter
  const tortuosityFactor = 1.28;
  const effectivePerimeter = targetKm / tortuosityFactor;
  // Radius of the circle
  const loopRadiusKm = effectivePerimeter / (2 * Math.PI);

  const kmPerLat = 111.139;
  const centerLatRad = (start.lat * Math.PI) / 180;
  const kmPerLng = kmPerLat * Math.cos(centerLatRad);

  const headingRad = (headingOffsetDeg * Math.PI) / 180;

  // Offset loop center from start point so start point is on the circle boundary
  const loopCenterLat = start.lat + (loopRadiusKm * Math.cos(headingRad)) / kmPerLat;
  const loopCenterLng = start.lng + (loopRadiusKm * Math.sin(headingRad)) / (kmPerLng || 1);

  const waypoints: LatLng[] = [start];

  // Distribute points along the circle starting from opposite angle and returning to start
  const baseAngle = headingRad + Math.PI; // angle pointing back to start

  for (let i = 1; i < numVertices; i++) {
    const fraction = i / numVertices;
    const angle = baseAngle + fraction * 2 * Math.PI;

    // Random jitter in radial distance to conform to natural street layouts
    const jitter = 1 + (Math.sin(i * 3.7 + headingOffsetDeg) * jitterFactor);
    const currentRadius = loopRadiusKm * jitter;

    const latOffset = (currentRadius * Math.cos(angle)) / kmPerLat;
    const lngOffset = (currentRadius * Math.sin(angle)) / (kmPerLng || 1);

    waypoints.push({
      lat: loopCenterLat + latOffset,
      lng: loopCenterLng + lngOffset,
    });
  }

  // Close the loop back at the exact start point
  waypoints.push(start);

  return waypoints;
}

/**
 * Generates a realistic simulated elevation profile for the route.
 * Employs multi-frequency harmonic synthesis based on coordinates to produce natural terrain hills.
 */
export function generateRealisticElevation(
  coordinates: LatLng[],
  totalDistanceKm: number
): {
  elevationGainM: number;
  elevationLossM: number;
  elevationProfile: ElevationPoint[];
} {
  if (coordinates.length === 0) {
    return { elevationGainM: 0, elevationLossM: 0, elevationProfile: [] };
  }

  const profile: ElevationPoint[] = [];
  let cumulativeDist = 0;
  let gain = 0;
  let loss = 0;

  // Base elevation seed from first coord
  const baseElevation = 25 + Math.abs(Math.sin(coordinates[0].lat * 100) * 45);

  let prevEle = baseElevation;
  profile.push({ distanceKm: 0, elevationM: Math.round(prevEle) });

  for (let i = 1; i < coordinates.length; i++) {
    const segmentDist = haversineDistance(coordinates[i - 1], coordinates[i]);
    cumulativeDist += segmentDist;

    // Multi-frequency hill wave
    const wave1 = Math.sin((cumulativeDist / (totalDistanceKm || 1)) * Math.PI * 4) * 12;
    const wave2 = Math.cos(cumulativeDist * 2.5) * 6;
    const wave3 = Math.sin(coordinates[i].lat * 500 + coordinates[i].lng * 500) * 4;

    const currentEle = Math.max(5, Math.round(baseElevation + wave1 + wave2 + wave3));

    const diff = currentEle - prevEle;
    if (diff > 0) gain += diff;
    else loss += Math.abs(diff);

    prevEle = currentEle;
    profile.push({
      distanceKm: Number(cumulativeDist.toFixed(2)),
      elevationM: currentEle,
    });
  }

  return {
    elevationGainM: Math.round(gain),
    elevationLossM: Math.round(loss),
    elevationProfile: profile,
  };
}

/**
 * Calculates estimated running time given distance and pace (seconds per km).
 */
export function calculatePaceTime(
  distanceKm: number,
  paceSecondsPerKm: number
): { hours: number; minutes: number; seconds: number; formatted: string } {
  const totalSeconds = Math.round(distanceKm * paceSecondsPerKm);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let formatted = '';
  if (hours > 0) {
    formatted = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return { hours, minutes, seconds, formatted };
}

/**
 * Calculates estimated calorie expenditure during the run.
 */
export function calculateCalories(
  distanceKm: number,
  paceSecondsPerKm: number,
  weightKg: number = 65
): number {
  // Running calorie formula: ~1.036 kcal / kg / km
  // Adjusted slightly by pace speed
  const speedKmh = 3600 / paceSecondsPerKm;
  const intensity = speedKmh > 12 ? 1.08 : speedKmh > 9 ? 1.02 : 0.98;
  return Math.round(distanceKm * weightKg * intensity);
}

/**
 * Converts kilometers to miles.
 */
export function kmToMiles(km: number): number {
  return km * 0.621371;
}

/**
 * Converts meters to feet.
 */
export function metersToFeet(meters: number): number {
  return Math.round(meters * 3.28084);
}

/**
 * Finds the geographic coordinate along a route polyline at a given distance in kilometers.
 * Used for elevation chart mouse hover scrubbing (like OnTheGoMap).
 */
export function getCoordinateAtDistance(
  coordinates: LatLng[],
  targetDistanceKm: number
): LatLng | null {
  if (!coordinates || coordinates.length === 0) return null;
  if (targetDistanceKm <= 0 || coordinates.length === 1) return coordinates[0];

  let accumulatedDist = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const segDist = haversineDistance(coordinates[i], coordinates[i + 1]);
    if (accumulatedDist + segDist >= targetDistanceKm) {
      const remaining = targetDistanceKm - accumulatedDist;
      const ratio = segDist > 0 ? remaining / segDist : 0;

      return {
        lat: coordinates[i].lat + (coordinates[i + 1].lat - coordinates[i].lat) * ratio,
        lng: coordinates[i].lng + (coordinates[i + 1].lng - coordinates[i].lng) * ratio,
      };
    }
    accumulatedDist += segDist;
  }

  return coordinates[coordinates.length - 1];
}

/**
 * Computes a continuous vibrant gradient color for route distance progression.
 * Harmonized with Strava aesthetic:
 * 0% (Start: Emerald Green) -> 30% (Warm Amber) -> 65% (Strava Orange #fc4c02) -> 100% (Finish Crimson)
 */
export function getDistanceGradientColor(ratio: number): string {
  const t = Math.max(0, Math.min(1, ratio));
  const stops = [
    { t: 0.0, r: 16, g: 185, b: 129 },  // #10b981 Emerald Start
    { t: 0.3, r: 245, g: 158, b: 11 },  // #f59e0b Amber Gold
    { t: 0.65, r: 252, g: 76, b: 2 },   // #fc4c02 Strava Signature Orange
    { t: 1.0, r: 225, g: 29, b: 72 },   // #e11d48 Crimson Finish
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (t >= s1.t && t <= s2.t) {
      const localRatio = (t - s1.t) / (s2.t - s1.t);
      const r = Math.round(s1.r + (s2.r - s1.r) * localRatio);
      const g = Math.round(s1.g + (s2.g - s1.g) * localRatio);
      const b = Math.round(s1.b + (s2.b - s1.b) * localRatio);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return '#fc4c02';
}

/**
 * Splits coordinates into gradient segments with distance progression info.
 */
export interface GradientSegment {
  coordinates: LatLng[];
  color: string;
  fraction: number;
}

export function buildGradientSegments(
  coordinates: LatLng[],
  maxSegments: number = 40
): GradientSegment[] {
  if (!coordinates || coordinates.length < 2) return [];

  const cumDists: number[] = [0];
  let totalDist = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalDist += haversineDistance(coordinates[i], coordinates[i + 1]);
    cumDists.push(totalDist);
  }

  if (totalDist === 0) {
    return [
      {
        coordinates,
        color: '#a3e635',
        fraction: 0,
      },
    ];
  }

  const numSegments = Math.min(maxSegments, coordinates.length - 1);
  const chunkSize = Math.max(1, Math.floor((coordinates.length - 1) / numSegments));
  const segments: GradientSegment[] = [];

  for (let i = 0; i < coordinates.length - 1; i += chunkSize) {
    const endIndex = Math.min(coordinates.length - 1, i + chunkSize);
    const segPoints = coordinates.slice(i, endIndex + 1);
    const avgDist = (cumDists[i] + cumDists[endIndex]) / 2;
    const fraction = avgDist / totalDist;
    const color = getDistanceGradientColor(fraction);

    segments.push({
      coordinates: segPoints,
      color,
      fraction,
    });

    if (endIndex >= coordinates.length - 1) break;
  }

  return segments;
}

export interface RouteMilepost {
  lat: number;
  lng: number;
  label: string;
  value: number;
}

/**
 * Generates distance milepost markers (1K, 2K, ... or 1MI, 2MI, ...) along a route polyline.
 */
export function buildRouteMileposts(
  coordinates: LatLng[],
  unitSystem: 'km' | 'mi' = 'km'
): RouteMilepost[] {
  if (!coordinates || coordinates.length < 2) return [];

  const totalKm = calculatePolylineDistance(coordinates);
  const stepKm = unitSystem === 'mi' ? 1.609344 : 1.0;
  const maxMarks = unitSystem === 'mi' ? Math.floor(totalKm / stepKm) : Math.floor(totalKm);
  if (maxMarks < 1) return [];

  const mileposts: RouteMilepost[] = [];
  let nextMarkerIndex = 1;
  let accumulatedKm = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const segKm = haversineDistance(p1, p2);
    if (segKm <= 0) continue;

    while (accumulatedKm + segKm >= nextMarkerIndex * stepKm && nextMarkerIndex <= 100) {
      const targetKm = nextMarkerIndex * stepKm;
      const ratio = (targetKm - accumulatedKm) / segKm;
      mileposts.push({
        lat: p1.lat + (p2.lat - p1.lat) * ratio,
        lng: p1.lng + (p2.lng - p1.lng) * ratio,
        label: unitSystem === 'mi' ? `${nextMarkerIndex} mi` : `${nextMarkerIndex}k`,
        value: nextMarkerIndex,
      });
      nextMarkerIndex++;
    }

    accumulatedKm += segKm;
  }

  return mileposts;
}

/**
 * Builds an accurate geographic circular GeoJSON ring [lng, lat][] for a center point & radiusKm.
 */
export function buildCirclePolygonCoords(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
  steps: number = 48
): [number, number][] {
  const kmPerLat = 111.139;
  const kmPerLng = kmPerLat * Math.cos((centerLat * Math.PI) / 180) || 1;
  const coords: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm * Math.cos(angle)) / kmPerLat;
    const dLng = (radiusKm * Math.sin(angle)) / kmPerLng;
    coords.push([centerLng + dLng, centerLat + dLat]);
  }

  return coords;
}
