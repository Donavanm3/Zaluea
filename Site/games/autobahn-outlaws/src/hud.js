// HUD: minimap with GPS, full map, money/wanted/weapon, notifications,
// subtitles, big messages, speedometer and markers in the 3D world.
import * as THREE from 'three';
import { G } from './game.js';
import { WEAPONS } from './weapons.js';
import { CITIES, REAL_KM_PER_M } from './geo.js';
import { GRID } from './terrain.js';
import { MAP_SCALE } from './world.js';
import { clamp, formatMoney, formatTime } from './util.js';

const $ = (id) => document.getElementById(id);

const SERVICE_ICON = { hospital: ['H', '#e74c3c'], police: ['P', '#3b6fd6'], gunshop: ['W', '#f39c12'], respray: ['L', '#9b59b6'], safehouse: ['⌂', '#2ecc71'], fuel: ['T', '#e67e22'], club: ['♪', '#ff4fd8'], bank: ['€', '#1abc9c'] };

export class HUD {
  constructor() {
    this.el = {
      root: $('hud'), money: $('hud-money'), stars: $('hud-stars'), weapon: $('hud-weapon'), ammo: $('hud-ammo'), clock: $('hud-clock'),
      health: $('hud-health'), armor: $('hud-armor'), notify: $('hud-notify'), area: $('hud-area'), areaName: $('hud-area-name'), areaSub: $('hud-area-sub'),
      veh: $('hud-veh'), speed: $('hud-speed'), speedVal: $('hud-speed-val'), objective: $('hud-objective'), timer: $('hud-timer'), sub: $('hud-sub'),
      big: $('hud-big'), bigTitle: $('hud-big-title'), bigSub: $('hud-big-sub'), cross: $('hud-cross'), hit: $('hud-hit'), dmg: $('hud-dmg'),
      prompt: $('hud-prompt'), moneyPop: $('hud-money-pop'), road: $('hud-road'), scope: $('hud-scope'), counter: $('hud-counter'),
    };
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.bigMap = $('bigmap');
    this.bctx = this.bigMap.getContext('2d');
    this.notifyQ = [];
    this.notifyT = 0;
    this.areaT = 0;
    this.vehT = 0;
    this.subT = 0;
    this.bigT = 0;
    this.currentCity = null;
    this.lastRoad = null;
    this.waypoint = null;
    this.gps = null; // {target, path, t}
    this.blips = [];
    this.markers = [];
    this.map = { open: false, zoom: 1, cx: 0, cz: 0, drag: null };
    this.moneyShown = 0;
    this.last = {};
    this.initMarkers();
    this.initBigMap();
  }

  // ---------- 3D markers ----------
  initMarkers() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    this.markerGeo = geo;
    this.ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 32);
  }
  addMarker(x, y, z, opts = {}) {
    const color = opts.color || 0xf2c200;
    const r = opts.r || 1.5;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(this.markerGeo, mat);
    m.scale.set(r, opts.h || 2.2, r);
    m.position.set(x, y + (opts.h || 2.2) / 2, z);
    m.renderOrder = 6;
    G.scene.add(m);
    const mk = { mesh: m, x, y, z, r, opts, blip: opts.blip !== false, color, label: opts.label };
    if (opts.checkpoint) {
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
      ring.scale.setScalar(r * 1.1);
      ring.position.set(x, y + 4, z);
      G.scene.add(ring);
      mk.ring = ring;
      m.scale.y = 8; m.position.y = y + 4;
    }
    this.markers.push(mk);
    return mk;
  }
  removeMarker(mk) {
    if (!mk) return;
    G.scene.remove(mk.mesh);
    mk.mesh.material.dispose();
    if (mk.ring) G.scene.remove(mk.ring);
    const i = this.markers.indexOf(mk);
    if (i >= 0) this.markers.splice(i, 1);
  }

  // ---------- messages ----------
  notify(text, dur = 4) {
    if (this.notifyQ.length && this.notifyQ[this.notifyQ.length - 1].text === text) return;
    if (this.el.notify.textContent === text && this.notifyT > 0) { this.notifyT = dur; return; }
    this.notifyQ.push({ text, dur });
    if (this.notifyQ.length > 4) this.notifyQ.shift();
  }
  subtitle(text, dur = 4, speaker) {
    this.el.sub.innerHTML = speaker ? `<b>${speaker}:</b> ${text}` : text;
    this.el.sub.style.opacity = 1;
    this.subT = dur;
  }
  objective(text) {
    this.el.objective.innerHTML = text || '';
    this.el.objective.style.display = text ? 'block' : 'none';
  }
  timer(sec) {
    if (sec === null || sec === undefined) { this.el.timer.style.display = 'none'; return; }
    this.el.timer.style.display = 'block';
    this.el.timer.textContent = formatTime(sec);
    this.el.timer.classList.toggle('low', sec < 15);
  }
  counter(text) {
    this.el.counter.style.display = text ? 'block' : 'none';
    this.el.counter.textContent = text || '';
  }
  bigMessage(title, color, sub, dur = 4.5) {
    this.el.bigTitle.textContent = title;
    this.el.bigTitle.style.color = color || '#f2c200';
    this.el.bigSub.textContent = sub || '';
    this.el.big.classList.add('show');
    this.bigT = dur;
  }
  clearBig() { this.el.big.classList.remove('show'); this.bigT = 0; }
  vehicleName(name, radio) {
    this.el.veh.innerHTML = (name ? `<div class="vn">${name}</div>` : '') + (radio ? `<div class="rn">📻 ${radio}</div>` : '');
    this.el.veh.style.opacity = 1;
    this.vehT = 3.5;
  }
  area(name, sub) {
    this.el.areaName.textContent = name;
    this.el.areaSub.textContent = sub || '';
    this.el.area.style.opacity = 1;
    this.areaT = 4;
  }
  prompt(text) {
    if (this.last.prompt === text) return;
    this.last.prompt = text;
    this.el.prompt.style.display = text ? 'block' : 'none';
    this.el.prompt.innerHTML = text || '';
  }
  damageFlash(a) {
    this.dmgA = Math.min(1, (this.dmgA || 0) + a * 0.8);
  }
  hitMarker(kill) {
    this.el.hit.classList.remove('show', 'kill');
    void this.el.hit.offsetWidth;
    this.el.hit.classList.add('show');
    if (kill) this.el.hit.classList.add('kill');
  }
  moneyPop(v) {
    const el = this.el.moneyPop;
    el.textContent = (v >= 0 ? '+' : '') + formatMoney(v).replace('€-', '-€');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  setWaypoint(x, z) {
    this.waypoint = x === null ? null : { x, z };
    this.gps = null;
    if (this.waypoint) this.notify('Waypoint set.', 2);
  }

  gpsTarget() {
    if (G.missions && G.missions.gpsTarget) return G.missions.gpsTarget;
    return this.waypoint;
  }

  updateGPS(dt) {
    const t = this.gpsTarget();
    if (!t) { this.gps = null; return; }
    const P = G.player.pos;
    if (Math.hypot(t.x - P.x, t.z - P.z) < 40) { this.gps = { target: t, path: [] }; if (t === this.waypoint && Math.hypot(t.x - P.x, t.z - P.z) < 15) { this.waypoint = null; this.notify('Destination reached.', 2); } return; }
    const need = !this.gps || this.gps.target !== t || (this.gps.t -= dt) <= 0;
    if (!need) return;
    const net = G.world.roads;
    const a = net.nearestNode(P.x, P.z), b = net.nearestNode(t.x, t.z);
    const path = a && b ? net.findPath(a.id, b.id) : null;
    const pts = path ? net.pathPoints(path) : [];
    this.gps = { target: t, path: [{ x: P.x, z: P.z }, ...pts, { x: t.x, z: t.z }], t: 2.5 };
    // total distance
    let L = 0;
    for (let i = 1; i < this.gps.path.length; i++) L += Math.hypot(this.gps.path[i].x - this.gps.path[i - 1].x, this.gps.path[i].z - this.gps.path[i - 1].z);
    this.gps.m = L;
  }

  // ---------- per frame ----------
  update(dt) {
    const P = G.player, c = P.char;
    // money counter animation
    if (this.moneyShown !== G.money) {
      const diff = G.money - this.moneyShown;
      this.moneyShown += Math.abs(diff) < 2 ? diff : diff * Math.min(1, dt * 6);
      if (Math.abs(G.money - this.moneyShown) < 1) this.moneyShown = G.money;
      this.el.money.textContent = formatMoney(Math.round(this.moneyShown));
    }
    // wanted stars
    const lvl = G.police.level;
    const flash = lvl > 0 && !G.police.seen && Math.floor(G.time * 3) % 2 === 0;
    const starKey = lvl + (flash ? 'f' : '');
    if (this.last.stars !== starKey) {
      this.last.stars = starKey;
      let h = '';
      for (let i = 1; i <= 5; i++) h += `<span class="${i <= lvl ? (flash ? 'star dim' : 'star on') : 'star'}">★</span>`;
      this.el.stars.innerHTML = h;
      this.el.stars.style.opacity = lvl > 0 ? 1 : 0.35;
    }
    // weapon
    const w = WEAPONS[P.weapon];
    const inv = P.inv[P.weapon];
    const ammoTxt = w.melee ? '' : w.throw ? `${inv.mag}` : `${inv.mag} / ${inv.ammo}`;
    const wkey = w.name + ammoTxt + (P.reloadT > 0 ? 'r' : '');
    if (this.last.w !== wkey) {
      this.last.w = wkey;
      this.el.weapon.textContent = `${w.icon} ${w.name}`;
      this.el.ammo.textContent = P.reloadT > 0 ? 'Reloading…' : ammoTxt;
    }
    // clock
    const hh = Math.floor(G.clock), mm = Math.floor((G.clock - hh) * 60);
    const ck = `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
    if (this.last.ck !== ck) { this.last.ck = ck; this.el.clock.textContent = ck; }
    // bars
    const hp = clamp(c.health / c.maxHealth, 0, 1), ar = clamp(c.armor / 100, 0, 1);
    this.el.health.style.width = (hp * 100).toFixed(1) + '%';
    this.el.health.classList.toggle('low', hp < 0.3);
    this.el.armor.style.width = (ar * 100).toFixed(1) + '%';
    // notifications
    if (this.notifyT > 0) {
      this.notifyT -= dt;
      if (this.notifyT <= 0) this.el.notify.classList.remove('show');
    } else if (this.notifyQ.length) {
      const n = this.notifyQ.shift();
      this.el.notify.textContent = n.text;
      this.el.notify.classList.add('show');
      this.notifyT = n.dur;
    }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.sub.style.opacity = 0; }
    if (this.areaT > 0) { this.areaT -= dt; if (this.areaT <= 0) this.el.area.style.opacity = 0; }
    if (this.vehT > 0) { this.vehT -= dt; if (this.vehT <= 0) this.el.veh.style.opacity = 0; }
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0 && !P.dead && !P.busted) this.clearBig(); }
    this.dmgA = Math.max(0, (this.dmgA || 0) - dt * 1.5);
    const lowHp = hp < 0.25 ? 0.25 + Math.sin(G.time * 5) * 0.1 : 0;
    this.el.dmg.style.opacity = Math.max(this.dmgA, lowHp).toFixed(2);

    // speedometer
    if (P.vehicle) {
      const kmh = Math.round(Math.abs(P.vehicle.speed) * 3.6);
      if (this.last.kmh !== kmh) { this.last.kmh = kmh; this.el.speedVal.textContent = kmh; }
      this.el.speed.style.display = 'block';
      if (P.vehicle.cls === 'heli') {
        const alt = Math.round(P.vehicle.pos.y - G.physics.terrain.heightAt(P.vehicle.pos.x, P.vehicle.pos.z));
        this.el.speed.dataset.alt = `ALT ${alt} m`;
      } else this.el.speed.dataset.alt = '';
    } else this.el.speed.style.display = 'none';
    // crosshair
    const showCross = !P.vehicle && !P.dead && (c.aim || G.input.aiming()) && !w.melee && !P.scoped;
    const showDriveby = P.vehicle && G.input.aiming() && (P.weapon === 'pistol' || P.weapon === 'smg');
    this.el.cross.style.display = showCross || showDriveby ? 'block' : 'none';
    this.el.scope.style.display = P.scoped ? 'block' : 'none';

    // area detection
    this.areaCheckT = (this.areaCheckT || 0) - dt;
    if (this.areaCheckT <= 0) {
      this.areaCheckT = 1;
      const p = P.pos;
      let city = null;
      for (const cc of CITIES) if (Math.hypot(cc.x - p.x, cc.z - p.z) < cc.r + 30) { city = cc; break; }
      if (city !== this.currentCity) {
        this.currentCity = city;
        if (city) this.area(city.name, city.state);
      }
      if (P.vehicle && P.vehicle.cls !== 'heli' && !city) {
        const near = G.world.roads.nearestOnRoad(p.x, p.z, 16, (e) => e.type !== 'city');
        const road = near ? near.edge.name : null;
        if (road && road !== this.lastRoad) {
          const e = near.edge;
          this.area(road, `${G.world.roads.grids[e.from].city.name} ↔ ${G.world.roads.grids[e.to].city.name}` + (e.type === 'autobahn' ? ' · Kein Tempolimit (no speed limit)' : ''));
        }
        this.lastRoad = road;
      } else if (city) this.lastRoad = null;
    }
    // markers bob
    for (const mk of this.markers) {
      mk.mesh.material.opacity = 0.25 + Math.sin(G.time * 3) * 0.08;
      if (mk.ring) mk.ring.rotation.y += dt;
    }
    this.updateGPS(dt);
    this.drawMinimap();
    if (this.map.open) this.drawBigMap();
  }

  worldToMini(x, z, P, yaw, scale, R) {
    const dx = (x - P.x) / scale, dz = (z - P.z) / scale;
    const th = yaw - Math.PI;
    const c = Math.cos(th), s = Math.sin(th);
    let sx = dx * c - dz * s, sy = dx * s + dz * c;
    const d = Math.hypot(sx, sy);
    let clamped = false;
    if (d > R) { sx *= R / d; sy *= R / d; clamped = true; }
    return [sx, sy, clamped];
  }

  drawMinimap() {
    const ctx = this.mctx;
    const W = this.mini.width, H = this.mini.height;
    const P = G.player.pos;
    const yaw = G.player.cam.yaw;
    const spd = G.player.vehicle ? Math.abs(G.player.vehicle.speed) : 0;
    const scale = (G.player.vehicle && G.player.vehicle.cls === 'heli' ? 2.2 : 1.1) + clamp(spd / 50, 0, 1) * 1.1; // world m per minimap px
    const R = W / 2 - 4;
    const map = G.world.map;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#34608a';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(yaw - Math.PI);
    const k = MAP_SCALE / scale;
    ctx.drawImage(map.canvas, -map.px(P.x) * k, -map.pz(P.z) * k, map.W * k, map.H * k);
    // GPS route
    if (this.gps && this.gps.path.length > 1) {
      ctx.strokeStyle = G.missions && G.missions.gpsTarget ? '#f2c200' : '#d040d0';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.gps.path.forEach((p, i) => {
        const x = (p.x - P.x) / scale, y = (p.z - P.z) / scale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    // blips
    const drawBlip = (x, z, color, size = 5, text, always = false) => {
      const [sx, sy, cl] = this.worldToMini(x, z, P, yaw, scale, R - 6);
      if (cl && !always) return;
      if (text) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, sx, sy + 0.5);
      } else {
        ctx.fillStyle = color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    };
    for (const s of G.world.services) {
      if (Math.abs(s.x - P.x) > 400 || Math.abs(s.z - P.z) > 400) continue;
      const ic = SERVICE_ICON[s.type];
      if (ic) drawBlip(s.x, s.z, ic[1], 5, ic[0]);
    }
    if (G.missions) for (const b of G.missions.blips()) drawBlip(b.x, b.z, b.color, b.size || 5, b.text, b.always);
    // police
    const flash = Math.floor(G.time * 4) % 2 === 0;
    for (const v of G.vehicles.list) {
      if (v.isPolice && (v.siren || v.ai) && !v.dead) drawBlip(v.pos.x, v.pos.z, flash ? '#3060ff' : '#ff3030', 4);
    }
    for (const c of G.peds.list) {
      if (!c.alive) continue;
      if (c.ai.role === 'cop' && G.police.level > 0) drawBlip(c.pos.x, c.pos.z, flash ? '#3060ff' : '#ff3030', 3);
      else if (c.ai.blip) drawBlip(c.pos.x, c.pos.z, c.ai.blip, 4, null, c.ai.blipAlways);
    }
    if (this.waypoint) drawBlip(this.waypoint.x, this.waypoint.z, '#d040d0', 6, null, true);
    // search radius when wanted
    if (G.police.level > 0 && !G.police.seen) {
      const ls = G.police.lastSeen;
      const [sx, sy] = this.worldToMini(ls.x, ls.z, P, yaw, scale, 9999);
      ctx.strokeStyle = flash ? 'rgba(255,60,60,0.8)' : 'rgba(60,90,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, G.police.searchRadius() * 0.5 / scale, 0, Math.PI * 2); ctx.stroke();
    }
    // player arrow
    const ph = G.player.vehicle ? G.player.vehicle.heading : G.player.char.heading;
    ctx.rotate(-(ph - yaw));
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // north indicator
    const [nx, ny] = this.worldToMini(P.x, P.z - 99999, P, yaw, scale, R - 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', W / 2 + nx, H / 2 + ny);
    // GPS distance
    if (this.gps && this.gps.m) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W / 2 - 34, H - 22, 68, 16);
      ctx.fillStyle = '#fff';
      ctx.font = '11px Arial';
      const m = this.gps.m;
      ctx.fillText(m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km', W / 2, H - 14);
    }
  }

  // ---------- Full map ----------
  initBigMap() {
    const cv = this.bigMap;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.map.zoom = clamp(this.map.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.5, 8);
    }, { passive: false });
    cv.addEventListener('mousedown', (e) => { this.map.drag = { x: e.clientX, y: e.clientY, cx: this.map.cx, cz: this.map.cz, moved: false }; });
    addEventListener('mousemove', (e) => {
      const d = this.map.drag;
      if (!d) return;
      const s = this.mapScale();
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      this.map.cx = d.cx - dx / s; this.map.cz = d.cz - dy / s;
    });
    addEventListener('mouseup', (e) => {
      const d = this.map.drag;
      this.map.drag = null;
      if (!d || d.moved || !this.map.open) return;
      const r = cv.getBoundingClientRect();
      const s = this.mapScale();
      const x = this.map.cx + (e.clientX - r.left - r.width / 2) / s;
      const z = this.map.cz + (e.clientY - r.top - r.height / 2) / s;
      if (e.button === 2 || (this.waypoint && Math.hypot(this.waypoint.x - x, this.waypoint.z - z) < 30 / s)) this.setWaypoint(null);
      else this.setWaypoint(x, z);
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  mapScale() {
    const cv = this.bigMap;
    const fit = Math.min(cv.width / (GRID.X1 - GRID.X0), cv.height / (GRID.Z1 - GRID.Z0)) * 1.15;
    return fit * this.map.zoom;
  }
  openMap(open) {
    this.map.open = open;
    this.bigMap.parentElement.style.display = open ? 'flex' : 'none';
    if (open) {
      this.bigMap.width = innerWidth; this.bigMap.height = innerHeight;
      this.map.cx = G.player.pos.x; this.map.cz = G.player.pos.z;
      this.map.zoom = 2.2;
    }
  }
  drawBigMap() {
    const ctx = this.bctx, cv = this.bigMap;
    const W = cv.width, H = cv.height;
    const s = this.mapScale();
    const map = G.world.map;
    ctx.fillStyle = '#23405e';
    ctx.fillRect(0, 0, W, H);
    const tx = (x) => W / 2 + (x - this.map.cx) * s, tz = (z) => H / 2 + (z - this.map.cz) * s;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(map.canvas, tx(GRID.X0), tz(GRID.Z0), (GRID.X1 - GRID.X0) * s, (GRID.Z1 - GRID.Z0) * s);
    if (this.gps && this.gps.path.length > 1) {
      ctx.strokeStyle = G.missions && G.missions.gpsTarget ? '#f2c200' : '#d040d0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      this.gps.path.forEach((p, i) => (i ? ctx.lineTo(tx(p.x), tz(p.z)) : ctx.moveTo(tx(p.x), tz(p.z))));
      ctx.stroke();
    }
    // cities
    ctx.textAlign = 'center';
    for (const c of CITIES) {
      const big = c.r >= 140;
      if (!big && this.map.zoom < 1.3) continue;
      ctx.font = `${big ? 'bold ' : ''}${big ? 15 : 12}px Arial`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(c.name, tx(c.x), tz(c.z) - c.r * s - 6);
      ctx.fillStyle = '#fff';
      ctx.fillText(c.name, tx(c.x), tz(c.z) - c.r * s - 6);
    }
    // services
    if (this.map.zoom > 2.5) for (const sv of G.world.services) {
      const ic = SERVICE_ICON[sv.type];
      if (!ic) continue;
      ctx.fillStyle = ic[1];
      ctx.beginPath(); ctx.arc(tx(sv.x), tz(sv.z), 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textBaseline = 'middle';
      ctx.fillText(ic[0], tx(sv.x), tz(sv.z) + 0.5);
      ctx.textBaseline = 'alphabetic';
    }
    if (G.missions) for (const b of G.missions.blips()) {
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.arc(tx(b.x), tz(b.z), 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      if (b.text) { ctx.fillStyle = '#000'; ctx.font = 'bold 11px Arial'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, tx(b.x), tz(b.z) + 0.5); ctx.textBaseline = 'alphabetic'; }
      if (b.label && this.map.zoom > 1) { ctx.fillStyle = '#fff'; ctx.font = '12px Arial'; ctx.fillText(b.label, tx(b.x), tz(b.z) + 22); }
    }
    if (this.waypoint) {
      ctx.fillStyle = '#d040d0';
      ctx.beginPath(); ctx.arc(tx(this.waypoint.x), tz(this.waypoint.z), 8, 0, Math.PI * 2); ctx.fill();
    }
    // player
    const P = G.player.pos;
    const h = G.player.vehicle ? G.player.vehicle.heading : G.player.char.heading;
    ctx.save();
    ctx.translate(tx(P.x), tz(P.z));
    ctx.rotate(-h + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // legend
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(16, H - 150, 260, 134);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('KARTE VON DEUTSCHLAND', 28, H - 128);
    ctx.font = '12px Arial';
    const leg = [['#f2c200', 'Mission'], ['#d040d0', 'Waypoint (click)'], ['#e74c3c', 'H Hospital'], ['#f39c12', 'W Gun shop'], ['#9b59b6', 'L Respray'], ['#2ecc71', '⌂ Safehouse']];
    leg.forEach(([col, t], i) => {
      ctx.fillStyle = col; ctx.fillRect(28 + (i % 2) * 120, H - 112 + Math.floor(i / 2) * 20, 10, 10);
      ctx.fillStyle = '#fff'; ctx.fillText(t, 44 + (i % 2) * 120, H - 103 + Math.floor(i / 2) * 20);
    });
    ctx.fillStyle = '#ccc';
    ctx.fillText('Drag to pan · Wheel to zoom · M/Esc to close', 28, H - 34);
  }
}
