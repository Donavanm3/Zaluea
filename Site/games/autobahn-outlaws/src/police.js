// Wanted level, crimes, police pursuit (cars, SEK vans, helicopters, cops on foot).
import * as THREE from 'three';
import { G } from './game.js';
import { Vehicle } from './vehicle.js';
import { clamp, lerp, wrapAngle, rand, pick } from './util.js';
import { CITIES } from './geo.js';

const THRESH = [0, 1, 4, 10, 20, 35];
const COP_LOOK = () => ({ skin: pick([0xf1c9a5, 0xe0ac86, 0xc68e63, 0x8d5a3b]), hair: 0x2b1d14, shirt: 0x1f2f4f, pants: 0x1a2438, shoes: 0x111111, cap: 0x1a2438, vest: Math.random() < 0.5 ? 0x243a5c : null, hairStyle: 0, female: Math.random() < 0.25 });
const SEK_LOOK = () => ({ skin: 0xe0ac86, hair: 0x111111, shirt: 0x1c1f24, pants: 0x1c1f24, shoes: 0x111111, helmet: 0x23262b, vest: 0x2e3238, hairStyle: 2, female: false });

class PoliceCarAI {
  constructor(veh, sek) {
    this.type = 'police';
    this.veh = veh;
    this.sek = sek;
    this.path = [];
    this.pathT = 0;
    this.stuckT = 0;
    this.revT = 0;
    this.copsOut = false;
    this.alive = true;
    this.cops = [];
  }

  update(dt) {
    const v = this.veh;
    if (v.dead || !this.alive) return;
    const P = G.police;
    v.siren = P.level > 0;
    if (P.level === 0) {
      // drive off
      v.ctrl.throttle = 0.4; v.ctrl.brake = 0; v.ctrl.steer = 0;
      return;
    }
    if (this.copsOut) {
      v.ctrl.throttle = 0; v.ctrl.brake = 1; v.ctrl.handbrake = true;
      // Re-enter and chase if the player drives off
      const pd = Math.hypot(G.player.pos.x - v.pos.x, G.player.pos.z - v.pos.z);
      if (G.player.vehicle && pd > 45 && this.cops.every((c) => !c.alive || Math.hypot(c.pos.x - v.pos.x, c.pos.z - v.pos.z) < 6)) {
        for (const c of this.cops) if (c.alive) G.peds.remove(c);
        this.cops = [];
        this.copsOut = false;
        v.ctrl.handbrake = false;
      }
      return;
    }
    const target = P.seen ? G.player.pos : P.lastSeen;
    const dx = target.x - v.pos.x, dz = target.z - v.pos.z;
    const d = Math.hypot(dx, dz);
    let aimX = target.x, aimZ = target.z;
    this.pathT -= dt;
    if (d > 70) {
      if (this.pathT <= 0 || !this.path.length) {
        this.pathT = 2.5;
        const net = G.world.roads;
        const a = net.nearestNode(v.pos.x, v.pos.z), b = net.nearestNode(target.x, target.z);
        const p = a && b ? net.findPath(a.id, b.id) : null;
        this.path = p ? net.pathPoints(p) : [];
      }
      while (this.path.length > 1 && Math.hypot(this.path[0].x - v.pos.x, this.path[0].z - v.pos.z) < 14) this.path.shift();
      if (this.path.length) { aimX = this.path[0].x; aimZ = this.path[0].z; }
    } else if (G.player.vehicle) {
      const pv = G.player.vehicle;
      aimX += pv.vel.x * 0.6; aimZ += pv.vel.z * 0.6;
    }
    const want = Math.atan2(aimX - v.pos.x, aimZ - v.pos.z);
    const err = wrapAngle(want - v.heading);
    const c = v.ctrl;
    let desired = d > 70 ? v.def.maxSpeed * 0.85 : clamp(d * 1.1, 4, 45);
    if (Math.abs(err) > 1.2) desired *= 0.35;
    if (this.revT > 0) {
      this.revT -= dt;
      c.throttle = 0; c.brake = 1; c.steer = clamp(err * 2, -1, 1); c.handbrake = false;
      return;
    }
    c.steer = clamp(-err * 2.3, -1, 1);
    c.throttle = v.speed < desired ? 1 : 0;
    c.brake = v.speed > desired + 5 ? 0.7 : 0;
    c.handbrake = Math.abs(err) > 1.4 && v.speed > 12;
    if (c.throttle > 0.5 && Math.abs(v.speed) < 1.2) {
      this.stuckT += dt;
      if (this.stuckT > 1.4) { this.revT = 1.3; this.stuckT = 0; }
    } else this.stuckT = Math.max(0, this.stuckT - dt);
    // bail out near a player on foot
    const onFoot = !G.player.vehicle;
    const pvSlow = G.player.vehicle && Math.abs(G.player.vehicle.speed) < 3;
    if (d < (onFoot ? 22 : 14) && (onFoot || pvSlow) && G.police.copsOnFoot() < 10) {
      if (Math.abs(v.speed) < 3) this.bail();
      else { c.throttle = 0; c.brake = 1; }
    }
  }

  bail() {
    const v = this.veh;
    this.copsOut = true;
    const n = this.sek ? 3 : 2;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const x = v.pos.x + fz * side * (v.def.W / 2 + 0.8) - fx * (i > 1 ? 1.5 : 0);
      const z = v.pos.z - fx * side * (v.def.W / 2 + 0.8) - fz * (i > 1 ? 1.5 : 0);
      const cop = G.police.spawnCop(x, v.pos.y, z, this.sek);
      this.cops.push(cop);
    }
    v.driver = null;
  }

  onShot() {}
}

class PoliceHeliAI {
  constructor(veh) {
    this.type = 'police';
    this.veh = veh;
    this.alive = true;
    this.fireT = 3;
    this.orbit = Math.random() * 6;
    veh.driver = this;
    veh.rotorSpeed = 1;
  }
  update(dt) {
    const v = this.veh;
    if (v.dead) return;
    const P = G.police;
    const t = P.seen ? G.player.pos : P.lastSeen;
    this.orbit += dt * 0.35;
    const ox = t.x + Math.cos(this.orbit) * 35, oz = t.z + Math.sin(this.orbit) * 35;
    const gy = G.physics.terrain.heightAt(ox, oz);
    const ty = Math.max(gy, t.y) + 42;
    const c = v.ctrl;
    const dx = ox - v.pos.x, dz = oz - v.pos.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const err = wrapAngle(want - v.heading);
    c.steer = clamp(-err * 1.5, -1, 1);
    c.throttle = d > 20 ? clamp(d / 60, 0.3, 1) * (Math.abs(err) < 1 ? 1 : 0.3) : 0;
    c.brake = d < 10 ? 0.5 : 0;
    c.lift = clamp((ty - v.pos.y) * 0.2, -1, 1);
    if (P.level === 0) { c.lift = 1; c.throttle = 1; }
    // Face the player when close to shoot
    this.fireT -= dt;
    const pd = Math.hypot(G.player.pos.x - v.pos.x, G.player.pos.z - v.pos.z);
    if (P.level >= 3 && this.fireT <= 0 && pd < 110) {
      this.fireT = rand(1.4, 2.4);
      const from = new THREE.Vector3(v.pos.x, v.pos.y + 0.5, v.pos.z);
      const tp = G.player.pos;
      const dir = new THREE.Vector3(tp.x - from.x, tp.y + 1 - from.y, tp.z - from.z).normalize();
      if (G.physics.lineOfSight(from.x, from.y, from.z, tp.x, tp.y + 1.2, tp.z)) {
        G.weapons.fire(null, 'rifle', from, dir, { extraSpread: 0.06, dmgMul: 0.28, vehicle: v });
      }
    }
    G.audio.setHeli(true, 1, v.pos);
  }
  onShot() {}
}

export class Police {
  constructor() {
    this.heat = 0;
    this.level = 0;
    this.units = [];
    this.helis = [];
    this.cops = [];
    this.seen = false;
    this.lastSeen = new THREE.Vector3();
    this.evadeT = 0;
    this.spawnT = 0;
    this.flash = 0;
    this.gunfireHeat = 0;
  }

  setHeat(h) {
    const old = this.level;
    this.heat = Math.min(60, h);
    let lvl = 0;
    for (let i = 1; i < THRESH.length; i++) if (this.heat >= THRESH[i]) lvl = i;
    if (G.flags.maxWanted !== undefined) lvl = Math.min(lvl, G.flags.maxWanted);
    this.level = lvl;
    if (lvl > old) {
      G.audio.ui('wanted');
      this.lastSeen.copy(G.player.pos);
      this.seen = true;
      this.evadeT = 0;
      if (lvl > G.stats.wantedMax) G.stats.wantedMax = lvl;
      if (old === 0) G.hud.notify('The Polizei are after you!', 3);
    }
  }

  setLevel(lvl) {
    this.setHeat(Math.max(this.heat, THRESH[lvl] + 0.1));
  }

  witnessed(pos, r = 70) {
    // Cops nearby, or in a city (people call 110)
    if (this.nearCop(pos, r)) return true;
    for (const c of CITIES) if (Math.hypot(c.x - pos.x, c.z - pos.z) < c.r + 20) return true;
    for (const p of G.peds.list) if (p.alive && p.ai.role === 'civ' && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 40) return true;
    return false;
  }

  nearCop(pos, r) {
    for (const v of G.vehicles.list) {
      if (v.isPolice && !v.dead && (v.driver || v.ai) && Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z) < r) return true;
    }
    for (const c of G.peds.list) if (c.alive && c.ai.role === 'cop' && Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < r) return true;
    return false;
  }

  crime(type, pos, amount) {
    if (G.flags.noWanted) return;
    let a = amount;
    switch (type) {
      case 'theft': a = this.nearCop(pos, 35) ? 1.2 : 0; break;
      case 'carjack': a = this.nearCop(pos, 60) ? 1.5 : Math.random() < 0.35 && this.witnessed(pos) ? 1 : 0; break;
      case 'stealCop': a = 1.2; break;
      case 'murder': a = this.witnessed(pos) ? 2.2 : 0.8; break;
      case 'assault': a = this.witnessed(pos) ? amount : 0; break;
      case 'killCop': a = 6; break;
      case 'attackCop': a = amount; break;
      case 'rammedCop': a = this.level > 0 ? 0.3 : 1.1; break;
      case 'gunfire': a = amount; break;
    }
    if (a <= 0) return;
    // Existing pursuit escalates faster
    this.setHeat(Math.max(this.heat + a, a >= 1 ? THRESH[1] + 0.01 : this.heat + a));
    if (this.nearCop(pos, 80)) { this.seen = true; this.lastSeen.copy(pos); this.evadeT = 0; }
  }

  onGunfire(pos, big) {
    if (this.nearCop(pos, 90) || this.witnessed(pos)) {
      this.gunfireHeat += big ? 1 : 0.25;
      if (this.level === 0 && this.gunfireHeat >= 0.25) this.crime('gunfire', pos, 1.01);
      else this.crime('gunfire', pos, big ? 0.8 : 0.08);
    }
  }

  onPlayerHit(c, killed, melee = false) {
    if (!c.ai) return;
    if (c.ai.role === 'cop') this.crime(killed ? 'killCop' : 'attackCop', c.pos, killed ? 6 : melee ? 1.2 : 2);
    else if (c.ai.role === 'civ' || c.ai.role === 'vip') this.crime(killed ? 'murder' : 'assault', c.pos, melee ? 0.25 : 0.8);
  }

  onRunOver(c, killed) {
    if (!c.ai) return;
    if (c.ai.role === 'cop') this.crime(killed ? 'killCop' : 'attackCop', c.pos, 2);
    else this.crime(killed ? 'murder' : 'assault', c.pos, 0.6);
  }

  copsOnFoot() { return this.cops.filter((c) => c.alive).length; }

  spawnCop(x, y, z, sek) {
    const cop = G.peds.spawnAt(x, G.physics.groundAt(x, z, y + 1.5), z, sek ? SEK_LOOK() : COP_LOOK(), 'cop', sek ? pick(['smg', 'rifle']) : Math.random() < 0.8 ? 'pistol' : 'shotgun');
    cop.ai.state = 'fight';
    cop.ai.target = G.player.char;
    cop.ai.accuracy = sek ? 0.65 : 0.45;
    cop.ai.timer = 999;
    cop.ai.persist = false;
    cop.health = sek ? 150 : 100;
    cop.armor = sek ? 60 : 20;
    cop.ai.dropMoney = 0;
    this.cops.push(cop);
    return cop;
  }

  spawnUnit(kind) {
    const P = G.player.pos;
    const net = G.world.roads;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, d = rand(110, 190);
      const near = net.nearestOnRoad(P.x + Math.cos(a) * d, P.z + Math.sin(a) * d, 60);
      if (!near) continue;
      const p = net.pointAt(near.edge, near.s);
      if (Math.hypot(p.x - P.x, p.z - P.z) < 80) continue;
      const heading = Math.atan2(P.x - p.x, P.z - p.z);
      const v = G.vehicles.spawn(kind, p.x, p.y, p.z, heading);
      const ai = new PoliceCarAI(v, kind === 'sek');
      v.ai = ai; v.driver = ai;
      v.siren = true;
      this.units.push(ai);
      return v;
    }
    return null;
  }

  spawnHeli() {
    const P = G.player.pos;
    const a = Math.random() * Math.PI * 2;
    const x = P.x + Math.cos(a) * 220, z = P.z + Math.sin(a) * 220;
    const y = G.physics.terrain.heightAt(x, z) + 60;
    const v = G.vehicles.spawn('polizeiheli', x, y, z, Math.atan2(P.x - x, P.z - z));
    v.rotorSpeed = 1;
    const ai = new PoliceHeliAI(v);
    v.ai = ai;
    this.helis.push(ai);
  }

  clear() {
    this.heat = 0;
    this.level = 0;
    this.gunfireHeat = 0;
    this.evadeT = 0;
    const P = G.player.pos;
    for (const u of [...this.units, ...this.helis]) {
      const v = u.veh;
      u.alive = false;
      v.siren = false;
      if (Math.hypot(v.pos.x - P.x, v.pos.z - P.z) > 60 || v.cls === 'heli') G.vehicles.remove(v);
      else { v.ai = null; v.driver = null; v.ctrl.throttle = 0; v.ctrl.brake = 1; }
    }
    this.units = [];
    this.helis = [];
    for (const c of this.cops) {
      if (!c.alive) continue;
      if (Math.hypot(c.pos.x - P.x, c.pos.z - P.z) > 50) G.peds.remove(c);
      else { c.ai.role = 'civ'; c.ai.state = 'flee'; c.ai.timer = 30; c.ai.fleeFrom = { x: P.x, z: P.z }; c.aim = false; }
    }
    this.cops = [];
    G.audio.setSiren(null);
    G.audio.setHeli(false);
  }

  evadeTime() { return 7 + this.level * 3.5; }
  searchRadius() { return 70 + this.level * 45; }

  update(dt) {
    this.gunfireHeat = Math.max(0, this.gunfireHeat - dt * 0.2);
    // ambient patrol cars in traffic react to the player
    const P = G.player.pos;
    if (this.level === 0) {
      G.audio.setSiren(null);
      if (this.helis.length) { for (const h of this.helis) G.vehicles.remove(h.veh); this.helis = []; G.audio.setHeli(false); }
      return;
    }
    // sight check
    this.sightT = (this.sightT || 0) - dt;
    if (this.sightT <= 0) {
      this.sightT = 0.5;
      let seen = false;
      const eye = G.player.vehicle ? G.player.vehicle.pos : G.player.char.pos;
      for (const u of this.units) {
        const v = u.veh;
        if (v.dead) continue;
        const d = Math.hypot(v.pos.x - eye.x, v.pos.z - eye.z);
        if (d < 110 && G.physics.lineOfSight(v.pos.x, v.pos.y + 1.4, v.pos.z, eye.x, eye.y + 1.2, eye.z)) { seen = true; break; }
      }
      if (!seen) for (const c of this.cops) {
        if (!c.alive) continue;
        const d = Math.hypot(c.pos.x - eye.x, c.pos.z - eye.z);
        if (d < 80 && G.physics.lineOfSight(c.pos.x, c.pos.y + 1.6, c.pos.z, eye.x, eye.y + 1.2, eye.z)) { seen = true; break; }
      }
      if (!seen) for (const h of this.helis) {
        if (h.veh.dead) continue;
        if (Math.hypot(h.veh.pos.x - eye.x, h.veh.pos.z - eye.z) < 90 && G.sky.night < 0.6) { seen = true; break; }
      }
      this.seen = seen;
      if (seen) { this.lastSeen.copy(eye); this.evadeT = 0; }
    }
    if (!this.seen) {
      this.evadeT += dt;
      const far = Math.hypot(P.x - this.lastSeen.x, P.z - this.lastSeen.z) > this.searchRadius() * 0.5;
      if (this.evadeT > this.evadeTime() && (far || this.evadeT > this.evadeTime() * 2)) {
        G.hud.notify('You lost the police.', 3);
        this.clear();
        return;
      }
    }
    // spawn units
    const wantCars = [0, 1, 2, 3, 4, 6][this.level];
    const wantHeli = this.level >= 3 ? (this.level >= 5 ? 2 : 1) : 0;
    this.units = this.units.filter((u) => {
      const v = u.veh;
      const d = Math.hypot(v.pos.x - P.x, v.pos.z - P.z);
      if (v.dead || d > 380) {
        if (d > 380 && G.vehicles.list.includes(v)) G.vehicles.remove(v);
        return false;
      }
      return true;
    });
    this.cops = this.cops.filter((c) => {
      if (!G.peds.list.includes(c)) return false;
      if (Math.hypot(c.pos.x - P.x, c.pos.z - P.z) > 200) { G.peds.remove(c); return false; }
      return c.alive;
    });
    this.helis = this.helis.filter((h) => !h.veh.dead && G.vehicles.list.includes(h.veh));
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.2;
      const active = this.units.filter((u) => !u.copsOut).length;
      if (active < wantCars) this.spawnUnit(this.level >= 4 && Math.random() < 0.4 ? 'sek' : 'polizei');
      if (this.helis.length < wantHeli) this.spawnHeli();
    }
    // siren audio from nearest unit
    let near = null, nd = Infinity;
    for (const u of this.units) {
      if (!u.veh.siren || u.veh.dead) continue;
      const d = Math.hypot(u.veh.pos.x - P.x, u.veh.pos.z - P.z);
      if (d < nd) { nd = d; near = u.veh.pos; }
    }
    G.audio.setSiren(near);
    if (!this.helis.length) G.audio.setHeli(G.player.vehicle && G.player.vehicle.cls === 'heli', 1, G.player.pos);
    // bust in car: stopped car next to cops at low wanted
    if (G.player.vehicle && this.level <= 1 && Math.abs(G.player.vehicle.speed) < 1) {
      let close = false;
      for (const c of this.cops) if (c.alive && Math.hypot(c.pos.x - P.x, c.pos.z - P.z) < 3.5) close = true;
      this.carBustT = close ? (this.carBustT || 0) + dt : 0;
      if (this.carBustT > 2.5) { this.carBustT = 0; G.player.arrest(); }
    }
  }
}
