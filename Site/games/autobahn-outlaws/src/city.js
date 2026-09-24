// Procedural German cities: Blockrand apartment blocks, downtown towers,
// Plattenbau in the east, houses with red roofs, parks, services and landmarks.
import * as THREE from 'three';
import { MeshBuf } from './meshbuf.js';
import { Builder, mulberry32, clamp } from './util.js';
import { facadeTextures, glassTextures, serviceSignTexture, particleTexture as glowTexture } from './textures.js';
import { LANDMARKS } from './landmarks.js';
import { RIVERS } from './geo.js';

const CITY_LANDMARKS = {
  berlin: [
    { type: 'brandenburg', near: [-1, 0] },
    { type: 'reichstag', near: [-2, -1] },
    { type: 'fernsehturm', near: [2, 0] },
    { type: 'rathaus', near: [1, 0], args: [0xa6503c, 0x5a4a44] },
    { type: 'wall', near: [3, 2] },
  ],
  hamburg: [
    { type: 'elbphilharmonie', near: [0, -1] },
    { type: 'rathaus', near: [-1, -2], args: [0x9c8a6a, 0x4e6b5d] },
  ],
  muenchen: [
    { type: 'frauenkirche_muc', near: [0, 0] },
    { type: 'rathaus', near: [1, 0], args: [0x8d8a80, 0x3c3c3c] },
    { type: 'arena', near: [0, -4] },
  ],
  koeln: [{ type: 'dom', near: [-1, -1] }, { type: 'rathaus', near: [-2, 1] }],
  frankfurt: [{ type: 'euro', near: [0, 0] }, { type: 'rathaus', near: [-1, 1], args: [0xa9624c, 0x5a3a33] }],
  dresden: [{ type: 'frauenkirche_dd', near: [0, -1] }],
  stuttgart: [{ type: 'tvtower', near: [2, 2] }, { type: 'rathaus', near: [0, 0] }],
  leipzig: [{ type: 'voelkerschlacht', near: [2, 2] }, { type: 'rathaus', near: [0, 0] }],
  nuernberg: [{ type: 'kaiserburg', near: [0, -2] }, { type: 'rathaus', near: [0, 0] }],
  kiel: [{ type: 'lighthouse', near: [0, -2] }, { type: 'rathaus', near: [0, 0] }],
  rostock: [{ type: 'lighthouse', near: [0, -2] }, { type: 'rathaus', near: [0, 0] }],
};

const EXTRA_SERVICES = {
  berlin: ['club', 'safehouse'],
  hamburg: ['safehouse'],
  frankfurt: ['bank', 'safehouse'],
  muenchen: ['safehouse'],
  koeln: ['safehouse'],
};

const SIGN_ROW = { hospital: 0, police: 1, gunshop: 2, respray: 3, safehouse: 4, fuel: 5, club: 6, bank: 7 };
const SERVICE_STYLE = {
  hospital: { color: 0xf0f0ee, h: 18 },
  police: { color: 0xd4dbe3, h: 14 },
  gunshop: { color: 0x6a5846, h: 8 },
  respray: { color: 0x8a8f96, h: 9 },
  safehouse: { color: 0xe5d9bf, h: 16 },
  club: { color: 0x3a3a44, h: 14 },
  bank: { color: 0x2f4f4a, h: 60, glass: true },
};

const PASTEL = [0xe8dcc0, 0xf0e6d0, 0xd9c7a5, 0xe6d3b3, 0xcfd6da, 0xe3c9b8, 0xd7a88f, 0xc4a484, 0xe0e0d8, 0xf2efe6, 0xb9a58c, 0xd8cfa0, 0xa8b8b0, 0xc9b99a, 0xdcc9a0, 0xefd9c6];
const BRICK = [0x9c5a45, 0x8e4f3a, 0xa3644c, 0x7f4636];
const ROOF_RED = [0xa0412d, 0x9a3b28, 0xb04a32, 0x8a3a2a];
const ROOF_GREY = [0x4a4d52, 0x55585e, 0x3f4247];

let _glowGeo = null;
function lampGlowGeo() {
  if (!_glowGeo) { _glowGeo = new THREE.PlaneGeometry(13, 13); _glowGeo.rotateX(-Math.PI / 2); }
  return _glowGeo;
}

export function sharedCityMaterials() {
  const f = facadeTextures(), g = glassTextures();
  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: f.map, emissiveMap: f.emissive, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: g.map, emissiveMap: g.emissive, emissive: 0xe8f0ff, emissiveIntensity: 0 });
  const miscMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x808070 });
  const signMat = new THREE.MeshLambertMaterial({ map: serviceSignTexture().tex, emissive: 0xffffff, emissiveMap: serviceSignTexture().tex, emissiveIntensity: 0.15 });
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  return { wallMat, glassMat, miscMat, lampMat, signMat, glowMat };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildCity(world, grid, mats) {
  const c = grid.city;
  const P = world.physics;
  const rng = mulberry32(hashStr(c.id));
  const R = () => rng();
  const pick = (a) => a[Math.floor(R() * a.length)];
  const wall = new MeshBuf(true), glass = new MeshBuf(true), misc = new MeshBuf(false), heads = new MeshBuf(false), signs = new MeshBuf(true);
  const lm = new Builder();
  const y0 = c.y, top = y0 + 0.2;
  const east = c.lon > 11.4 && c.lat > 50.3;
  const north = c.lat > 52.6;
  const blocks = grid.blocks.filter((b) => !b.removed);
  const byKey = grid.blockMap;
  const key = grid.key;
  grid.parking = [];
  grid.lampPositions = [];
  world.cityTrees = world.cityTrees || [];

  const free = (b) => b && !b.removed && b.type === 'normal';
  const nearestFree = (ni, nj) => {
    let best = null, bd = Infinity;
    for (const b of blocks) {
      if (!free(b)) continue;
      const d = (b.i - ni) ** 2 + (b.j - nj) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };

  // Landmarks
  for (const spec of CITY_LANDMARKS[c.id] || [{ type: 'rathaus', near: [0, 0] }]) {
    const b = nearestFree(spec.near[0], spec.near[1]);
    if (!b) continue;
    b.type = 'landmark';
    b.landmark = spec;
  }
  // Services
  const services = [];
  if (c.r >= 85) services.push('hospital', 'police', 'gunshop', 'respray');
  else if (c.r >= 60) services.push(R() < 0.5 ? 'gunshop' : 'respray');
  for (const s of EXTRA_SERVICES[c.id] || []) services.push(s);
  for (const s of services) {
    const cands = blocks.filter((b) => free(b) && Math.hypot(b.cx - c.x, b.cz - c.z) / c.r > 0.2 && Math.hypot(b.cx - c.x, b.cz - c.z) / c.r < 0.85 && byKey.get(key(b.i, b.j - 1)) !== undefined);
    const b = cands.length ? cands[Math.floor(R() * cands.length)] : null;
    if (!b) continue;
    b.type = 'service';
    b.service = s;
  }
  // Harbour in Hamburg (south bank), parks elsewhere
  for (const b of blocks) {
    if (b.type !== 'normal') continue;
    if (c.id === 'hamburg' && b.j >= 1 && b.j <= 2 && Math.abs(b.i) <= 3) { b.type = 'harbor'; continue; }
    const t = Math.hypot(b.cx - c.x, b.cz - c.z) / c.r;
    if (R() < (t > 0.6 ? 0.13 : 0.07)) b.type = 'park';
  }

  const sidewalk = 0xa3a39c, curb = 0x8c8c86;
  for (const b of blocks) {
    // Sidewalk slab
    misc.box(b.minX, y0 - 0.6, b.minZ, b.maxX, top, b.maxZ, b.type === 'park' ? 0x5f8f3e : sidewalk);
    if (b.type !== 'park') misc.box(b.minX + 2.6, top, b.minZ + 2.6, b.maxX - 2.6, top + 0.02, b.maxZ - 2.6, 0x8f8f89);
    P.addBox(b.minX, b.minZ, b.maxX, b.maxZ, y0 - 3, top, { slab: true });
    const lx0 = b.minX + 3, lx1 = b.maxX - 3, lz0 = b.minZ + 3, lz1 = b.maxZ - 3;
    const t = Math.hypot(b.cx - c.x, b.cz - c.z) / c.r;

    // Street lamps at corners
    for (const [lx, lz] of [[b.minX + 0.7, b.minZ + 0.7], [b.maxX - 0.7, b.minZ + 0.7], [b.maxX - 0.7, b.maxZ - 0.7], [b.minX + 0.7, b.maxZ - 0.7]]) {
      misc.box(lx - 0.09, top, lz - 0.09, lx + 0.09, top + 6, lz + 0.09, 0x3d4045);
      heads.box(lx - 0.35, top + 5.8, lz - 0.35, lx + 0.35, top + 6.15, lz + 0.35, 0xffffff, true, true);
      P.addCircle(lx, lz, 0.15, top, top + 6, { lamp: true });
      grid.lampPositions.push({ x: lx, z: lz });
    }
    // Parking spots: along north and south edges on the street
    if (R() < 0.8) grid.parking.push({ x: b.cx + (R() - 0.5) * 16, z: b.minZ - 1.3, y: y0, heading: Math.PI / 2 });
    if (R() < 0.8) grid.parking.push({ x: b.cx + (R() - 0.5) * 16, z: b.maxZ + 1.3, y: y0, heading: -Math.PI / 2 });
    if (R() < 0.5) grid.parking.push({ x: b.maxX + 1.3, z: b.cz + (R() - 0.5) * 16, y: y0, heading: 0 });

    // Street trees on outer blocks
    if (t > 0.35 && b.type !== 'harbor') {
      for (let k = 0; k < 3; k++) {
        const side = Math.floor(R() * 4);
        const u = 0.25 + R() * 0.5;
        let tx, tz;
        if (side === 0) { tx = b.minX + (b.maxX - b.minX) * u; tz = b.minZ + 1.4; }
        else if (side === 1) { tx = b.maxX - 1.4; tz = b.minZ + (b.maxZ - b.minZ) * u; }
        else if (side === 2) { tx = b.minX + (b.maxX - b.minX) * u; tz = b.maxZ - 1.4; }
        else { tx = b.minX + 1.4; tz = b.minZ + (b.maxZ - b.minZ) * u; }
        world.cityTrees.push({ x: tx, z: tz, y: top, s: 0.6 + R() * 0.25, kind: 1 });
        P.addCircle(tx, tz, 0.3, top, top + 6);
      }
    }

    if (b.type === 'landmark') {
      const fn = LANDMARKS[b.landmark.type];
      if (b.landmark.type === 'wall') fn(lm, P, b.minX + 2, b.maxZ - 1.2, b.maxX - 2, top);
      else fn(lm, P, b.cx, top, b.cz, ...(b.landmark.args || []));
      if (b.landmark.type !== 'wall') world.landmarkSpots.push({ type: b.landmark.type, city: c.id, x: b.cx, z: b.cz, y: top });
      else building(b.minX + 3, b.minZ + 3, b.maxX - 3, b.maxZ - 12, 12, pick(PASTEL), 'gable');
      continue;
    }
    if (b.type === 'park') {
      const n = 4 + Math.floor(R() * 5);
      for (let k = 0; k < n; k++) {
        const tx = lx0 + R() * (lx1 - lx0), tz = lz0 + R() * (lz1 - lz0);
        world.cityTrees.push({ x: tx, z: tz, y: top, s: 0.8 + R() * 0.5, kind: R() < 0.3 ? 0 : 1 });
        P.addCircle(tx, tz, 0.35, top, top + 8);
      }
      // path cross
      misc.box(b.cx - 1.2, top, b.minZ, b.cx + 1.2, top + 0.03, b.maxZ, 0xc2b28f);
      misc.box(b.minX, top, b.cz - 1.2, b.maxX, top + 0.03, b.cz + 1.2, 0xc2b28f);
      if (R() < 0.5) {
        // fountain
        misc.box(b.cx - 2.5, top, b.cz - 2.5, b.cx + 2.5, top + 0.6, b.cz + 2.5, 0xb8b8b0);
        misc.box(b.cx - 2.1, top + 0.6, b.cz - 2.1, b.cx + 2.1, top + 0.62, b.cz + 2.1, 0x4f86b8);
        P.addBox(b.cx - 2.5, b.cz - 2.5, b.cx + 2.5, b.cz + 2.5, top - 0.2, top + 0.6);
      }
      continue;
    }
    if (b.type === 'harbor') {
      LANDMARKS.containers(lm, P, lx0, lz0 + 10, lx1, lz1, top);
      if ((b.i & 1) === 0) LANDMARKS.crane(lm, P, b.cx, top, b.minZ + 8);
      continue;
    }
    if (b.type === 'service') {
      const st = SERVICE_STYLE[b.service];
      const bh = st.h;
      const x0 = lx0, x1 = lx1, z0 = lz0, z1 = b.service === 'bank' ? lz1 : lz0 + 18;
      building(x0, z0, x1, z1, bh, st.color, 'flat', st.glass);
      if (b.service === 'police') misc.box(x0 - 0.05, top + 3.2, z0 - 0.05, x1 + 0.05, top + 4.0, z1 + 0.05, 0x1f4f9a, false);
      if (b.service === 'hospital') {
        misc.box(b.cx - 0.6, top + bh, b.cz - 3, b.cx + 0.6, top + bh + 0.2, b.cz - 3 + 6, 0xd62020);
      }
      // Sign above the door facing north (-z)
      const row = SIGN_ROW[b.service];
      const rows = serviceSignTexture().rows;
      const v1 = 1 - row / rows, v0 = v1 - 1 / rows;
      const sw = 11, sh = 2.6, sy = top + 4.6, sz = z0 - 0.08;
      signs.quad([b.cx + sw / 2, sy, sz], [b.cx - sw / 2, sy, sz], [b.cx - sw / 2, sy + sh, sz], [b.cx + sw / 2, sy + sh, sz], 0xffffff,
        [[0, v0], [1, v0], [1, v1], [0, v1]], [0, 0, -1]);
      world.services.push({ type: b.service, city: c.id, x: b.cx, z: b.minZ + 1.6, y: top, block: b });
      // rest of the block: small houses
      if (b.service !== 'bank') building(x0, z1 + 3, x1, lz1, 8 + R() * 4, pick(PASTEL), 'gable');
      continue;
    }

    // ---------- Normal blocks ----------
    const tall = c.tall;
    const downtown = t < 0.28 + 0.08 * (tall - 1);
    if (downtown) {
      const layout = R();
      const parts = layout < 0.35 ? [[lx0, lz0, lx1, lz1]] : layout < 0.7
        ? (R() < 0.5 ? [[lx0, lz0, (lx0 + lx1) / 2 - 1, lz1], [(lx0 + lx1) / 2 + 1, lz0, lx1, lz1]] : [[lx0, lz0, lx1, (lz0 + lz1) / 2 - 1], [lx0, (lz0 + lz1) / 2 + 1, lx1, lz1]])
        : [[lx0, lz0, (lx0 + lx1) / 2 - 1, (lz0 + lz1) / 2 - 1], [(lx0 + lx1) / 2 + 1, lz0, lx1, (lz0 + lz1) / 2 - 1], [lx0, (lz0 + lz1) / 2 + 1, (lx0 + lx1) / 2 - 1, lz1], [(lx0 + lx1) / 2 + 1, (lz0 + lz1) / 2 + 1, lx1, lz1]];
      for (const [a, bb, cc, d] of parts) {
        let h = (20 + R() * 26) * (tall > 1.5 ? tall * (1.35 - t * 2) : tall * (1.2 - t));
        h = clamp(h, 14, 170);
        const isGlass = h > 42 || R() < 0.25;
        building(a, bb, cc, d, h, isGlass ? pick([0xb8c8d8, 0xa0b4c8, 0xc8d4dc, 0x9fb0a8]) : pick(PASTEL), 'flat', isGlass);
        if (h > 50 && R() < 0.6) {
          const inset = 3;
          building(a + inset, bb + inset, cc - inset, d - inset, h * 0.12, 0xb0bcc8, 'flat', true, h);
        }
      }
    } else if (east && t > 0.6 && R() < 0.45) {
      // Plattenbau
      const alongX = R() < 0.5;
      if (alongX) building(lx0, (lz0 + lz1) / 2 - 6, lx1, (lz0 + lz1) / 2 + 6, 24 + Math.floor(R() * 4) * 3, pick([0xd8d2c0, 0xc9c5b8, 0xe0d6b8, 0xbfc7c9]), 'flat', false, 0, 2.8);
      else building((lx0 + lx1) / 2 - 6, lz0, (lx0 + lx1) / 2 + 6, lz1, 24 + Math.floor(R() * 4) * 3, pick([0xd8d2c0, 0xc9c5b8, 0xe0d6b8]), 'flat', false, 0, 2.8);
    } else if (t < 0.78) {
      // Blockrand: perimeter block with courtyard
      const D = 10.5;
      const strips = [
        [lx0, lz0, lx1, lz0 + D, 'x'],
        [lx0, lz1 - D, lx1, lz1, 'x'],
        [lx0, lz0 + D, lx0 + D, lz1 - D, 'z'],
        [lx1 - D, lz0 + D, lx1, lz1 - D, 'z'],
      ];
      const baseH = 13 + R() * 6;
      const roofStyle = R() < 0.55 ? 'gable' : 'flat';
      for (const [a, bb, cc, d, ax] of strips) {
        const L = ax === 'x' ? cc - a : d - bb;
        const n = L > 20 ? 1 + Math.floor(R() * 3) : 1;
        for (let k = 0; k < n; k++) {
          const s0 = k / n, s1 = (k + 1) / n;
          const h = baseH + (R() - 0.5) * 4;
          const col = north && R() < 0.5 ? pick(BRICK) : pick(PASTEL);
          if (ax === 'x') building(a + L * s0, bb, a + L * s1, d, h, col, roofStyle);
          else building(a, bb + L * s0, cc, bb + L * s1, h, col, roofStyle);
        }
      }
      world.cityTrees.push({ x: b.cx, z: b.cz, y: top, s: 0.7, kind: 1 });
    } else {
      const r = R();
      if (r < 0.14) {
        // warehouse / supermarket
        building(lx0 + 1, lz0 + 4, lx1 - 1, lz1 - 1, 7 + R() * 3, pick([0x9aa3ab, 0x7f8f9f, 0xb0a890, 0x8c9a8c]), 'flat');
      } else {
        // detached houses with red roofs
        const q = [[lx0, lz0], [(lx0 + lx1) / 2, lz0], [lx0, (lz0 + lz1) / 2], [(lx0 + lx1) / 2, (lz0 + lz1) / 2]];
        const qs = (lx1 - lx0) / 2;
        for (const [qx, qz] of q) {
          if (R() < 0.12) { world.cityTrees.push({ x: qx + qs / 2, z: qz + qs / 2, y: top, s: 0.9, kind: R() < 0.5 ? 0 : 1 }); continue; }
          const w = 9 + R() * 3, d = 8 + R() * 3;
          const hx = qx + (qs - w) / 2, hz = qz + (qs - d) / 2;
          building(hx, hz, hx + w, hz + d, 5.5 + R() * 3, pick(PASTEL), 'gable', false, 0, 2.9, pick(ROOF_RED));
          misc.box(qx + 0.5, top, qz + 0.5, qx + qs - 0.5, top + 0.04, qz + qs - 0.5, 0x6a9a48, true);
        }
      }
    }
  }

  function building(x0, z0, x1, z1, h, color, roof, isGlass = false, baseOff = 0, floorH = 3.2, roofColor) {
    if (x1 - x0 < 2 || z1 - z0 < 2) return;
    const yb = top + baseOff, yt = yb + h;
    const buf = isGlass ? glass : wall;
    const uOff = Math.floor(R() * 8) * 3.5;
    buf.wallLoop(x0, z0, x1, z1, yb, yt, color, { u0: uOff, sx: 3.5 * 8, sy: floorH * 8 });
    const rc = roofColor || (roof === 'gable' ? (R() < 0.7 ? pick(ROOF_RED) : pick(ROOF_GREY)) : 0x77756f);
    if (roof === 'gable') {
      const alongX = x1 - x0 >= z1 - z0;
      const rh = Math.min(x1 - x0, z1 - z0) * 0.45;
      const yr = yt + rh;
      if (alongX) {
        const zm = (z0 + z1) / 2;
        misc.quad([x1, yt, z0], [x0, yt, z0], [x0, yr, zm], [x1, yr, zm], rc, null, [0, 1, -1]);
        misc.quad([x0, yt, z1], [x1, yt, z1], [x1, yr, zm], [x0, yr, zm], rc, null, [0, 1, 1]);
        misc.tri([x1, yt, z1], [x1, yt, z0], [x1, yr, zm], color, null, null, null, [1, 0, 0]);
        misc.tri([x0, yt, z0], [x0, yt, z1], [x0, yr, zm], color, null, null, null, [-1, 0, 0]);
      } else {
        const xm = (x0 + x1) / 2;
        misc.quad([x0, yt, z0], [x0, yt, z1], [xm, yr, z1], [xm, yr, z0], rc, null, [-1, 1, 0]);
        misc.quad([x1, yt, z1], [x1, yt, z0], [xm, yr, z0], [xm, yr, z1], rc, null, [1, 1, 0]);
        misc.tri([x0, yt, z1], [x1, yt, z1], [xm, yr, z1], color, null, null, null, [0, 0, 1]);
        misc.tri([x1, yt, z0], [x0, yt, z0], [xm, yr, z0], color, null, null, null, [0, 0, -1]);
      }
      P.addBox(x0, z0, x1, z1, yb - 1, yt + rh * 0.5, { building: true });
    } else {
      misc.quad([x0, yt, z1], [x1, yt, z1], [x1, yt, z0], [x0, yt, z0], rc, null, [0, 1, 0]);
      // parapet
      misc.box(x0, yt, z0, x1, yt + 0.6, z0 + 0.3, 0x8a8880);
      misc.box(x0, yt, z1 - 0.3, x1, yt + 0.6, z1, 0x8a8880);
      if (h > 20 && R() < 0.5) misc.box((x0 + x1) / 2 - 2, yt, (z0 + z1) / 2 - 1.5, (x0 + x1) / 2 + 2, yt + 2.2, (z0 + z1) / 2 + 1.5, 0x9a9890);
      P.addBox(x0, z0, x1, z1, yb - 1, yt, { building: true });
    }
  }

  const group = new THREE.Group();
  group.name = 'city-' + c.id;
  const add = (buf, mat, shadow = true) => {
    if (!buf.count && !(buf.parts && buf.parts.length)) return;
    const geo = buf.toGeometry ? buf.toGeometry() : buf.build();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    group.add(m);
  };
  add(wall, mats.wallMat);
  add(glass, mats.glassMat);
  add(misc, mats.miscMat);
  add(heads, mats.lampMat, false);
  add(signs, mats.signMat, false);
  if (lm.parts.length) add(lm, mats.miscMat);
  // Pools of lamp light on the ground (visible at night)
  if (grid.lampPositions.length) {
    const im = new THREE.InstancedMesh(lampGlowGeo(), mats.glowMat, grid.lampPositions.length);
    const m4 = new THREE.Matrix4();
    grid.lampPositions.forEach((p, i) => { m4.makeTranslation(p.x, top + 0.06, p.z); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere();
    im.renderOrder = 3;
    group.add(im);
  }
  group.userData.city = c;
  return group;
}

// Distance from point to nearest river (used for harbour/boat spawns)
export function nearestRiverDist(x, z) {
  let best = Infinity;
  for (const r of RIVERS) {
    const p = r.smooth || r.pts;
    for (let i = 0; i < p.length - 1; i++) {
      const ax = p[i].x, az = p[i].z, bx = p[i + 1].x, bz = p[i + 1].z;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z) - r.w;
      if (d < best) best = d;
    }
  }
  return best;
}
