import type { LatLng } from './types';
import { haversineDistance, resamplePolylineMeters } from './geo';
import { decodeMvtLayers, MvtFeature } from './mvt';

const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const ROAD_LAYERS = new Set(['transportation', 'transportation_name']);

const MVT_CAR_CLASSES = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'minor']);
const MVT_MAJOR_CLASSES = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
const MVT_EXCLUDED_SUBCLASSES = new Set([
  'footway',
  'steps',
  'pedestrian',
  'cycleway',
  'path',
  'bridleway',
  'track',
]);
const MVT_GANG_REGEX =
  /(?:\b(?:gang|gg|lorong|lrg|setapak|bantaran|inspeksi)\b|\b(?:gang|gg|lrg)\d+\b)/i;
const MVT_TOLL_REGEX = /(?:\b(?:tol|toll)\b|jalan\s+tol|bebas\s+hambatan)/i;

let tileTemplatePromise: Promise<string | null> | null = null;

function getTileTemplate(): Promise<string | null> {
  if (!tileTemplatePromise) {
    tileTemplatePromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(OPENFREEMAP_TILEJSON_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const json = await res.json();
        const tpl = json?.tiles?.[0];
        return typeof tpl === 'string' ? tpl : null;
      } catch {
        return null;
      }
    })();
  }
  return tileTemplatePromise;
}

function latLngToTile(lat: number, lng: number, z: number): { x: number; y: number } {
  const n = Math.pow(2, z);
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((lng + 180) / 360) * n)));
  const y = Math.max(
    0,
    Math.min(
      n - 1,
      Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
    )
  );
  return { x, y };
}

function pointInRing(pt: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersect =
      yi > pt.lat !== yj > pt.lat &&
      pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distancePointToSegmentMeters(pt: LatLng, a: LatLng, b: LatLng, mPerLng: number): number {
  const px = pt.lng * mPerLng;
  const py = pt.lat * 110540;
  const ax = a.lng * mPerLng;
  const ay = a.lat * 110540;
  const bx = b.lng * mPerLng;
  const by = b.lat * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function isPointNearFeature(
  pt: LatLng,
  feat: MvtFeature,
  thresholdMeters: number,
  mPerLng: number
): boolean {
  const degPadLat = (thresholdMeters + 15) / 110540;
  const degPadLng = (thresholdMeters + 15) / mPerLng;
  const [minLng, minLat, maxLng, maxLat] = feat.bbox;
  if (
    pt.lng < minLng - degPadLng ||
    pt.lng > maxLng + degPadLng ||
    pt.lat < minLat - degPadLat ||
    pt.lat > maxLat + degPadLat
  ) {
    return false;
  }

  if (feat.type === 3) {
    // Outer rings contain polygon interiors (e.g., parks, forests, lakes)
    if (feat.rings[0] && pointInRing(pt, feat.rings[0])) {
      return true;
    }
  }

  for (const ring of feat.rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      if (distancePointToSegmentMeters(pt, ring[i], ring[i + 1], mPerLng) <= thresholdMeters) {
        return true;
      }
    }
  }

  return false;
}

export type MvtRoadClass = 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'minor';

interface DecodedRoadEntry {
  feat: MvtFeature;
  cls: MvtRoadClass;
}

interface DecodedRoadTile {
  carRoads: DecodedRoadEntry[];
  gangNames: MvtFeature[];
  tollNames: MvtFeature[];
}

const roadTileCache = new Map<string, Promise<DecodedRoadTile | null>>();

function fetchAndDecodeRoadTile(
  z: number,
  x: number,
  y: number
): Promise<DecodedRoadTile | null> {
  const key = `road:${z}/${x}/${y}`;
  const cached = roadTileCache.get(key);
  if (cached) return cached;

  if (roadTileCache.size >= 28) {
    const oldestKey = roadTileCache.keys().next().value;
    if (oldestKey) roadTileCache.delete(oldestKey);
  }

  const promise = (async (): Promise<DecodedRoadTile | null> => {
    const tpl = await getTileTemplate();
    if (!tpl) return null;

    const url = tpl
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        roadTileCache.delete(key);
        return null;
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      const layers = decodeMvtLayers(buf, ROAD_LAYERS, x, y, z);

      const carRoads: DecodedRoadEntry[] = [];
      for (const feat of layers.transportation || []) {
        const br = String(feat.props.brunnel || '').toLowerCase();
        if (br === 'tunnel') continue;
        const cls = String(feat.props.class || '').toLowerCase();
        if (!MVT_CAR_CLASSES.has(cls)) continue;
        const sub = String(feat.props.subclass || '').toLowerCase();
        if (MVT_EXCLUDED_SUBCLASSES.has(sub)) continue;
        carRoads.push({ feat, cls: cls as MvtRoadClass });
      }

      const gangNames: MvtFeature[] = [];
      const tollNames: MvtFeature[] = [];
      for (const feat of layers.transportation_name || []) {
        const name = String(feat.props.name || '');
        if (!name) continue;
        if (MVT_TOLL_REGEX.test(name)) {
          tollNames.push(feat);
        } else if (MVT_GANG_REGEX.test(name)) {
          gangNames.push(feat);
        }
      }

      return { carRoads, gangNames, tollNames };
    } catch {
      roadTileCache.delete(key);
      return null;
    }
  })();

  roadTileCache.set(key, promise);
  return promise;
}

async function loadRoadTilesForBbox(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<DecodedRoadTile[]> {
  const z = 14; // OpenFreeMap preserves minor street names & Gang labels cleanly at z=14
  const tl = latLngToTile(maxLat, minLng, z);
  const br = latLngToTile(minLat, maxLng, z);
  const count = (br.x - tl.x + 1) * (br.y - tl.y + 1);

  const coords: Array<{ x: number; y: number }> = [];
  if (count <= 9) {
    for (let tx = tl.x; tx <= br.x; tx++) {
      for (let ty = tl.y; ty <= br.y; ty++) {
        coords.push({ x: tx, y: ty });
      }
    }
  } else {
    const mid = latLngToTile((minLat + maxLat) / 2, (minLng + maxLng) / 2, z);
    for (let tx = Math.max(0, mid.x - 1); tx <= mid.x + 1; tx++) {
      for (let ty = Math.max(0, mid.y - 1); ty <= mid.y + 1; ty++) {
        coords.push({ x: tx, y: ty });
      }
    }
  }

  const tiles = await Promise.all(coords.map((c) => fetchAndDecodeRoadTile(z, c.x, c.y)));
  return tiles.filter((t): t is DecodedRoadTile => t !== null);
}

function projectPointOnSegment(
  pt: LatLng,
  a: LatLng,
  b: LatLng,
  mPerLng: number
): { lat: number; lng: number; distMeters: number } {
  const px = pt.lng * mPerLng;
  const py = pt.lat * 110540;
  const ax = a.lng * mPerLng;
  const ay = a.lat * 110540;
  const bx = b.lng * mPerLng;
  const by = b.lat * 110540;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  const rx = ax + t * dx;
  const ry = ay + t * dy;
  return {
    lat: ry / 110540,
    lng: rx / mPerLng,
    distMeters: Math.hypot(px - rx, py - ry),
  };
}

/**
 * Snaps a raw coordinate onto a nearby car & motorcycle passable street using
 * cached OpenFreeMap z=14 vector tiles (~110ms cold, 0ms cached), rejecting tunnels,
 * footways, service alleys, Gang/Gg./Lorong, and Tolls.
 */
export async function snapCarRoadFromMvt(
  rawPoint: LatLng,
  mode: 'manual' | 'loop_start' | 'major_only',
  maxRadiusMeters: number = 700,
  abortSignal?: AbortSignal
): Promise<{ point: LatLng; roadClass: MvtRoadClass; distMeters: number } | null> {
  if (abortSignal?.aborted) return null;

  const padLat = maxRadiusMeters / 110540;
  const mPerLng = 111320 * Math.max(Math.cos((rawPoint.lat * Math.PI) / 180), 0.1);
  const padLng = maxRadiusMeters / mPerLng;

  const tiles = await loadRoadTilesForBbox(
    rawPoint.lat - padLat,
    rawPoint.lng - padLng,
    rawPoint.lat + padLat,
    rawPoint.lng + padLng
  );
  if (abortSignal?.aborted || tiles.length === 0) return null;

  const restrictedNames: MvtFeature[] = [];
  for (const t of tiles) {
    restrictedNames.push(...t.gangNames, ...t.tollNames);
  }

  let best: { point: LatLng; roadClass: MvtRoadClass; distMeters: number } | null = null;
  let bestScore = Infinity;

  for (const tile of tiles) {
    for (const entry of tile.carRoads) {
      const feat = entry.feat;
      const cls = entry.cls;

      const [minLng, minLat, maxLng, maxLat] = feat.bbox;
      if (
        rawPoint.lng < minLng - padLng ||
        rawPoint.lng > maxLng + padLng ||
        rawPoint.lat < minLat - padLat ||
        rawPoint.lat > maxLat + padLat
      ) {
        continue;
      }

      for (const ring of feat.rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const hit = projectPointOnSegment(rawPoint, ring[i], ring[i + 1], mPerLng);
          if (hit.distMeters > maxRadiusMeters) continue;

          // Exclude points lying directly on named Gang / Gg. / Lorong / Tol segments
          const isRestricted = restrictedNames.some((rf) =>
            isPointNearFeature(hit, rf, 15, mPerLng)
          );
          if (isRestricted) continue;

          let penalty = 0;
          if (mode === 'major_only') {
            penalty =
              cls === 'tertiary' || cls === 'secondary'
                ? 0
                : cls === 'primary'
                ? 10
                : cls === 'trunk'
                ? 20
                : 120;
          } else if (hit.distMeters <= 32) {
            penalty = cls === 'minor' ? 8 : cls === 'trunk' ? 14 : 0;
          } else {
            penalty =
              cls === 'tertiary' || cls === 'secondary'
                ? 0
                : cls === 'primary'
                ? 12
                : cls === 'trunk'
                ? 22
                : 45;
          }

          const score = hit.distMeters + penalty;
          if (score < bestScore) {
            bestScore = score;
            best = {
              point: { lat: hit.lat, lng: hit.lng },
              roadClass: cls,
              distMeters: hit.distMeters,
            };
          }
        }
      }
    }
  }

  return best;
}

/**
 * Checks a completed polyline against decoded OpenFreeMap z=14 road names to flag
 * actual segments entering named Gang / Gg. / Lorong / Tol roads (ignoring simple avenue crossings).
 */
export async function scanRouteRestrictedRoadsMvt(
  coordinates: LatLng[],
  abortSignal?: AbortSignal
): Promise<{ gangPoints: LatLng[]; tollCount: number }> {
  if (!coordinates || coordinates.length < 2 || abortSignal?.aborted) {
    return { gangPoints: [], tollCount: 0 };
  }

  const samples = resamplePolylineMeters(coordinates, 65);
  if (samples.length < 2) return { gangPoints: [], tollCount: 0 };

  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const pt of samples) {
    if (pt.lat < minLat) minLat = pt.lat;
    if (pt.lat > maxLat) maxLat = pt.lat;
    if (pt.lng < minLng) minLng = pt.lng;
    if (pt.lng > maxLng) maxLng = pt.lng;
  }

  const pad = 0.0005;
  const tiles = await loadRoadTilesForBbox(minLat - pad, minLng - pad, maxLat + pad, maxLng + pad);
  if (abortSignal?.aborted || tiles.length === 0) {
    return { gangPoints: [], tollCount: 0 };
  }

  const allGangNames: MvtFeature[] = [];
  const allTollNames: MvtFeature[] = [];
  const majorRoads: MvtFeature[] = [];

  for (const t of tiles) {
    allGangNames.push(...t.gangNames);
    allTollNames.push(...t.tollNames);
    for (const r of t.carRoads) {
      if (MVT_MAJOR_CLASSES.has(r.cls)) {
        majorRoads.push(r.feat);
      }
    }
  }

  if (allGangNames.length === 0 && allTollNames.length === 0) {
    return { gangPoints: [], tollCount: 0 };
  }

  const mPerLng = 111320 * Math.max(Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180), 0.1);
  const gangPoints: LatLng[] = [];
  let tollCount = 0;

  for (const pt of samples) {
    if (allTollNames.some((tf) => isPointNearFeature(pt, tf, 12, mPerLng))) {
      tollCount++;
    }
    if (allGangNames.some((gf) => isPointNearFeature(pt, gf, 11, mPerLng))) {
      // Do not trigger false-positives when crossing the mouth of a gang along a major avenue
      const onMajorStreet = majorRoads.some((mf) => isPointNearFeature(pt, mf, 12, mPerLng));
      if (!onMajorStreet && gangPoints.every((g) => haversineDistance(g, pt) > 0.09)) {
        gangPoints.push(pt);
        if (gangPoints.length >= 10) break;
      }
    }
  }

  return { gangPoints, tollCount };
}

