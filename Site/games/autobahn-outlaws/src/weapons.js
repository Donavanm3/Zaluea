// Weapon definitions, hitscan shooting, projectiles and explosions.
import * as THREE from 'three';
import { G } from './game.js';
import { weaponModel } from './models.js';

export const WEAPONS = {
  fist: { id: 'fist', name: 'Fäuste', slot: 0, melee: true, dmg: 14, rate: 0.42, range: 1.9, icon: '✊' },
  pistol: { id: 'pistol', name: 'P9 Pistole', slot: 1, dmg: 27, rate: 0.2, mag: 12, spread: 0.012, range: 150, sound: 'pistol', price: 450, ammoPrice: 60, ammoPack: 24, reload: 1.1, icon: '🔫' },
  smg: { id: 'smg', name: 'MP-K', slot: 2, dmg: 16, rate: 0.075, mag: 30, auto: true, spread: 0.032, range: 110, sound: 'smg', price: 1400, ammoPrice: 100, ammoPack: 60, reload: 1.5, icon: '🔫' },
  shotgun: { id: 'shotgun', name: 'Pumpgun', slot: 3, dmg: 13, pellets: 8, rate: 0.85, mag: 8, spread: 0.08, range: 50, sound: 'shotgun', price: 1800, ammoPrice: 90, ammoPack: 16, reload: 2.2, icon: '💥' },
  rifle: { id: 'rifle', name: 'StG-A Sturmgewehr', slot: 4, dmg: 25, rate: 0.105, mag: 30, auto: true, spread: 0.02, range: 220, sound: 'rifle', price: 3200, ammoPrice: 150, ammoPack: 60, reload: 1.8, icon: '🎯' },
  sniper: { id: 'sniper', name: 'Präzisionsgewehr', slot: 5, dmg: 150, rate: 1.1, mag: 5, spread: 0, range: 500, scope: true, sound: 'sniper', price: 5500, ammoPrice: 200, ammoPack: 10, reload: 2.4, icon: '🔭' },
  rpg: { id: 'rpg', name: 'Panzerfaust', slot: 6, dmg: 320, rate: 1.4, mag: 1, projectile: 'rocket', radius: 8, sound: 'rpg', price: 9000, ammoPrice: 700, ammoPack: 3, reload: 2.0, icon: '🚀' },
  grenade: { id: 'grenade', name: 'Handgranaten', slot: 7, throw: true, radius: 7, dmg: 260, rate: 0.9, mag: 1, price: 1500, ammoPrice: 500, ammoPack: 5, reload: 0.1, icon: '💣' },
};
export const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'rpg', 'grenade'];

const _d = new THREE.Vector3();

export class Weapons {
  constructor() {
    this.projectiles = [];
    this._hit = {};
    this.pending = [];
  }

  // Nearest hit along a ray among statics, terrain, characters and vehicles.
  trace(ox, oy, oz, dx, dy, dz, range, ignoreChar, ignoreVeh) {
    const h = G.physics.raycast(ox, oy, oz, dx, dy, dz, range, this._hit);
    let best = h.hit ? h.t : range;
    let target = null;
    const chars = G.peds.list;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === ignoreChar) continue;
      const r = c.rayHit(ox, oy, oz, dx, dy, dz, best);
      if (r && r.t < best) { best = r.t; target = { kind: 'char', c, head: r.head }; }
    }
    const pc = G.player && G.player.char;
    if (pc && pc !== ignoreChar && pc.visible) {
      const r = pc.rayHit(ox, oy, oz, dx, dy, dz, best);
      if (r && r.t < best) { best = r.t; target = { kind: 'char', c: pc, head: r.head }; }
    }
    for (const v of G.vehicles.list) {
      if (v === ignoreVeh) continue;
      if (Math.abs(v.pos.x - ox) > best + 12 && Math.abs(v.pos.z - oz) > best + 12) continue;
      const t = v.rayHit(ox, oy, oz, dx, dy, dz, best);
      if (t >= 0 && t < best) { best = t; target = { kind: 'veh', v }; }
    }
    return {
      t: best, target, hitStatic: !target && h.hit && h.t <= best + 1e-6,
      obj: h.obj, nx: h.nx, ny: h.ny, nz: h.nz,
      x: ox + dx * best, y: oy + dy * best, z: oz + dz * best,
    };
  }

  // shooter: Character (or null), from: muzzle position, dir: normalized
  fire(shooter, wid, from, dir, opts = {}) {
    const w = WEAPONS[wid];
    const isPlayer = shooter && shooter.isPlayer;
    if (w.sound) G.audio.shot(w.sound, from);
    if (w.projectile === 'rocket') {
      this.spawnRocket(shooter, from, dir, opts.vehicle);
      G.fx.muzzle(from.x, from.y, from.z, dir.x, dir.y, dir.z);
      if (isPlayer) G.police.onGunfire(from, true);
      return;
    }
    if (w.throw) {
      this.spawnGrenade(shooter, from, dir);
      return;
    }
    G.fx.muzzle(from.x, from.y, from.z, dir.x, dir.y, dir.z);
    const pellets = w.pellets || 1;
    const spread = (w.spread || 0) + (opts.extraSpread || 0);
    for (let p = 0; p < pellets; p++) {
      _d.copy(dir);
      if (spread > 0) {
        _d.x += (Math.random() - 0.5) * 2 * spread;
        _d.y += (Math.random() - 0.5) * 2 * spread;
        _d.z += (Math.random() - 0.5) * 2 * spread;
        _d.normalize();
      }
      const r = this.trace(from.x, from.y, from.z, _d.x, _d.y, _d.z, w.range, shooter, opts.vehicle);
      const dmg = w.dmg * (opts.dmgMul || 1);
      if (r.target && r.target.kind === 'char') {
        const c = r.target.c;
        const killed = c.damage(dmg, shooter, _d, r.target.head, 'bullet');
        G.fx.impact(r.x, r.y, r.z, -_d.x, -_d.y, -_d.z, 'blood');
        if (c.onShot) c.onShot(shooter);
        if (isPlayer) G.police.onPlayerHit(c, killed);
      } else if (r.target && r.target.kind === 'veh') {
        const v = r.target.v;
        v.damage(dmg * 0.65, shooter, 'bullet');
        G.fx.impact(r.x, r.y, r.z, -_d.x, -_d.y, -_d.z, 'spark');
        if (Math.random() < 0.5) G.audio.shot('metal', r);
        if (v.ai && v.ai.onShot) v.ai.onShot(shooter);
        if (isPlayer && v.isPolice) G.police.crime('attackCop', v.pos, 2);
      } else if (r.hitStatic || r.t < w.range) {
        if (r.obj === 'terrain') {
          if (r.y < 0.15 && G.physics.waterDepth(r.x, r.z, r.y) > 0) G.fx.impact(r.x, 0, r.z, 0, 1, 0, 'water');
          else G.fx.impact(r.x, r.y, r.z, 0, 1, 0, 'dirt');
        } else if (r.obj) {
          G.fx.impact(r.x, r.y, r.z, r.nx, r.ny, r.nz, 'spark');
          if (r.obj.pump) this.damagePump(r.x, r.z, dmg, shooter);
        }
      }
      if (pellets === 1 || p % 3 === 0) {
        const col = isPlayer ? [1, 0.85, 0.5] : [1, 0.6, 0.35];
        G.fx.tracer(from.x, from.y, from.z, r.x, r.y, r.z, col);
      }
    }
    if (isPlayer) G.police.onGunfire(from, false);
    if (G.peds) G.peds.alarm(from, isPlayer ? 60 : 40, shooter);
  }

  melee(attacker) {
    const w = WEAPONS.fist;
    const h = attacker.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    G.audio.shot('punch', attacker.pos);
    const targets = [...G.peds.list];
    if (G.player.char !== attacker) targets.push(G.player.char);
    let hit = null, bd = w.range;
    for (const c of targets) {
      if (c === attacker || !c.alive || !c.visible) continue;
      const dx = c.pos.x - attacker.pos.x, dz = c.pos.z - attacker.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(c.pos.y - attacker.pos.y) > 1.2) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.5) continue;
      bd = d; hit = c;
    }
    if (hit) {
      _d.set(fx, 0.2, fz);
      const killed = hit.damage(w.dmg * (attacker.isPlayer ? 1 : 0.7), attacker, _d, false, 'melee');
      if (hit.onShot) hit.onShot(attacker);
      hit.vel.x += fx * 3; hit.vel.z += fz * 3;
      if (attacker.isPlayer) G.police.onPlayerHit(hit, killed, true);
      G.fx.impact(hit.pos.x, hit.pos.y + 1.5, hit.pos.z, -fx, 0, -fz, 'blood');
    }
    return hit;
  }

  spawnRocket(shooter, from, dir, ignoreVeh) {
    const g = weaponModel('rpg');
    g.scale.setScalar(0.6);
    G.scene.add(g);
    this.projectiles.push({ kind: 'rocket', pos: from.clone(), vel: dir.clone().multiplyScalar(65), life: 6, mesh: g, shooter, ignoreVeh });
  }

  spawnGrenade(shooter, from, dir) {
    const g = weaponModel('grenade');
    g.scale.setScalar(1.6);
    G.scene.add(g);
    const v = dir.clone().multiplyScalar(16);
    v.y += 4.5;
    this.projectiles.push({ kind: 'grenade', pos: from.clone(), vel: v, life: 2.6, mesh: g, shooter });
    G.audio.shot('grenade', from);
  }

  damagePump(x, z, dmg, source) {
    for (const p of G.world.fuelPumps) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - x, p.z - z) < 2.5) {
        p.hp -= dmg;
        if (p.hp <= 0) {
          p.alive = false;
          this.pending.push({ t: 0.15, x: p.x, y: p.y, z: p.z, r: 10, dmg: 320, source });
        }
      }
    }
  }

  explode(x, y, z, radius, dmg, source, fromVehicle) {
    G.fx.explosion(x, y, z, radius * 0.7);
    G.audio.explosion({ x, y, z });
    const isPlayer = source && (source === G.player.char || source.isPlayer);
    const dir = new THREE.Vector3();
    const chars = [...G.peds.list, G.player.char];
    for (const c of chars) {
      if (!c.alive) continue;
      const dx = c.pos.x - x, dy = c.pos.y + 1 - y, dz = c.pos.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius) continue;
      if (c === G.player.char && G.player.vehicle) continue;
      const f = 1 - d / radius;
      dir.set(dx, 0, dz).normalize();
      const killed = c.damage(dmg * f * (c.isPlayer ? 0.55 : 1), source, dir, false, 'explosion');
      if (isPlayer && c !== G.player.char) G.police.onPlayerHit(c, killed);
    }
    for (const v of G.vehicles.list) {
      if (v === fromVehicle || v.dead) continue;
      const dx = v.pos.x - x, dy = v.pos.y - y, dz = v.pos.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius) continue;
      const f = 1 - d / radius;
      if (v.mode === 'kinematic') v.mode = 'physics';
      v.vel.x += (dx / (d || 1)) * f * 12; v.vel.z += (dz / (d || 1)) * f * 12;
      v.vy += f * 7; v.onGround = false;
      v.damage(dmg * f * 3.2, source, 'explosion');
      if (isPlayer && v.isPolice) G.police.crime('attackCop', v.pos, 3);
    }
    for (const p of G.world.fuelPumps) {
      if (p.alive && Math.hypot(p.x - x, p.z - z) < radius) {
        p.alive = false;
        this.pending.push({ t: 0.3 + Math.random() * 0.3, x: p.x, y: p.y, z: p.z, r: 10, dmg: 320, source });
      }
    }
    if (G.peds) G.peds.alarm({ x, y, z }, 120, source);
    if (isPlayer) G.police.onGunfire({ x, y, z }, true);
    // player in vehicle nearby takes vehicle damage (handled above)
  }

  update(dt) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const e = this.pending[i];
      e.t -= dt;
      if (e.t <= 0) { this.pending.splice(i, 1); this.explode(e.x, e.y, e.z, e.r, e.dmg, e.source); }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      let boom = p.life <= 0;
      if (p.kind === 'rocket') {
        const step = p.vel.length() * dt;
        _d.copy(p.vel).normalize();
        const r = this.trace(p.pos.x, p.pos.y, p.pos.z, _d.x, _d.y, _d.z, step, p.shooter, p.ignoreVeh);
        if (r.t < step - 1e-4 || (r.target && r.t <= step)) {
          p.pos.set(r.x, r.y, r.z);
          boom = true;
        } else p.pos.addScaledVector(p.vel, dt);
        G.fx.smoke(p.pos.x, p.pos.y, p.pos.z, 0.2, 0.5);
        G.fx.add.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.08, 0.7, 0.1, 1, 0.7, 0.3, 1, 0);
        p.mesh.position.copy(p.pos);
        p.mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
        if (boom) this.explode(p.pos.x, p.pos.y, p.pos.z, WEAPONS.rpg.radius, WEAPONS.rpg.dmg, p.shooter);
      } else {
        p.vel.y -= 18 * dt;
        const nx = p.pos.x + p.vel.x * dt, nz = p.pos.z + p.vel.z * dt;
        let ny = p.pos.y + p.vel.y * dt;
        const g = G.physics.groundAt(nx, nz, p.pos.y + 0.3, 0.4);
        const tmp = { x: nx, y: ny - 0.2, z: nz };
        const hit = G.physics.collideCircle(tmp, 0.12, 0.3, 0.1);
        if (hit.hit) { p.vel.x *= -0.4; p.vel.z *= -0.4; }
        if (ny < g + 0.08) {
          ny = g + 0.08;
          p.vel.y = Math.abs(p.vel.y) * 0.35;
          p.vel.x *= 0.6; p.vel.z *= 0.6;
          if (G.physics.waterDepth(nx, nz, ny) > 0.5) { p.vel.set(0, 0, 0); }
        }
        p.pos.set(hit.hit ? p.pos.x : nx, ny, hit.hit ? p.pos.z : nz);
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.x += dt * 8;
        if (boom) this.explode(p.pos.x, p.pos.y, p.pos.z, WEAPONS.grenade.radius, WEAPONS.grenade.dmg, p.shooter);
      }
      if (boom) {
        G.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
