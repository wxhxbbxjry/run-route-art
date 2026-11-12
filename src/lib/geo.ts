import {
  GeneratorShape,
  LatLng,
  RoutePreferences,
  RouteQualityMetrics,
  RouteQualityScore,
  RouteScorePart,
} from './types';

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

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Projects LatLng polyline into local flat-earth meters relative to first point.
 */
function projectToLocalMeters(coords: LatLng[]): Array<[number, number]> {
  if (coords.length === 0) return [];
  const refLat = coords[0].lat;
  const metersPerLng = 111320 * Math.max(Math.cos((refLat * Math.PI) / 180), 0.01);
  return coords.map((p) => [p.lng * metersPerLng, p.lat * 110540]);
}

function resampleProjectedMeters(pts: Array<[number, number]>, stepMeters: number): Array<[number, number]> {
  if (pts.length < 2) return pts;
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const total = cum[cum.length - 1];
  if (total <= 0) return [pts[0], pts[pts.length - 1]];

  const out: Array<[number, number]> = [];
  let idx = 1;
  for (let d = 0; d <= total; d += stepMeters) {
    while (idx < pts.length && cum[idx] < d) {
      idx++;
    }
    if (idx >= pts.length) break;
    const segLen = cum[idx] - cum[idx - 1];
    const t = segLen > 0 ? (d - cum[idx - 1]) / segLen : 0;
    out.push([
      pts[idx - 1][0] + t * (pts[idx][0] - pts[idx - 1][0]),
      pts[idx - 1][1] + t * (pts[idx][1] - pts[idx - 1][1]),
    ]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Resamples a LatLng polyline every `stepMeters` along local projected distance.
 */
export function resamplePolylineMeters(coords: LatLng[], stepMeters: number = 20): LatLng[] {
  if (coords.length < 2) return coords;
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum[i] = cum[i - 1] + haversineDistance(coords[i - 1], coords[i]) * 1000;
  }
  const total = cum[cum.length - 1];
  if (total <= 0) return coords;

  const out: LatLng[] = [];
  let idx = 1;
  for (let d = 0; d <= total; d += stepMeters) {
    while (idx < coords.length && cum[idx] < d) {
      idx++;
    }
    if (idx >= coords.length) break;
    const segLen = cum[idx] - cum[idx - 1];
    const t = segLen > 0 ? (d - cum[idx - 1]) / segLen : 0;
    out.push({
      lat: coords[idx - 1].lat + t * (coords[idx].lat - coords[idx - 1].lat),
      lng: coords[idx - 1].lng + t * (coords[idx].lng - coords[idx - 1].lng),
    });
  }
  out.push(coords[coords.length - 1]);
  return out;
}

function buildSpatialCellSet(coords: LatLng[], gridSizeM: number, sampleStepM: number): Set<string> {
  const resampled = resamplePolylineMeters(coords, sampleStepM);
  const cosLat = Math.max(Math.cos(((coords[0]?.lat || 0) * Math.PI) / 180), 0.01);
  const metersPerLng = 111320 * cosLat;
  const cells = new Set<string>();
  for (const pt of resampled) {
    const gx = Math.floor((pt.lng * metersPerLng) / gridSizeM);
    const gy = Math.floor((pt.lat * 110540) / gridSizeM);
    cells.add(`${gx}:${gy}`);
  }
  return cells;
}

/**
 * Checks whether two candidate routes share >= threshold (default 62%) of spatial road grid cells.
 * Ported from RunCulture corridor deduplication (`20m` resample + `28-32m` spatial grid).
 */
export function arePolylinesTooSimilar(
  coordsA: LatLng[],
  coordsB: LatLng[],
  threshold: number = 0.62,
  gridSizeM: number = 32,
  sampleStepM: number = 20
): boolean {
  if (coordsA.length < 2 || coordsB.length < 2) return false;
  const setA = buildSpatialCellSet(coordsA, gridSizeM, sampleStepM);
  const setB = buildSpatialCellSet(coordsB, gridSizeM, sampleStepM);
  if (setA.size === 0 || setB.size === 0) return false;

  let matches = 0;
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = setA.size <= setB.size ? setB : setA;
  smaller.forEach((cell) => {
    if (larger.has(cell)) matches++;
  });

  return matches / smaller.size >= threshold;
}

/**
 * Computes self-overlap ratio (`0..1`) where non-adjacent sections pass within `24m`.
 * Ported directly from RunCulture module `63308.ES`.
 */
export function computeSelfOverlapRatio(coords: LatLng[]): number {
  if (!coords || coords.length < 4) return 0;
  const projected = projectToLocalMeters(coords);
  let totalM = 0;
  for (let i = 1; i < projected.length; i++) {
    totalM += Math.hypot(projected[i][0] - projected[i - 1][0], projected[i][1] - projected[i - 1][1]);
  }
  if (totalM <= 0) return 0;

  const stepM = Math.max(12, totalM / 900);
  const resampled = resampleProjectedMeters(projected, stepM);
  if (resampled.length < 6) return 0;

  const skipGap = Math.max(3, Math.ceil(24 / stepM) + 1);
  let overlapped = 0;
  for (let i = 0; i < resampled.length; i++) {
    const [ax, ay] = resampled[i];
    let hit = false;
    for (let j = 0; j < resampled.length; j++) {
      if (Math.abs(j - i) <= skipGap) continue;
      const dx = ax - resampled[j][0];
      const dy = ay - resampled[j][1];
      if (dx * dx + dy * dy < 576) {
        hit = true;
        break;
      }
    }
    if (hit) overlapped++;
  }
  return overlapped / resampled.length;
}

function computeBearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Counts sharp turns (`>= 50 deg` change over 25m decimated segments) per kilometer.
 * Ported directly from RunCulture module `88896.yr`.
 */
export function computeTurnsPerKm(coords: LatLng[]): number {
  if (!coords || coords.length < 3) return 0;
  const decimated: LatLng[] = [];
  for (const pt of coords) {
    const prev = decimated[decimated.length - 1];
    if (!prev || haversineDistance(prev, pt) * 1000 >= 25) {
      decimated.push(pt);
    }
  }
  let totalMeters = 0;
  for (let i = 1; i < decimated.length; i++) {
    totalMeters += haversineDistance(decimated[i - 1], decimated[i]) * 1000;
  }
  if (decimated.length < 3 || totalMeters <= 0) return 0;

  let sharpTurns = 0;
  for (let i = 2; i < decimated.length; i++) {
    const b1 = computeBearingDeg(decimated[i - 2], decimated[i - 1]);
    const b2 = computeBearingDeg(decimated[i - 1], decimated[i]);
    let delta = Math.abs(b2 - b1) % 360;
    if (delta > 180) delta = 360 - delta;
    if (delta >= 50) sharpTurns++;
  }
  return sharpTurns / (totalMeters / 1000);
}

/**
 * Extracts editable route anchor dots evenly distributed along a generated route polyline.
 * Ported from RunCulture module `47124._3`.
 */
export function extractEditableAnchors(
  coords: LatLng[],
  maxAnchors: number = 14
): { points: LatLng[]; indices: number[] } {
  if (!coords || coords.length < 2) {
    return { points: coords ? [...coords] : [], indices: coords?.map((_, i) => i) || [] };
  }
  const cumMeters: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumMeters[i] = cumMeters[i - 1] + haversineDistance(coords[i - 1], coords[i]) * 1000;
  }
  const totalMeters = cumMeters[cumMeters.length - 1];
  if (totalMeters <= 0) {
    return {
      points: [coords[0], coords[coords.length - 1]],
      indices: [0, coords.length - 1],
    };
  }

  const targetSpacingM = Math.max(450, Math.min(2500, totalMeters / 9));
  const numIntervals = Math.min(Math.max(3, Math.round(totalMeters / targetSpacingM)), maxAnchors - 1);
  const indices: number[] = [0];

  for (let step = 1; step < numIntervals; step++) {
    const targetM = (totalMeters * step) / numIntervals;
    let idx = cumMeters.findIndex((m) => m >= targetM);
    if (idx < 0) break;
    if (idx <= indices[indices.length - 1]) idx = indices[indices.length - 1] + 1;
    if (idx >= coords.length - 1) break;
    indices.push(idx);
  }
  indices.push(coords.length - 1);

  return {
    points: indices.map((idx) => ({ lat: coords[idx].lat, lng: coords[idx].lng })),
    indices,
  };
}

/**
 * Finds the closest projected point & segment index along a route polyline.
 * Ported from RunCulture module `47124.W1`.
 */
export function findClosestPointOnPolyline(
  coords: LatLng[],
  target: LatLng
): { lat: number; lng: number; segmentIndex: number; distanceMeters: number } | null {
  if (coords.length < 2) return null;
  const metersPerLng = 111320 * Math.max(Math.cos((target.lat * Math.PI) / 180), 0.01);
  const tx = target.lng * metersPerLng;
  const ty = target.lat * 111320;

  let best: { lat: number; lng: number; segmentIndex: number; distanceMeters: number } | null = null;
  let bestDistSq = Infinity;

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = a.lng * metersPerLng;
    const ay = a.lat * 111320;
    const bx = b.lng * metersPerLng;
    const by = b.lat * 111320;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? clamp01(((tx - ax) * dx + (ty - ay) * dy) / lenSq) : 0;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const distSq = (tx - px) * (tx - px) + (ty - py) * (ty - py);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = {
        lat: py / 111320,
        lng: px / metersPerLng,
        segmentIndex: i,
        distanceMeters: Math.sqrt(distSq),
      };
    }
  }
  return best;
}

/**
 * Finds which anchor slot corresponds to an arbitrary route polyline segment index.
 * Ported from RunCulture module `47124.yF`.
 */
export function getInsertionIndexForSegment(anchorIndices: number[], segmentIndex: number): number {
  if (anchorIndices.length < 2) return 1;
  for (let i = 0; i < anchorIndices.length - 1; i++) {
    if (segmentIndex < anchorIndices[i + 1]) return i + 1;
  }
  return anchorIndices.length - 1;
}

export function hasActiveRoutePreferences(prefs: RoutePreferences): boolean {
  return (
    prefs.environment !== 'any' ||
    prefs.traffic !== 'any' ||
    prefs.flow !== 'any'
  );
}

const SCORE_WEIGHTS: Record<RouteScorePart['key'], { weight: number; label: string }> = {
  nature: { weight: 0.25, label: 'Alam & Air' },
  quiet: { weight: 0.2, label: 'Jalan Tenang' },
  signals: { weight: 0.15, label: 'Lampu Merah' },
  flow: { weight: 0.15, label: 'Alur Lari' },
  overlap: { weight: 0.15, label: 'Anti-Overlap' },
  distance: { weight: 0.1, label: 'Akurasi Jarak' },
};

/**
 * Computes RunCulture's 0-100% Route Score + Preference match score (without elevation).
 * Uses Largest Remainder integer partitioning so breakdown points sum strictly to `pct`.
 */
export function computeRouteQualityScore(params: {
  coordinates: LatLng[];
  distanceKm: number;
  targetDistanceKm?: number;
  shape?: GeneratorShape;
  greenPct?: number | null;
  waterPct?: number | null;
  quietPct?: number | null;
  signalsCount?: number | null;
  preferences?: RoutePreferences;
}): RouteQualityScore {
  const {
    coordinates,
    distanceKm,
    targetDistanceKm,
    shape = 'loop',
    greenPct = null,
    waterPct = null,
    quietPct = null,
    signalsCount = null,
    preferences,
  } = params;

  const deviationPct =
    targetDistanceKm && targetDistanceKm > 0
      ? ((distanceKm - targetDistanceKm) / targetDistanceKm) * 100
      : 0;

  const turnsPerKm = computeTurnsPerKm(coordinates);
  // For an out-and-back route, the return trip along the outbound leg is expected;
  // check overlap strictly on the outbound half so legitimate out-and-backs score accurately.
  const overlapSampleCoords =
    shape === 'out_and_back' && coordinates.length > 6
      ? coordinates.slice(0, Math.max(4, Math.ceil(coordinates.length / 2)))
      : coordinates;
  const selfOverlapRatio = computeSelfOverlapRatio(overlapSampleCoords);
  const signalsPerKm =
    signalsCount !== null && distanceKm > 0 ? signalsCount / distanceKm : null;

  const normNature =
    greenPct === null && waterPct === null
      ? 0.5
      : clamp01(((greenPct ?? 0) + 0.5 * (waterPct ?? 0)) / 100);
  const normQuiet = quietPct === null ? 0.5 : clamp01(quietPct / 100);
  const normSignals = signalsPerKm === null ? 0.5 : clamp01(1 - signalsPerKm / 4);
  const normFlow = clamp01(1 - turnsPerKm / 12);
  const normOverlap = clamp01(1 - selfOverlapRatio / 0.3);
  const normDistance =
    targetDistanceKm && targetDistanceKm > 0
      ? clamp01(1 - Math.abs(deviationPct) / 12)
      : 0.75;

  const normalized: Record<RouteScorePart['key'], number> = {
    nature: normNature,
    quiet: normQuiet,
    signals: normSignals,
    flow: normFlow,
    overlap: normOverlap,
    distance: normDistance,
  };

  const keys = Object.keys(SCORE_WEIGHTS) as RouteScorePart['key'][];
  const rawPoints = keys.map((k) => SCORE_WEIGHTS[k].weight * normalized[k] * 100);
  const totalFloat = rawPoints.reduce((acc, v) => acc + v, 0);
  const pct = Math.min(100, Math.max(0, Math.round(totalFloat)));

  const floored = rawPoints.map((v) => Math.floor(v));
  let remainder = pct - floored.reduce((acc, v) => acc + v, 0);
  const byFrac = rawPoints
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const item of byFrac) {
    if (remainder <= 0) break;
    floored[item.i] += 1;
    remainder -= 1;
  }

  const parts: RouteScorePart[] = keys.map((k, idx) => ({
    key: k,
    label: SCORE_WEIGHTS[k].label,
    points: floored[idx],
    max: Math.round(SCORE_WEIGHTS[k].weight * 100),
  }));

  let preferenceScore: number | null = null;
  let weakestPreference: string | null = null;
  if (preferences && hasActiveRoutePreferences(preferences)) {
    const dimScores: Array<{ label: string; score: number }> = [];
    if (preferences.environment === 'green') {
      dimScores.push({
        label: 'Ruang Hijau / Taman',
        score: greenPct !== null ? clamp01(greenPct / 100) : 0.4,
      });
    } else if (preferences.environment === 'water') {
      dimScores.push({
        label: 'Tepi Air / Sungai',
        score: waterPct !== null ? clamp01(waterPct / 100) : 0.4,
      });
    } else if (preferences.environment === 'green_water') {
      const g = greenPct !== null ? clamp01(greenPct / 100) : 0.4;
      const w = waterPct !== null ? clamp01(waterPct / 100) : 0.4;
      dimScores.push({
        label: 'Taman & Tepi Air',
        score: (g + w) / 2,
      });
    }

    if (preferences.traffic === 'quiet') {
      const q = quietPct !== null ? clamp01(quietPct / 100) : 0.5;
      const quietCombined =
        signalsPerKm !== null ? 0.7 * normSignals + 0.3 * q : q;
      dimScores.push({
        label: 'Jalan Tenang & Minim Lampu Merah',
        score: quietCombined,
      });
    }

    if (preferences.flow === 'few_turns') {
      dimScores.push({
        label: 'Minim Belokan Tajam',
        score: normFlow,
      });
    }

    if (dimScores.length > 0) {
      preferenceScore =
        dimScores.reduce((acc, d) => acc + d.score, 0) / dimScores.length;
      const weakest = dimScores.reduce((min, d) => (d.score < min.score ? d : min));
      if (weakest.score < 0.35) {
        weakestPreference = weakest.label;
      }
    }
  }

  const metrics: RouteQualityMetrics = {
    deviationPct,
    greenPct: greenPct !== null ? Math.round(greenPct) : null,
    waterPct: waterPct !== null ? Math.round(waterPct) : null,
    quietPct: quietPct !== null ? Math.round(quietPct) : null,
    signalsCount,
    signalsPerKm,
    turnsPerKm: Number(turnsPerKm.toFixed(1)),
    selfOverlapRatio: Number(selfOverlapRatio.toFixed(3)),
  };

  return {
    pct,
    parts,
    metrics,
    preferenceScore,
    weakestPreference,
  };
}
