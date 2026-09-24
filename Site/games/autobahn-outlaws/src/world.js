// Orchestrates world generation and exposes world queries.
import * as THREE from 'three';
import { Terrain, GRID, naturalHeight } from './terrain.js';
import { RoadNet, isWaterPlan } from './roads.js';
import { Physics } from './physics.js';
import { buildCity, sharedCityMaterials } from './city.js';
import { buildNature } from './nature.js';
import { CITIES, CITY_BY_ID, POIS, ZUGSPITZE, insideGermany, BORDER, borderInfo } from './geo.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

export async function buildWorld(scene, quality, progress = () => {}) {
  const world = { scene, services: [], landmarkSpots: [], pads: [], cityTrees: [], cityGroups: [], quality };
  progress(0.04, 'Planning the Autobahn network…');
  await tick();
  const roads = new RoadNet();
  roads.plan();
  world.roads = roads;

  // Countryside POIs get flat pads.
  const pads = world.pads;
  pads.push({ type: 'neuschwanstein', x: POIS.neuschwanstein.x, z: POIS.neuschwanstein.z, r: 30, pad: true });
  pads.push({ type: 'summitcross', x: ZUGSPITZE.x, z: ZUGSPITZE.z, r: 10, pad: true });
  pads.push({ type: 'brocken', x: POIS.brocken.x, z: POIS.brocken.z, r: 10, pad: true });
  for (const id of ['berlin', 'frankfurt', 'muenchen', 'hamburg', 'koeln', 'stuttgart']) {
    const c = CITY_BY_ID[id];
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7]]) {
      const x = c.x + ax * (c.r + 60), z = c.z + az * (c.r + 60);
      if (isWaterPlan(x, z, 30)) continue;
      pads.push({ type: 'helipad', x, z, r: 12, pad: true, city: id });
      break;
    }
  }
  for (const p of pads) if (p.y === undefined) p.y = Math.max(1.5, naturalHeight(p.x, p.z) + (p.type === 'neuschwanstein' ? 8 : 0.5));

  progress(0.12, 'Shaping the terrain…');
  await tick();
  const T = new Terrain();
  T.computeNatural();
  progress(0.3, 'Building roads…');
  await tick();
  T.applyRoads(roads.roadsForTerrain());
  T.applyCities([...CITIES, ...pads]);
  T.applyCityMask(roads.grids);
  progress(0.38, 'Filling rivers and lakes…');
  await tick();
  T.applyWater();
  T.computeMasks();
  world.terrain = T;
  roads.finalize(T);

  progress(0.46, 'Painting the landscape…');
  await tick();
  scene.add(T.buildMesh(quality));
  const water = makeWater();
  scene.add(water);
  world.water = water;

  const physics = new Physics(T);
  world.physics = physics;
  roads.buildMeshes(T, scene, quality);
  for (const d of roads.decks) physics.addDeck(d.ax, d.az, d.bx, d.bz, d.ya, d.yb, d.half);

  progress(0.55, 'Building cities…');
  await tick();
  const mats = sharedCityMaterials();
  world.cityMats = mats;
  let ci = 0;
  for (const id in roads.grids) {
    const g = buildCity(world, roads.grids[id], mats);
    scene.add(g);
    world.cityGroups.push(g);
    if (++ci % 6 === 0) {
      progress(0.55 + (ci / CITIES.length) * 0.2, 'Building cities… ' + roads.grids[id].city.name);
      await tick();
    }
  }
  progress(0.78, 'Planting forests and villages…');
  await tick();
  buildNature(world, quality);
  progress(0.9, 'Drawing the map…');
  await tick();
  world.map = buildMapImage(world);
  world.nightMats = [mats.wallMat, mats.glassMat];
  return world;
}

function makeWater() {
  const geo = new THREE.PlaneGeometry(GRID.X1 - GRID.X0 + 8000, GRID.Z1 - GRID.Z0 + 8000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({ color: 0x2f6f96, specular: 0x88aacc, shininess: 60, transparent: true, opacity: 0.88 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set((GRID.X0 + GRID.X1) / 2, -0.05, (GRID.Z0 + GRID.Z1) / 2);
  m.receiveShadow = true;
  m.renderOrder = 1;
  m.name = 'water';
  return m;
}

// Top-down painted map shared by minimap and pause map. 5 world metres per pixel.
export const MAP_SCALE = 5;
function buildMapImage(world) {
  const T = world.terrain;
  const { NX, NZ, X0, Z0 } = GRID;
  const base = document.createElement('canvas');
  base.width = NX; base.height = NZ;
  const bctx = base.getContext('2d');
  const img = bctx.createImageData(NX, NZ);
  const c = new THREE.Color();
  for (let i = 0; i < NX * NZ; i++) {
    T.mapColor(i, c);
    img.data[i * 4] = c.r * 255; img.data[i * 4 + 1] = c.g * 255; img.data[i * 4 + 2] = c.b * 255; img.data[i * 4 + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
  const W = Math.round((GRID.X1 - GRID.X0) / MAP_SCALE), H = Math.round((GRID.Z1 - GRID.Z0) / MAP_SCALE);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, 0, 0, W, H);
  const px = (x) => (x - X0) / MAP_SCALE, pz = (z) => (z - Z0) / MAP_SCALE;
  // Border
  ctx.strokeStyle = 'rgba(60,40,40,0.8)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  BORDER.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  // Roads
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    for (const e of world.roads.edges) {
      if (e.type === 'city') {
        if (pass !== 1) continue;
        ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = pass === 0 ? '#8a5a00' : e.type === 'autobahn' ? '#f5b700' : '#ffe680';
        ctx.lineWidth = pass === 0 ? 5.5 : 3.2;
      }
      ctx.beginPath();
      e.pts.forEach((p, i) => (i ? ctx.lineTo(px(p.x), pz(p.z)) : ctx.moveTo(px(p.x), pz(p.z))));
      ctx.stroke();
    }
  }
  return { canvas: cv, W, H, px, pz };
}

export { insideGermany, borderInfo };
