// Real light from the street lamps closest to the camera at night. A fixed pool of
// point lights is moved around so shaders never have to recompile.
import * as THREE from 'three';
import { G } from './game.js';
import { clamp } from './util.js';

export class LampLights {
  constructor(scene, quality) {
    this.n = quality === 'low' ? 0 : quality === 'high' ? 8 : 6;
    this.lights = [];
    for (let i = 0; i < this.n; i++) {
      const l = new THREE.PointLight(0xffc27a, 0, 30, 2);
      scene.add(l);
      this.lights.push(l);
    }
    this.sel = [];
    this.cut = 110;
    this.t = 0;
  }

  update(dt, pos, night) {
    if (!this.n) return;
    this.t -= dt;
    if (this.t <= 0 && night > 0.05) {
      this.t = 0.3;
      const cand = [];
      for (const id in G.world.roads.grids) {
        const g = G.world.roads.grids[id], c = g.city;
        if (!g.lampPositions || Math.hypot(c.x - pos.x, c.z - pos.z) > c.r + 150) continue;
        for (const p of g.lampPositions) {
          const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
          if (d < 110 * 110) cand.push([d, p]);
        }
      }
      cand.sort((a, b) => a[0] - b[0]);
      this.sel = cand.slice(0, this.n).map((c) => c[1]);
      // Lights fade out before the next-closest lamp would take their place, so nothing pops.
      this.cut = cand.length > this.n ? Math.sqrt(cand[this.n][0]) : 110;
    }
    for (let i = 0; i < this.n; i++) {
      const l = this.lights[i], p = this.sel[i];
      if (!p || night <= 0.05) { l.intensity = 0; continue; }
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      l.position.set(p.x, p.y, p.z);
      l.intensity = night * 70 * clamp((this.cut - d) / (this.cut * 0.35 + 1), 0, 1);
    }
  }
}
