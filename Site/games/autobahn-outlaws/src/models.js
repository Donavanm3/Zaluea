// Low-poly models built from primitives: people, weapons and vehicles.
import * as THREE from 'three';
import { Builder, profileGeometry, UNIT_CYL, UNIT_SPHERE, pick } from './util.js';

export const charMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const vehMat = new THREE.MeshLambertMaterial({ vertexColors: true });
export const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
export const burntMat = new THREE.MeshLambertMaterial({ color: 0x222222 });

// ---------------- People ----------------
export const SKIN = [0xf1c9a5, 0xe0ac86, 0xc68e63, 0x8d5a3b, 0x5e3a24, 0xf5d4b8];
export const HAIR = [0x2b1d14, 0x4a3020, 0x8a6a3a, 0xd8c28a, 0x111111, 0x7a3a1a, 0xaaaaaa];
export const SHIRT = [0x2f4f8f, 0x8f2f2f, 0x2f7f4f, 0xe0e0e0, 0x333333, 0xc8a040, 0x6a3f8f, 0xd07030, 0x4aa0c0, 0x9a9a9a, 0xb03050, 0x305030];
export const PANTS = [0x22304a, 0x333333, 0x5a4a3a, 0x3a3a50, 0x7a7a70, 0x1a1a1a, 0x4a5a70];

export function randomLook() {
  return {
    skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), pants: pick(PANTS),
    shoes: pick([0x1a1a1a, 0x3a2a1a, 0xdddddd, 0x5a3a2a]), hairStyle: Math.random() < 0.45 ? 1 : Math.random() < 0.15 ? 2 : 0,
    female: Math.random() < 0.45, jacket: Math.random() < 0.4 ? pick([0x2a2a2a, 0x5a4030, 0x1f3050, 0x606060]) : null,
  };
}

export function buildHumanoid(look) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Builder();
  const shirt = look.jacket || look.shirt;
  const w = look.female ? 0.4 : 0.46;
  b.box(w, 0.36, 0.25, 0, 1.39, 0, shirt);
  b.box(w * 0.92, 0.26, 0.23, 0, 1.1, 0, look.jacket ? look.shirt : shirt);
  if (look.jacket) b.box(0.12, 0.5, 0.01, 0, 1.3, 0.128, look.shirt);
  b.box(0.36, 0.14, 0.22, 0, 0.95, 0, look.pants);
  if (look.vest) b.box(w + 0.02, 0.44, 0.27, 0, 1.3, 0, look.vest);
  b.box(0.11, 0.08, 0.11, 0, 1.6, 0, look.skin);
  b.box(0.23, 0.27, 0.24, 0, 1.76, 0, look.skin);
  b.box(0.04, 0.03, 0.01, 0.055, 1.79, 0.121, 0x1a1a1a);
  b.box(0.04, 0.03, 0.01, -0.055, 1.79, 0.121, 0x1a1a1a);
  b.box(0.06, 0.02, 0.01, 0, 1.69, 0.121, 0x8a4a3a);
  if (look.helmet) {
    b.box(0.27, 0.14, 0.28, 0, 1.9, 0, look.helmet);
    b.box(0.25, 0.06, 0.02, 0, 1.8, 0.13, 0x222222);
  } else if (look.cap) {
    b.box(0.26, 0.07, 0.27, 0, 1.92, 0, look.cap);
    b.box(0.24, 0.02, 0.1, 0, 1.885, 0.16, 0x111111);
    b.box(0.06, 0.04, 0.01, 0, 1.93, 0.136, 0xd4af37);
  } else if (look.hairStyle !== 2) {
    b.box(0.25, 0.08, 0.26, 0, 1.92, -0.005, look.hair);
    b.box(0.25, 0.18, 0.05, 0, 1.8, -0.12, look.hair);
    if (look.hairStyle === 1 || look.female) b.box(0.24, 0.3, 0.06, 0, 1.66, -0.13, look.hair);
  }
  const torso = new THREE.Mesh(b.build(), charMat);
  torso.castShadow = true;
  body.add(torso);

  const limb = (x, y, parts) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    const bb = new Builder();
    for (const p of parts) bb.box(...p);
    const m = new THREE.Mesh(bb.build(), charMat);
    m.castShadow = true;
    g.add(m);
    body.add(g);
    return g;
  };
  const sleeve = look.jacket || look.shirt;
  const armL = limb(0.29, 1.52, [[0.12, 0.3, 0.13, 0, -0.14, 0, sleeve], [0.1, 0.28, 0.11, 0, -0.43, 0, look.jacket ? sleeve : look.skin], [0.09, 0.1, 0.1, 0, -0.62, 0.01, look.skin]]);
  const armR = limb(-0.29, 1.52, [[0.12, 0.3, 0.13, 0, -0.14, 0, sleeve], [0.1, 0.28, 0.11, 0, -0.43, 0, look.jacket ? sleeve : look.skin], [0.09, 0.1, 0.1, 0, -0.62, 0.01, look.skin]]);
  const legL = limb(0.1, 0.94, [[0.17, 0.86, 0.19, 0, -0.43, 0, look.pants], [0.17, 0.09, 0.27, 0, -0.895, 0.04, look.shoes]]);
  const legR = limb(-0.1, 0.94, [[0.17, 0.86, 0.19, 0, -0.43, 0, look.pants], [0.17, 0.09, 0.27, 0, -0.895, 0.04, look.shoes]]);
  const gunSlot = new THREE.Group();
  gunSlot.position.set(0, -0.62, 0.02);
  gunSlot.rotation.x = Math.PI / 2;
  armR.add(gunSlot);
  return { root, body, armL, armR, legL, legR, gunSlot };
}

export function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
}

// ---------------- Weapons ----------------
const gunCache = {};
export function weaponModel(id) {
  if (gunCache[id]) return gunCache[id].clone();
  const b = new Builder();
  const blk = 0x1c1c1e, grey = 0x3a3a3e, wood = 0x6a4428;
  switch (id) {
    case 'pistol':
      b.box(0.045, 0.09, 0.2, 0, 0.03, 0.06, blk); b.box(0.04, 0.12, 0.05, 0, -0.04, 0, grey); break;
    case 'smg':
      b.box(0.05, 0.1, 0.34, 0, 0.03, 0.1, blk); b.box(0.04, 0.16, 0.04, 0, -0.08, 0.1, grey); b.box(0.04, 0.1, 0.05, 0, -0.04, -0.02, grey); break;
    case 'shotgun':
      b.box(0.05, 0.07, 0.8, 0, 0.04, 0.25, blk); b.box(0.06, 0.06, 0.25, 0, 0.0, 0.25, wood); b.box(0.05, 0.12, 0.25, 0, -0.02, -0.18, wood); break;
    case 'rifle':
      b.box(0.05, 0.1, 0.72, 0, 0.04, 0.2, blk); b.box(0.04, 0.18, 0.06, 0, -0.08, 0.14, grey); b.box(0.05, 0.12, 0.22, 0, 0.0, -0.2, blk); b.box(0.03, 0.05, 0.12, 0, 0.12, 0.12, grey); break;
    case 'sniper':
      b.box(0.045, 0.08, 1.05, 0, 0.04, 0.3, 0x2a3024); b.box(0.05, 0.12, 0.28, 0, 0.0, -0.22, 0x2a3024);
      b.cyl(0.035, 0.3, 0, 0.12, 0.12, blk, Math.PI / 2); break;
    case 'rpg':
      b.cyl(0.075, 1.1, 0, 0.08, 0.2, 0x3d4a2a, Math.PI / 2); b.add(new THREE.ConeGeometry(0.1, 0.25, 8), 0x5a5a3a, 0, 0.08, 0.85, Math.PI / 2, 0, 0);
      b.box(0.04, 0.14, 0.05, 0, -0.04, 0.05, grey); break;
    case 'grenade':
      b.add(UNIT_SPHERE, 0x3a4a2a, 0, 0, 0.02, 0, 0, 0, 0.1, 0.12, 0.1); break;
    default:
      return new THREE.Group();
  }
  const m = new THREE.Mesh(b.build(), charMat);
  m.geometry.userData.keep = true;
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  gunCache[id] = g;
  return g.clone();
}

// ---------------- Vehicles ----------------
const SHAPES = {
  hatch: {
    lower: [[-2.05, 0.3], [2.05, 0.3], [2.08, 0.62], [1.95, 0.8], [1.05, 0.92], [-1.95, 0.95], [-2.07, 0.75]],
    cabin: [[1.0, 0.92], [0.2, 1.42], [-1.5, 1.44], [-1.97, 0.95]],
  },
  sedan: {
    lower: [[-2.35, 0.3], [2.35, 0.3], [2.38, 0.62], [2.2, 0.8], [1.15, 0.9], [-1.65, 0.94], [-2.35, 0.92], [-2.4, 0.62]],
    cabin: [[1.15, 0.9], [0.35, 1.42], [-0.95, 1.42], [-1.65, 0.94]],
  },
  wagon: {
    lower: [[-2.35, 0.3], [2.35, 0.3], [2.38, 0.62], [2.2, 0.8], [1.15, 0.9], [-2.35, 0.94], [-2.4, 0.62]],
    cabin: [[1.15, 0.9], [0.35, 1.46], [-2.15, 1.46], [-2.33, 0.94]],
  },
  sports: {
    lower: [[-2.2, 0.26], [2.2, 0.26], [2.25, 0.5], [2.0, 0.62], [0.75, 0.78], [-2.0, 0.86], [-2.22, 0.66]],
    cabin: [[0.75, 0.78], [-0.05, 1.13], [-0.95, 1.13], [-1.85, 0.86]],
  },
  trabbi: {
    lower: [[-1.75, 0.3], [1.75, 0.3], [1.78, 0.68], [1.1, 0.84], [-1.75, 0.86]],
    cabin: [[1.05, 0.84], [0.5, 1.35], [-1.25, 1.36], [-1.62, 0.86]],
  },
};

function wheelGeo(r, w) {
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(r, r, w, 14), 0x161616, 0, 0, 0, 0, 0, Math.PI / 2);
  b.add(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 10), 0x9a9ea3, 0, 0, 0, 0, 0, Math.PI / 2);
  return b.build();
}
const wheelCache = {};
function getWheel(r, w) {
  const k = r + '_' + w;
  if (!wheelCache[k]) { wheelCache[k] = wheelGeo(r, w); wheelCache[k].userData.keep = true; }
  return wheelCache[k];
}

export function buildVehicleModel(def, color) {
  const group = new THREE.Group();
  const b = new Builder(), glow = new Builder();
  const W = def.W, L = def.L;
  const glass = 0x1e2a36, dark = 0x202022, chrome = 0xb8bcc0;
  const wheels = [];
  const extras = {};
  const addWheel = (x, z, r, w, front) => {
    const m = new THREE.Mesh(getWheel(r, w), vehMat);
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    pivot.add(m);
    group.add(pivot);
    m.castShadow = true;
    wheels.push({ pivot, mesh: m, front, r });
  };

  if (SHAPES[def.shape]) {
    const s = SHAPES[def.shape];
    b.geo(profileGeometry(s.lower, W), color);
    b.geo(profileGeometry(s.cabin, W * 0.9), glass);
    // roof panel & pillars in paint colour
    const roofY = Math.max(...s.cabin.map((p) => p[1]));
    const rz = s.cabin.filter((p) => p[1] === roofY).map((p) => p[0]);
    const r0 = Math.min(...rz), r1 = Math.max(...rz);
    b.box(W * 0.9 + 0.02, 0.05, r1 - r0 + 0.02, 0, roofY + 0.01, (r0 + r1) / 2, color);
    b.box(W * 0.9 + 0.03, (roofY - s.cabin[0][1]) * 0.9, 0.12, 0, (roofY + s.cabin[0][1]) / 2, (r0 + r1) / 2, color);
    // bumpers
    b.box(W * 0.98, 0.18, 0.12, 0, 0.42, L / 2 + 0.02, dark);
    b.box(W * 0.98, 0.18, 0.12, 0, 0.42, -L / 2 - 0.02, dark);
    b.box(W * 0.5, 0.14, 0.05, 0, 0.62, L / 2 + 0.04, 0x2a2a2a);
    // mirrors
    b.box(0.12, 0.08, 0.1, W / 2 + 0.05, s.cabin[0][1] + 0.08, s.cabin[0][0] - 0.2, color);
    b.box(0.12, 0.08, 0.1, -W / 2 - 0.05, s.cabin[0][1] + 0.08, s.cabin[0][0] - 0.2, color);
    // lights
    glow.box(0.34, 0.12, 0.04, W / 2 - 0.3, 0.68, L / 2 + 0.03, 0xfff6d8);
    glow.box(0.34, 0.12, 0.04, -W / 2 + 0.3, 0.68, L / 2 + 0.03, 0xfff6d8);
    glow.box(0.3, 0.12, 0.04, W / 2 - 0.25, 0.72, -L / 2 - 0.03, 0xd01010);
    glow.box(0.3, 0.12, 0.04, -W / 2 + 0.25, 0.72, -L / 2 - 0.03, 0xd01010);
    // number plates (white with blue EU band)
    b.box(0.52, 0.12, 0.02, 0, 0.45, L / 2 + 0.09, 0xf2f2f2);
    b.box(0.07, 0.12, 0.022, -0.225, 0.45, L / 2 + 0.09, 0x1b3fa0);
    b.box(0.52, 0.12, 0.02, 0, 0.45, -L / 2 - 0.09, 0xf2f2f2);
    const wr = def.shape === 'sports' ? 0.34 : def.shape === 'trabbi' ? 0.29 : 0.33;
    const wz = def.wheelbase / 2;
    addWheel(W / 2 - 0.12, wz, wr, 0.24, true);
    addWheel(-W / 2 + 0.12, wz, wr, 0.24, true);
    addWheel(W / 2 - 0.12, -wz, wr, 0.24, false);
    addWheel(-W / 2 + 0.12, -wz, wr, 0.24, false);
    if (def.police) {
      // blue stripes + light bar
      b.box(W + 0.02, 0.16, L * 0.8, 0, 0.62, 0, 0x1f4f9a);
      b.box(W * 0.62, 0.1, 0.34, 0, roofY + 0.08, (r0 + r1) / 2 + 0.2, 0x222222);
      const lb = new Builder();
      lb.box(W * 0.28, 0.12, 0.3, W * 0.17, roofY + 0.18, (r0 + r1) / 2 + 0.2, 0xffffff);
      const lb2 = new Builder();
      lb2.box(W * 0.28, 0.12, 0.3, -W * 0.17, roofY + 0.18, (r0 + r1) / 2 + 0.2, 0xffffff);
      const m1 = new THREE.MeshBasicMaterial({ color: 0x1030ff }), m2 = new THREE.MeshBasicMaterial({ color: 0x1030ff });
      const l1 = new THREE.Mesh(lb.build(), m1), l2 = new THREE.Mesh(lb2.build(), m2);
      group.add(l1, l2);
      extras.lightbar = [m1, m2];
    }
    if (def.taxi) {
      b.box(0.5, 0.2, 0.28, 0, roofY + 0.12, (r0 + r1) / 2, 0xf2c200);
      glow.box(0.46, 0.14, 0.02, 0, roofY + 0.12, (r0 + r1) / 2 + 0.145, 0xffe066);
    }
  } else if (def.shape === 'van') {
    b.geo(profileGeometry([[-2.6, 0.32], [2.6, 0.32], [2.62, 0.9], [2.35, 1.1], [-2.6, 1.12]], W), color);
    b.geo(profileGeometry([[2.35, 1.1], [1.75, 2.0], [1.25, 2.0], [1.25, 1.1]], W * 0.92), glass);
    b.geo(profileGeometry([[1.3, 1.1], [1.3, 2.08], [-2.6, 2.08], [-2.6, 1.1]], W), color);
    b.box(W * 0.93, 0.06, 0.6, 0, 2.02, 1.55, color);
    b.box(0.05, 0.35, 0.9, W / 2 + 0.01, 1.55, 0.75, glass);
    b.box(0.05, 0.35, 0.9, -W / 2 - 0.01, 1.55, 0.75, glass);
    b.box(W, 0.2, 0.12, 0, 0.45, 2.65, dark); b.box(W, 0.2, 0.12, 0, 0.45, -2.65, dark);
    glow.box(0.3, 0.14, 0.04, W / 2 - 0.25, 0.8, 2.64, 0xfff6d8); glow.box(0.3, 0.14, 0.04, -W / 2 + 0.25, 0.8, 2.64, 0xfff6d8);
    glow.box(0.2, 0.3, 0.04, W / 2 - 0.15, 1.0, -2.63, 0xd01010); glow.box(0.2, 0.3, 0.04, -W / 2 + 0.15, 1.0, -2.63, 0xd01010);
    for (const [x, z, f] of [[W / 2 - 0.15, 1.75, true], [-W / 2 + 0.15, 1.75, true], [W / 2 - 0.15, -1.75, false], [-W / 2 + 0.15, -1.75, false]]) addWheel(x, z, 0.36, 0.26, f);
    if (def.police) {
      b.box(W + 0.02, 0.18, L * 0.85, 0, 0.75, 0, def.sek ? 0x3a4a5a : 0x1f4f9a);
      const lb = new Builder(); lb.box(W * 0.3, 0.12, 0.3, W * 0.2, 2.16, 1.6, 0xffffff);
      const lb2 = new Builder(); lb2.box(W * 0.3, 0.12, 0.3, -W * 0.2, 2.16, 1.6, 0xffffff);
      const m1 = new THREE.MeshBasicMaterial({ color: 0x1030ff }), m2 = new THREE.MeshBasicMaterial({ color: 0x1030ff });
      group.add(new THREE.Mesh(lb.build(), m1), new THREE.Mesh(lb2.build(), m2));
      extras.lightbar = [m1, m2];
    }
    if (def.ambulance) b.box(W + 0.02, 0.25, 3.6, 0, 1.5, -0.6, 0xd62020);
  } else if (def.shape === 'truck') {
    b.box(W, 2.2, 2.3, 0, 1.75, L / 2 - 1.15, color);
    b.box(W * 0.92, 0.9, 0.06, 0, 2.3, L / 2 - 0.0, glass);
    b.box(W, 0.5, 0.2, 0, 0.7, L / 2, dark);
    b.box(W * 0.9, 0.3, L, 0, 0.75, 0, dark);
    const trailerCol = pick([0xf2f2f2, 0xd8d8d8, 0x2a5a9a, 0xc0392b, 0x2e7d32]);
    b.box(W + 0.05, 3.1, L - 2.7, 0, 2.45, -1.3, trailerCol);
    glow.box(0.3, 0.15, 0.04, W / 2 - 0.25, 0.9, L / 2 + 0.1, 0xfff6d8); glow.box(0.3, 0.15, 0.04, -W / 2 + 0.25, 0.9, L / 2 + 0.1, 0xfff6d8);
    glow.box(0.25, 0.15, 0.04, W / 2 - 0.2, 0.9, -L / 2 - 0.02, 0xd01010); glow.box(0.25, 0.15, 0.04, -W / 2 + 0.2, 0.9, -L / 2 - 0.02, 0xd01010);
    for (const z of [L / 2 - 1.2, -L / 2 + 2.4, -L / 2 + 1.1]) {
      addWheel(W / 2 - 0.2, z, 0.52, 0.4, z > 0);
      addWheel(-W / 2 + 0.2, z, 0.52, 0.4, z > 0);
    }
  } else if (def.shape === 'bus') {
    b.box(W, 2.0, L, 0, 1.45, 0, color);
    b.box(W + 0.02, 0.9, L - 0.8, 0, 1.95, -0.2, glass);
    b.box(W * 0.95, 0.9, 0.05, 0, 1.9, L / 2 + 0.01, glass);
    b.box(W, 0.35, L, 0, 2.62, 0, 0xf2f2f2);
    glow.box(0.35, 0.15, 0.04, W / 2 - 0.3, 0.8, L / 2 + 0.02, 0xfff6d8); glow.box(0.35, 0.15, 0.04, -W / 2 + 0.3, 0.8, L / 2 + 0.02, 0xfff6d8);
    glow.box(0.25, 0.25, 0.04, W / 2 - 0.2, 0.9, -L / 2 - 0.02, 0xd01010); glow.box(0.25, 0.25, 0.04, -W / 2 + 0.2, 0.9, -L / 2 - 0.02, 0xd01010);
    glow.box(1.6, 0.3, 0.03, 0, 2.55, L / 2 + 0.03, 0xffb000);
    for (const [z, f] of [[L / 2 - 2.2, true], [-L / 2 + 2.6, false]]) { addWheel(W / 2 - 0.2, z, 0.5, 0.35, f); addWheel(-W / 2 + 0.2, z, 0.5, 0.35, f); }
  } else if (def.shape === 'bike') {
    b.box(0.25, 0.35, 1.1, 0, 0.62, 0, color);
    b.box(0.3, 0.12, 0.6, 0, 0.86, -0.25, 0x151515);
    b.box(0.22, 0.25, 0.3, 0, 0.9, 0.5, color);
    b.box(0.7, 0.05, 0.05, 0, 1.08, 0.62, 0x333333);
    b.box(0.08, 0.5, 0.08, 0, 0.55, 0.72, chrome, 0, -0.35);
    b.box(0.08, 0.2, 0.5, 0, 0.45, -0.55, chrome);
    glow.box(0.16, 0.12, 0.04, 0, 0.95, 0.67, 0xfff6d8);
    glow.box(0.14, 0.08, 0.04, 0, 0.9, -0.58, 0xd01010);
    addWheel(0, 0.78, 0.34, 0.14, true);
    addWheel(0, -0.72, 0.34, 0.16, false);
  } else if (def.shape === 'boat') {
    b.geo(profileGeometry([[-3.2, 0.0], [2.2, 0.0], [3.3, 0.9], [-3.2, 0.9]], W), 0xf2f2f2);
    b.geo(profileGeometry([[-3.2, 0.02], [2.3, 0.02], [2.9, 0.5], [-3.2, 0.5]], W + 0.02), color);
    b.box(W * 0.9, 0.08, 4.5, 0, 0.92, -0.6, 0x9a7a55);
    b.geo(profileGeometry([[0.6, 0.9], [0.1, 1.5], [-0.3, 1.5], [-0.3, 0.9]], W * 0.8), glass);
    b.box(0.6, 0.6, 0.6, 0, 1.2, -1.6, 0x333333);
    b.box(0.5, 0.9, 0.4, 0, 0.5, -3.3, 0x222222);
    glow.box(0.12, 0.12, 0.12, W / 2 - 0.1, 1.0, 2.5, 0x20ff40);
    glow.box(0.12, 0.12, 0.12, -W / 2 + 0.1, 1.0, 2.5, 0xff2020);
  } else if (def.shape === 'heli') {
    b.add(UNIT_SPHERE, color, 0, 1.5, 0.6, 0, 0, 0, 2.2, 2.0, 4.2);
    b.add(UNIT_SPHERE, glass, 0, 1.75, 1.7, 0, 0, 0, 1.7, 1.3, 2.0);
    b.box(0.45, 0.5, 5.2, 0, 1.8, -3.4, color);
    b.box(0.1, 1.3, 0.8, 0, 2.3, -5.8, color);
    b.box(1.8, 0.1, 0.5, 0, 1.9, -5.4, color);
    b.box(0.1, 0.1, 3.4, 0.8, 0.1, 0.6, 0x333333); b.box(0.1, 0.1, 3.4, -0.8, 0.1, 0.6, 0x333333);
    b.box(0.08, 0.5, 0.08, 0.8, 0.35, 1.5, 0x333333); b.box(0.08, 0.5, 0.08, -0.8, 0.35, 1.5, 0x333333);
    b.box(0.08, 0.5, 0.08, 0.8, 0.35, -0.4, 0x333333); b.box(0.08, 0.5, 0.08, -0.8, 0.35, -0.4, 0x333333);
    b.box(0.3, 0.5, 0.3, 0, 2.6, 0.5, 0x333333);
    if (def.police) b.box(2.25, 0.3, 3.0, 0, 1.3, 0.6, 0x1f4f9a);
    glow.box(0.1, 0.1, 0.1, 0, 0.9, 2.5, 0xffffff);
    glow.box(0.1, 0.1, 0.1, 0, 2.9, -5.9, 0xff2020);
    const rb = new Builder();
    rb.box(11, 0.06, 0.34, 0, 0, 0, 0x2a2a2a);
    rb.box(0.34, 0.06, 11, 0, 0, 0, 0x2a2a2a);
    const rotor = new THREE.Mesh(rb.build(), vehMat);
    rotor.position.set(0, 2.9, 0.5);
    group.add(rotor);
    const tb = new Builder();
    tb.box(0.05, 1.6, 0.14, 0, 0, 0, 0x2a2a2a);
    const trot = new THREE.Mesh(tb.build(), vehMat);
    trot.position.set(0.12, 2.3, -5.8);
    group.add(trot);
    extras.rotor = rotor; extras.tailRotor = trot;
  }

  const body = new THREE.Mesh(b.build(), vehMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const lights = new THREE.Mesh(glow.build(), glowMat);
  group.add(lights);
  return { group, body, lights, wheels, extras };
}
