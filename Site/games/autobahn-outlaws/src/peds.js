// Pedestrians and armed NPCs: sidewalk navigation, fleeing, fighting.
import * as THREE from 'three';
import { G } from './game.js';
import { Character } from './character.js';
import { randomLook } from './models.js';
import { WEAPONS } from './weapons.js';
import { clamp, rand, pick, lerpAngle, wrapAngle } from './util.js';
import { CITIES } from './geo.js';

const CROSS = {
  0: [[-1, 0, 1], [0, -1, 3]],
  1: [[1, 0, 0], [0, -1, 2]],
  2: [[1, 0, 3], [0, 1, 1]],
  3: [[-1, 0, 2], [0, 1, 0]],
};
const INSET = 1.6;
function corner(b, k) {
  switch (k) {
    case 0: return { x: b.minX + INSET, z: b.minZ + INSET };
    case 1: return { x: b.maxX - INSET, z: b.minZ + INSET };
    case 2: return { x: b.maxX - INSET, z: b.maxZ - INSET };
    default: return { x: b.minX + INSET, z: b.maxZ - INSET };
  }
}

const _dir = new THREE.Vector3(), _m = new THREE.Vector3(), _t = new THREE.Vector3();

export class NPC {
  constructor(char, role) {
    this.char = char;
    this.role = role; // civ | cop | gang | target | guard | vip
    this.state = 'walk';
    this.timer = 0;
    this.threat = null;
    this.target = null;
    this.speedWalk = rand(1.2, 1.6);
    this.fireT = rand(0.5, 1.5);
    this.accuracy = 0.5;
    this.burst = 0;
    this.persist = false;
    this.dropMoney = role === 'civ' ? Math.floor(rand(5, 60)) : role === 'gang' ? Math.floor(rand(30, 120)) : 0;
    this.bustT = 0;
  }
}

export class Peds {
  constructor() {
    this.list = []; // Characters with .ai
    this.spawnT = 0;
  }

  max() {
    const q = G.settings.quality;
    return q === 'low' ? 12 : q === 'medium' ? 20 : 30;
  }

  spawnAt(x, y, z, look, role = 'civ', weapon = null) {
    const c = new Character(look || randomLook(), x, y, z, rand(0, 6.28));
    c.ai = new NPC(c, role);
    if (weapon) c.setWeapon(weapon);
    c.onShot = (src) => this.onHurt(c, src);
    c.onDeath = () => this.onDeath(c);
    this.list.push(c);
    return c;
  }

  // Place a civilian on a sidewalk of a city block.
  spawnCivilian(center, minD, maxD) {
    let city = null, cd = Infinity;
    for (const c of CITIES) {
      const d = Math.hypot(c.x - center.x, c.z - center.z) - c.r;
      if (d < cd) { cd = d; city = c; }
    }
    if (!city || cd > 120) return this.spawnVillager(center);
    const grid = G.world.roads.grids[city.id];
    const blocks = grid.blocks;
    if (!blocks.length) return this.spawnVillager(center);
    for (let i = 0; i < 10; i++) {
      const b = blocks[Math.floor(Math.random() * blocks.length)];
      if (b.removed) continue;
      const d = Math.hypot(b.cx - center.x, b.cz - center.z);
      if (d < minD || d > maxD) continue;
      const k = Math.floor(Math.random() * 4);
      const a = corner(b, k), bb = corner(b, (k + 1) % 4);
      const t = Math.random();
      const x = a.x + (bb.x - a.x) * t, z = a.z + (bb.z - a.z) * t;
      const y = G.physics.groundAt(x, z, city.y + 2);
      const role = Math.random() < 0.03 && city.r > 120 ? 'gang' : 'civ';
      const c = this.spawnAt(x, y, z, null, role, role === 'gang' ? pick(['pistol', 'pistol', 'smg']) : null);
      c.ai.grid = grid; c.ai.block = b; c.ai.k = (k + 1) % 4; c.ai.dirK = 1;
      if (role === 'gang') { c.ai.accuracy = 0.35; c.health = 80; }
      return c;
    }
    return null;
  }

  spawnVillager(center) {
    const W = G.world;
    let best = null, bd = Infinity;
    for (const v of W.villages) {
      const d = Math.hypot(v.x - center.x, v.z - center.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best || bd > 220) return null;
    const a = Math.random() * 6.28, r = rand(15, 50);
    const x = best.x + Math.cos(a) * r, z = best.z + Math.sin(a) * r;
    if (Math.hypot(x - center.x, z - center.z) < 30) return null;
    const y = G.physics.groundAt(x, z);
    const c = this.spawnAt(x, y, z);
    c.ai.anchor = { x: best.x, z: best.z, r: 55 };
    return c;
  }

  remove(c) {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    c.remove();
  }

  // Gunfire / explosions scare people.
  alarm(pos, radius, source) {
    for (const c of this.list) {
      if (!c.alive || c === source) continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d > radius) continue;
      const ai = c.ai;
      if (ai.role === 'civ' || ai.role === 'vip') {
        if (ai.state !== 'flee' && ai.state !== 'cower') {
          ai.state = Math.random() < 0.18 && d < 15 ? 'cower' : 'flee';
          ai.timer = rand(8, 16);
          ai.fleeFrom = { x: pos.x, z: pos.z };
        } else ai.timer = Math.max(ai.timer, 6);
      } else if ((ai.role === 'gang' || ai.role === 'guard') && source && source.isPlayer && ai.state !== 'fight') {
        ai.state = 'fight'; ai.target = source; ai.timer = 40;
      }
    }
  }

  honk(pos) {
    for (const c of this.list) {
      if (!c.alive || c.ai.state === 'fight') continue;
      const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
      if (d < 9 && c.ai.state === 'walk') { c.ai.state = 'dodge'; c.ai.timer = 1.2; c.ai.fleeFrom = { x: pos.x, z: pos.z }; }
    }
  }

  onHurt(c, src) {
    const ai = c.ai;
    if (!c.alive) return;
    if (ai.role === 'civ' || ai.role === 'vip') {
      if (src && src.isPlayer && Math.random() < 0.12 && ai.role === 'civ') { ai.state = 'fight'; ai.target = src; ai.timer = 10; }
      else { ai.state = 'flee'; ai.timer = 14; ai.fleeFrom = src ? { x: src.pos.x, z: src.pos.z } : { x: c.pos.x + 1, z: c.pos.z }; }
    } else if (src) {
      ai.state = 'fight'; ai.target = src; ai.timer = 40;
    }
  }

  onDeath(c) {
    const ai = c.ai;
    const killer = c.lastAttacker;
    if (killer && killer.isPlayer) {
      G.stats.kills++;
      if (ai.dropMoney > 0 && G.pickups) G.pickups.spawn('money', c.pos.x, c.pos.y, c.pos.z, ai.dropMoney);
      if (ai.role === 'cop' && G.pickups) G.pickups.spawn('weapon', c.pos.x + 0.5, c.pos.y, c.pos.z, 12, c.weapon === 'fist' ? 'pistol' : c.weapon);
      if (ai.role === 'gang' && c.weapon !== 'fist' && G.pickups) G.pickups.spawn('weapon', c.pos.x + 0.5, c.pos.y, c.pos.z, 20, c.weapon);
    }
    if (c.onKilled) c.onKilled(killer);
    this.alarm(c.pos, 25, killer);
  }

  update(dt) {
    const P = G.player.pos;
    this.spawnT -= dt;
    const civCount = this.list.filter((c) => c.ai.role === 'civ' || c.ai.role === 'gang').length;
    if (this.spawnT <= 0 && civCount < this.max()) {
      this.spawnT = 0.35;
      this.spawnCivilian(P, 35, 120);
    }
    const pc = G.player.char;
    const aimingAt = !G.player.vehicle && pc.aim && pc.weapon !== 'fist';
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const d = Math.hypot(c.pos.x - P.x, c.pos.z - P.z);
      if (!c.ai.persist && (d > 170 || (!c.alive && (c.deadT > 45 || d > 110)))) {
        this.list.splice(i, 1);
        c.remove();
        continue;
      }
      if (!c.alive) { c.animate(dt, 0); continue; }
      // far-away NPCs update at reduced cost
      if (d > 90 && (G.frame + i) % 3 !== 0) continue;
      const step = d > 90 ? dt * 3 : dt;
      this.think(c, step, aimingAt);
    }
  }

  think(c, dt, aimingAt) {
    const ai = c.ai;
    ai.timer -= dt;
    let wx = 0, wz = 0, speed = 0;
    const pc = G.player.char;
    // hands up when the player aims at a civilian
    if (aimingAt && (ai.role === 'civ') && ai.state === 'walk') {
      const dx = c.pos.x - pc.pos.x, dz = c.pos.z - pc.pos.z, d = Math.hypot(dx, dz);
      if (d < 14) {
        const fx = Math.sin(G.player.cam.yaw), fz = Math.cos(G.player.cam.yaw);
        if ((dx * fx + dz * fz) / d > 0.96) { ai.state = 'handsup'; ai.timer = 3; }
      }
    }
    switch (ai.state) {
      case 'walk': {
        if (ai.idleT > 0) { ai.idleT -= dt; break; }
        let tgt = null;
        if (ai.block) {
          tgt = ai.cross || corner(ai.block, ai.k);
        } else if (ai.anchor) {
          if (!ai.wp || Math.hypot(ai.wp.x - c.pos.x, ai.wp.z - c.pos.z) < 1) {
            const a = Math.random() * 6.28, r = Math.random() * ai.anchor.r;
            ai.wp = { x: ai.anchor.x + Math.cos(a) * r, z: ai.anchor.z + Math.sin(a) * r };
            if (Math.random() < 0.3) ai.idleT = rand(2, 5);
          }
          tgt = ai.wp;
        } else if (ai.goto) tgt = ai.goto;
        if (!tgt) break;
        const dx = tgt.x - c.pos.x, dz = tgt.z - c.pos.z, dl = Math.hypot(dx, dz);
        if (dl < 0.7) {
          if (ai.block) this.nextCorner(c);
          else if (ai.goto) { ai.state = 'idle'; }
          break;
        }
        wx = dx / dl; wz = dz / dl; speed = ai.speedWalk;
        break;
      }
      case 'idle':
        break;
      case 'handsup':
        c.pose = 'handsup';
        if (ai.timer <= 0) { c.pose = 'normal'; ai.state = 'flee'; ai.timer = 10; ai.fleeFrom = { x: pc.pos.x, z: pc.pos.z }; }
        break;
      case 'dodge':
      case 'flee': {
        const src = ai.fleeFrom || pc.pos;
        let dx = c.pos.x - src.x, dz = c.pos.z - src.z;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        // wobble
        ai.wob = (ai.wob || Math.random() * 6) + dt;
        const w = Math.sin(ai.wob * 0.9) * 0.5;
        wx = dx * Math.cos(w) - dz * Math.sin(w); wz = dx * Math.sin(w) + dz * Math.cos(w);
        speed = ai.state === 'dodge' ? 3 : 5.6;
        c.pose = 'normal';
        if (ai.timer <= 0) this.resumeWalk(c);
        break;
      }
      case 'cower':
        c.pose = 'cower';
        if (ai.timer <= 0) { c.pose = 'normal'; ai.state = 'flee'; ai.timer = 8; }
        break;
      case 'follow': {
        const t = ai.target;
        if (!t) { ai.state = 'idle'; break; }
        const tp = t.pos;
        const dx = tp.x - c.pos.x, dz = tp.z - c.pos.z, dl = Math.hypot(dx, dz);
        if (dl > 2.5) { wx = dx / dl; wz = dz / dl; speed = dl > 8 ? 5.5 : 3; }
        break;
      }
      case 'fight':
        this.fight(c, dt);
        return;
    }
    if (ai.state !== 'fight') {
      c.aim = false;
      c.move(dt, wx * speed, wz * speed);
      if (speed > 0.1) c.heading = lerpAngle(c.heading, Math.atan2(wx, wz), Math.min(1, dt * 8));
      c.animate(dt, Math.hypot(c.vel.x, c.vel.z));
    }
  }

  nextCorner(c) {
    const ai = c.ai;
    if (ai.cross) { ai.cross = null; return; }
    if (Math.random() < 0.08) ai.idleT = rand(1.5, 4);
    if (Math.random() < 0.25) {
      const opts = CROSS[ai.k];
      const [di, dj, nk] = opts[Math.floor(Math.random() * 2)];
      const nb = ai.grid.blockMap.get(ai.grid.key(ai.block.i + di, ai.block.j + dj));
      if (nb && !nb.removed) {
        ai.block = nb;
        ai.cross = corner(nb, nk);
        ai.k = nk;
        return;
      }
    }
    ai.k = (ai.k + ai.dirK + 4) % 4;
  }

  resumeWalk(c) {
    const ai = c.ai;
    ai.state = 'walk';
    ai.cross = null;
    c.pose = 'normal';
    if (ai.grid) {
      // find nearest block corner
      let best = null, bd = Infinity;
      for (const b of ai.grid.blocks) {
        if (b.removed) continue;
        const d = Math.hypot(b.cx - c.pos.x, b.cz - c.pos.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best && bd < 60) { ai.block = best; ai.k = Math.floor(Math.random() * 4); }
      else { ai.block = null; ai.anchor = { x: c.pos.x, z: c.pos.z, r: 20 }; }
    }
  }

  fight(c, dt) {
    const ai = c.ai;
    let t = ai.target;
    if (ai.role === 'cop' && G.police.level === 0) { t = null; }
    if (!t || !t.alive || ai.timer <= 0 && ai.role !== 'guard' && ai.role !== 'cop') {
      if (ai.role === 'cop' && G.police.level > 0) { ai.target = G.player.char; t = ai.target; }
      else { this.resumeWalk(c); c.aim = false; c.animate(dt, 0); return; }
    }
    const tp = t === G.player.char && G.player.vehicle ? G.player.vehicle.pos : t.pos;
    const dx = tp.x - c.pos.x, dz = tp.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    const armed = c.weapon !== 'fist';
    const prefer = armed ? (c.weapon === 'shotgun' ? 8 : 14) : 1.3;
    let wx = 0, wz = 0, speed = 0;
    const face = Math.atan2(dx, dz);
    // line of sight
    ai.losT = (ai.losT || 0) - dt;
    if (ai.losT <= 0) {
      ai.losT = 0.4;
      ai.los = G.physics.lineOfSight(c.pos.x, c.pos.y + 1.5, c.pos.z, tp.x, tp.y + 1.2, tp.z);
    }
    if (d > prefer || !ai.los) {
      wx = dx / (d || 1); wz = dz / (d || 1);
      speed = d > 25 ? 5.5 : 3.6;
    } else if (d < prefer * 0.5 && armed) {
      wx = -dx / d; wz = -dz / d; speed = 2;
    } else {
      // strafe
      ai.strafe = (ai.strafe || (Math.random() < 0.5 ? 1 : -1));
      if (Math.random() < 0.01) ai.strafe *= -1;
      wx = (-dz / d) * ai.strafe; wz = (dx / d) * ai.strafe; speed = 1.5;
    }
    c.move(dt, wx * speed, wz * speed);
    c.heading = lerpAngle(c.heading, face, Math.min(1, dt * 10));
    c.aim = armed && d < 60;
    c.aimPitch = clamp(Math.atan2(tp.y - c.pos.y, d), -0.8, 0.8);
    // Arrest instead of shooting at low wanted levels
    if (ai.role === 'cop' && t === G.player.char && G.police.level <= 1 && !G.player.vehicle) {
      c.aim = armed;
      if (d < 2.2) {
        ai.bustT += dt;
        if (ai.bustT > 1.6) G.player.arrest();
      } else ai.bustT = Math.max(0, ai.bustT - dt);
      c.animate(dt, Math.hypot(c.vel.x, c.vel.z));
      return;
    }
    ai.fireT -= dt;
    if (ai.fireT <= 0 && ai.los) {
      const w = WEAPONS[c.weapon];
      if (!armed) {
        if (d < 1.9) { c.punchT = 0.35; G.weapons.melee(c); }
        ai.fireT = 0.9;
      } else if (d < w.range * 0.8) {
        // aim with error
        _t.set(tp.x, tp.y + (t === G.player.char && G.player.vehicle ? 0.8 : 1.2), tp.z);
        _m.set(c.pos.x, c.pos.y + 1.5, c.pos.z);
        _dir.subVectors(_t, _m).normalize();
        c.muzzle(_dir, _m);
        _dir.subVectors(_t, _m).normalize();
        const tv = t === G.player.char && G.player.vehicle ? Math.hypot(G.player.vehicle.vel.x, G.player.vehicle.vel.z) : Math.hypot(t.vel.x, t.vel.z);
        const err = (1 - ai.accuracy) * 0.09 + d * 0.0012 + tv * 0.004;
        G.weapons.fire(c, c.weapon, _m, _dir, { extraSpread: err, dmgMul: ai.role === 'cop' ? 0.34 : 0.45 });
        ai.burst++;
        const burstMax = w.auto ? 4 : 2;
        if (ai.burst >= burstMax) { ai.burst = 0; ai.fireT = rand(0.9, 1.8); }
        else ai.fireT = w.rate * (w.auto ? 1.2 : 2.5);
      }
    }
    c.animate(dt, Math.hypot(c.vel.x, c.vel.z));
  }
}
