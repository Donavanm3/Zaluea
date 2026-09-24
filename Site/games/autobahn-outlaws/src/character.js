// A walking, shooting, dying humanoid used by the player, pedestrians and police.
import * as THREE from 'three';
import { buildHumanoid, weaponModel, disposeGroup } from './models.js';
import { G } from './game.js';
import { clamp, lerp, lerpAngle } from './util.js';

const TWO_HANDED = new Set(['smg', 'shotgun', 'rifle', 'sniper', 'rpg']);

export class Character {
  constructor(look, x, y, z, heading = 0) {
    this.look = look;
    this.m = buildHumanoid(look);
    this.root = this.m.root;
    this.root.rotation.order = 'YXZ';
    this.m.armL.rotation.order = 'YXZ';
    this.m.armR.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.heading = heading;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.alive = true;
    this.radius = 0.32;
    this.height = 1.85;
    this.phase = Math.random() * 6;
    this.weapon = 'fist';
    this.gunModel = null;
    this.aim = false;
    this.aimPitch = 0;
    this.punchT = 0;
    this.onGround = true;
    this.swimming = false;
    this.deadT = 0;
    this.fling = null;
    this.visible = true;
    this.pose = 'normal';
    this.stepT = 0;
    G.scene.add(this.root);
    this.sync();
  }

  setWeapon(id) {
    if (this.weapon === id && (this.gunModel || id === 'fist')) return;
    if (this.gunModel) this.m.gunSlot.remove(this.gunModel);
    this.gunModel = null;
    this.weapon = id;
    if (id && id !== 'fist') {
      this.gunModel = weaponModel(id);
      this.m.gunSlot.add(this.gunModel);
    }
  }

  setVisible(v) {
    this.visible = v;
    this.root.visible = v;
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
  }

  get chestY() { return this.pos.y + 1.35; }

  // Shoulder world position (right) and muzzle estimate along aim dir.
  muzzle(dir, out) {
    const h = this.heading;
    const sx = -Math.cos(h) * 0.29, sz = Math.sin(h) * 0.29; // right shoulder offset
    const len = TWO_HANDED.has(this.weapon) ? 1.05 : 0.8;
    out.set(this.pos.x + sx + dir.x * len, this.pos.y + 1.5 + dir.y * len, this.pos.z + sz + dir.z * len);
    return out;
  }

  // Integrate movement with collisions. wx/wz = desired horizontal velocity.
  move(dt, wx, wz, jump = false) {
    const P = G.physics;
    const p = this.pos;
    const accel = this.onGround || this.swimming ? 16 : 3;
    const dvx = wx - this.vel.x, dvz = wz - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dl > maxDv) { this.vel.x += (dvx / dl) * maxDv; this.vel.z += (dvz / dl) * maxDv; }
    else { this.vel.x = wx; this.vel.z = wz; }

    const depth = P.waterDepth(p.x, p.z, p.y);
    const wasSwim = this.swimming;
    this.swimming = depth > 1.3 && p.y < 0.3;
    if (this.swimming) {
      if (!wasSwim) { G.fx.splash(p.x, p.z, 1); G.audio.splash(p); }
      p.y = lerp(p.y, -1.3, Math.min(1, dt * 5));
      this.vy = 0;
      this.onGround = false;
    } else {
      if (jump && this.onGround) { this.vy = 5.4; this.onGround = false; }
      this.vy -= 19 * dt;
      p.y += this.vy * dt;
    }
    p.x += this.vel.x * dt;
    p.z += this.vel.z * dt;
    const hit = P.collideCircle(p, this.radius, this.height, 0.45, this._hit || (this._hit = {}));
    if (hit.hit) {
      // remove velocity into the wall
      const l = Math.hypot(hit.x, hit.z);
      if (l > 1e-5) {
        const nx = hit.x / l, nz = hit.z / l;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) { this.vel.x -= nx * vn; this.vel.z -= nz * vn; }
      }
    }
    if (!this.swimming) {
      const g = P.groundAt(p.x, p.z, p.y, 0.45);
      if (p.y <= g) {
        if (this.vy < -15) this.fallDamage(-this.vy);
        p.y = g;
        this.vy = 0;
        this.onGround = true;
      } else if (this.onGround && p.y - g < 0.35 && this.vy <= 0) {
        p.y = g;
        this.vy = 0;
      } else {
        this.onGround = false;
      }
    }
    return hit;
  }

  fallDamage(v) {
    const dmg = (v - 15) * 9;
    if (dmg > 0) this.damage(dmg, null, null, false, 'fall');
  }

  // Returns true if killed by this hit.
  damage(amount, source, dir, head = false, kind = 'bullet') {
    if (!this.alive) return false;
    if (this.godMode) return false;
    let a = amount * (head ? 2.5 : 1);
    if (this.armor > 0 && kind !== 'fall') {
      const absorbed = Math.min(this.armor, a * 0.7);
      this.armor -= absorbed;
      a -= absorbed;
    }
    this.health -= a;
    this.lastHit = G.time;
    this.lastAttacker = source;
    if (this.onDamage) this.onDamage(a, source, kind);
    if (this.health <= 0) {
      this.health = 0;
      this.kill(dir, kind === 'explosion' || kind === 'vehicle' ? 1 : 0.3);
      return true;
    }
    return false;
  }

  kill(dir, force = 0.3) {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 0;
    this.fallDir = Math.random() < 0.5 ? -1 : 1;
    if (dir && force > 0.5) {
      this.fling = new THREE.Vector3(dir.x * 9 * force, 4 + 5 * force, dir.z * 9 * force);
    }
    if (this.onDeath) this.onDeath();
  }

  // Ray vs body cylinder + head sphere. Returns {t, head} or null.
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    if (!this.alive || !this.visible) return null;
    const p = this.pos;
    const r = 0.3;
    const fx = ox - p.x, fz = oz - p.z;
    const a = dx * dx + dz * dz;
    let best = null;
    if (a > 1e-8) {
      const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t > 0 && t < maxT) {
          const y = oy + dy * t - p.y;
          if (y > 0 && y < 1.62) best = { t, head: false };
        }
      }
    }
    // head sphere
    const hx = ox - p.x, hy = oy - (p.y + 1.77), hz = oz - p.z;
    const hb = hx * dx + hy * dy + hz * dz, hc = hx * hx + hy * hy + hz * hz - 0.17 * 0.17;
    const hd = hb * hb - hc;
    if (hd >= 0) {
      const t = -hb - Math.sqrt(hd);
      if (t > 0 && t < maxT && (!best || t < best.t)) best = { t, head: true };
    }
    return best;
  }

  animate(dt, speed, o = {}) {
    const m = this.m;
    if (!this.alive) {
      this.deadT += dt;
      const P = G.physics;
      if (this.fling) {
        this.pos.addScaledVector(this.fling, dt);
        this.fling.y -= 18 * dt;
        const g = P.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.6);
        if (this.pos.y <= g) {
          this.pos.y = g;
          this.fling.multiplyScalar(0.35);
          this.fling.y = Math.abs(this.fling.y) * 0.2;
          if (this.fling.lengthSq() < 0.5) this.fling = null;
        }
        this.root.rotation.x -= dt * 7;
      } else {
        const g = P.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.6);
        const depth = P.waterDepth(this.pos.x, this.pos.z, this.pos.y);
        if (depth > 1) this.pos.y = lerp(this.pos.y, -0.3, dt * 2);
        else this.pos.y = lerp(this.pos.y, g, Math.min(1, dt * 10));
        const k = Math.min(1, this.deadT * 2.6);
        const target = -Math.PI / 2 * (1 - (1 - k) * (1 - k));
        this.root.rotation.x = lerpAngle(this.root.rotation.x, target, Math.min(1, dt * 10));
        this.root.rotation.z = lerp(this.root.rotation.z, 0, dt * 5);
      }
      m.armL.rotation.set(-2.6, 0, 0.3);
      m.armR.rotation.set(-2.4, 0, -0.3);
      m.legL.rotation.x = 0.1; m.legR.rotation.x = -0.15;
      this.root.position.copy(this.pos);
      this.root.position.y += 0.14;
      this.root.rotation.y = this.heading;
      return;
    }
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    if (o.seated) {
      m.legL.rotation.x = -1.35; m.legR.rotation.x = -1.35;
      m.armL.rotation.set(-1.1, -0.2, 0); m.armR.rotation.set(-1.1, 0.2, 0);
      m.body.position.y = 0;
      this.sync();
      return;
    }
    if (this.swimming) {
      this.phase += dt * 5;
      this.root.rotation.x = speed > 0.5 ? 1.2 : 0.2;
      const s = Math.sin(this.phase);
      m.armL.rotation.set(-2.6 + s * 0.8, 0, 0.2); m.armR.rotation.set(-2.6 - s * 0.8, 0, -0.2);
      m.legL.rotation.x = s * 0.4; m.legR.rotation.x = -s * 0.4;
      this.sync();
      return;
    }
    const run = speed > 4.2;
    if (speed > 0.15) this.phase += dt * (speed * 1.55 + 2.2);
    const amp = Math.min(1, speed / 5.5) * (run ? 0.95 : 0.6);
    const sw = Math.sin(this.phase) * amp;
    m.legL.rotation.x = sw;
    m.legR.rotation.x = -sw;
    if (!this.onGround && !this.swimming) { m.legL.rotation.x = -0.5; m.legR.rotation.x = 0.3; }
    m.body.position.y = Math.abs(Math.cos(this.phase)) * 0.05 * amp;
    // footsteps
    if (speed > 0.5 && this.onGround && this.isPlayer) {
      const st = Math.floor(this.phase / Math.PI);
      if (st !== this.stepT) { this.stepT = st; G.audio.step2(this.pos, run); }
    }
    const pitch = this.aimPitch;
    if (this.pose === 'handsup') {
      m.armL.rotation.set(-2.9, 0, 0.2); m.armR.rotation.set(-2.9, 0, -0.2);
    } else if (this.pose === 'cower') {
      m.armL.rotation.set(-2.2, -0.6, 0); m.armR.rotation.set(-2.2, 0.6, 0);
      m.legL.rotation.x = -0.9; m.legR.rotation.x = -0.9;
      m.body.position.y = -0.35;
    } else if (this.punchT > 0) {
      const k = Math.sin((1 - this.punchT / 0.35) * Math.PI);
      m.armR.rotation.set(-0.3 - k * 1.3, 0.3 * k, 0);
      m.armL.rotation.set(-0.9, 0.3, 0);
    } else if (this.aim && this.weapon !== 'fist') {
      if (this.weapon === 'grenade') {
        m.armR.rotation.set(-2.6, 0, 0); m.armL.rotation.set(-0.9 - pitch, -0.3, 0);
      } else {
        m.armR.rotation.set(-Math.PI / 2 - pitch, TWO_HANDED.has(this.weapon) ? 0.12 : 0.05, 0);
        if (TWO_HANDED.has(this.weapon)) m.armL.rotation.set(-Math.PI / 2 - pitch + 0.15, -0.62, 0);
        else m.armL.rotation.set(-sw * 0.5, 0, 0);
      }
    } else {
      m.armL.rotation.set(-sw * 0.8, 0, 0.05);
      if (this.weapon !== 'fist' && TWO_HANDED.has(this.weapon)) {
        m.armR.rotation.set(-0.7, 0.4, 0); m.armL.rotation.set(-0.9, -0.5, 0);
      } else m.armR.rotation.set(sw * 0.8, 0, -0.05);
    }
    if (this.punchT > 0) this.punchT -= dt;
    this.sync();
  }

  remove() {
    G.scene.remove(this.root);
    disposeGroup(this.root);
  }
}
