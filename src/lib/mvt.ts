import { LatLng } from './types';

export interface MvtFeature {
  type: number; // 1 = Point, 2 = LineString, 3 = Polygon
  props: Record<string, string | number | boolean | null>;
  rings: LatLng[][];
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  centroid: LatLng;
}

class ByteReader {
  buf: Uint8Array;
  pos: number = 0;
  len: number;
  view: DataView;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.len = buf.length;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  readVarint(): number {
    let val = 0;
    let mult = 1;
    while (this.pos < this.len) {
      const b = this.buf[this.pos++];
      val += (b & 0x7f) * mult;
      if ((b & 0x80) === 0) return val;
      mult *= 128;
    }
    return val;
  }

  readVarint32(): number {
    let val = 0;
    let shift = 0;
    while (this.pos < this.len) {
      const b = this.buf[this.pos++];
      val |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0 || shift >= 28) {
        let cur = b;
        while ((cur & 0x80) !== 0 && this.pos < this.len) {
          cur = this.buf[this.pos++];
        }
        return val >>> 0;
      }
      shift += 7;
    }
    return val >>> 0;
  }

  readSVarint(): number {
    const n = this.readVarint();
    return n % 2 === 1 ? -((n + 1) / 2) : n / 2;
  }

  readBytes(len: number): Uint8Array {
    const safeLen = Math.max(0, Math.floor(len));
    const end = Math.min(this.len, this.pos + safeLen);
    const slice = this.buf.subarray(this.pos, end);
    this.pos = end;
    return slice;
  }

  readString(len: number): string {
    return new TextDecoder().decode(this.readBytes(len));
  }

  skip(wireType: number): void {
    switch (wireType) {
      case 0:
        this.readVarint();
        break;
      case 1:
        this.pos = Math.min(this.len, this.pos + 8);
        break;
      case 2: {
        const len = Math.max(0, Math.floor(this.readVarint()));
        this.pos = Math.min(this.len, this.pos + len);
        break;
      }
      case 5:
        this.pos = Math.min(this.len, this.pos + 4);
        break;
      default:
        this.pos = this.len;
    }
  }
}

function tilePointToLatLng(
  px: number,
  py: number,
  extent: number,
  tx: number,
  ty: number,
  z: number
): LatLng {
  const n = Math.pow(2, z);
  const lng = ((tx + px / extent) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + py / extent)) / n)));
  return { lat: (latRad * 180) / Math.PI, lng };
}

function decodeValueMessage(bytes: Uint8Array): string | number | boolean | null {
  const vr = new ByteReader(bytes);
  let val: string | number | boolean | null = null;
  while (vr.pos < vr.len) {
    const vt = vr.readVarint();
    const vf = vt >>> 3;
    const vw = vt & 7;
    if (vf === 1 && vw === 2) {
      val = vr.readString(vr.readVarint());
    } else if (vf === 2 && vw === 5 && vr.pos + 4 <= vr.len) {
      val = vr.view.getFloat32(vr.pos, true);
      vr.pos += 4;
    } else if (vf === 3 && vw === 1 && vr.pos + 8 <= vr.len) {
      val = vr.view.getFloat64(vr.pos, true);
      vr.pos += 8;
    } else if ((vf === 4 || vf === 5) && vw === 0) {
      val = vr.readVarint();
    } else if (vf === 6 && vw === 0) {
      val = vr.readSVarint();
    } else if (vf === 7 && vw === 0) {
      val = vr.readVarint() !== 0;
    } else {
      vr.skip(vw);
    }
  }
  return val;
}

function decodeFeature(
  bytes: Uint8Array,
  keys: string[],
  values: Array<string | number | boolean | null>,
  extent: number,
  tx: number,
  ty: number,
  z: number
): MvtFeature | null {
  const r = new ByteReader(bytes);
  let type = 0;
  const tagInts: number[] = [];
  const geomInts: number[] = [];

  while (r.pos < r.len) {
    const tag = r.readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 2 && wire === 2) {
      const len = r.readVarint();
      const end = Math.min(r.len, r.pos + len);
      while (r.pos < end) tagInts.push(r.readVarint());
    } else if (field === 3 && wire === 0) {
      type = r.readVarint();
    } else if (field === 4 && wire === 2) {
      const len = r.readVarint();
      const end = Math.min(r.len, r.pos + len);
      while (r.pos < end) geomInts.push(r.readVarint32());
    } else {
      r.skip(wire);
    }
  }

  const props: Record<string, string | number | boolean | null> = {};
  for (let i = 0; i + 1 < tagInts.length; i += 2) {
    const k = keys[tagInts[i]];
    if (k !== undefined) {
      props[k] = values[tagInts[i + 1]] ?? null;
    }
  }

  const rings: LatLng[][] = [];
  let currentRing: LatLng[] = [];
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let x = 0;
  let y = 0;
  let gi = 0;

  while (gi < geomInts.length) {
    const cmdInt = geomInts[gi++];
    const cmd = cmdInt & 7;
    const count = cmdInt >>> 3;
    if (cmd === 1 || cmd === 2) {
      for (let k = 0; k < count && gi + 1 < geomInts.length; k++) {
        const dx = geomInts[gi++];
        const dy = geomInts[gi++];
        x += (dx >>> 1) ^ -(dx & 1);
        y += (dy >>> 1) ^ -(dy & 1);
        const ll = tilePointToLatLng(x, y, extent, tx, ty, z);
        if (ll.lng < minLng) minLng = ll.lng;
        if (ll.lat < minLat) minLat = ll.lat;
        if (ll.lng > maxLng) maxLng = ll.lng;
        if (ll.lat > maxLat) maxLat = ll.lat;
        if (cmd === 1 && currentRing.length > 0) {
          rings.push(currentRing);
          currentRing = [];
        }
        currentRing.push(ll);
      }
    } else if (cmd === 7) {
      if (currentRing.length > 0) {
        currentRing.push({ ...currentRing[0] });
      }
    }
  }

  if (currentRing.length > 0) {
    rings.push(currentRing);
  }

  if (rings.length === 0 || !Number.isFinite(minLat)) {
    return null;
  }

  return {
    type,
    props,
    rings,
    bbox: [minLng, minLat, maxLng, maxLat],
    centroid: {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    },
  };
}

function decodeLayer(
  bytes: Uint8Array,
  wantedLayers: Set<string>,
  tx: number,
  ty: number,
  z: number
): { name: string; features: MvtFeature[] } | null {
  const r = new ByteReader(bytes);
  let name = '';
  let extent = 4096;
  const keys: string[] = [];
  const values: Array<string | number | boolean | null> = [];
  const rawFeatures: Uint8Array[] = [];

  while (r.pos < r.len) {
    const tag = r.readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      name = r.readString(r.readVarint());
      if (!wantedLayers.has(name)) {
        return null;
      }
    } else if (field === 2 && wire === 2) {
      rawFeatures.push(r.readBytes(r.readVarint()));
    } else if (field === 3 && wire === 2) {
      keys.push(r.readString(r.readVarint()));
    } else if (field === 4 && wire === 2) {
      values.push(decodeValueMessage(r.readBytes(r.readVarint())));
    } else if (field === 5 && wire === 0) {
      extent = r.readVarint() || 4096;
    } else {
      r.skip(wire);
    }
  }

  if (!wantedLayers.has(name)) return null;

  const features: MvtFeature[] = [];
  for (const fb of rawFeatures) {
    const feat = decodeFeature(fb, keys, values, extent, tx, ty, z);
    if (feat) features.push(feat);
  }
  return { name, features };
}

/**
 * Decodes selected Mapbox Vector Tile layers into WGS84 LatLng features in ~100ms.
 */
export function decodeMvtLayers(
  buf: Uint8Array,
  wantedLayers: Set<string>,
  tx: number,
  ty: number,
  z: number
): Record<string, MvtFeature[]> {
  const result: Record<string, MvtFeature[]> = {};
  const tr = new ByteReader(buf);

  while (tr.pos < tr.len) {
    const tag = tr.readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 3 && wire === 2) {
      const layerBytes = tr.readBytes(tr.readVarint());
      const decoded = decodeLayer(layerBytes, wantedLayers, tx, ty, z);
      if (decoded) {
        result[decoded.name] = decoded.features;
      }
    } else {
      tr.skip(wire);
    }
  }

  return result;
}

