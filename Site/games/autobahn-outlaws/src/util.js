// Shared math, noise and geometry helpers.
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Deterministic PRNG so the world is identical on every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(ix, iz) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f + i * 17.31, z * f - i * 9.17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

export function ridged(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(2 * vnoise(x * f + i * 31.7, z * f + i * 11.3) - 1);
    s += a * v * v;
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return s / n;
}

// Distance from point to segment; also returns param t via out object.
export function segDist(px, pz, ax, az, bx, bz, out) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  const ex = px - cx, ez = pz - cz;
  if (out) { out.t = t; out.x = cx; out.z = cz; }
  return Math.sqrt(ex * ex + ez * ez);
}

// ---------- Geometry building ----------
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
export const UNIT_CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
export const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 8);
export const UNIT_SPHERE = new THREE.IcosahedronGeometry(0.5, 1);
export const UNIT_SPHERE_HI = new THREE.SphereGeometry(0.5, 16, 10);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color();

// Collects coloured primitives and merges them into one non-indexed geometry
// with a vertex colour attribute (one draw call per model).
export class Builder {
  constructor() { this.parts = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.parts.push({ geo, color, m: _m.clone() });
    return this;
  }
  box(w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0) {
    return this.add(UNIT_BOX, color, x, y, z, rx, ry, rz, w, h, d);
  }
  cyl(r, h, x, y, z, color, rx = 0, ry = 0, rz = 0, geo = UNIT_CYL) {
    return this.add(geo, color, x, y, z, rx, ry, rz, r * 2, h, r * 2);
  }
  geo(g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    return this.add(g, color, x, y, z, rx, ry, rz, 1, 1, 1);
  }
  build() { return mergeParts(this.parts); }
}

export function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map((p) => {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.m) g.applyMatrix4(p.m);
    total += g.attributes.position.count;
    return { g, color: p.color };
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color } of prepared) {
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    pos.set(pa, o * 3);
    nor.set(na, o * 3);
    _c.set(color);
    const n = g.attributes.position.count;
    for (let i = 0; i < n; i++) {
      col[(o + i) * 3] = _c.r; col[(o + i) * 3 + 1] = _c.g; col[(o + i) * 3 + 2] = _c.b;
    }
    o += n;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

// Extrude a 2D side profile (points as [along, up]) across a width, centred.
export function profileGeometry(points, width) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = opts.anisotropy || 4;
  if (opts.nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}

export function formatMoney(v) {
  return '€' + Math.floor(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
