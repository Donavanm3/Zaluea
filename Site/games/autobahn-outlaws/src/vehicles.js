// Vehicle manager: spawning parked cars/boats/helicopters, collisions between
// vehicles and with people, and despawning.
import * as THREE from 'three';
import { G } from './game.js';
import { Vehicle } from './vehicle.js';
import { pick, rand } from './util.js';
import { LAKES, CITIES, CITY_BY_ID } from './geo.js';

export class VehicleManager {
  constructor() {
    this.list = [];
    this.spots = [];
    this.scanT = 0;
  }

  add(v) { this.list.push(v); return v; }
  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    if (v.spot) { v.spot.veh = null; v.spot.cool = G.time + 60; }
    v.dispose();
  }

  spawn(type, x, y, z, heading, color) {
    const v = new Vehicle(type, x, y, z, heading, color);
    if (v.cls === 'car' || v.cls === 'bike') v.groundFollow(0.016, true);
    v.sync();
    return this.add(v);
  }

  // Build static spawn spots once the world exists.
  initSpots() {
    const W = G.world;
    for (const id in W.roads.grids) {
      const g = W.roads.grids[id];
      for (const p of g.parking) this.spots.push({ ...p, kind: 'parked', city: id });
    }
    for (const s of W.services) {
      if (s.type === 'police') this.spots.push({ x: s.x + 6, z: s.z - 4.6, y: s.y - 0.2, heading: Math.PI / 2, kind: 'police' });
      if (s.type === 'hospital') this.spots.push({ x: s.x + 7, z: s.z - 4.6, y: s.y - 0.2, heading: Math.PI / 2, kind: 'rtw' });
      if (s.type === 'fuel') this.spots.push({ x: s.x + 3, z: s.z + 3, y: s.y, heading: rand(0, 6), kind: 'parked' });
    }
    for (const p of W.pads) {
      if (p.type === 'helipad') this.spots.push({ x: p.x, z: p.z, y: p.y + 0.4, heading: 0, kind: p.city === 'berlin' ? 'polizeiheli' : 'libelle' });
    }
    // boats near water in coastal / river cities and big lakes
    const T = W.terrain;
    const tryWater = (cx, cz, R) => {
      for (let k = 0; k < 400; k++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * R;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (T.heightAt(x, z) < -1.6 && T.heightAt(x + 6, z) < -1 && T.heightAt(x - 6, z) < -1 && T.heightAt(x, z + 6) < -1 && T.heightAt(x, z - 6) < -1) return { x, z };
      }
      return null;
    };
    for (const id of ['hamburg', 'kiel', 'rostock', 'koeln', 'dresden', 'bremen', 'luebeck', 'frankfurt', 'mannheim', 'magdeburg']) {
      const c = CITY_BY_ID[id];
      const w = tryWater(c.x, c.z, c.r + 160);
      if (w) this.spots.push({ x: w.x, z: w.z, y: 0, heading: rand(0, 6), kind: 'boat' });
    }
    for (const l of LAKES) {
      if (l.city) continue;
      const w = tryWater(l.x, l.z, Math.min(l.rx, l.rz) * 0.8);
      if (w) this.spots.push({ x: w.x, z: w.z, y: 0, heading: rand(0, 6), kind: 'boat' });
    }
  }

  spotType(s) {
    if (s.kind === 'parked') {
      const r = Math.random();
      if (r < 0.06) return 'falke';
      if (r < 0.14) return 'blitz';
      if (r < 0.22) return 'rennpappe';
      if (r < 0.3) return 'transporter';
      return pick(['pendler', 'pendler', 'adler', 'kombi', 'kombi']);
    }
    if (s.kind === 'boat') return 'speedboot';
    if (s.kind === 'police') return 'polizei';
    return s.kind;
  }

  scanSpots() {
    const P = G.player.pos;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - P.x, s.z - P.z);
      const special = s.kind !== 'parked';
      const inR = special ? 260 : 150;
      if (!s.veh && d < inR && d > (special ? 10 : 45) && (!s.cool || G.time > s.cool)) {
        if (!special && Math.random() < 0.45) { s.cool = G.time + 30; continue; }
        const type = this.spotType(s);
        const v = this.spawn(type, s.x, s.y, s.z, s.heading);
        v.spot = s;
        v.parked = true;
        v.ctrl.handbrake = true;
        s.veh = v;
      }
    }
  }

  update(dt) {
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 1; this.scanSpots(); }
    for (const v of this.list) {
      if (v.ai && v.ai.type === 'police') v.ai.update(dt);
      v.update(dt);
    }
    this.collide(dt);
    // despawn
    const P = G.player.pos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v === G.player.vehicle || v.persist) continue;
      if (v.ai && v.ai.type === 'traffic' && v.ai.alive) continue;
      const d = Math.hypot(v.pos.x - P.x, v.pos.z - P.z);
      const lim = v.spot ? (v.spot.kind === 'parked' ? 230 : 330) : 380;
      if (d > lim || (v.dead && v.deadT > 60 && d > 60) || (v.drowned && d > 30)) {
        if (v.spot && v.spot.veh === v) { v.spot.veh = null; }
        this.list.splice(i, 1);
        v.dispose();
      }
    }
  }

  collide(dt) {
    const L = this.list;
    const n = L.length;
    for (let i = 0; i < n; i++) {
      const a = L[i];
      for (let j = i + 1; j < n; j++) {
        const b = L[j];
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
        const rr = a.radius + b.radius;
        if (dx * dx + dz * dz > rr * rr) continue;
        if (Math.abs(a.pos.y - b.pos.y) > Math.max(a.def.H, b.def.H) + 0.5) continue;
        if (a.mode === 'kinematic' && b.mode === 'kinematic') continue;
        this.collidePair(a, b);
      }
    }
    // vehicles vs people
    const people = G.peds.list;
    const pc = G.player.char;
    for (const v of L) {
      if (v.cls === 'heli' && !v.onGround) continue;
      const spd = Math.hypot(v.vel.x, v.vel.z);
      for (let k = -1; k < people.length; k++) {
        const c = k < 0 ? pc : people[k];
        if (!c.alive || !c.visible) continue;
        if (c === pc && G.player.vehicle) continue;
        const dx = c.pos.x - v.pos.x, dz = c.pos.z - v.pos.z;
        const rr = v.radius + 0.4;
        if (dx * dx + dz * dz > rr * rr || Math.abs(c.pos.y - v.pos.y) > v.def.H + 0.5) continue;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        for (const cc of v.circles) {
          const cx = v.pos.x + fx * cc.z, cz = v.pos.z + fz * cc.z;
          const ex = c.pos.x - cx, ez = c.pos.z - cz;
          const d = Math.hypot(ex, ez);
          const rad = cc.r + c.radius;
          if (d >= rad) continue;
          const nx = d > 0.001 ? ex / d : 1, nz = d > 0.001 ? ez / d : 0;
          if (spd > 5.5 && (v.driver || v.mode === 'physics')) {
            const dmg = Math.pow(spd, 1.6) * 2.4;
            const dir = new THREE.Vector3(v.vel.x / spd + nx * 0.3, 0, v.vel.z / spd + nz * 0.3).normalize();
            const killed = c.damage(dmg, v.driver === 'player' ? pc : null, dir, false, 'vehicle');
            if (!c.alive && !c.fling) c.fling = new THREE.Vector3(v.vel.x * 0.8, 3 + spd * 0.25, v.vel.z * 0.8);
            else { c.vel.x += nx * spd * 0.5; c.vel.z += nz * spd * 0.5; c.vy = 3; }
            G.audio.crash(c.pos, 0.35);
            G.fx.impact(c.pos.x, c.pos.y + 1, c.pos.z, nx, 0.5, nz, 'blood');
            v.vel.multiplyScalar(0.94);
            if (v.driver === 'player') G.police.onRunOver(c, killed);
            if (c === pc) G.hud.damageFlash(1);
            if (c.onShot) c.onShot(v.driver === 'player' ? pc : null);
          }
          const push = rad - d;
          c.pos.x += nx * push; c.pos.z += nz * push;
          break;
        }
      }
    }
  }

  collidePair(a, b) {
    const fa = [Math.sin(a.heading), Math.cos(a.heading)], fb = [Math.sin(b.heading), Math.cos(b.heading)];
    for (const ca of a.circles) {
      const ax = a.pos.x + fa[0] * ca.z, az = a.pos.z + fa[1] * ca.z;
      for (const cb of b.circles) {
        const bx = b.pos.x + fb[0] * cb.z, bz = b.pos.z + fb[1] * cb.z;
        const dx = ax - bx, dz = az - bz;
        const d = Math.hypot(dx, dz);
        const rr = ca.r + cb.r;
        if (d >= rr || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d;
        const pen = rr - d;
        // kinematic cars become physical when hit
        for (const v of [a, b]) {
          if (v.mode === 'kinematic') {
            v.mode = 'physics';
            if (v.ai) v.ai.recoverT = 0;
          }
        }
        const ma = a.def.mass * (a.parked ? 1.5 : 1), mb = b.def.mass * (b.parked ? 1.5 : 1);
        const ia = 1 / ma, ib = 1 / mb, it = ia + ib;
        a.pos.x += nx * pen * (ia / it); a.pos.z += nz * pen * (ia / it);
        b.pos.x -= nx * pen * (ib / it); b.pos.z -= nz * pen * (ib / it);
        const rv = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
        if (rv < 0) {
          const j = (-(1 + 0.25) * rv) / it;
          a.vel.x += nx * j * ia; a.vel.z += nz * j * ia;
          b.vel.x -= nx * j * ib; b.vel.z -= nz * j * ib;
          a.angVel += (Math.random() - 0.5) * -rv * 0.05;
          b.angVel += (Math.random() - 0.5) * -rv * 0.05;
          const impact = -rv;
          if (impact > 3) {
            const dmg = (impact - 3) * 22;
            a.damage(dmg * (mb / (ma + mb)) * 2, b.driver === 'player' ? G.player.char : null, 'crash');
            b.damage(dmg * (ma / (ma + mb)) * 2, a.driver === 'player' ? G.player.char : null, 'crash');
            G.audio.crash({ x: bx + nx * cb.r, y: a.pos.y, z: bz + nz * cb.r }, impact / 20);
            G.fx.impact(bx + nx * cb.r, a.pos.y + 0.6, bz + nz * cb.r, nx, 0.3, nz);
            if (a.driver === 'player' || b.driver === 'player') {
              G.fx.shake(Math.min(1, impact / 18));
              const other = a.driver === 'player' ? b : a;
              if (other.isPolice) G.police.crime('rammedCop', other.pos, 1);
              if (other.ai && other.ai.onShot && Math.random() < 0.5) other.ai.onShot(G.player.char);
              if (G.player.vehicle && G.player.vehicle.cls === 'bike' && impact > 12) G.player.ejectFromBike(impact);
            }
          }
        }
        return;
      }
    }
  }
}
