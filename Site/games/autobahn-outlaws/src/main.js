// Autobahn Outlaws — bootstrap and main loop.
import * as THREE from 'three';
import { G } from './game.js';
import { buildWorld } from './world.js';
import { borderInfo, CITY_BY_ID, CITIES } from './geo.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { Sky } from './sky.js';
import { Effects } from './effects.js';
import { Weapons } from './weapons.js';
import { VehicleManager } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Peds } from './peds.js';
import { Police } from './police.js';
import { Pickups } from './pickups.js';
import { Player } from './player.js';
import { HUD } from './hud.js';
import { Missions } from './missions.js';
import { UI } from './ui.js';
import { SaveSystem, loadSettings } from './save.js';
import { updateRotors } from './nature.js';
import { lerp } from './util.js';

const TIPS = [
  'There is no general speed limit on the Autobahn — but the police still care about the rest.',
  'Hidden around Germany are 30 garden gnomes (Gartenzwerge). Find them all for a big bonus.',
  'Drive a car into a Lackiererei (respray) to lose the police when they cannot see you.',
  'Press Q in a car to switch between Berlin Techno FM, Blasmusik Bayern and more.',
  'Helicopters wait on helipads just outside the big cities.',
  'Hungry? Tankstellen along the Autobahn sell Currywurst that restores health.',
  'In a taxi, press J to start driving passengers for cash.',
  'Blue flag markers start Autobahn races. Beat your best time!',
  'Save at your Wohnung (safehouse) — look for the green house icon on the map.',
];

const $ = (id) => document.getElementById(id);

function fatal(msg) {
  $('fatal-msg').innerHTML = msg;
  $('fatal').classList.add('show');
  $('scr-loading').classList.remove('show');
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch (e) { return false; }
}

async function boot() {
  if (!webglAvailable()) {
    fatal('Your browser or device does not support WebGL, which is required to play. Please try a recent version of Chrome, Firefox, Edge or Safari.');
    return;
  }
  $('load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  G.settings = loadSettings();
  const q = G.settings.quality;
  const canvas = $('game');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
  } catch (e) {
    fatal('Could not start the 3D renderer: ' + e.message);
    return;
  }
  G.renderer = renderer;
  renderer.shadowMap.enabled = q !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 5000);
  G.camera = camera;
  scene.add(camera);
  const resize = () => {
    const pr = Math.min(devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (G.fx) {
      const s = (innerHeight * pr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      G.fx.add.mat.uniforms.scale.value = s;
      G.fx.norm.mat.uniforms.scale.value = s;
    }
  };
  addEventListener('resize', resize);
  resize();

  G.input = new Input(canvas);
  G.audio = new AudioSys();
  G.audio.vol = { master: G.settings.master, sfx: G.settings.sfx, music: G.settings.music };
  G.sky = new Sky(scene, q);
  G.fx = new Effects(scene, q);
  resize();

  const setProgress = (p, text) => {
    $('load-bar').style.width = Math.round(p * 100) + '%';
    if (text) $('load-text').textContent = text;
  };
  let world;
  try {
    world = await buildWorld(scene, q, setProgress);
  } catch (e) {
    console.error(e);
    fatal('The world failed to load: ' + e.message);
    return;
  }
  world.borderInfo = borderInfo;
  G.world = world;
  G.physics = world.physics;
  setProgress(0.95, 'Getting ready…');
  await new Promise((r) => setTimeout(r, 0));

  G.weapons = new Weapons();
  G.vehicles = new VehicleManager();
  G.traffic = new Traffic();
  G.peds = new Peds();
  G.police = new Police();
  G.pickups = new Pickups();
  G.hud = new HUD();
  G.missions = new Missions();
  G.save = new SaveSystem();
  G.ui = new UI();
  G.vehicles.initSpots();

  // Headlight for the player's vehicle (always present so shaders never recompile)
  const head = new THREE.SpotLight(0xfff2d8, 0, 70, 0.55, 0.6, 1.2);
  scene.add(head, head.target);
  G.headlight = head;

  // Player placeholder at Hamburg for the menu flyover
  const hs = world.services.find((s) => s.type === 'safehouse' && s.city === 'hamburg') || { x: CITY_BY_ID.hamburg.x, y: CITY_BY_ID.hamburg.y, z: CITY_BY_ID.hamburg.z };
  G.player = new Player(hs.x, hs.y + 0.2, hs.z - 1.5, Math.PI);
  G.player.char.setVisible(false);

  G.applyGraphics = () => {
    const far = G.settings.drawDistance;
    G.sky.farBase = far;
    camera.far = far + 2500;
    camera.updateProjectionMatrix();
    G.sky.camFar = camera.far;
  };
  G.applyGraphics();

  G.startGame = startGame;
  $('btn-continue').style.display = G.save.has() ? '' : 'none';
  if ('ontouchstart' in window && !matchMedia('(pointer: fine)').matches) {
    $('menu-note').textContent = 'This game needs a keyboard & mouse or a gamepad. Touch-only devices are not supported yet.';
  }
  setProgress(1, 'Ready!');
  G.state = 'menu';
  G.ui.show('menu');
  G.menuT = 0;
  // debug hook for automated tests
  window.__game = G;
  requestAnimationFrame(loop);
}

function startGame(save) {
  const P = G.player;
  const c = P.char;
  G.audio.init();
  G.audio.applyVolumes();
  G.ui.hideAll();
  $('hud').classList.remove('hidden');
  c.setVisible(true);
  G.money = 500;
  if (save) {
    G.money = save.money || 0;
    P.inv = save.inv || P.inv;
    if (!P.inv.fist) P.inv.fist = { mag: 0, ammo: 0 };
    Object.assign(G.stats, save.stats || {});
    G.clock = save.clock ?? 9;
    if (save.pos) c.pos.set(save.pos.x, save.pos.y, save.pos.z);
    c.health = save.health || c.maxHealth;
    c.armor = save.armor || 0;
    Object.assign(G.flags, save.flags || {});
    G.missions.init(save.progress || 0, save.bestTimes);
    G.pickups.initGnomes(save.gnomes || []);
    G.stats.gnomes = G.pickups.collected.size;
    if (save.weapon && P.inv[save.weapon]) P.switchTo(save.weapon);
    G.hud.notify('Welcome back to Germany.', 3);
  } else {
    G.clock = 9.0;
    G.missions.init(0, {});
    G.pickups.initGnomes([]);
    G.hud.notify('Welcome to Autobahn Outlaws! Walk into the yellow marker and press E to start your first mission.', 7);
    setTimeout(() => G.hud.notify('Controls: WASD move · Mouse look · F steal/enter cars · M map · Esc pause.', 6), 600);
  }
  // ground snap
  c.pos.y = G.physics.groundAt(c.pos.x, c.pos.z, c.pos.y + 2);
  P.cam.yaw = c.heading;
  G.state = 'play';
  G.input.lock();
  G.time = G.time || 0;
  G.hud.area(G.hud.currentCity ? G.hud.currentCity.name : 'Hamburg', 'Freie und Hansestadt Hamburg');
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0, fpsT = 0;
G.frame = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.05);
  G.dt = dt;
  G.frame++;
  const I = G.input;
  I.update();
  try {
    if (G.state === 'play') stepGame(dt);
    else if (G.state === 'menu') stepMenu(dt);
    else if (G.state === 'map') {
      G.hud.drawBigMap();
      if (I.pressed('map') || I.pressed('pause')) { G.hud.openMap(false); G.state = 'play'; I.lock(); }
    }
    if (G.state === 'pause' && I.pressed('pause') && G.ui.current === 'pause' && performance.now() - (G.ui.pausedAt || 0) > 350) G.ui.resume();
    else if (G.state === 'shop' && I.pressed('pause')) G.ui.closeShop();
    commonUpdate(dt);
    G.renderer.render(G.scene, G.camera);
  } catch (e) {
    console.error(e);
    if (!G._errShown) { G._errShown = true; G.hud && G.hud.notify('Error: ' + e.message, 8); }
  }
  // fps
  fpsAcc += dt; fpsN++;
  if ((fpsT += dt) > 0.5) {
    if (G.settings && G.settings.fps && G.hud) G.hud.el.root.querySelector('#hud-fps').textContent = `${Math.round(fpsN / fpsAcc)} FPS · ${G.renderer.info.render.calls} calls`;
    else if (G.hud) G.hud.el.root.querySelector('#hud-fps').textContent = '';
    fpsAcc = 0; fpsN = 0; fpsT = 0;
  }
  I.endFrame();
}

function stepGame(dt) {
  const I = G.input;
  if (I.pressed('pause')) { G.ui.pause(); return; }
  if (I.pressed('map')) { G.hud.openMap(true); G.state = 'map'; I.unlock(true); return; }
  G.time += dt;
  G.clock = (G.clock + dt / 60) % 24; // one in-game hour per real minute
  G.player.update(dt);
  G.traffic.update(dt);
  G.vehicles.update(dt);
  G.peds.update(dt);
  G.police.update(dt);
  G.weapons.update(dt);
  G.pickups.update(dt);
  G.player.updateCamera(dt);
  G.missions.update(dt);
  G.ui.updateInteractions();
  G.hud.update(dt);
  G.audio.update();
}

// Cinematic flyover behind the title screen.
function stepMenu(dt) {
  G.menuT += dt;
  const t = G.menuT * 0.035;
  const c = CITY_BY_ID.berlin;
  const tower = G.world.landmarkSpots.find((l) => l.type === 'fernsehturm') || c;
  const r = 230;
  G.camera.position.set(tower.x + Math.cos(t) * r, c.y + 95 + Math.sin(t * 0.7) * 20, tower.z + Math.sin(t) * r);
  G.camera.lookAt(tower.x, c.y + 70, tower.z);
  G.clock = 18.2 + Math.sin(G.menuT * 0.02) * 0.6;
}

function commonUpdate(dt) {
  const cam = G.camera;
  const focus = G.state === 'menu' ? cam.position : G.player.pos;
  G.sky.update(G.clock, cam.position, focus, G.state === 'play' ? dt : dt * 0.2);
  // night lighting
  const night = G.sky.night;
  for (const m of G.world.nightMats) m.emissiveIntensity = night * 0.95;
  G.world.cityMats.lampMat.color.setRGB(0.4 + night * 0.6, 0.4 + night * 0.55, 0.35 + night * 0.35);
  G.world.cityMats.glowMat.opacity = night * 0.55;
  G.world.cityMats.glowMat.visible = night > 0.05;
  // headlight
  const hl = G.headlight;
  const v = G.player && G.player.vehicle;
  if (v && night > 0.3 && v.cls !== 'heli') {
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    hl.position.set(v.pos.x + fx * v.def.L * 0.5, v.pos.y + 1, v.pos.z + fz * v.def.L * 0.5);
    hl.target.position.set(v.pos.x + fx * 30, v.pos.y - 1, v.pos.z + fz * 30);
    hl.intensity = 60 * night;
  } else hl.intensity = 0;
  // distance culling
  const far = G.settings.drawDistance;
  if (G.frame % 10 === 0) {
    for (const g of G.world.cityGroups) {
      const c = g.userData.city;
      g.visible = Math.hypot(c.x - cam.position.x, c.z - cam.position.z) < far + c.r + 200;
    }
    const tf = far * 0.75;
    for (const t of G.world.treeChunks) t.visible = Math.hypot(t.userData.cx - cam.position.x, t.userData.cz - cam.position.z) < tf + 360;
  }
  updateRotors(G.world, dt);
  G.fx.update(dt);
  if (G.audio.ctx) {
    G.audio.setListener(cam.position.x, cam.position.y, cam.position.z, G.player ? G.player.cam.yaw : 0);
    if (G.state !== 'play') { G.audio.setEngine(false); G.audio.setSiren(null); G.audio.setHeli(false); }
  }
}

boot().catch((e) => { console.error(e); fatal('Unexpected error: ' + e.message); });
