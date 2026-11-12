import type { LatLng } from './types';
import { haversineDistance, resamplePolylineMeters } from './geo';
import { decodeMvtLayers, MvtFeature } from './mvt';

const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const WANTED_LAYERS = new Set(['park', 'landcover', 'landuse', 'water', 'waterway']);
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

const GREEN_CLASSES = new Set([
  'park',
  'wood',
  'forest',
  'grass',
  'golf_course',
  'meadow',
  'recreation_ground',
  'village_green',
  'garden',
  'wetland',
  'track',
  'cemetery',
  'heath',
  'scrub',
  'pitch',
]);

const WATER_CLASSES = new Set([
  'river',
  'lake',
  'pond',
  'reservoir',
  'canal',
  'stream',
  'dock',
]);

interface DecodedEnvTile {
  green: MvtFeature[];
  water: MvtFeature[];
}

export interface ScoutedPoint extends LatLng {
  kind: 'green' | 'water';
  name?: string;
  sizeWeight: number;
}

export interface RouteEnvironmentStats {
  greenPct: number | null;
  waterPct: number | null;
}

let tileTemplatePromise: Promise<string | null> | null = null;
const tileCache = new Map<string, Promise<DecodedEnvTile | null>>();

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

function isGreenFeature(layerName: string, feat: MvtFeature): boolean {
  if (layerName === 'park') return true;
  const cls = String(feat.props.class || '').toLowerCase();
  const sub = String(feat.props.subclass || '').toLowerCase();
  if (layerName === 'landcover') {
    return GREEN_CLASSES.has(cls) || GREEN_CLASSES.has(sub);
  }
  if (layerName === 'landuse') {
    return GREEN_CLASSES.has(cls) || GREEN_CLASSES.has(sub);
  }
  return false;
}

function isWaterFeature(layerName: string, feat: MvtFeature): boolean {
  const cls = String(feat.props.class || '').toLowerCase();
  const sub = String(feat.props.subclass || '').toLowerCase();
  if (cls === 'swimming_pool' || sub === 'swimming_pool' || cls === 'drain') {
    return false;
  }
  if (layerName === 'water') {
    return WATER_CLASSES.has(cls) || WATER_CLASSES.has(sub) || cls === '';
  }
  if (layerName === 'waterway') {
    return cls === 'river' || cls === 'canal' || cls === 'stream' || sub === 'river';
  }
  return false;
}

function fetchAndDecodeEnvTile(z: number, x: number, y: number): Promise<DecodedEnvTile | null> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;

  if (tileCache.size >= 36) {
    const oldestKey = tileCache.keys().next().value;
    if (oldestKey) tileCache.delete(oldestKey);
  }

  const promise = (async (): Promise<DecodedEnvTile | null> => {
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
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      const layers = decodeMvtLayers(buf, WANTED_LAYERS, x, y, z);

      const green: MvtFeature[] = [];
      const water: MvtFeature[] = [];

      for (const [layerName, feats] of Object.entries(layers)) {
        for (const feat of feats) {
          if (isGreenFeature(layerName, feat)) {
            green.push(feat);
          } else if (isWaterFeature(layerName, feat)) {
            water.push(feat);
          }
        }
      }

      return { green, water };
    } catch {
      tileCache.delete(key);
      return null;
    }
  })();

  tileCache.set(key, promise);
  return promise;
}

async function loadEnvTilesForBbox(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<DecodedEnvTile[]> {
  let z = 13;
  let tl = latLngToTile(maxLat, minLng, z);
  let br = latLngToTile(minLat, maxLng, z);
  let count = (br.x - tl.x + 1) * (br.y - tl.y + 1);

  if (count > 4) {
    z = 12;
    tl = latLngToTile(maxLat, minLng, z);
    br = latLngToTile(minLat, maxLng, z);
    count = (br.x - tl.x + 1) * (br.y - tl.y + 1);
  }

  if (count > 9) {
    // Safety cap: focus around center tiles
    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    const mid = latLngToTile(midLat, midLng, z);
    tl = { x: Math.max(0, mid.x - 1), y: Math.max(0, mid.y - 1) };
    br = { x: mid.x + 1, y: mid.y + 1 };
  }

  const coords: Array<{ x: number; y: number }> = [];
  for (let tx = tl.x; tx <= br.x; tx++) {
    for (let ty = tl.y; ty <= br.y; ty++) {
      coords.push({ x: tx, y: ty });
    }
  }

  const results = await Promise.all(coords.map((c) => fetchAndDecodeEnvTile(z, c.x, c.y)));
  return results.filter((t): t is DecodedEnvTile => t !== null);
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

/**
 * Scouts real local greenery & water anchors around `center` using decoded OpenFreeMap PBF tiles.
 * Used to steer route candidates toward parks, riverside corridors, lakes, and canals.
 */
export async function scoutEnvironmentAnchors(
  center: LatLng,
  searchRadiusKm: number
): Promise<{ greenPoints: ScoutedPoint[]; waterPoints: ScoutedPoint[] }> {
  const clampedR = Math.max(0.8, Math.min(10, searchRadiusKm));
  const dLat = clampedR / 111.139;
  const dLng = clampedR / (111.139 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.15));

  const tiles = await loadEnvTilesForBbox(
    center.lat - dLat,
    center.lng - dLng,
    center.lat + dLat,
    center.lng + dLng
  );

  const greenPoints: ScoutedPoint[] = [];
  const waterPoints: ScoutedPoint[] = [];

  const addFeatureSamples = (
    feats: MvtFeature[],
    kind: 'green' | 'water',
    out: ScoutedPoint[]
  ) => {
    for (const f of feats) {
      const spanM = Math.hypot(
        (f.bbox[2] - f.bbox[0]) * 111320 * Math.cos((center.lat * Math.PI) / 180),
        (f.bbox[3] - f.bbox[1]) * 110540
      );
      if (spanM < 35) continue;

      const name = typeof f.props.name === 'string' && f.props.name.trim() ? f.props.name.trim() : undefined;
      const samples: LatLng[] = [f.centroid];
      const primary = f.rings[0];
      if (primary && primary.length >= 4 && spanM > 140) {
        const stride = Math.max(1, Math.floor(primary.length / 4));
        for (let i = 0; i < primary.length; i += stride) {
          samples.push(primary[i]);
        }
      }

      for (const s of samples) {
        const distKm = haversineDistance(center, s);
        if (distKm < Math.max(0.18, clampedR * 0.14) || distKm > clampedR * 1.08) continue;
        // Deduplicate samples within ~220m of an existing point of same kind
        const tooClose = out.some((existing) => haversineDistance(existing, s) < 0.22);
        if (!tooClose) {
          out.push({
            lat: s.lat,
            lng: s.lng,
            kind,
            name,
            sizeWeight: Math.min(5, spanM / 120) + (name ? 1.5 : 0),
          });
        }
      }
    }
  };

  for (const tile of tiles) {
    addFeatureSamples(tile.green, 'green', greenPoints);
    addFeatureSamples(tile.water, 'water', waterPoints);
  }

  greenPoints.sort((a, b) => b.sizeWeight - a.sizeWeight);
  waterPoints.sort((a, b) => b.sizeWeight - a.sizeWeight);

  return {
    greenPoints: greenPoints.slice(0, 18),
    waterPoints: waterPoints.slice(0, 18),
  };
}

/**
 * Evaluates percentage of a candidate route running along parks/greenery & lakes/rivers/waterways.
 */
export async function analyzeRouteEnvironment(coordinates: LatLng[]): Promise<RouteEnvironmentStats> {
  if (!coordinates || coordinates.length < 2) {
    return { greenPct: null, waterPct: null };
  }

  const samples = resamplePolylineMeters(coordinates, 55);
  if (samples.length < 2) {
    return { greenPct: null, waterPct: null };
  }

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

  const pad = 0.0012; // ~130m around route bounds
  const tiles = await loadEnvTilesForBbox(minLat - pad, minLng - pad, maxLat + pad, maxLng + pad);
  if (tiles.length === 0) {
    return { greenPct: null, waterPct: null };
  }

  const allGreen: MvtFeature[] = [];
  const allWater: MvtFeature[] = [];
  for (const t of tiles) {
    allGreen.push(...t.green);
    allWater.push(...t.water);
  }

  const midLat = (minLat + maxLat) / 2;
  const mPerLng = 111320 * Math.max(Math.cos((midLat * Math.PI) / 180), 0.01);

  let greenHits = 0;
  let waterHits = 0;
  for (const pt of samples) {
    if (allGreen.some((f) => isPointNearFeature(pt, f, 65, mPerLng))) {
      greenHits++;
    }
    if (allWater.some((f) => isPointNearFeature(pt, f, 80, mPerLng))) {
      waterHits++;
    }
  }

  return {
    greenPct: Math.round((greenHits / samples.length) * 100),
    waterPct: Math.round((waterHits / samples.length) * 100),
  };
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

