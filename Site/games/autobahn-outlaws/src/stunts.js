// Stunt-jump ramps beside the Autobahn with airtime rewards.
import * as THREE from 'three';
import { G } from './game.js';
import { Builder, profileGeometry, mulberry32, formatMoney } from './util.js';

const LEN = 14, H = 3.3, HALF = 3.2;

export class Stunts {
  constructor() {
    this.ramps = [];
    this.done = new Set();
    this.jump = null;
  }

  init(done) {
    this.done = new Set(done || []);
    const W = G.world, roads = W.roads, P = G.physics;
    const rng = mulberry32(77);
    const B = new Builder();
    const edges = roads.edges.filter((e) => e.type === 'autobahn' && e.len > 450);
    let id = 0;
    for (const e of edges) {
      if (rng() < 0.55 || this.ramps.length >= 14) continue;
      const p = roads.pointAt(e, e.len * (0.3 + rng() * 0.4));
      const side = rng() < 0.5 ? 1 : -1;
      const off = e.half + 16;
      const cx = p.x + p.rx * off * side, cz = p.z + p.rz * off * side;
      const dir = rng() < 0.5 ? 1 : -1;
      const fx = p.tx * dir, fz = p.tz * dir;
      const ax = cx - fx * LEN / 2, az = cz - fz * LEN / 2, bx = cx + fx * LEN / 2, bz = cz + fz * LEN / 2;
      const ga = W.terrain.heightAt(ax, az), gb = W.terrain.heightAt(bx, bz);
      if (Math.abs(ga - gb) > 2 || W.terrain.nearest(W.terrain.water, cx, cz)) continue;
      const base = Math.min(ga, gb);
      const yaw = Math.atan2(fx, fz);
      // wedge: profile along local z (0..LEN), rising to H
      const wedge = profileGeometry([[0, 0], [LEN, 0], [LEN, H], [LEN - 0.4, H]], HALF * 2);
      wedge.rotateY(yaw);
      wedge.translate(ax, base, az);
      B.geo(wedge, 0xf2c200);
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        B.box(HALF * 2 + 0.04, 0.06, 0.7, ax + fx * LEN * t, base + H * t + 0.03, az + fz * LEN * t, 0x222222, yaw, -Math.atan2(H, LEN));
      }
      P.addDeck(ax, az, bx, bz, base + 0.05, base + H, HALF);
      // solid back so it cannot be driven through from behind
      const ex = bx - fx * 1.2, ez = bz - fz * 1.2;
      P.addBox(Math.min(ex, bx) - 0.8, Math.min(ez, bz) - 0.8, Math.max(ex, bx) + 0.8, Math.max(ez, bz) + 0.8, base - 1, base + H - 0.2, { ghost: false, noWalk: true });
      this.ramps.push({ id: id++, ax, az, bx, bz, fx, fz, base, name: e.name });
    }
    const mesh = new THREE.Mesh(B.build(), W.cityMats.miscMat);
    mesh.castShadow = mesh.receiveShadow = true;
    G.scene.add(mesh);
  }

  update(dt) {
    const v = G.player.vehicle;
    if (!v || v.cls === 'heli' || v.cls === 'boat') { this.jump = null; return; }
    if (!this.jump) {
      if (v.onGround || v.vy <= 0.5) return;
      for (const r of this.ramps) {
        const d = Math.hypot(v.pos.x - r.bx, v.pos.z - r.bz);
        if (d < 6 && (v.vel.x * r.fx + v.vel.z * r.fz) > 10) {
          this.jump = { r, t: 0, x: v.pos.x, z: v.pos.z, maxY: v.pos.y };
          break;
        }
      }
      return;
    }
    const j = this.jump;
    j.t += dt;
    j.maxY = Math.max(j.maxY, v.pos.y);
    if (v.onGround || j.t > 12) {
      const dist = Math.hypot(v.pos.x - j.x, v.pos.z - j.z);
      if (j.t > 0.9 && dist > 12) {
        const first = !this.done.has(j.r.id);
        const pay = first ? 500 : 50;
        this.done.add(j.r.id);
        G.money += pay;
        G.stats.stunts = this.done.size;
        G.audio.ui('pass');
        G.hud.bigMessage('STUNT JUMP!', '#ff9f1a', `${Math.round(dist)} m · ${j.t.toFixed(1)} s airtime · +${formatMoney(pay)}${first ? ` · ${this.done.size}/${this.ramps.length} ramps` : ''}`, 3);
      }
      this.jump = null;
    }
  }
}
