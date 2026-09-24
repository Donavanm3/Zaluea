// Vehicle definitions and arcade physics (cars, bikes, boats, helicopters).
import * as THREE from 'three';
import { G } from './game.js';
import { buildVehicleModel, disposeGroup, burntMat } from './models.js';
import { clamp, lerp, pick } from './util.js';

const COMMON = [0xc0c4c8, 0x1a1a1c, 0xf2f2f2, 0x1f3050, 0x5a5e64, 0x8a1a1a, 0x2a4a3a, 0x7a8a9a, 0xd8d0c0, 0x303a4a];
export const VEHICLES = {
  pendler: { name: 'Vulkan Pendler', cls: 'car', shape: 'hatch', L: 4.1, W: 1.78, H: 1.45, mass: 1200, maxSpeed: 52, accel: 9.5, brake: 17, steer: 0.62, wheelbase: 2.55, grip: 1.0, hp: 1000, sound: 'car', colors: COMMON },
  adler: { name: 'Adler Limousine', cls: 'car', shape: 'sedan', L: 4.75, W: 1.84, H: 1.45, mass: 1600, maxSpeed: 62, accel: 11, brake: 18, steer: 0.58, wheelbase: 2.85, grip: 1.05, hp: 1100, sound: 'car', colors: [0x1a1a1c, 0xc0c4c8, 0x1f3050, 0xf2f2f2, 0x5a5e64] },
  kombi: { name: 'Vulkan Kombi', cls: 'car', shape: 'wagon', L: 4.8, W: 1.84, H: 1.5, mass: 1500, maxSpeed: 56, accel: 9.5, brake: 17, steer: 0.58, wheelbase: 2.8, grip: 1.0, hp: 1100, sound: 'car', colors: COMMON },
  falke: { name: 'Falke GT', cls: 'car', shape: 'sports', L: 4.4, W: 1.92, H: 1.15, mass: 1400, maxSpeed: 86, accel: 18, brake: 24, steer: 0.55, wheelbase: 2.5, grip: 1.3, hp: 900, sound: 'sports', colors: [0xd01c1c, 0xf2c200, 0x1a1a1c, 0xf2f2f2, 0x2a6ad0, 0x2aa04a] },
  rennpappe: { name: 'Rennpappe 601', cls: 'car', shape: 'trabbi', L: 3.5, W: 1.5, H: 1.38, mass: 620, maxSpeed: 31, accel: 4.4, brake: 12, steer: 0.66, wheelbase: 2.0, grip: 0.9, hp: 650, sound: 'trabbi', colors: [0x9ab8c8, 0xd8d0a0, 0x7aa07a, 0xe8e2d0, 0x3a6a9a, 0xb07a4a] },
  taxi: { name: 'Taxi', cls: 'car', shape: 'sedan', L: 4.75, W: 1.84, H: 1.45, mass: 1600, maxSpeed: 58, accel: 10, brake: 18, steer: 0.58, wheelbase: 2.85, grip: 1.05, hp: 1100, sound: 'car', colors: [0xf0e4b8], taxi: true },
  polizei: { name: 'Polizei Streifenwagen', cls: 'car', shape: 'wagon', L: 4.8, W: 1.86, H: 1.5, mass: 1650, maxSpeed: 66, accel: 13, brake: 20, steer: 0.6, wheelbase: 2.85, grip: 1.15, hp: 1400, sound: 'car', colors: [0xdde2e6], police: true },
  transporter: { name: 'Kraft Transporter', cls: 'car', shape: 'van', L: 5.2, W: 2.0, H: 2.1, mass: 2300, maxSpeed: 44, accel: 6.8, brake: 14, steer: 0.55, wheelbase: 3.3, grip: 0.95, hp: 1400, sound: 'car', colors: [0xf2f2f2, 0xd8d8d8, 0x2a4a8a, 0xc0392b, 0x5a5e64] },
  sek: { name: 'SEK Einsatzwagen', cls: 'car', shape: 'van', L: 5.2, W: 2.0, H: 2.1, mass: 2800, maxSpeed: 54, accel: 9.5, brake: 16, steer: 0.55, wheelbase: 3.3, grip: 1.05, hp: 2200, sound: 'truck', colors: [0x2b2f36], police: true, sek: true },
  rtw: { name: 'Rettungswagen', cls: 'car', shape: 'van', L: 5.2, W: 2.0, H: 2.1, mass: 2600, maxSpeed: 50, accel: 8, brake: 16, steer: 0.55, wheelbase: 3.3, grip: 1.0, hp: 1500, sound: 'car', colors: [0xf4f4f0], ambulance: true },
  brummi: { name: 'Brummi 18t', cls: 'car', shape: 'truck', L: 9, W: 2.5, H: 3.9, mass: 9000, maxSpeed: 32, accel: 3.6, brake: 9, steer: 0.5, wheelbase: 5.5, grip: 0.9, hp: 2600, sound: 'truck', colors: [0xf2f2f2, 0x2a4a8a, 0xc0392b, 0x2e7d32, 0xf2c200] },
  bus: { name: 'Linienbus', cls: 'car', shape: 'bus', L: 11, W: 2.5, H: 3.0, mass: 11000, maxSpeed: 25, accel: 3.2, brake: 9, steer: 0.52, wheelbase: 6.2, grip: 0.9, hp: 2600, sound: 'bus', colors: [0xf2c200] },
  blitz: { name: 'Blitz 1000 Motorrad', cls: 'bike', shape: 'bike', L: 2.1, W: 0.7, H: 1.2, mass: 260, maxSpeed: 74, accel: 15, brake: 20, steer: 0.72, wheelbase: 1.5, grip: 1.15, hp: 450, sound: 'bike', colors: [0xd01c1c, 0x1a1a1c, 0x2a6ad0, 0xf2f2f2, 0x2aa04a] },
  speedboot: { name: 'Speedboot Hanse', cls: 'boat', shape: 'boat', L: 6.5, W: 2.4, H: 1.5, mass: 1500, maxSpeed: 36, accel: 7.5, brake: 8, steer: 0.9, wheelbase: 4, grip: 0.3, hp: 1000, sound: 'boat', colors: [0x1f4f9a, 0xc0392b, 0x1a1a1c, 0x2e7d32] },
  libelle: { name: 'Hubschrauber Libelle', cls: 'heli', shape: 'heli', L: 11, W: 2.4, H: 3.2, mass: 2500, maxSpeed: 48, accel: 16, brake: 10, steer: 1.4, wheelbase: 4, grip: 1, hp: 1300, sound: 'heli', colors: [0xf2f2f2, 0xd01c1c, 0x1a1a1c, 0xf2c200] },
  polizeiheli: { name: 'Polizeihubschrauber', cls: 'heli', shape: 'heli', L: 11, W: 2.4, H: 3.2, mass: 2500, maxSpeed: 50, accel: 16, brake: 10, steer: 1.4, wheelbase: 4, grip: 1, hp: 1600, sound: 'heli', colors: [0xdde2e6], police: true },
};

const GRAV = 18;

function computeCircles(d) {
  if (d.cls === 'heli') return [{ z: 1.2, r: 1.6 }, { z: -2.5, r: 1.1 }];
  if (d.cls === 'bike') return [{ z: 0.55, r: 0.45 }, { z: -0.55, r: 0.45 }];
  const r = d.W / 2;
  const n = Math.max(2, Math.ceil(d.L / d.W));
  const out = [];
  for (let i = 0; i < n; i++) out.push({ z: -(d.L / 2 - r) + (i / (n - 1)) * (d.L - 2 * r), r });
  return out;
}

let nextId = 1;
export class Vehicle {
  constructor(id, x, y, z, heading, color) {
    this.uid = nextId++;
    this.type = id;
    this.def = VEHICLES[id];
    const d = this.def;
    this.color = color ?? pick(d.colors);
    this.model = buildVehicleModel(d, this.color);
    this.group = this.model.group;
    this.group.rotation.order = 'YXZ';
    G.scene.add(this.group);
    this.pos = new THREE.Vector3(x, y, z);
    this.prev = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.heading = heading;
    this.angVel = 0;
    this.pitch = 0;
    this.roll = 0;
    this.vy = 0;
    this.onGround = true;
    this.hp = d.hp;
    this.dead = false;
    this.burning = 0;
    this.sinkT = 0;
    this.deadT = 0;
    this.driver = null;
    this.ai = null;
    this.ctrl = { throttle: 0, brake: 0, steer: 0, handbrake: false, lift: 0 };
    this.mode = 'physics';
    this.steerAngle = 0;
    this.speed = 0;
    this.siren = false;
    this.sirenT = 0;
    this.rotorSpeed = 0;
    this.radius = Math.hypot(d.L, d.W) / 2;
    this.circles = computeCircles(d);
    this.persist = false;
    this.lastHitBy = null;
    this.lean = 0;
    this.bob = Math.random() * 6;
    this._hit = {};
    this.sync();
  }

  get isPolice() { return !!this.def.police; }
  get cls() { return this.def.cls; }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }

  update(dt) {
    this.prev.copy(this.pos);
    if (this.dead) {
      this.deadT += dt;
      if (this.deadT < 12 && Math.random() < 0.5) G.fx.fire(this.pos.x, this.pos.y + 1, this.pos.z, 1.2);
      if (this.deadT < 30 && Math.random() < 0.2) G.fx.smoke(this.pos.x, this.pos.y + 1.5, this.pos.z, 0.9, 1.5);
      this.vel.multiplyScalar(1 - Math.min(1, dt * 2));
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      if (this.cls === 'heli' || !this.onGround) {
        this.vy -= GRAV * dt;
        this.pos.y += this.vy * dt;
        const g = G.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 1, 1);
        if (this.pos.y < g) { this.pos.y = g; this.vy = 0; this.onGround = true; }
      }
      if (this.cls === 'boat') this.pos.y = lerp(this.pos.y, -2, dt * 0.3);
      this.sync();
      return;
    }
    if (this.mode === 'kinematic') {
      this.groundFollow(dt, true);
    } else if (this.cls === 'heli') this.updateHeli(dt);
    else if (this.cls === 'boat') this.updateBoat(dt);
    else this.updateCar(dt);

    // damage effects
    if (this.hp < 450 && this.cls !== 'boat') {
      const fz = this.fz * (this.def.L / 2 - 0.6), fx = this.fx * (this.def.L / 2 - 0.6);
      if (Math.random() < 0.35) G.fx.smoke(this.pos.x + fx, this.pos.y + this.def.H * 0.7, this.pos.z + fz, this.hp < 250 ? 0.9 : 0.3, 0.8);
    }
    if (this.hp < 160 && !this.burning) this.burning = 5 + Math.random() * 2;
    if (this.burning > 0) {
      this.burning -= dt;
      if (Math.random() < 0.7) G.fx.fire(this.pos.x + this.fx * (this.def.L / 2 - 0.8), this.pos.y + this.def.H * 0.6, this.pos.z + this.fz * (this.def.L / 2 - 0.8), 0.8);
      if (this.burning <= 0) this.explode();
    }
    // police light bar
    if (this.model.extras.lightbar) {
      const lb = this.model.extras.lightbar;
      if (this.siren) {
        this.sirenT += dt;
        const on = Math.floor(this.sirenT * 6) % 2 === 0;
        lb[0].color.setHex(on ? 0x2050ff : 0x0a0a30);
        lb[1].color.setHex(on ? 0x0a0a30 : 0x2050ff);
      } else {
        lb[0].color.setHex(0x1a2a60); lb[1].color.setHex(0x1a2a60);
      }
    }
    // velocity for kinematic bodies
    if (this.mode === 'kinematic' && dt > 0) {
      this.vel.set((this.pos.x - this.prev.x) / dt, 0, (this.pos.z - this.prev.z) / dt);
    }
    this.sync(dt);
  }

  updateCar(dt) {
    const d = this.def, c = this.ctrl;
    let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let rx = -fz, rz = fx;
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vR = this.vel.x * rx + this.vel.z * rz;
    const P = G.physics;
    const depth = P.waterDepth(this.pos.x, this.pos.z, this.pos.y);
    if (depth > 0.9 && this.pos.y < 0.3) {
      if (this.sinkT === 0) { G.fx.splash(this.pos.x, this.pos.z, 2); G.audio.splash(this.pos); }
      this.sinkT += dt;
      this.vel.multiplyScalar(1 - Math.min(1, dt * 2.5));
      this.pos.addScaledVector(this.vel, dt);
      this.pos.y = lerp(this.pos.y, -d.H - 0.5, dt * 0.6);
      this.pitch = lerp(this.pitch, 0.25, dt);
      if (this.sinkT > 8) { this.hp = 0; this.dead = true; this.drowned = true; }
      return;
    }
    if (this.onGround) {
      const maxS = d.maxSpeed * (this.hp < 250 ? 0.6 : 1) * (this.boost || 1);
      if (c.throttle > 0.01) {
        if (vF < -0.5) vF += d.brake * c.throttle * dt;
        else vF += d.accel * c.throttle * (1 - Math.pow(clamp(vF / maxS, 0, 1), 2)) * dt;
      }
      if (c.brake > 0.01) {
        if (vF > 0.5) vF -= d.brake * c.brake * dt;
        else if (vF > -maxS * 0.28) vF -= d.accel * 0.7 * c.brake * dt;
      }
      const coast = c.throttle < 0.01 && c.brake < 0.01;
      vF -= vF * (0.05 + (coast ? 0.25 : 0) + Math.abs(vF) * 0.0006) * dt;
      if (c.handbrake) vF -= vF * 1.6 * dt;
      if (coast && Math.abs(vF) < 0.4) vF *= 0.9;
      const steerMax = d.steer / (1 + Math.abs(vF) / 20);
      this.steerAngle = lerp(this.steerAngle, c.steer * steerMax, Math.min(1, dt * 7));
      const wet = G.sky && G.sky.weather > 0.5 ? 0.82 : 1;
      const grip = d.grip * (c.handbrake ? 0.22 : 1) * wet;
      const yawT = (-vF * Math.tan(this.steerAngle)) / d.wheelbase;
      this.angVel = lerp(this.angVel, yawT * (c.handbrake ? 1.4 : 1), Math.min(1, dt * 7 * Math.max(0.4, grip)));
      vR *= Math.exp(-dt * 10 * grip);
      vF -= 9.8 * Math.sin(this.pitch) * dt;
      // tyre smoke when drifting
      if (Math.abs(vR) > 4.5 && Math.random() < 0.6) {
        G.fx.dust(this.pos.x - fx * d.L * 0.35, this.pos.y + 0.2, this.pos.z - fz * d.L * 0.35, 0.7);
      }
    } else {
      this.angVel *= 1 - dt * 0.3;
    }
    this.heading += this.angVel * dt;
    fx = Math.sin(this.heading); fz = Math.cos(this.heading); rx = -fz; rz = fx;
    this.vel.x = fx * vF + rx * vR;
    this.vel.z = fz * vF + rz * vR;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.speed = vF;
    this.groundFollow(dt, false);
    this.collideStatic(dt);
  }

  groundFollow(dt, forceGround) {
    const d = this.def, P = G.physics;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = -fz, rz = fx;
    const hl = d.wheelbase / 2, hw = d.cls === 'bike' ? 0.05 : d.W * 0.4;
    const yRef = this.pos.y + 0.7;
    const px = this.pos.x, pz = this.pos.z;
    const gFL = P.groundAt(px + fx * hl - rx * hw, pz + fz * hl - rz * hw, yRef);
    const gFR = P.groundAt(px + fx * hl + rx * hw, pz + fz * hl + rz * hw, yRef);
    const gRL = P.groundAt(px - fx * hl - rx * hw, pz - fz * hl - rz * hw, yRef);
    const gRR = P.groundAt(px - fx * hl + rx * hw, pz - fz * hl + rz * hw, yRef);
    const front = (gFL + gFR) / 2, rear = (gRL + gRR) / 2, left = (gFL + gRL) / 2, right = (gFR + gRR) / 2;
    const gy = (front + rear) / 2;
    const tp = Math.atan2(front - rear, d.wheelbase), tr = d.cls === 'bike' ? 0 : Math.atan2(left - right, hw * 2);
    if (forceGround) {
      this.pos.y = gy; this.vy = 0; this.onGround = true;
      this.pitch = lerp(this.pitch, tp, Math.min(1, dt * 10));
      this.roll = lerp(this.roll, tr, Math.min(1, dt * 10));
      return;
    }
    if (this.onGround) {
      const predicted = this.pos.y + this.vy * dt;
      const tol = 0.1 + Math.abs(this.speed) * dt * 0.35;
      if (gy >= predicted - tol) {
        this.vy = clamp((gy - this.pos.y) / Math.max(dt, 1e-3), -25, 25);
        this.pos.y = gy;
      } else {
        this.onGround = false;
        this.vy -= GRAV * dt;
        this.pos.y += this.vy * dt;
      }
    } else {
      this.vy -= GRAV * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gy) {
        if (this.vy < -9) {
          this.damage((-this.vy - 9) * 18, null, 'crash');
          G.audio.crash(this.pos, Math.min(1, -this.vy / 20));
          if (this.driver === 'player') G.fx.shake(0.5);
        }
        this.pos.y = gy;
        this.vy = 0;
        this.onGround = true;
      }
    }
    const k = this.onGround ? Math.min(1, dt * 12) : Math.min(1, dt * 0.8);
    this.pitch = lerp(this.pitch, this.onGround ? tp : this.pitch - 0.02, k);
    this.roll = lerp(this.roll, this.onGround ? tr : this.roll, k);
  }

  collideStatic(dt) {
    const d = this.def, P = G.physics;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const tmp = this._tmp || (this._tmp = { x: 0, y: 0, z: 0 });
    for (const c of this.circles) {
      tmp.x = this.pos.x + fx * c.z; tmp.y = this.pos.y; tmp.z = this.pos.z + fz * c.z;
      const h = P.collideCircle(tmp, c.r, d.H, 0.55, this._hit);
      if (!h.hit) continue;
      this.pos.x += h.x; this.pos.z += h.z;
      const l = Math.hypot(h.x, h.z);
      if (l < 1e-6) continue;
      const nx = h.x / l, nz = h.z / l;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) {
        const impact = -vn;
        this.vel.x -= nx * vn * 1.25;
        this.vel.z -= nz * vn * 1.25;
        this.vel.x *= 0.93; this.vel.z *= 0.93;
        this.angVel += c.z * (fz * nx - fx * nz) * impact * 0.06;
        if (impact > 4) {
          this.damage((impact - 4) * 28, null, 'crash');
          G.audio.crash(this.pos, impact / 22);
          G.fx.impact(tmp.x - nx * c.r, this.pos.y + 0.6, tmp.z - nz * c.r, nx, 0.3, nz);
          if (this.driver === 'player') {
            G.fx.shake(Math.min(1, impact / 20));
            if (this.cls === 'bike' && impact > 13) G.player.ejectFromBike(impact);
          }
        }
      }
    }
    // Don't leave Germany: soft border wall at land borders
    this.keepInWorld();
  }

  keepInWorld() {
    const W = G.world;
    if (!W || (G.time - (this._bt || 0)) < 0.25) return;
    this._bt = G.time;
    const bi = W.borderInfo(this.pos.x, this.pos.z);
    if (!bi.inside && bi.t === 'l' && bi.d > 2) {
      const dx = bi.x - this.pos.x, dz = bi.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
      this.pos.x = bi.x + (dx / l) * 2; this.pos.z = bi.z + (dz / l) * 2;
      const vn = this.vel.x * (dx / l) + this.vel.z * (dz / l);
      if (vn < 0) { this.vel.x -= (dx / l) * vn * 1.5; this.vel.z -= (dz / l) * vn * 1.5; }
      if (this.driver === 'player') G.hud.notify('Border closed! You can\'t leave Germany.', 3);
    }
  }

  updateBoat(dt) {
    const d = this.def, c = this.ctrl, P = G.physics;
    const depth = P.waterDepth(this.pos.x, this.pos.z, this.pos.y);
    let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let vF = this.vel.x * fx + this.vel.z * fz, vR = this.vel.x * -fz + this.vel.z * fx;
    const floating = depth > 0.45;
    if (floating) {
      if (c.throttle > 0.01) vF += d.accel * c.throttle * (1 - Math.pow(clamp(vF / d.maxSpeed, 0, 1), 2)) * dt;
      if (c.brake > 0.01) vF -= (vF > 0 ? d.brake : d.accel * 0.5) * c.brake * dt;
      vF = Math.max(vF, -8);
      vF -= vF * 0.18 * dt;
      const yawT = -c.steer * 0.95 * clamp(Math.abs(vF) / 6, 0.25, 1) * Math.sign(vF || 1);
      this.angVel = lerp(this.angVel, yawT, Math.min(1, dt * 2.5));
      vR *= Math.exp(-dt * 2.2);
      this.bob += dt * 2;
      this.pos.y = lerp(this.pos.y, Math.sin(this.bob) * 0.08 + 0.02, Math.min(1, dt * 4));
      this.pitch = lerp(this.pitch, Math.min(0.12, Math.max(0, vF) * 0.004) + Math.sin(this.bob * 0.7) * 0.02, dt * 3);
      this.roll = lerp(this.roll, c.steer * Math.min(1, vF / 20) * 0.15 + Math.sin(this.bob * 1.1) * 0.02, dt * 3);
      if (Math.abs(vF) > 8 && Math.random() < 0.7) G.fx.splash(this.pos.x - fx * 3, this.pos.z - fz * 3, 0.1);
    } else {
      vF *= 1 - Math.min(1, dt * 5);
      vR *= 1 - Math.min(1, dt * 5);
      this.angVel *= 1 - Math.min(1, dt * 5);
      const g = P.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
      this.pos.y = lerp(this.pos.y, Math.max(g, 0), dt * 5);
      if (c.brake > 0.1) vF = -3;
    }
    this.heading += this.angVel * dt;
    fx = Math.sin(this.heading); fz = Math.cos(this.heading);
    this.vel.x = fx * vF - fz * vR;
    this.vel.z = fz * vF + fx * vR;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.speed = vF;
    this.onGround = true;
    this.collideStatic(dt);
  }

  updateHeli(dt) {
    const d = this.def, c = this.ctrl, P = G.physics;
    const powered = !!this.driver;
    this.rotorSpeed = clamp(this.rotorSpeed + (powered ? 0.4 : -0.15) * dt, 0, 1);
    const lift = this.rotorSpeed > 0.65;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const g = P.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5, 1.5);
    const onGround = this.pos.y <= g + 0.05;
    if (lift) {
      if (!onGround || c.lift > 0) this.heading -= c.steer * 1.3 * dt;
      const acc = (c.throttle - c.brake) * d.accel * (onGround ? 0 : 1);
      this.vel.x += fx * acc * dt; this.vel.z += fz * acc * dt;
      const sx = -fz, sz = fx;
      if (c.strafe) { this.vel.x += sx * c.strafe * 8 * dt; this.vel.z += sz * c.strafe * 8 * dt; }
      const drag = 0.5;
      this.vel.x -= this.vel.x * drag * dt; this.vel.z -= this.vel.z * drag * dt;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > d.maxSpeed) { this.vel.x *= d.maxSpeed / hs; this.vel.z *= d.maxSpeed / hs; }
      const targetVy = c.lift * 9 + (powered ? 0 : -3);
      this.vy = lerp(this.vy, targetVy, Math.min(1, dt * 2));
    } else {
      this.vy -= GRAV * 0.6 * dt;
      this.vel.multiplyScalar(1 - dt * 0.3);
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y < g) {
      if (this.vy < -7) { this.damage((-this.vy - 7) * 70, null, 'crash'); G.audio.crash(this.pos, 1); }
      this.pos.y = g;
      this.vy = Math.max(0, this.vy);
      this.vel.multiplyScalar(1 - Math.min(1, dt * 6));
    }
    if (this.pos.y > 700) { this.pos.y = 700; this.vy = Math.min(0, this.vy); }
    if (P.waterDepth(this.pos.x, this.pos.z, this.pos.y) > 1 && this.pos.y < 0.5) {
      this.damage(400 * dt, null, 'crash');
    }
    // tilt from input
    const fwd = this.vel.x * fx + this.vel.z * fz;
    this.pitch = lerp(this.pitch, -(c.throttle - c.brake) * 0.22 - fwd * 0.003, Math.min(1, dt * 3));
    this.roll = lerp(this.roll, -c.steer * 0.18 * (onGround ? 0 : 1), Math.min(1, dt * 3));
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.onGround = onGround;
    // building collisions
    const tmp = this._tmp || (this._tmp = { x: 0, y: 0, z: 0 });
    for (const cc of this.circles) {
      tmp.x = this.pos.x + fx * cc.z; tmp.y = this.pos.y; tmp.z = this.pos.z + fz * cc.z;
      const h = P.collideCircle(tmp, cc.r + (cc.z > 0 ? 3.5 : 0), d.H, 0.3, this._hit);
      if (h.hit) {
        this.pos.x += h.x; this.pos.z += h.z;
        const imp = Math.hypot(this.vel.x, this.vel.z);
        this.vel.multiplyScalar(-0.3);
        if (imp > 3) { this.damage(imp * 25, null, 'crash'); G.audio.crash(this.pos, imp / 20); }
      }
    }
    this.keepInWorld();
  }

  damage(amount, source, kind = 'bullet') {
    if (this.dead) return;
    if (this.invincible) return;
    this.hp -= amount;
    if (source) this.lastHitBy = source;
    if (this.onDamage) this.onDamage(amount, source, kind);
    if (this.hp <= 0) this.explode();
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.burning = 0;
    this.siren = false;
    this.body = this.model.body;
    this.model.body.material = burntMat;
    this.model.lights.visible = false;
    if (this.model.extras.lightbar) this.model.extras.lightbar.forEach((m) => m.color.setHex(0x111111));
    this.vy = this.cls === 'heli' ? this.vy : 7;
    this.onGround = false;
    G.weapons.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, 9, 240, this.lastHitBy, this);
    if (this.onExplode) this.onExplode();
  }

  // Ray vs oriented box.
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    const d = this.def;
    const cx = this.pos.x, cy = this.pos.y + d.H / 2, cz = this.pos.z;
    const s = Math.sin(-this.heading), c = Math.cos(-this.heading);
    const lx = ox - cx, lz = oz - cz;
    const px = lx * c + lz * s, pz = -lx * s + lz * c, py = oy - cy;
    const qx = dx * c + dz * s, qz = -dx * s + dz * c, qy = dy;
    const hx = d.W / 2, hy = d.H / 2, hz = d.L / 2;
    let t0 = 0, t1 = maxT;
    for (const [o, v, h] of [[px, qx, hx], [py, qy, hy], [pz, qz, hz]]) {
      if (Math.abs(v) < 1e-9) { if (o < -h || o > h) return -1; continue; }
      let a = (-h - o) / v, b = (h - o) / v;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
    return t0 > 0 ? t0 : -1;
  }

  sync(dt = 0) {
    const g = this.group;
    g.position.copy(this.pos);
    const d = this.def;
    if (d.cls === 'bike' && !this.dead) {
      this.lean = lerp(this.lean, this.steerAngle * clamp(Math.abs(this.speed) / 12, 0, 1) * 1.1, Math.min(1, dt * 6));
      g.rotation.set(-this.pitch, this.heading, this.lean);
    } else g.rotation.set(-this.pitch, this.heading, this.roll);
    for (const w of this.model.wheels) {
      w.mesh.rotation.x += (this.speed * dt) / w.r;
      if (w.front) w.pivot.rotation.y = -this.steerAngle;
    }
    const ex = this.model.extras;
    if (ex.rotor) {
      ex.rotor.rotation.y += this.rotorSpeed * dt * 38;
      ex.tailRotor.rotation.x += this.rotorSpeed * dt * 50;
    }
  }

  dispose() {
    G.scene.remove(this.group);
    disposeGroup(this.group);
  }
}
