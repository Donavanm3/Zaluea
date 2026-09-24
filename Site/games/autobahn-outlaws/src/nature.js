// Forests, villages, wind parks, Autobahn service stations and countryside POIs.
import * as THREE from 'three';
import { Builder, mulberry32, clamp, UNIT_CYL6, UNIT_CONE } from './util.js';
import { MeshBuf } from './meshbuf.js';
import { GRID } from './terrain.js';
import { toLonLat, CITIES, insideGermany } from './geo.js';
import { LANDMARKS, prismX } from './landmarks.js';
import { serviceSignTexture } from './textures.js';

const CHUNK = 500;

function treeGeometries() {
  const con = new Builder();
  con.add(UNIT_CYL6, 0x5a3d24, 0, 0.8, 0, 0, 0, 0, 0.45, 1.6, 0.45);
  con.add(UNIT_CONE, 0x2f5a2a, 0, 3.4, 0, 0, 0, 0, 3.8, 4.4, 3.8);
  con.add(UNIT_CONE, 0x356630, 0, 5.4, 0, 0, 0.4, 0, 2.9, 3.4, 2.9);
  con.add(UNIT_CONE, 0x3b6e35, 0, 7.0, 0, 0, 0.8, 0, 1.9, 2.4, 1.9);
  const dec = new Builder();
  dec.add(UNIT_CYL6, 0x5e4128, 0, 1.3, 0, 0, 0, 0, 0.5, 2.6, 0.5);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  dec.add(ico, 0x4f7f33, 0, 4.2, 0, 0, 0, 0, 2.6, 2.3, 2.6);
  dec.add(ico, 0x5a8c3a, 0.9, 5.0, 0.4, 0.5, 0.3, 0, 1.7, 1.6, 1.7);
  dec.add(ico, 0x4a7a30, -0.8, 4.9, -0.5, 0.2, 1.1, 0, 1.6, 1.5, 1.6);
  return [con.build(), dec.build()];
}

export function buildNature(world, quality) {
  const { terrain: T, physics: P, scene } = world;
  const rng = mulberry32(4242);
  const R = () => rng();
  const density = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1.0;
  const chunks = new Map(); // key -> [[],[]]
  const addTree = (x, y, z, s, kind, collide = true) => {
    const k = Math.floor(x / CHUNK) * 1000 + Math.floor(z / CHUNK);
    let c = chunks.get(k);
    if (!c) { c = { lists: [[], []], cx: (Math.floor(x / CHUNK) + 0.5) * CHUNK, cz: (Math.floor(z / CHUNK) + 0.5) * CHUNK }; chunks.set(k, c); }
    c.lists[kind].push(x, y, z, s, R() * Math.PI * 2, 0.85 + R() * 0.3);
    if (collide) P.addCircle(x, z, 0.45 * s, y, y + 7 * s, { tree: true });
  };

  // Forests + scattered field trees
  const step = 15;
  for (let z = GRID.Z0 + 20; z < GRID.Z1 - 20; z += step) {
    for (let x = GRID.X0 + 20; x < GRID.X1 - 20; x += step) {
      const jx = x + (R() - 0.5) * step, jz = z + (R() - 0.5) * step;
      const f = T.sample(T.forest, jx, jz);
      const water = T.nearest(T.water, jx, jz);
      if (water) continue;
      const cityM = T.sample(T.city, jx, jz);
      if (cityM > 0.01) continue;
      const roadD = T.sample(T.roadD, jx, jz);
      if (roadD < 16) continue;
      let p = f * 0.9 * density;
      if (f < 0.1) p = 0.012 * density; // lone trees and hedgerows
      if (R() > p) continue;
      const y = T.heightAt(jx, jz);
      if (y > 250) continue;
      const { lat } = toLonLat(jx, jz);
      const conifer = y > 90 || lat < 49.2 ? R() < 0.8 : R() < 0.45;
      addTree(jx, y - 0.2, jz, 0.8 + R() * 0.55, conifer ? 0 : 1, f > 0.1);
    }
  }
  for (const t of world.cityTrees || []) addTree(t.x, t.y, t.z, t.s, t.kind, false);

  const [conGeo, decGeo] = treeGeometries();
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  world.treeChunks = [];
  const treeGroup = new THREE.Group();
  treeGroup.name = 'trees';
  for (const c of chunks.values()) {
    for (let kind = 0; kind < 2; kind++) {
      const L = c.lists[kind];
      const n = L.length / 6;
      if (!n) continue;
      const im = new THREE.InstancedMesh(kind === 0 ? conGeo : decGeo, treeMat, n);
      for (let i = 0; i < n; i++) {
        const o = i * 6;
        q.setFromAxisAngle(up, L[o + 4]);
        m4.compose(v.set(L[o], L[o + 1], L[o + 2]), q, sc.set(L[o + 3], L[o + 3] * (0.9 + (L[o + 5] - 0.85)), L[o + 3]));
        im.setMatrixAt(i, m4);
        col.setRGB(L[o + 5], L[o + 5] * (0.95 + (i % 7) * 0.015), L[o + 5] * 0.95);
        im.setColorAt(i, col);
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = quality === 'high';
      im.receiveShadow = false;
      im.userData.cx = c.cx; im.userData.cz = c.cz;
      treeGroup.add(im);
      world.treeChunks.push(im);
    }
  }
  scene.add(treeGroup);

  buildVillages(world, rng);
  buildWindParks(world, rng);
  buildServiceStations(world, rng);
  buildPOIs(world);
}

function farFromCities(x, z, extra) {
  for (const c of CITIES) if (Math.hypot(x - c.x, z - c.z) < c.r + extra) return false;
  return true;
}

function buildVillages(world, rng) {
  const { terrain: T, physics: P } = world;
  const R = () => rng();
  const wall = new MeshBuf(true), misc = new MeshBuf(false);
  const lm = new Builder();
  const PASTEL = [0xefe6d2, 0xe8dcc0, 0xd9c7a5, 0xf2efe6, 0xe3c9b8, 0xcfd6da];
  const ROOF = [0xa0412d, 0x9a3b28, 0xb04a32, 0x8a3a2a, 0x55585e];
  world.villages = [];
  let placed = 0;
  for (let attempt = 0; attempt < 5000 && placed < 90; attempt++) {
    const x = GRID.X0 + 400 + R() * (GRID.X1 - GRID.X0 - 800);
    const z = GRID.Z0 + 400 + R() * (GRID.Z1 - GRID.Z0 - 800);
    if (!insideGermany(x, z)) continue;
    if (!farFromCities(x, z, 180)) continue;
    const rd = T.sample(T.roadD, x, z);
    if (rd < 70 || rd > 400) continue;
    if (T.sample(T.forest, x, z) > 0.3 || T.nearest(T.water, x, z)) continue;
    const hc = T.heightAt(x, z);
    if (hc > 170) continue;
    let tooClose = false;
    for (const v of world.villages) if (Math.hypot(v.x - x, v.z - z) < 300) { tooClose = true; break; }
    if (tooClose) continue;
    const { lat } = toLonLat(x, z);
    const bavaria = lat < 49.9 && x > -400;
    world.villages.push({ x, z, y: hc });
    placed++;
    // church
    const cy = minGround(T, x - 5, z - 9, x + 5, z + 9) - 0.3;
    wall.wallLoop(x - 4, z - 8, x + 4, z + 8, cy, cy + 8, 0xf2efe6, { u0: 0, sx: 28, sy: 25.6 });
    lm.geo(prismX(16, 5, 8).rotateY(Math.PI / 2), 0x8a3a2a, x, cy + 8, z);
    lm.box(4.6, 18, 4.6, x, cy + 9, z + 10, 0xf2efe6);
    if (bavaria) {
      lm.add(new THREE.SphereGeometry(2.4, 10, 8), 0x3f7a5b, x, cy + 19.5, z + 10, 0, 0, 0, 1, 1.3, 1);
      lm.add(new THREE.ConeGeometry(0.8, 4, 8), 0x3f7a5b, x, cy + 23.5, z + 10);
    } else {
      lm.add(new THREE.ConeGeometry(3.2, 10, 4), 0x55585e, x, cy + 23, z + 10, 0, Math.PI / 4, 0);
    }
    P.addBox(x - 4, z - 8, x + 4, z + 8, cy - 1, cy + 13, { building: true });
    P.addBox(x - 2.3, z + 7.7, x + 2.3, z + 12.3, cy - 1, cy + 28, { building: true });
    if (bavaria) {
      // Maibaum
      const mx = x + 14, mz = z - 4, my = T.heightAt(mx, mz);
      for (let i = 0; i < 10; i++) lm.add(UNIT_CYL6, i % 2 ? 0x2f6fb5 : 0xf5f5f5, mx, my + 1.5 + i * 3, mz, 0, 0, 0, 0.5, 3, 0.5);
      lm.add(new THREE.TorusGeometry(1.4, 0.25, 6, 12), 0x3f7a3b, mx, my + 27, mz, Math.PI / 2, 0, 0);
      P.addCircle(mx, mz, 0.3, my, my + 30);
    }
    const n = 6 + Math.floor(R() * 8);
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, d = 22 + R() * 50;
      const hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d;
      if (T.sample(T.roadD, hx, hz) < 16 || T.nearest(T.water, hx, hz)) continue;
      const w = 8 + R() * 4, dd = 7 + R() * 4;
      const x0 = hx - w / 2, x1 = hx + w / 2, z0 = hz - dd / 2, z1 = hz + dd / 2;
      const yb = minGround(T, x0, z0, x1, z1) - 0.4;
      const yt = maxGround(T, x0, z0, x1, z1) + 4.5 + R() * 2.5;
      const color = PASTEL[Math.floor(R() * PASTEL.length)];
      wall.wallLoop(x0, z0, x1, z1, yb, yt, color, { u0: Math.floor(R() * 8) * 3.5, sx: 28, sy: 25.6 });
      const rc = ROOF[Math.floor(R() * ROOF.length)];
      const rh = Math.min(w, dd) * 0.5, yr = yt + rh, zm = (z0 + z1) / 2;
      misc.quad([x1, yt, z0], [x0, yt, z0], [x0, yr, zm], [x1, yr, zm], rc, null, [0, 1, -1]);
      misc.quad([x0, yt, z1], [x1, yt, z1], [x1, yr, zm], [x0, yr, zm], rc, null, [0, 1, 1]);
      misc.tri([x1, yt, z1], [x1, yt, z0], [x1, yr, zm], color, null, null, null, [1, 0, 0]);
      misc.tri([x0, yt, z0], [x0, yt, z1], [x0, yr, zm], color, null, null, null, [-1, 0, 0]);
      P.addBox(x0, z0, x1, z1, yb - 1, yt + rh * 0.5, { building: true });
      // hay bales / fence
      if (R() < 0.3) {
        const bx = hx + 12, bz = hz + 3, by = T.heightAt(bx, bz);
        lm.add(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 10), 0xd8c070, bx, by + 0.8, bz, 0, 0, Math.PI / 2);
      }
    }
  }
  const mats = world.cityMats;
  const g = new THREE.Group();
  g.name = 'villages';
  const w = new THREE.Mesh(wall.toGeometry(), mats.wallMat); w.castShadow = true; w.receiveShadow = true;
  const m = new THREE.Mesh(misc.toGeometry(), mats.miscMat); m.castShadow = true;
  const l = new THREE.Mesh(lm.build(), mats.miscMat); l.castShadow = true;
  g.add(w, m, l);
  world.scene.add(g);
}

function minGround(T, x0, z0, x1, z1) {
  return Math.min(T.heightAt(x0, z0), T.heightAt(x1, z0), T.heightAt(x0, z1), T.heightAt(x1, z1), T.heightAt((x0 + x1) / 2, (z0 + z1) / 2));
}
function maxGround(T, x0, z0, x1, z1) {
  return Math.max(T.heightAt(x0, z0), T.heightAt(x1, z0), T.heightAt(x0, z1), T.heightAt(x1, z1));
}

function buildWindParks(world, rng) {
  const { terrain: T, physics: P } = world;
  const R = () => rng();
  const B = new Builder();
  const rotors = [];
  let parks = 0;
  for (let attempt = 0; attempt < 3000 && parks < 16; attempt++) {
    const x = GRID.X0 + R() * (GRID.X1 - GRID.X0);
    const z = GRID.Z0 + R() * (GRID.Z1 - GRID.Z0);
    const { lat } = toLonLat(x, z);
    if (lat < 51.6 || !insideGermany(x, z) || !farFromCities(x, z, 220)) continue;
    if (T.sample(T.roadD, x, z) < 80 || T.sample(T.forest, x, z) > 0.2 || T.nearest(T.water, x, z)) continue;
    parks++;
    const n = 4 + Math.floor(R() * 5);
    for (let k = 0; k < n; k++) {
      const tx = x + (R() - 0.5) * 260, tz = z + (R() - 0.5) * 260;
      if (T.nearest(T.water, tx, tz) || T.sample(T.roadD, tx, tz) < 40 || T.sample(T.city, tx, tz) > 0) continue;
      const ty = T.heightAt(tx, tz) - 0.5;
      LANDMARKS.windturbine(B, tx, ty, tz);
      P.addCircle(tx, tz, 2.0, ty, ty + 72);
      rotors.push({ x: tx, y: ty + 71, z: tz, yaw: 0, a: R() * 6, speed: 0.8 + R() * 0.5 });
    }
  }
  const tower = new THREE.Mesh(B.build(), world.cityMats.miscMat);
  tower.castShadow = true;
  world.scene.add(tower);
  // rotor: hub + three blades
  const rb = new Builder();
  rb.add(new THREE.SphereGeometry(1.4, 10, 8), 0xeeeeee, 0, 0, 3.2, 0, 0, 0, 1, 1, 1.5);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    rb.add(new THREE.BoxGeometry(1, 1, 1), 0xf5f5f5, Math.sin(a) * 12, Math.cos(a) * 12, 3.4, 0, 0, -a, 1.4, 24, 0.3);
  }
  const rotorGeo = rb.build();
  const im = new THREE.InstancedMesh(rotorGeo, world.cityMats.miscMat, Math.max(1, rotors.length));
  im.count = rotors.length;
  world.windRotors = { mesh: im, list: rotors };
  updateRotors(world, 0);
  im.computeBoundingSphere();
  world.scene.add(im);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
export function updateRotors(world, dt) {
  const W = world.windRotors;
  if (!W) return;
  for (let i = 0; i < W.list.length; i++) {
    const r = W.list[i];
    r.a += dt * r.speed;
    _e.set(0, r.yaw, r.a, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_v.set(r.x, r.y, r.z), _q, _s);
    W.mesh.setMatrixAt(i, _m);
  }
  W.mesh.instanceMatrix.needsUpdate = true;
}

function buildServiceStations(world, rng) {
  const { roads, physics: P } = world;
  const B = new Builder();
  const signs = new MeshBuf(true);
  const st = serviceSignTexture();
  world.fuelPumps = world.fuelPumps || [];
  let count = 0;
  for (const e of roads.edges) {
    if (e.type !== 'autobahn' || e.len < 520) continue;
    if (rng() < 0.35) continue;
    const p = roads.pointAt(e, e.len * (0.35 + rng() * 0.3));
    const off = e.half + 20;
    const side = rng() < 0.5 ? 1 : -1;
    const cx = p.x + p.rx * off * side, cz = p.z + p.rz * off * side;
    const y = p.y;
    const ry = Math.atan2(p.tx, p.tz);
    // Paved apron
    B.box(34, 0.3, 26, cx, y + 0.1, cz, 0x6a6a6e, ry);
    // canopy + pillars
    B.box(20, 0.8, 12, cx, y + 5.4, cz, 0xf2f2f2, ry);
    B.box(20.2, 0.5, 12.2, cx, y + 5.0, cz, 0xe05a00, ry);
    const fx = p.tx, fz = p.tz, rx = p.rx, rz = p.rz;
    for (const [a, b] of [[-8, -4.5], [8, -4.5], [-8, 4.5], [8, 4.5]]) {
      const px = cx + rx * a + fx * b, pz = cz + rz * a + fz * b;
      B.box(0.5, 5, 0.5, px, y + 2.5, pz, 0xdddddd, ry);
      P.addCircle(px, pz, 0.35, y, y + 5.2);
    }
    for (const a of [-4, 4]) {
      const px = cx + rx * a, pz = cz + rz * a;
      B.box(1.2, 1.8, 3.2, px, y + 0.9, pz, 0xd0d0d0, ry);
      B.box(1.25, 0.5, 3.25, px, y + 1.6, pz, 0xe05a00, ry);
      P.addBox(px - 0.8, pz - 0.8, px + 0.8, pz + 0.8, y, y + 1.8, { pump: true });
      world.fuelPumps.push({ x: px, y: y + 1, z: pz, hp: 60, alive: true });
    }
    // shop
    const sx = cx + rx * 0 - fx * 0 + (rx * side) * 0, sz = cz;
    const shopX = cx + p.rx * side * 11, shopZ = cz + p.rz * side * 11;
    B.box(16, 4.5, 8, shopX, y + 2.25, shopZ, 0xf0ede6, ry);
    B.box(16.2, 0.6, 8.2, shopX, y + 4.6, shopZ, 0xe05a00, ry);
    P.addBox(shopX - 6, shopZ - 6, shopX + 6, shopZ + 6, y, y + 4.8, { building: true });
    // price pylon
    const plx = cx - fx * 15, plz = cz - fz * 15;
    B.box(0.6, 8, 0.6, plx, y + 4, plz, 0x999999);
    B.box(2.5, 3, 0.5, plx, y + 8.5, plz, 0xe05a00, ry + Math.PI / 2);
    world.services.push({ type: 'fuel', city: null, x: cx + p.rx * side * 5.5, z: cz + p.rz * side * 5.5, y: y + 0.25 });
    count++;
    void sx; void sz; void st;
  }
  const mesh = new THREE.Mesh(B.build(), world.cityMats.miscMat);
  mesh.castShadow = mesh.receiveShadow = true;
  world.scene.add(mesh);
  world.stationCount = count;
}

function buildPOIs(world) {
  const B = new Builder();
  const P = world.physics;
  for (const pad of world.pads) {
    if (!LANDMARKS[pad.type]) continue;
    if (pad.type === 'helipad') continue;
    LANDMARKS[pad.type](B, P, pad.x, pad.y, pad.z);
    world.landmarkSpots.push({ type: pad.type, x: pad.x, z: pad.z, y: pad.y });
  }
  // Helipads
  for (const pad of world.pads) {
    if (pad.type !== 'helipad') continue;
    B.box(20, 0.4, 20, pad.x, pad.y + 0.2, pad.z, 0x5a5a5e);
    B.add(new THREE.TorusGeometry(7, 0.35, 4, 32), 0xf2c200, pad.x, pad.y + 0.42, pad.z, Math.PI / 2, 0, 0);
    B.box(1, 0.05, 7, pad.x - 2, pad.y + 0.43, pad.z, 0xffffff);
    B.box(1, 0.05, 7, pad.x + 2, pad.y + 0.43, pad.z, 0xffffff);
    B.box(4, 0.05, 1, pad.x, pad.y + 0.43, pad.z, 0xffffff);
    P.addBox(pad.x - 10, pad.z - 10, pad.x + 10, pad.z + 10, pad.y - 3, pad.y + 0.4, { slab: true });
  }
  const mesh = new THREE.Mesh(B.build(), world.cityMats.miscMat);
  mesh.castShadow = mesh.receiveShadow = true;
  world.scene.add(mesh);
}
