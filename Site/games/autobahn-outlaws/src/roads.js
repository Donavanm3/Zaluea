// Road network: city street grids + Autobahn links, meshes, bridges and A* routing.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, canvasTexture, Builder, segDist } from './util.js';
import { CITIES, CITY_BY_ID, AUTOBAHN_LINKS, RIVERS, LAKES, borderInfo, REAL_KM_PER_M } from './geo.js';
import { naturalHeight, chaikin } from './terrain.js';

export const CITY_S = 50; // grid spacing
export const CITY_HALF = 6; // half road width in cities

export function riverSmooth() {
  for (const r of RIVERS) if (!r.smooth) r.smooth = chaikin(r.pts, 3);
}

// Plan-time water test (before the terrain grid exists).
export function isWaterPlan(x, z, margin = 6) {
  const bi = borderInfo(x, z);
  if (!bi.inside && bi.t !== 'l' && bi.d > 0) return true;
  if (bi.inside && bi.t !== 'l' && bi.d < margin) return true;
  for (const l of LAKES) {
    const dx = (x - l.x) / (l.rx * 1.15 + margin), dz = (z - l.z) / (l.rz * 1.15 + margin);
    if (dx * dx + dz * dz < 1) return true;
  }
  for (const r of RIVERS) {
    const p = r.smooth;
    for (let i = 0; i < p.length - 1; i++) {
      if (Math.abs(p[i].x - x) > 400 && Math.abs(p[i + 1].x - x) > 400) continue;
      if (segDist(x, z, p[i].x, p[i].z, p[i + 1].x, p[i + 1].z) < r.w + margin) return true;
    }
  }
  return false;
}

function resample(pts, step) {
  const out = [{ x: pts[0].x, z: pts[0].z }];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    let s = step - carry;
    while (s < L) {
      const t = s / L;
      out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
      s += step;
    }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1];
  const lo = out[out.length - 1];
  if (Math.hypot(last.x - lo.x, last.z - lo.z) > step * 0.3) out.push({ x: last.x, z: last.z });
  else { lo.x = last.x; lo.z = last.z; }
  return out;
}

export class RoadNet {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.grids = {}; // cityId -> grid info
    this.bridges = []; // deck segments
    this.signs = [];
  }

  addNode(x, z, y, city = null) {
    const n = { id: this.nodes.length, x, z, y, city, edges: [] };
    this.nodes.push(n);
    return n;
  }

  addEdge(a, b, pts, type, extra = {}) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const e = { id: this.edges.length, a: a.id, b: b.id, pts, cum, len: cum[cum.length - 1], type, ...extra };
    this.edges.push(e);
    a.edges.push(e.id);
    b.edges.push(e.id);
    return e;
  }

  other(e, nodeId) { return e.a === nodeId ? e.b : e.a; }

  // ---------- Planning ----------
  plan() {
    riverSmooth();
    for (const c of CITIES) {
      // City base height = smoothed natural height around the centre.
      let s = 0, n = 0;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, rr = k === 0 ? 0 : c.r * 0.6;
        s += naturalHeight(c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr);
        n++;
      }
      c.y = clamp(s / n, 2.5, 140);
      this.planGrid(c);
    }
    for (const L of AUTOBAHN_LINKS) this.planLink(L);
  }

  planGrid(c) {
    const S = CITY_S;
    c.r = Math.max(c.r, 75); // every town gets at least a 2x2 block core
    const n = Math.floor(c.r / S);
    const map = new Map();
    const key = (i, j) => i * 1000 + j;
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        if ((i * S) ** 2 + (j * S) ** 2 > c.r * c.r) continue;
        const node = this.addNode(c.x + i * S, c.z + j * S, c.y, c.id);
        node.gi = i; node.gj = j;
        map.set(key(i, j), node);
      }
    }
    const grid = { city: c, n, S, map, key, blocks: [], edges: [] };
    for (const node of map.values()) {
      const r = map.get(key(node.gi + 1, node.gj));
      const d = map.get(key(node.gi, node.gj + 1));
      if (r) grid.edges.push(this.addEdge(node, r, [{ x: node.x, z: node.z, y: c.y }, { x: r.x, z: r.z, y: c.y }], 'city', { half: CITY_HALF, lanes: 1, speed: 13, city: c.id }));
      if (d) grid.edges.push(this.addEdge(node, d, [{ x: node.x, z: node.z, y: c.y }, { x: d.x, z: d.z, y: c.y }], 'city', { half: CITY_HALF, lanes: 1, speed: 13, city: c.id }));
    }
    for (const node of map.values()) {
      const i = node.gi, j = node.gj;
      if (map.has(key(i + 1, j)) && map.has(key(i, j + 1)) && map.has(key(i + 1, j + 1))) {
        grid.blocks.push({
          i, j,
          minX: node.x + CITY_HALF, maxX: node.x + S - CITY_HALF,
          minZ: node.z + CITY_HALF, maxZ: node.z + S - CITY_HALF,
          cx: node.x + S / 2, cz: node.z + S / 2,
          type: 'normal', removed: false,
        });
      }
    }
    grid.blockMap = new Map(grid.blocks.map((b) => [key(b.i, b.j), b]));
    this.grids[c.id] = grid;
  }

  pickExit(c, target, used) {
    const grid = this.grids[c.id];
    const dx = target.x - c.x, dz = target.z - c.z, dl = Math.hypot(dx, dz);
    const ux = dx / dl, uz = dz / dl;
    let best = null, bs = -Infinity;
    for (const node of grid.map.values()) {
      if (node.edges.length >= 4) continue;
      const nx = node.x - c.x, nz = node.z - c.z, nl = Math.hypot(nx, nz) || 1;
      let s = (nx * ux + nz * uz) / nl + nl / c.r * 0.3;
      if (used.has(node.id)) s -= 0.35;
      if (isWaterPlan(node.x, node.z, 14)) s -= 5;
      if (s > bs) { bs = s; best = node; }
    }
    used.add(best.id);
    // outward axis direction
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let od = null, os = -Infinity;
    for (const [ax, az] of dirs) {
      if (grid.map.has(grid.key(best.gi + ax, best.gj + az))) continue;
      const s = ax * (target.x - best.x) + az * (target.z - best.z);
      if (s > os) { os = s; od = { x: ax, z: az }; }
    }
    if (!od) od = { x: ux, z: uz };
    return { node: best, out: od };
  }

  planLink(L) {
    this._used = this._used || new Set();
    const A = CITY_BY_ID[L.a], B = CITY_BY_ID[L.b];
    const first = L.via.length ? L.via[0] : B;
    const last = L.via.length ? L.via[L.via.length - 1] : A;
    const ea = this.pickExit(A, first, this._used);
    const eb = this.pickExit(B, last, this._used);
    const raw = [
      { x: ea.node.x, z: ea.node.z },
      { x: ea.node.x + ea.out.x * 30, z: ea.node.z + ea.out.z * 30 },
      { x: ea.node.x + ea.out.x * 80, z: ea.node.z + ea.out.z * 80 },
      ...L.via,
      { x: eb.node.x + eb.out.x * 80, z: eb.node.z + eb.out.z * 80 },
      { x: eb.node.x + eb.out.x * 30, z: eb.node.z + eb.out.z * 30 },
      { x: eb.node.x, z: eb.node.z },
    ];
    const pts = resample(chaikin(raw, 3), 12);
    // Height profile: natural height, smoothed, grade-limited.
    const n = pts.length;
    const h0 = pts.map((p) => Math.max(1.6, naturalHeight(p.x, p.z)));
    const h1 = new Array(n);
    const W = 10;
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -W; k <= W; k++) { const j = clamp(i + k, 0, n - 1); s += h0[j]; c++; }
      h1[i] = s / c;
    }
    const ramp = 9;
    for (let i = 0; i < n; i++) {
      h1[i] = lerp(A.y, h1[i], smoothstep(0, ramp, i));
      h1[i] = lerp(B.y, h1[i], smoothstep(0, ramp, n - 1 - i));
    }
    h1[0] = A.y; h1[n - 1] = B.y;
    const g = 0.07 * 12;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) h1[i] = clamp(h1[i], h1[i - 1] - g, h1[i - 1] + g);
      for (let i = n - 2; i >= 0; i--) h1[i] = clamp(h1[i], h1[i + 1] - g, h1[i + 1] + g);
    }
    for (let i = 0; i < n; i++) pts[i].y = Math.max(1.6, h1[i]);
    pts[0].y = A.y; pts[n - 1].y = B.y;
    const half = L.narrow ? 5 : 11;
    const e = this.addEdge(ea.node, eb.node, pts, L.narrow ? 'land' : 'autobahn', {
      name: L.name, half, lanes: L.narrow ? 1 : 2, speed: L.narrow ? 22 : 36, from: A.id, to: B.id,
    });
    return e;
  }

  roadsForTerrain() {
    return this.edges.filter((e) => e.type !== 'city').map((e) => ({ pts: e.pts, half: e.half }));
  }

  // After the terrain exists: blocks over water, bridges.
  finalize(terrain) {
    for (const id in this.grids) {
      const g = this.grids[id];
      for (const b of g.blocks) {
        const samples = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ], [b.cx, b.cz], [b.cx, b.minZ], [b.cx, b.maxZ], [b.minX, b.cz], [b.maxX, b.cz]];
        for (const [x, z] of samples) {
          if (terrain.heightAt(x, z) < g.city.y - 0.8) { b.removed = true; break; }
        }
      }
    }
    for (const e of this.edges) {
      const step = e.type === 'city' ? 5 : 6;
      let span = null;
      const flush = () => {
        if (span && span.length) this.bridges.push({ edge: e, pts: span, half: e.half + 0.6 });
        span = null;
      };
      // Walk along the polyline
      const L = e.len;
      let prevGap = false;
      const samples = [];
      for (let s = 0; s <= L + 0.01; s += step) samples.push(this.pointAt(e, Math.min(s, L)));
      if (samples.length < 2) samples.push(this.pointAt(e, L));
      for (let k = 0; k < samples.length; k++) {
        const p = samples[k];
        const gap = terrain.heightAt(p.x, p.z) < p.y - 1.0 ||
          (e.type !== 'city' && (terrain.heightAt(p.x + p.rx * e.half, p.z + p.rz * e.half) < p.y - 1.4 ||
            terrain.heightAt(p.x - p.rx * e.half, p.z - p.rz * e.half) < p.y - 1.4));
        if (gap) {
          if (!span) { span = []; if (k > 0) span.push(samples[k - 1]); }
          span.push(p);
        } else if (span) {
          span.push(p);
          flush();
        }
        prevGap = gap;
      }
      flush();
    }
  }

  pointAt(e, s) {
    const cum = e.cum, pts = e.pts;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1;
    const t = clamp((s - cum[lo]) / seg, 0, 1);
    const a = pts[lo], b = pts[hi];
    const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz) || 1;
    return {
      x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t),
      tx: dx / dl, tz: dz / dl, rx: -dz / dl, rz: dx / dl, seg: lo,
    };
  }

  // ---------- Queries ----------
  nearestNode(x, z, filter) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // Nearest point on any edge: {edge, s, d, point}
  nearestOnRoad(x, z, maxD = 200, filter) {
    let best = null, bd = maxD;
    const out = {};
    for (const e of this.edges) {
      if (filter && !filter(e)) continue;
      const p = e.pts;
      // bbox reject
      if (!e.bb) {
        let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
        for (const q of p) { a = Math.min(a, q.x); b = Math.max(b, q.x); c = Math.min(c, q.z); d = Math.max(d, q.z); }
        e.bb = [a, b, c, d];
      }
      if (x < e.bb[0] - bd || x > e.bb[1] + bd || z < e.bb[2] - bd || z > e.bb[3] + bd) continue;
      for (let i = 0; i < p.length - 1; i++) {
        const d = segDist(x, z, p[i].x, p[i].z, p[i + 1].x, p[i + 1].z, out);
        if (d < bd) {
          bd = d;
          best = { edge: e, s: e.cum[i] + out.t * (e.cum[i + 1] - e.cum[i]), d, x: out.x, z: out.z };
        }
      }
    }
    return best;
  }

  // A* over the node graph; returns list of node ids
  findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const N = this.nodes;
    const goal = N[toId];
    const g = new Map([[fromId, 0]]);
    const came = new Map();
    const open = [{ id: fromId, f: 0 }];
    const closed = new Set();
    let iter = 0;
    while (open.length && iter++ < 20000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur.id === toId) {
        const path = [toId];
        let c = toId;
        while (came.has(c)) { c = came.get(c); path.push(c); }
        return path.reverse();
      }
      if (closed.has(cur.id)) continue;
      closed.add(cur.id);
      const node = N[cur.id];
      for (const eid of node.edges) {
        const e = this.edges[eid];
        const nb = this.other(e, cur.id);
        if (closed.has(nb)) continue;
        // prefer autobahns slightly
        const cost = g.get(cur.id) + e.len * (e.type === 'autobahn' ? 0.8 : 1);
        if (cost < (g.get(nb) ?? Infinity)) {
          g.set(nb, cost);
          came.set(nb, cur.id);
          const nn = N[nb];
          open.push({ id: nb, f: cost + Math.hypot(nn.x - goal.x, nn.z - goal.z) * 0.8 });
        }
      }
    }
    return null;
  }

  edgeBetween(a, b) {
    for (const eid of this.nodes[a].edges) {
      const e = this.edges[eid];
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
    }
    return null;
  }

  // Polyline points of a node path (for GPS drawing)
  pathPoints(path) {
    const out = [];
    for (let i = 0; i < path.length - 1; i++) {
      const e = this.edgeBetween(path[i], path[i + 1]);
      if (!e) continue;
      const pts = e.a === path[i] ? e.pts : [...e.pts].reverse();
      for (const p of pts) out.push(p);
    }
    return out;
  }

  // ---------- Meshes ----------
  buildMeshes(terrain, scene, quality) {
    const group = new THREE.Group();
    group.name = 'roads';
    const abTex = makeAutobahnTexture(false), landTex = makeAutobahnTexture(true), cityTex = makeCityStreetTexture();
    const mk = (tex) => new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const abMat = mk(abTex), landMat = mk(landTex), cityMat = mk(cityTex);

    // Autobahn / land roads
    const ab = { pos: [], uv: [], idx: [], nrm: [] };
    const land = { pos: [], uv: [], idx: [], nrm: [] };
    const rail = new Builder();
    for (const e of this.edges) {
      if (e.type === 'city') continue;
      const buf = e.type === 'autobahn' ? ab : land;
      const P = e.pts, n = P.length;
      const trimA = 8, trimB = e.len - 8;
      let base = buf.pos.length / 3;
      let started = false;
      for (let i = 0; i < n; i++) {
        const s = e.cum[i];
        if (s < trimA || s > trimB) continue;
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const rx = -tz, rz = tx;
        const y = P[i].y + 0.06;
        const h = e.half;
        buf.pos.push(P[i].x - rx * h, y, P[i].z - rz * h, P[i].x + rx * h, y, P[i].z + rz * h);
        buf.nrm.push(0, 1, 0, 0, 1, 0);
        buf.uv.push(0, s / 24, 1, s / 24);
        if (started) {
          const k = buf.pos.length / 3 - 4;
          buf.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
        started = true;
      }
      // Median barrier for autobahns
      if (e.type === 'autobahn') {
        for (let i = 0; i < n - 1; i += 1) {
          const s = e.cum[i];
          if (s < 30 || s > e.len - 30) continue;
          const a = P[i], b = P[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
          rail.box(0.35, 0.8, L + 0.05, (a.x + b.x) / 2, (a.y + b.y) / 2 + 0.45, (a.z + b.z) / 2, 0xb8bcc0, Math.atan2(dx, dz), -Math.atan2(b.y - a.y, L));
        }
      }
    }
    const mkGeo = (b) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      return g;
    };
    const abMesh = new THREE.Mesh(mkGeo(ab), abMat);
    abMesh.receiveShadow = true;
    const landMesh = new THREE.Mesh(mkGeo(land), landMat);
    landMesh.receiveShadow = true;
    group.add(abMesh, landMesh);

    // City streets + zebra crossings
    const cs = { pos: [], uv: [], idx: [], nrm: [] };
    const quad = (x0, z0, x1, z1, y, u0, u1, v0, v1, alongX) => {
      const k = cs.pos.length / 3;
      if (alongX) {
        // road runs along x: u across (z), v along (x)
        cs.pos.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z1);
        cs.uv.push(u0, v0, u1, v0, u0, v1, u1, v1);
        cs.idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      } else {
        cs.pos.push(x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
        cs.uv.push(u0, v0, u1, v0, u0, v1, u1, v1);
        cs.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
      cs.nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    };
    for (const e of this.edges) {
      if (e.type !== 'city') continue;
      const a = e.pts[0], b = e.pts[1];
      const y = a.y + 0.03;
      const h = e.half;
      const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
      if (alongX) {
        const x0 = Math.min(a.x, b.x) + h, x1 = Math.max(a.x, b.x) - h;
        quad(x0 + 3, a.z - h, x1 - 3, a.z + h, y, 0, 0.5, 0, (x1 - x0 - 6) / 12, true);
        quad(x0, a.z - h, x0 + 3, a.z + h, y, 0.5, 1, 0, 0.25, true);
        quad(x1 - 3, a.z - h, x1, a.z + h, y, 0.5, 1, 0, 0.25, true);
      } else {
        const z0 = Math.min(a.z, b.z) + h, z1 = Math.max(a.z, b.z) - h;
        quad(a.x - h, z0 + 3, a.x + h, z1 - 3, y, 0, 0.5, 0, (z1 - z0 - 6) / 12, false);
        quad(a.x - h, z0, a.x + h, z0 + 3, y, 0.5, 1, 0, 0.25, false);
        quad(a.x - h, z1 - 3, a.x + h, z1, y, 0.5, 1, 0, 0.25, false);
      }
    }
    // plain asphalt patches for intersections
    for (const n of this.nodes) {
      if (!n.city) continue;
      quad(n.x - CITY_HALF, n.z - CITY_HALF, n.x + CITY_HALF, n.z + CITY_HALF, n.y + 0.03, 0.02, 0.12, 0, 0.5, false);
    }
    const cityMesh = new THREE.Mesh(mkGeo(cs), cityMat);
    cityMesh.receiveShadow = true;
    group.add(cityMesh);

    // Bridges
    const br = new Builder();
    for (const bspan of this.bridges) {
      const P = bspan.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
        if (L < 0.01) continue;
        const ry = Math.atan2(dx, dz);
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
        const W = bspan.half * 2;
        const pitch = -Math.atan2(b.y - a.y, L);
        br.box(W, 1.2, L + 0.3, mx, my - 0.62, mz, 0x9a9a96, ry, pitch);
        const rx = -dz / L, rz = dx / L;
        br.box(0.35, 1.0, L + 0.3, mx + rx * (W / 2 - 0.2), my + 0.45, mz + rz * (W / 2 - 0.2), 0x777a7e, ry, pitch);
        br.box(0.35, 1.0, L + 0.3, mx - rx * (W / 2 - 0.2), my + 0.45, mz - rz * (W / 2 - 0.2), 0x777a7e, ry, pitch);
        if (i % 4 === 1) {
          const ground = terrain.heightAt(mx, mz);
          const ph = my - 1.2 - ground + 2.5;
          if (ph > 0.5) br.box(W * 0.6, ph, 2.2, mx, ground - 2.5 + ph / 2, mz, 0x8a8a86, ry);
        }
        this.decks = this.decks || [];
        this.decks.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, ya: a.y, yb: b.y, half: bspan.half });
      }
    }
    if (br.parts.length) {
      const bm = new THREE.Mesh(br.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
      bm.castShadow = bm.receiveShadow = quality !== 'low';
      group.add(bm);
    }
    if (rail.parts.length) {
      const rm = new THREE.Mesh(rail.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
      group.add(rm);
    }
    this.decks = this.decks || [];
    group.add(this.buildSigns());
    scene.add(group);
    this.group = group;
    return group;
  }

  // Blue Autobahn direction signs + yellow city-entry signs from one atlas.
  buildSigns() {
    const COLS = 8, ROWS = 16, CW = 256, CH = 128;
    const entries = [];
    const signFor = (edge, fromNode, toCity) => {
      const toward = CITY_BY_ID[toCity];
      const km = Math.round(edge.len * REAL_KM_PER_M);
      entries.push({ kind: 'ab', text: edge.name, dest: toward.name, km, edge, fromNode });
    };
    for (const e of this.edges) {
      if (e.type === 'city' || entries.length > COLS * ROWS - CITIES.length - 2) continue;
      signFor(e, e.a, e.to);
      signFor(e, e.b, e.from);
    }
    for (const c of CITIES) entries.push({ kind: 'city', text: c.name, state: c.state, city: c });
    const count = Math.min(entries.length, COLS * ROWS);
    const tex = canvasTexture(COLS * CW, ROWS * CH, (ctx) => {
      for (let i = 0; i < count; i++) {
        const en = entries[i];
        const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH;
        if (en.kind === 'ab') {
          ctx.fillStyle = '#1b4fa0'; ctx.fillRect(x, y, CW, CH);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.strokeRect(x + 6, y + 6, CW - 12, CH - 12);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 40px Arial';
          ctx.textBaseline = 'middle';
          let name = en.dest.replace(' am Main', '').replace('-Partenkirchen', '');
          ctx.fillText(name, x + 18, y + 44, CW - 40);
          ctx.font = 'bold 32px Arial';
          ctx.fillText(en.km + ' km', x + 18, y + 92);
          // Autobahn number shield
          ctx.fillStyle = en.text.startsWith('B') ? '#f2c200' : '#fff';
          ctx.fillRect(x + CW - 88, y + 70, 70, 42);
          ctx.fillStyle = en.text.startsWith('B') ? '#000' : '#1b4fa0';
          ctx.font = 'bold 28px Arial';
          ctx.fillText(en.text, x + CW - 82, y + 92, 60);
        } else {
          ctx.fillStyle = '#f7c600'; ctx.fillRect(x, y, CW, CH);
          ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.strokeRect(x + 7, y + 7, CW - 14, CH - 14);
          ctx.fillStyle = '#111';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 34px Arial';
          ctx.fillText(en.text.replace(' am Main', ''), x + CW / 2, y + 50, CW - 30);
          ctx.font = '20px Arial';
          ctx.fillText(en.state.replace('Freie und Hansestadt ', '').replace('Freie Hansestadt ', ''), x + CW / 2, y + 90, CW - 30);
          ctx.textAlign = 'left';
        }
      }
    });
    const pos = [], uv = [], nrm = [], idx = [];
    const post = new Builder();
    const place = (i, x, z, y, yaw, w, h) => {
      const u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS;
      const v1 = 1 - Math.floor(i / COLS) / ROWS, v0 = v1 - 1 / ROWS;
      const fx = Math.sin(yaw), fz = Math.cos(yaw); // facing direction
      const rx = fz, rz = -fx; // sign's local +x when looking at it from the front
      const k = pos.length / 3;
      const hw = w / 2;
      // front face vertices (viewer stands at +facing)
      pos.push(x - rx * hw, y, z - rz * hw, x + rx * hw, y, z + rz * hw, x - rx * hw, y + h, z - rz * hw, x + rx * hw, y + h, z + rz * hw);
      uv.push(u0, v0, u1, v0, u0, v1, u1, v1);
      for (let q = 0; q < 4; q++) nrm.push(fx, 0, fz);
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
      post.box(0.12, y, 0.12, x - rx * (hw - 0.3), y / 2, z - rz * (hw - 0.3), 0x8a8d90);
      post.box(0.12, y, 0.12, x + rx * (hw - 0.3), y / 2, z + rz * (hw - 0.3), 0x8a8d90);
      post.box(w + 0.1, h + 0.1, 0.08, x - fx * 0.05, y + h / 2, z - fz * 0.05, 0x666a6e, yaw);
    };
    for (let i = 0; i < count; i++) {
      const en = entries[i];
      if (en.kind === 'ab') {
        const e = en.edge;
        const fromA = en.fromNode === e.a;
        const s = fromA ? 70 : e.len - 70;
        if (e.len < 160) continue;
        const p = this.pointAt(e, s);
        const dirx = fromA ? p.tx : -p.tx, dirz = fromA ? p.tz : -p.tz;
        const rgx = -dirz, rgz = dirx; // right side of travel
        const off = e.half + 2.5;
        const yaw = Math.atan2(-dirx, -dirz); // face oncoming traffic
        place(i, p.x + rgx * off, p.z + rgz * off, p.y + 2.2, yaw, 4.2, 2.1);
      }
    }
    // City entry signs at every autobahn endpoint
    for (const e of this.edges) {
      if (e.type === 'city') continue;
      for (const end of [0, 1]) {
        const cityId = end === 0 ? e.from : e.to;
        const ci = entries.findIndex((en) => en.kind === 'city' && en.city.id === cityId);
        if (ci < 0 || ci >= count) continue;
        const s = end === 0 ? 34 : e.len - 34;
        const p = this.pointAt(e, s);
        // traveling toward the city
        const dirx = end === 0 ? -p.tx : p.tx, dirz = end === 0 ? -p.tz : p.tz;
        const rgx = -dirz, rgz = dirx;
        const off = e.half + 2;
        place(ci, p.x + rgx * off, p.z + rgz * off, p.y + 1.5, Math.atan2(-dirx, -dirz), 2.6, 1.3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex })));
    if (post.parts.length) grp.add(new THREE.Mesh(post.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    return grp;
  }
}

function makeAutobahnTexture(narrow) {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4a4a4e';
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() - 0.5) * 18;
      img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#e8e8e8';
    const px = w / (narrow ? 10 : 22); // px per metre
    if (narrow) {
      // edge lines, dashed centre
      ctx.fillRect(0.6 * px, 0, 0.15 * px, h);
      ctx.fillRect(w - 0.75 * px, 0, 0.15 * px, h);
      for (let y = 0; y < h; y += h / 4) ctx.fillRect(w / 2 - 0.08 * px, y, 0.16 * px, h / 8);
    } else {
      const c = w / 2;
      // median
      ctx.fillStyle = '#6b6b6b';
      ctx.fillRect(c - 1 * px, 0, 2 * px, h);
      ctx.fillStyle = '#e8e8e8';
      for (const side of [-1, 1]) {
        ctx.fillRect(c + side * 1.1 * px - (side < 0 ? 0.3 * px : 0), 0, 0.3 * px, h);
        const dash = c + side * 4.85 * px - 0.075 * px;
        for (let y = 0; y < h; y += h / 2) ctx.fillRect(dash, y, 0.15 * px, h / 4);
        ctx.fillRect(c + side * 8.6 * px - (side < 0 ? 0.3 * px : 0), 0, 0.3 * px, h);
      }
    }
  }, { repeat: true, anisotropy: 8 });
}

function makeCityStreetTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#505055';
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() - 0.5) * 14;
      img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
    }
    ctx.putImageData(img, 0, 0);
    const half = w / 2;
    const px = half / 12;
    ctx.fillStyle = '#e6e6e6';
    // dashed centre line along v
    for (let y = 0; y < h; y += h / 2) ctx.fillRect(half / 2 - 0.08 * px, y, 0.16 * px, h / 4);
    // zebra: stripes across width, uniform along v
    for (let m = 1.5; m < 11; m += 1) ctx.fillRect(half + m * px, 0, 0.5 * px, h);
  }, { repeat: true, anisotropy: 8 });
}
