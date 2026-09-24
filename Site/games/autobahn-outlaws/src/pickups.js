// Collectable pickups: cash, weapons, health, armour and hidden garden gnomes.
import * as THREE from 'three';
import { G } from './game.js';
import { Builder, mulberry32, UNIT_CONE, UNIT_SPHERE } from './util.js';
import { weaponModel, charMat } from './models.js';
import { WEAPONS } from './weapons.js';
import { GRID } from './terrain.js';
import { insideGermany, CITIES } from './geo.js';

function moneyModel() {
  const b = new Builder();
  b.box(0.5, 0.06, 0.26, 0, 0, 0, 0x3f8f3f);
  b.box(0.48, 0.06, 0.24, 0.02, 0.07, 0.01, 0x4fa04f);
  b.box(0.1, 0.14, 0.27, 0, 0.03, 0, 0xe0d8a0);
  return new THREE.Mesh(b.build(), charMat);
}
function healthModel() {
  const b = new Builder();
  b.box(0.5, 0.5, 0.2, 0, 0, 0, 0xf2f2f2);
  b.box(0.12, 0.34, 0.22, 0, 0, 0, 0xd62020);
  b.box(0.34, 0.12, 0.22, 0, 0, 0, 0xd62020);
  return new THREE.Mesh(b.build(), charMat);
}
function armorModel() {
  const b = new Builder();
  b.box(0.5, 0.6, 0.18, 0, 0, 0, 0x2a4a8a);
  b.box(0.2, 0.2, 0.2, 0, 0.35, 0, 0x2a4a8a);
  return new THREE.Mesh(b.build(), charMat);
}
export function gnomeModel() {
  const b = new Builder();
  b.add(UNIT_SPHERE, 0x3a6ab0, 0, 0.25, 0, 0, 0, 0, 0.42, 0.45, 0.38);
  b.add(UNIT_SPHERE, 0xf1c9a5, 0, 0.58, 0, 0, 0, 0, 0.26, 0.26, 0.26);
  b.add(UNIT_CONE, 0xd62020, 0, 0.84, 0, 0, 0, 0.1, 0.3, 0.42, 0.3);
  b.add(UNIT_CONE, 0xf4f4f4, 0, 0.44, 0.1, Math.PI, 0, 0, 0.22, 0.3, 0.12);
  b.box(0.2, 0.08, 0.2, 0, 0.04, 0.03, 0x5a3a1a);
  const m = new THREE.Mesh(b.build(), charMat);
  m.castShadow = true;
  return m;
}

export class Pickups {
  constructor() {
    this.list = [];
    this.gnomes = [];
    this.t = 0;
  }

  spawn(type, x, y, z, amount = 0, weapon = null, opts = {}) {
    let mesh;
    if (type === 'money') mesh = moneyModel();
    else if (type === 'health') mesh = healthModel();
    else if (type === 'armor') mesh = armorModel();
    else if (type === 'weapon') { mesh = weaponModel(weapon); mesh.scale.setScalar(1.6); }
    else if (type === 'gnome') { mesh = gnomeModel(); mesh.scale.setScalar(1.3); }
    else mesh = new THREE.Group();
    const gy = G.physics.groundAt(x, z, y + 1);
    mesh.position.set(x, gy + 0.6, z);
    G.scene.add(mesh);
    const p = { type, x, y: gy, z, amount, weapon, mesh, respawn: opts.respawn || 0, life: opts.life || (type === 'money' || type === 'weapon' ? 60 : 0), phase: Math.random() * 6, id: opts.id };
    this.list.push(p);
    return p;
  }

  remove(p) {
    G.scene.remove(p.mesh);
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Place 30 hidden garden gnomes (Gartenzwerge) around Germany.
  initGnomes(collected) {
    const rng = mulberry32(2024);
    const W = G.world;
    const spots = [];
    // near landmarks and cities first, then countryside
    for (const l of W.landmarkSpots) spots.push({ x: l.x + (rng() - 0.5) * 30, z: l.z + (rng() - 0.5) * 30 });
    for (const c of CITIES) if (spots.length < 22) spots.push({ x: c.x + (rng() - 0.5) * c.r, z: c.z + (rng() - 0.5) * c.r });
    let guard = 0;
    while (spots.length < 30 && guard++ < 2000) {
      const x = GRID.X0 + rng() * (GRID.X1 - GRID.X0), z = GRID.Z0 + rng() * (GRID.Z1 - GRID.Z0);
      if (!insideGermany(x, z) || W.terrain.heightAt(x, z) < 1) continue;
      spots.push({ x, z });
    }
    this.gnomeSpots = spots.slice(0, 30).map((s, i) => ({ ...s, id: i }));
    this.collected = new Set(collected || []);
    this.gnomeActive = new Map();
  }

  update(dt) {
    this.t += dt;
    const P = G.player;
    const pp = P.pos;
    // stream gnomes in near the player
    if (this.gnomeSpots && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) {
      for (const s of this.gnomeSpots) {
        if (this.collected.has(s.id)) continue;
        const d = Math.hypot(s.x - pp.x, s.z - pp.z);
        const act = this.gnomeActive.get(s.id);
        if (d < 150 && !act) {
          // avoid placing inside buildings: nudge out
          const tmp = { x: s.x, y: G.physics.groundAt(s.x, s.z) , z: s.z };
          G.physics.collideCircle(tmp, 0.5, 1, 0.3);
          const p = this.spawn('gnome', tmp.x, tmp.y, tmp.z, 0, null, { id: s.id });
          this.gnomeActive.set(s.id, p);
        } else if (d > 200 && act) {
          this.remove(act);
          this.gnomeActive.delete(s.id);
        }
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.phase += dt;
      p.mesh.rotation.y += dt * 1.8;
      p.mesh.position.y = p.y + 0.55 + Math.sin(p.phase * 2.5) * 0.12;
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) { this.remove(p); continue; }
      }
      if (P.dead) continue;
      const d = Math.hypot(p.x - pp.x, p.z - pp.z);
      const reach = P.vehicle ? 3 : 1.4;
      if (d > reach || Math.abs(p.y - pp.y) > 2.5) continue;
      if (P.vehicle && p.type !== 'money' && p.type !== 'gnome') continue;
      this.collect(p);
    }
  }

  collect(p) {
    const P = G.player;
    const c = P.char;
    switch (p.type) {
      case 'money':
        G.money += p.amount;
        G.hud.moneyPop(p.amount);
        G.audio.ui('money');
        break;
      case 'health':
        if (c.health >= c.maxHealth) return;
        c.health = c.maxHealth;
        G.audio.ui('pickup');
        break;
      case 'armor':
        if (c.armor >= 100) return;
        c.armor = 100;
        G.audio.ui('pickup');
        break;
      case 'weapon':
        P.giveWeapon(p.weapon, p.amount || WEAPONS[p.weapon].mag * 2);
        G.hud.notify(`Picked up: ${WEAPONS[p.weapon].name}`, 2);
        G.audio.ui('pickup');
        break;
      case 'gnome': {
        this.collected.add(p.id);
        this.gnomeActive.delete(p.id);
        G.stats.gnomes = this.collected.size;
        G.money += 500;
        G.audio.ui('pass');
        G.hud.notify(`Garden gnome (Gartenzwerg) found! ${this.collected.size}/30 · +€500`, 4);
        if (this.collected.size === 30) {
          G.money += 25000;
          G.hud.bigMessage('ALL 30 GARDEN GNOMES!', '#f2c200', 'Bonus: €25.000');
        }
        if (G.save) G.save.autosave();
        break;
      }
    }
    this.remove(p);
  }
}
