// Heightfield terrain for Germany and its neighbours.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm, ridged, vnoise, canvasTexture, mulberry32 } from './util.js';
import { toLonLat, borderInfo, HILLS, ALPS, ZUGSPITZE, LAKES, RIVERS } from './geo.js';

export const GRID = {
  X0: -2700, Z0: -3300, CELL: 10,
  NX: 541, NZ: 661,
};
GRID.X1 = GRID.X0 + (GRID.NX - 1) * GRID.CELL;
GRID.Z1 = GRID.Z0 + (GRID.NZ - 1) * GRID.CELL;

// Spatial index of river segments so valley attenuation stays cheap.
const RCELL = 400, RMARGIN = 380;
let riverSegs = null;
const riverIdx = new Map();
function buildRiverIndex() {
  riverSegs = [];
  for (const r of RIVERS) {
    if (!r.smooth) r.smooth = chaikin(r.pts, 3);
    const p = r.smooth;
    for (let i = 0; i < p.length - 1; i++) {
      const sgm = { ax: p[i].x, az: p[i].z, bx: p[i + 1].x, bz: p[i + 1].z, w: r.w };
      riverSegs.push(sgm);
      const ix0 = Math.floor((Math.min(sgm.ax, sgm.bx) - RMARGIN) / RCELL), ix1 = Math.floor((Math.max(sgm.ax, sgm.bx) + RMARGIN) / RCELL);
      const iz0 = Math.floor((Math.min(sgm.az, sgm.bz) - RMARGIN) / RCELL), iz1 = Math.floor((Math.max(sgm.az, sgm.bz) + RMARGIN) / RCELL);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const k = ix * 10000 + iz;
        let a = riverIdx.get(k);
        if (!a) { a = []; riverIdx.set(k, a); }
        a.push(sgm);
      }
    }
  }
}
export function riverDistance(x, z) {
  if (!riverSegs) buildRiverIndex();
  const a = riverIdx.get(Math.floor(x / RCELL) * 10000 + Math.floor(z / RCELL));
  if (!a) return 1e9;
  let best = 1e9;
  for (let i = 0; i < a.length; i++) {
    const g = a[i];
    const dx = g.bx - g.ax, dz = g.bz - g.az, l2 = dx * dx + dz * dz || 1;
    let t = ((x - g.ax) * dx + (z - g.az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = g.ax + dx * t - x, ez = g.az + dz * t - z;
    const d = Math.sqrt(ex * ex + ez * ez) - g.w;
    if (d < best) best = d;
  }
  return best;
}

// Natural terrain before roads/cities/rivers. Returns height; sets NAT.sea.
export const NAT = { sea: false, coastD: 999, inside: true };
export function naturalHeight(x, z) {
  const { lon, lat } = toLonLat(x, z);
  const south = smoothstep(52.7, 51.0, lat);
  let h = 3 + south * 20 + fbm(x / 430 + 3.1, z / 430 - 7.7, 4) * (5 + south * 24);

  for (let i = 0; i < HILLS.length; i++) {
    const m = HILLS[i];
    const dx = x - m.x, dz = z - m.z;
    const c = Math.cos(m.rot), s = Math.sin(m.rot);
    const lx = (dx * c - dz * s) / m.sx, lz = (dx * s + dz * c) / m.sz;
    const e = lx * lx + lz * lz;
    if (e < 5) {
      const f = Math.exp(-e * 1.4);
      h += m.h * f * (0.45 + 0.75 * ridged(x / 150 + i * 13.1, z / 150 - i * 3.7, 3));
    }
  }

  if (lat < 47.95 && lon > ALPS.lonA - 1.2 && lon < ALPS.lonB + 1.2) {
    const a = smoothstep(ALPS.latTop, ALPS.latFull, lat) *
      smoothstep(ALPS.lonA - 0.9, ALPS.lonA + 0.1, lon) * smoothstep(ALPS.lonB + 0.9, ALPS.lonB - 0.1, lon);
    if (a > 0) {
      h += a * ALPS.h * (0.3 + 0.85 * ridged(x / 330 + 5.5, z / 330 + 1.3, 3));
      const zd = Math.hypot(x - ZUGSPITZE.x, z - ZUGSPITZE.z);
      h += ZUGSPITZE.h * Math.exp(-(zd * zd) / (ZUGSPITZE.r * ZUGSPITZE.r)) * a;
    }
  }

  // Rivers and lakes sit in broad valleys close to sea level.
  const rd = riverDistance(x, z);
  if (rd < RMARGIN) {
    const f = smoothstep(0, 340, rd);
    h = lerp(1.6 + (h - 1.6) * 0.12, h, f);
  }
  for (let i = 0; i < LAKES.length; i++) {
    const l = LAKES[i];
    const dx = (x - l.x) / l.rx, dz = (z - l.z) / l.rz;
    const e = Math.sqrt(dx * dx + dz * dz);
    if (e < 4 && !l.city) h = lerp(1.2 + (h - 1.2) * 0.1, h, smoothstep(1, 4, e));
  }

  const bi = borderInfo(x, z);
  NAT.inside = bi.inside;
  NAT.coastD = bi.t !== 'l' ? bi.d : 999;
  NAT.sea = false;
  if (!bi.inside && (bi.t === 'c' || (bi.t === 'k' && bi.d < 120))) {
    NAT.sea = true;
    NAT.coastD = -bi.d;
    return -1.5 - Math.min(bi.d * 0.06, 22);
  }
  if (bi.t !== 'l' && bi.d < 70) {
    h = lerp(0.9, h, smoothstep(4, 70, bi.d));
  }
  return h;
}

// Low-frequency version used for road profiles (ignores fine detail).
export function roadBaseHeight(x, z) {
  return naturalHeight(x, z);
}

function chaikin(pts, iters) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
export { chaikin };

// Rasterise a polyline's distance field into grid arrays.
function rasterPolyline(pts, margin, cb) {
  const { X0, Z0, CELL, NX, NZ } = GRID;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const minX = Math.min(a.x, b.x) - margin, maxX = Math.max(a.x, b.x) + margin;
    const minZ = Math.min(a.z, b.z) - margin, maxZ = Math.max(a.z, b.z) + margin;
    const ix0 = clamp(Math.floor((minX - X0) / CELL), 0, NX - 1), ix1 = clamp(Math.ceil((maxX - X0) / CELL), 0, NX - 1);
    const iz0 = clamp(Math.floor((minZ - Z0) / CELL), 0, NZ - 1), iz1 = clamp(Math.ceil((maxZ - Z0) / CELL), 0, NZ - 1);
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
    for (let iz = iz0; iz <= iz1; iz++) {
      const z = Z0 + iz * CELL;
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = X0 + ix * CELL;
        let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = a.x + dx * t - x, cz = a.z + dz * t - z;
        const d = Math.sqrt(cx * cx + cz * cz);
        if (d < margin) cb(iz * NX + ix, d, i, t);
      }
    }
  }
}

export class Terrain {
  constructor() {
    const n = GRID.NX * GRID.NZ;
    this.h = new Float32Array(n);
    this.water = new Uint8Array(n);
    this.sea = new Uint8Array(n);
    this.inside = new Uint8Array(n);
    this.city = new Float32Array(n);
    this.roadD = new Float32Array(n).fill(999);
    this.roadH = new Float32Array(n);
    this.riverD = new Float32Array(n).fill(999);
    this.forest = new Float32Array(n);
    this.farm = new Float32Array(n);
  }

  // Step 1: natural heights
  computeNatural() {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    for (let iz = 0; iz < NZ; iz++) {
      const z = Z0 + iz * CELL;
      for (let ix = 0; ix < NX; ix++) {
        const x = X0 + ix * CELL;
        const i = iz * NX + ix;
        this.h[i] = naturalHeight(x, z);
        this.sea[i] = NAT.sea ? 1 : 0;
        this.water[i] = NAT.sea ? 1 : 0;
        this.inside[i] = NAT.inside ? 1 : 0;
      }
    }
  }

  // Step 2: roads (list of {pts:[{x,z,y}], half})
  applyRoads(roads) {
    for (const r of roads) {
      const pts = r.pts;
      rasterPolyline(pts, 64, (i, d, si, t) => {
        if (d < this.roadD[i]) {
          this.roadD[i] = d;
          this.roadH[i] = lerp(pts[si].y, pts[si + 1].y, t);
        }
      });
    }
    for (let i = 0; i < this.h.length; i++) {
      const d = this.roadD[i];
      if (d < 64 && !this.sea[i]) this.h[i] = lerp(this.roadH[i], this.h[i], smoothstep(24, 62, d));
    }
  }

  // Step 3: cities
  applyCities(cities) {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    for (const c of cities) {
      const R = c.r + 90;
      const ix0 = clamp(Math.floor((c.x - R - X0) / CELL), 0, NX - 1), ix1 = clamp(Math.ceil((c.x + R - X0) / CELL), 0, NX - 1);
      const iz0 = clamp(Math.floor((c.z - R - Z0) / CELL), 0, NZ - 1), iz1 = clamp(Math.ceil((c.z + R - Z0) / CELL), 0, NZ - 1);
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const i = iz * NX + ix;
          const x = X0 + ix * CELL, z = Z0 + iz * CELL;
          const d = Math.hypot(x - c.x, z - c.z);
          const t = c.pad ? smoothstep(c.r, c.r + 34, d) : smoothstep(c.r + 14, c.r + Math.min(85, c.r * 0.9), d);
          if (t < 1 && !this.sea[i]) {
            this.h[i] = lerp(c.y, this.h[i], t);
            if (!c.pad) this.city[i] = Math.max(this.city[i], 1 - smoothstep(c.r + 4, c.r + 22, d));
            else this.roadD[i] = Math.min(this.roadD[i], 30 + d);
          }
        }
      }
    }
  }

  // Asphalt only where the street grid actually is.
  applyCityMask(grids) {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    for (const id in grids) {
      const g = grids[id], c = g.city, S = g.S;
      const R = c.r + 40;
      const ix0 = clamp(Math.floor((c.x - R - X0) / CELL), 0, NX - 1), ix1 = clamp(Math.ceil((c.x + R - X0) / CELL), 0, NX - 1);
      const iz0 = clamp(Math.floor((c.z - R - Z0) / CELL), 0, NZ - 1), iz1 = clamp(Math.ceil((c.z + R - Z0) / CELL), 0, NZ - 1);
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const i = iz * NX + ix;
          const x = X0 + ix * CELL, z = Z0 + iz * CELL;
          const fi = Math.floor((x - c.x) / S), fj = Math.floor((z - c.z) / S);
          let d = 1e9;
          for (let dj = -1; dj <= 2; dj++) {
            for (let di = -1; di <= 2; di++) {
              const n = g.map.get(g.key(fi + di, fj + dj));
              if (!n) continue;
              d = Math.min(d, Math.hypot(x - n.x, z - n.z));
              const r = g.map.get(g.key(fi + di + 1, fj + dj));
              if (r && Math.abs(z - n.z) < d && x >= n.x && x <= r.x) d = Math.abs(z - n.z);
              const b = g.map.get(g.key(fi + di, fj + dj + 1));
              if (b && Math.abs(x - n.x) < d && z >= n.z && z <= b.z) d = Math.abs(x - n.x);
            }
          }
          const bl = g.blockMap.get(g.key(fi, fj));
          if (bl && x > bl.minX - 2 && x < bl.maxX + 2 && z > bl.minZ - 2 && z < bl.maxZ + 2) d = 0;
          const m = 1 - smoothstep(13, 24, d);
          if (this.city[i] > 0) this.city[i] = m;
        }
      }
    }
  }

  // Step 4: rivers and lakes
  applyWater() {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    for (const r of RIVERS) {
      const pts = chaikin(r.pts, 3);
      r.smooth = pts;
      rasterPolyline(pts, r.w + 110, (i, d) => {
        if (d < this.riverD[i]) this.riverD[i] = d;
        const inCity = this.city[i] > 0.05;
        const valley = inCity ? 5 : 16 + 0.6 * Math.max(0, this.h[i] - 4);
        if (d > r.w + valley) return;
        const t = smoothstep(r.w, r.w + valley, d);
        const bed = -2.2;
        const nh = lerp(bed, this.h[i], t);
        if (nh < this.h[i]) this.h[i] = nh;
        if (d < r.w + 2) this.water[i] = 1;
      });
    }
    for (const l of LAKES) {
      const R = Math.max(l.rx, l.rz) * 1.8;
      const ix0 = clamp(Math.floor((l.x - R - X0) / CELL), 0, NX - 1), ix1 = clamp(Math.ceil((l.x + R - X0) / CELL), 0, NX - 1);
      const iz0 = clamp(Math.floor((l.z - R - Z0) / CELL), 0, NZ - 1), iz1 = clamp(Math.ceil((l.z + R - Z0) / CELL), 0, NZ - 1);
      for (let iz = iz0; iz <= iz1; iz++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const i = iz * NX + ix;
          const x = X0 + ix * CELL, z = Z0 + iz * CELL;
          const dx = (x - l.x) / l.rx, dz = (z - l.z) / l.rz;
          const e = Math.sqrt(dx * dx + dz * dz) * (0.85 + 0.3 * vnoise(x / 40, z / 40));
          if (e < 1) {
            this.h[i] = Math.min(this.h[i], -0.6 - 2.5 * (1 - e));
            this.water[i] = 1;
          } else if (e < 1.7) {
            const lim = l.city ? 1.15 : 1.7;
            if (e < lim) this.h[i] = lerp(l.city ? -1 : 0.8, this.h[i], smoothstep(1, lim, e));
          }
        }
      }
    }
    // Everything that is not water must be above sea level.
    for (let i = 0; i < this.h.length; i++) {
      if (!this.water[i] && this.h[i] < 0.6) this.h[i] = 0.6;
      if (this.water[i] && this.h[i] > -0.4) this.h[i] = -0.4;
    }
  }

  // Step 5: vegetation masks
  computeMasks() {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    for (let iz = 0; iz < NZ; iz++) {
      for (let ix = 0; ix < NX; ix++) {
        const i = iz * NX + ix;
        const x = X0 + ix * CELL, z = Z0 + iz * CELL;
        const h = this.h[i];
        if (this.water[i] || this.city[i] > 0.02 || this.roadD[i] < 20 || this.riverD[i] < 30) {
          this.forest[i] = 0;
        } else {
          const hill = clamp((h - 25) / 70, 0, 1);
          const f = fbm(x / 520 + 40, z / 520 - 12, 3);
          let dens = smoothstep(0.56 - 0.2 * hill, 0.66 - 0.2 * hill, f);
          if (h > 210) dens *= 1 - smoothstep(210, 250, h);
          this.forest[i] = dens * smoothstep(20, 40, this.roadD[i]);
        }
        const rock = smoothstep(150, 200, h);
        this.farm[i] = (1 - this.forest[i]) * (1 - this.city[i]) * (1 - rock) * (this.water[i] ? 0 : 1) *
          (NAT_BEACH(this, i) ? 0 : 1);
      }
    }
  }

  index(ix, iz) { return iz * GRID.NX + ix; }

  // Exact height on the rendered triangle mesh.
  heightAt(x, z) {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    let fx = (x - X0) / CELL, fz = (z - Z0) / CELL;
    if (fx < 0) fx = 0; else if (fx > NX - 1.001) fx = NX - 1.001;
    if (fz < 0) fz = 0; else if (fz > NZ - 1.001) fz = NZ - 1.001;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const u = fx - ix, v = fz - iz;
    const i = iz * NX + ix;
    const ha = this.h[i], hd = this.h[i + 1], hb = this.h[i + NX], hc = this.h[i + NX + 1];
    // triangles (a,b,d) and (b,c,d) where a=(0,0) d=(1,0) b=(0,1) c=(1,1)
    if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
    return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  sample(arr, x, z) {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    const fx = clamp((x - X0) / CELL, 0, NX - 1.001), fz = clamp((z - Z0) / CELL, 0, NZ - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
    const i = iz * NX + ix;
    return lerp(lerp(arr[i], arr[i + 1], u), lerp(arr[i + NX], arr[i + NX + 1], u), v);
  }
  nearest(arr, x, z) {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    const ix = clamp(Math.round((x - X0) / CELL), 0, NX - 1), iz = clamp(Math.round((z - Z0) / CELL), 0, NZ - 1);
    return arr[iz * NX + ix];
  }

  normalAt(x, z, out) {
    const e = 2;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    out.set(-hx, 2 * e, -hz).normalize();
    return out;
  }

  buildMesh(quality) {
    const { X0, Z0, CELL, NX, NZ } = GRID;
    const n = NX * NZ;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), farm = new Float32Array(n);
    const c = new THREE.Color();
    const grass = new THREE.Color(0x5b8a36), forestC = new THREE.Color(0x2c4a1f), rockC = new THREE.Color(0x7d766c),
      snowC = new THREE.Color(0xf4f6fa), sandC = new THREE.Color(0xd8c89a), cityC = new THREE.Color(0x505055),
      bedC = new THREE.Color(0x6f6a50), shoulder = new THREE.Color(0x6b7a4a), alpine = new THREE.Color(0x6d8a45);
    const rng = mulberry32(7);
    for (let iz = 0; iz < NZ; iz++) {
      for (let ix = 0; ix < NX; ix++) {
        const i = iz * NX + ix;
        const x = X0 + ix * CELL, z = Z0 + iz * CELL;
        const h = this.h[i];
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        // slope
        const hl = this.h[i - (ix > 0 ? 1 : 0)], hr = this.h[i + (ix < NX - 1 ? 1 : 0)];
        const hu = this.h[i - (iz > 0 ? NX : 0)], hdn = this.h[i + (iz < NZ - 1 ? NX : 0)];
        const slope = Math.hypot(hr - hl, hdn - hu) / (2 * CELL);
        if (this.water[i]) {
          c.copy(bedC);
          if (this.city[i] > 0.3) c.setRGB(0.16, 0.19, 0.21);
        } else {
          c.copy(grass);
          const v = vnoise(x / 90, z / 90);
          c.offsetHSL((v - 0.5) * 0.04, 0, (v - 0.5) * 0.06);
          if (h > 120) c.lerp(alpine, smoothstep(120, 170, h));
          c.lerp(forestC, this.forest[i]);
          c.lerp(rockC, clamp(smoothstep(0.45, 0.9, slope) + smoothstep(170, 230, h) * 0.8, 0, 1));
          c.lerp(snowC, smoothstep(235, 275, h + (rng() - 0.5) * 20));
          if (NAT_BEACH(this, i)) c.lerp(sandC, 0.85);
          if (this.roadD[i] < 30) c.lerp(shoulder, (1 - smoothstep(12, 30, this.roadD[i])) * 0.6);
          c.lerp(cityC, this.city[i]);
          if (!this.inside[i]) {
            const l = (c.r + c.g + c.b) / 3;
            c.r = lerp(c.r, l, 0.35) * 0.92; c.g = lerp(c.g, l, 0.35) * 0.92; c.b = lerp(c.b, l, 0.35) * 0.92;
          }
        }
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        farm[i] = this.inside[i] ? this.farm[i] : this.farm[i] * 0.5;
      }
    }
    // Analytic normals from the heightfield (seamless across chunks)
    const nor = new Float32Array(n * 3);
    for (let iz = 0; iz < NZ; iz++) {
      for (let ix = 0; ix < NX; ix++) {
        const i = iz * NX + ix;
        const hl = this.h[ix > 0 ? i - 1 : i], hr = this.h[ix < NX - 1 ? i + 1 : i];
        const hu = this.h[iz > 0 ? i - NX : i], hd = this.h[iz < NZ - 1 ? i + NX : i];
        let nx = -(hr - hl) / (2 * CELL), nz = -(hd - hu) / (2 * CELL), ny = 1;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nor[i * 3] = nx / l; nor[i * 3 + 1] = ny / l; nor[i * 3 + 2] = nz / l;
      }
    }
    const geos = [];
    const CH = 60; // cells per chunk side
    for (let cz = 0; cz < NZ - 1; cz += CH) {
      for (let cx = 0; cx < NX - 1; cx += CH) {
        const w = Math.min(CH, NX - 1 - cx), hgt = Math.min(CH, NZ - 1 - cz);
        const vw = w + 1, vh = hgt + 1;
        const P = new Float32Array(vw * vh * 3), N = new Float32Array(vw * vh * 3), C = new Float32Array(vw * vh * 3), F = new Float32Array(vw * vh);
        for (let z = 0; z < vh; z++) {
          for (let x = 0; x < vw; x++) {
            const gi = (cz + z) * NX + (cx + x), li = z * vw + x;
            P[li * 3] = pos[gi * 3]; P[li * 3 + 1] = pos[gi * 3 + 1]; P[li * 3 + 2] = pos[gi * 3 + 2];
            N[li * 3] = nor[gi * 3]; N[li * 3 + 1] = nor[gi * 3 + 1]; N[li * 3 + 2] = nor[gi * 3 + 2];
            C[li * 3] = col[gi * 3]; C[li * 3 + 1] = col[gi * 3 + 1]; C[li * 3 + 2] = col[gi * 3 + 2];
            F[li] = farm[gi];
          }
        }
        const idx = new Uint32Array(w * hgt * 6);
        let k = 0;
        for (let z = 0; z < hgt; z++) {
          for (let x = 0; x < w; x++) {
            const a = z * vw + x, d = a + 1, b = a + vw, cc = b + 1;
            idx[k++] = a; idx[k++] = b; idx[k++] = d;
            idx[k++] = b; idx[k++] = cc; idx[k++] = d;
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
        geo.setAttribute('farm', new THREE.BufferAttribute(F, 1));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        geos.push(geo);
      }
    }

    const fieldTex = makeFieldTexture();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.fieldMap = { value: fieldTex };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float farm;\nvarying float vFarm;\nvarying vec2 vWXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFarm = farm;\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D fieldMap;\nvarying float vFarm;\nvarying vec2 vWXZ;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 fc = texture2D(fieldMap, vWXZ / 760.0).rgb;
          float gn = fract(sin(dot(floor(vWXZ * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb = mix(diffuseColor.rgb, fc, vFarm * 0.85) * (0.96 + 0.08 * gn);`);
    };
    const group = new THREE.Group();
    group.name = 'terrain';
    for (const geo of geos) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = quality !== 'low';
      group.add(mesh);
    }
    this.mesh = group;
    this.material = mat;
    this.fieldTex = fieldTex;
    return group;
  }

  // Small image of the map for minimap/fullscreen map
  mapColor(i, c) {
    const h = this.h[i];
    if (this.water[i]) return c.setRGB(0.33, 0.55, 0.78);
    if (this.city[i] > 0.4) return c.setRGB(0.62, 0.62, 0.64);
    c.setRGB(0.55, 0.72, 0.42);
    c.lerp(new THREE.Color(0.32, 0.52, 0.3), this.forest[i] * 0.9);
    if (h > 110) c.lerp(new THREE.Color(0.62, 0.58, 0.5), smoothstep(110, 200, h));
    if (h > 235) c.lerp(new THREE.Color(0.95, 0.95, 0.97), smoothstep(235, 270, h));
    if (!this.inside[i]) c.lerp(new THREE.Color(0.78, 0.78, 0.76), 0.55);
    return c;
  }
}

function NAT_BEACH(t, i) {
  return !t.water[i] && t.h[i] < 2.2 && t.inside[i] && t.city[i] < 0.1 && t.riverD[i] > 40 && t.roadD[i] > 25;
}

function makeFieldTexture() {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const rng = mulberry32(99);
    ctx.fillStyle = '#6f9a3c';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#8fae4b', '#9fb955', '#c9b553', '#e3d33c', '#7b6848', '#6f9a3c', '#a89452', '#86a845', '#5f8a38', '#b7a95a'];
    // Grid of fields with jitter so it tiles cleanly.
    const n = 9;
    const cs = w / n;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const split = rng() < 0.5;
        const parts = 1 + Math.floor(rng() * 3);
        for (let p = 0; p < parts; p++) {
          ctx.fillStyle = cols[Math.floor(rng() * cols.length)];
          if (split) ctx.fillRect(gx * cs, gy * cs + (p * cs) / parts, cs, cs / parts);
          else ctx.fillRect(gx * cs + (p * cs) / parts, gy * cs, cs / parts, cs);
          // furrows
          ctx.globalAlpha = 0.08;
          ctx.strokeStyle = '#000';
          for (let f = 0; f < 10; f++) {
            ctx.beginPath();
            if (split) { const yy = gy * cs + (p * cs) / parts + (f / 10) * (cs / parts); ctx.moveTo(gx * cs, yy); ctx.lineTo(gx * cs + cs, yy); }
            else { const xx = gx * cs + (p * cs) / parts + (f / 10) * (cs / parts); ctx.moveTo(xx, gy * cs); ctx.lineTo(xx, gy * cs + cs); }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    // hedgerows
    ctx.strokeStyle = 'rgba(40,70,25,0.7)';
    ctx.lineWidth = 3;
    for (let g = 0; g <= n; g++) {
      ctx.beginPath(); ctx.moveTo(g * cs, 0); ctx.lineTo(g * cs, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, g * cs); ctx.lineTo(w, g * cs); ctx.stroke();
    }
    // speckle
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (rng() - 0.5) * 14;
      img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: true, anisotropy: 8 });
}
