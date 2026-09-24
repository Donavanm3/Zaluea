// Particles, tracers, muzzle flashes, explosions and screen shake.
import * as THREE from 'three';
import { particleTexture } from './textures.js';
import { G } from './game.js';

class ParticleSystem {
  constructor(scene, max, blending) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.a1 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.sa = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pa);
    geo.setAttribute('pcolor', this.ca);
    geo.setAttribute('psize', this.sa);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: particleTexture() }, scale: { value: 600 } },
      vertexShader: `attribute vec4 pcolor; attribute float psize; varying vec4 vC; uniform float scale;
        void main(){ vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, blending,
    });
    this.mat = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a0, a1, grav = 0, drag = 0) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = Math.floor(Math.random() * this.max);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a0;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.a1[i] = a1;
    this.grav[i] = grav; this.drag[i] = drag;
    this.size[i] = s0;
  }

  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap with last
        n--;
        if (i !== n) this.copy(n, i);
        i--;
        continue;
      }
      const t = 1 - this.life[i] / this.maxLife[i];
      const d = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] + (this.a1[i] - this.a0[i]) * t;
    }
    this.n = n;
    this.points.geometry.setDrawRange(0, n);
    this.pa.needsUpdate = true; this.ca.needsUpdate = true; this.sa.needsUpdate = true;
  }

  copy(from, to) {
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col[to * 4 + k] = this.col[from * 4 + k];
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from]; this.a0[to] = this.a0[from]; this.a1[to] = this.a1[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.size[to] = this.size[from];
  }
}

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    const mult = quality === 'low' ? 0.5 : 1;
    this.add = new ParticleSystem(scene, Math.floor(2500 * mult), THREE.AdditiveBlending);
    this.norm = new ParticleSystem(scene, Math.floor(3000 * mult), THREE.NormalBlending);
    // Tracers
    this.maxTr = 64;
    this.trPos = new Float32Array(this.maxTr * 6);
    this.trCol = new Float32Array(this.maxTr * 6);
    this.trLife = new Float32Array(this.maxTr);
    this.trBase = new Float32Array(this.maxTr * 3);
    this.trIdx = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    // Flash light (single, always present to avoid shader recompiles)
    this.light = new THREE.PointLight(0xffc070, 0, 30, 1.6);
    scene.add(this.light);
    this.lightT = 0;
    // Explosion fireballs
    this.balls = [];
    const bm = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const bg = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(bg, bm.clone());
      m.visible = false;
      scene.add(m);
      this.balls.push({ m, t: 0, life: 0, r: 1 });
    }
    this.shakeAmt = 0;
    this.decals = [];
  }

  tracer(ax, ay, az, bx, by, bz, color = [1, 0.85, 0.5]) {
    const i = this.trIdx;
    this.trIdx = (this.trIdx + 1) % this.maxTr;
    this.trPos.set([ax, ay, az, bx, by, bz], i * 6);
    this.trBase.set(color, i * 3);
    this.trLife[i] = 0.07;
  }

  flash(x, y, z, intensity = 3, color = 0xffc070, dur = 0.06) {
    this.light.position.set(x, y, z);
    this.light.color.setHex(color);
    this.light.intensity = intensity * 40;
    this.light.distance = 25 + intensity * 8;
    this.lightT = dur;
  }

  muzzle(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 4; i++) {
      const s = 2 + Math.random() * 6;
      this.add.spawn(x + dx * 0.1 * i, y + dy * 0.1 * i, z + dz * 0.1 * i, dx * s, dy * s, dz * s, 0.05, 0.35, 0.1, 1, 0.8, 0.4, 1, 0);
    }
    this.norm.spawn(x, y, z, dx * 1.5, 0.6, dz * 1.5, 0.6, 0.2, 0.9, 0.7, 0.7, 0.7, 0.25, 0, -0.4, 1.5);
    this.flash(x, y, z, 1.2);
  }

  impact(x, y, z, nx, ny, nz, kind = 'spark') {
    if (kind === 'blood') {
      for (let i = 0; i < 8; i++) this.norm.spawn(x, y, z, nx * 2 + (Math.random() - 0.5) * 3, ny * 2 + Math.random() * 2, nz * 2 + (Math.random() - 0.5) * 3, 0.5, 0.12, 0.2, 0.55, 0.02, 0.02, 0.95, 0.4, 9, 0.5);
      return;
    }
    if (kind === 'dirt') {
      for (let i = 0; i < 6; i++) this.norm.spawn(x, y, z, (Math.random() - 0.5) * 2, 1 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.6, 0.15, 0.5, 0.45, 0.38, 0.28, 0.8, 0, 8, 1);
      return;
    }
    if (kind === 'water') {
      for (let i = 0; i < 8; i++) this.norm.spawn(x, y, z, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.7, 0.2, 0.4, 0.85, 0.92, 1, 0.8, 0, 9, 0.5);
      return;
    }
    for (let i = 0; i < 6; i++) {
      this.add.spawn(x, y, z, nx * 3 + (Math.random() - 0.5) * 6, ny * 3 + Math.random() * 4, nz * 3 + (Math.random() - 0.5) * 6, 0.25, 0.12, 0.02, 1, 0.75, 0.3, 1, 0, 12, 0.5);
    }
    this.norm.spawn(x, y, z, nx, ny + 0.5, nz, 0.5, 0.2, 0.7, 0.6, 0.6, 0.58, 0.5, 0, -0.2, 2);
  }

  explosion(x, y, z, r = 6) {
    const b = this.balls.find((q) => !q.m.visible) || this.balls[0];
    b.m.visible = true; b.t = 0; b.life = 0.7; b.r = r; b.m.position.set(x, y + 1, z);
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = 4 + Math.random() * 12;
      const q = Math.sqrt(1 - u * u);
      this.add.spawn(x, y + 1, z, Math.cos(a) * q * s, Math.abs(u) * s + 2, Math.sin(a) * q * s, 0.5 + Math.random() * 0.5, 2.5, 0.5, 1, 0.55 + Math.random() * 0.3, 0.15, 1, 0, 3, 2.5);
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
      this.norm.spawn(x + (Math.random() - 0.5) * 3, y + 1 + Math.random() * 2, z + (Math.random() - 0.5) * 3, Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s, 2.5 + Math.random() * 2, 2, 7, 0.15, 0.14, 0.13, 0.75, 0, -0.6, 0.9);
    }
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, s = 8 + Math.random() * 14;
      this.add.spawn(x, y + 1, z, Math.cos(a) * s, 5 + Math.random() * 12, Math.sin(a) * s, 1.2, 0.25, 0.1, 1, 0.8, 0.3, 1, 0.5, 18, 0.2);
    }
    this.flash(x, y + 2, z, 6, 0xff9040, 0.4);
    this.shake(Math.min(1.5, 40 / Math.max(8, this.distToCam(x, y, z))));
  }

  fire(x, y, z, scale = 1) {
    this.add.spawn(x + (Math.random() - 0.5) * scale, y, z + (Math.random() - 0.5) * scale, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), 0.5 + Math.random() * 0.4, 1.2 * scale, 0.2, 1, 0.5 + Math.random() * 0.3, 0.1, 0.9, 0, -1, 1);
    if (Math.random() < 0.4) this.norm.spawn(x, y + 1, z, (Math.random() - 0.5), 2 + Math.random(), (Math.random() - 0.5), 2.5, 1, 4 * scale, 0.1, 0.1, 0.1, 0.5, 0, -0.5, 0.5);
  }

  smoke(x, y, z, dark = 0.5, scale = 1) {
    const c = 0.75 - dark * 0.6;
    this.norm.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6, 2, 0.6 * scale, 3 * scale, c, c, c, 0.45, 0, -0.3, 0.6);
  }

  dust(x, y, z, amount = 1) {
    this.norm.spawn(x, y, z, (Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2, 1, 0.5, 2.2 * amount, 0.62, 0.58, 0.5, 0.3, 0, -0.2, 1);
  }

  splash(x, z, big = 1) {
    for (let i = 0; i < 20 * big; i++) this.norm.spawn(x + (Math.random() - 0.5) * 2, 0.1, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4, 3 + Math.random() * 5, (Math.random() - 0.5) * 4, 1, 0.3, 0.8, 0.85, 0.93, 1, 0.8, 0, 12, 0.5);
  }

  shake(a) { this.shakeAmt = Math.min(2, this.shakeAmt + a); }

  distToCam(x, y, z) {
    const c = G.camera.position;
    return Math.hypot(c.x - x, c.y - y, c.z - z);
  }

  update(dt) {
    this.add.update(dt);
    this.norm.update(dt);
    let any = false;
    for (let i = 0; i < this.maxTr; i++) {
      if (this.trLife[i] > 0) {
        this.trLife[i] -= dt;
        const f = Math.max(0, this.trLife[i] / 0.07);
        for (let k = 0; k < 3; k++) {
          this.trCol[i * 6 + k] = this.trBase[i * 3 + k] * f * 0.6;
          this.trCol[i * 6 + 3 + k] = this.trBase[i * 3 + k] * f;
        }
        any = true;
      } else if (this.trCol[i * 6] !== 0) {
        for (let k = 0; k < 6; k++) this.trCol[i * 6 + k] = 0;
        any = true;
      }
    }
    if (any) {
      this.tracers.geometry.attributes.position.needsUpdate = true;
      this.tracers.geometry.attributes.color.needsUpdate = true;
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      if (this.lightT <= 0) this.light.intensity = 0;
    }
    for (const b of this.balls) {
      if (!b.m.visible) continue;
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) { b.m.visible = false; continue; }
      const s = b.r * (0.4 + k * 1.1);
      b.m.scale.setScalar(s);
      b.m.material.opacity = (1 - k) * 0.9;
      b.m.material.color.setRGB(1, 0.65 - k * 0.4, 0.25 - k * 0.2);
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
  }
}
