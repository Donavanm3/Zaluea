// The player: on-foot controls, camera, shooting, vehicles, death and arrest.
import * as THREE from 'three';
import { G } from './game.js';
import { Character } from './character.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { clamp, lerp, lerpAngle, wrapAngle } from './util.js';

export const PLAYER_LOOK = {
  skin: 0xe8b894, hair: 0x2b1d14, shirt: 0xd8d8d0, pants: 0x28344a, shoes: 0x1a1a1a,
  jacket: 0x3a2a20, hairStyle: 0, female: false,
};

const _dir = new THREE.Vector3(), _m = new THREE.Vector3(), _t = new THREE.Vector3(), _tmp = new THREE.Vector3();

export class Player {
  constructor(x, y, z, heading = 0) {
    this.char = new Character(PLAYER_LOOK, x, y, z, heading);
    this.char.isPlayer = true;
    this.char.onDamage = (a, src, kind) => this.onDamage(a, src, kind);
    this.char.onDeath = () => this.onDeath();
    this.vehicle = null;
    this.inv = { fist: { mag: 0, ammo: 0 } };
    this.weapon = 'fist';
    this.cooldown = 0;
    this.reloadT = 0;
    this.lastFire = -10;
    this.cam = { yaw: heading, pitch: -0.12, dist: 4.2, mode: 0, lastLook: 0, fov: 70, shoulder: 0.4 };
    this.dead = false;
    this.deadT = 0;
    this.busted = false;
    this.regenT = 0;
    this.enterCooldown = 0;
    this.lastVehicle = null;
    this.hornHeld = false;
  }

  get pos() { return this.vehicle ? this.vehicle.pos : this.char.pos; }
  get inVehicle() { return !!this.vehicle; }

  giveWeapon(id, ammo) {
    const w = WEAPONS[id];
    if (!this.inv[id]) this.inv[id] = { mag: 0, ammo: 0 };
    const s = this.inv[id];
    if (w.throw) { s.mag += ammo; }
    else {
      s.ammo += ammo;
      const need = w.mag - s.mag;
      const take = Math.min(need, s.ammo);
      s.mag += take; s.ammo -= take;
    }
    if (this.weapon === 'fist' && id !== 'fist') this.switchTo(id);
  }

  totalAmmo(id) {
    const s = this.inv[id];
    return s ? s.mag + s.ammo : 0;
  }

  switchTo(id) {
    if (!this.inv[id]) return;
    if (id !== 'fist' && this.totalAmmo(id) <= 0) return;
    this.weapon = id;
    this.reloadT = 0;
    this.char.setWeapon(id);
    G.audio.ui('select');
  }

  cycleWeapon(dir) {
    const owned = WEAPON_ORDER.filter((id) => this.inv[id] && (id === 'fist' || this.totalAmmo(id) > 0));
    let i = owned.indexOf(this.weapon);
    i = (i + dir + owned.length) % owned.length;
    this.switchTo(owned[i]);
  }

  reload() {
    const w = WEAPONS[this.weapon];
    const s = this.inv[this.weapon];
    if (!s || w.melee || w.throw || s.mag >= w.mag || s.ammo <= 0 || this.reloadT > 0) return;
    this.reloadT = w.reload;
    G.audio.shot('reload', this.char.pos);
  }

  onDamage(a, src, kind) {
    this.regenT = 0;
    if (G.hud) G.hud.damageFlash(Math.min(1, a / 30));
  }

  onDeath() {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
    G.stats.deaths++;
    if (this.vehicle) this.forceExit(false);
    G.audio.setEngine(false);
    G.audio.setRadio(false);
    G.audio.ui('wasted');
    G.hud.bigMessage('WASTED', '#c0392b', 'You died');
    if (G.missions) G.missions.fail('You died.');
  }

  arrest() {
    if (this.dead || this.busted) return;
    this.busted = true;
    this.deadT = 0;
    G.stats.arrests++;
    if (this.vehicle) this.forceExit(false);
    G.audio.setEngine(false);
    G.audio.setRadio(false);
    G.audio.ui('busted');
    G.hud.bigMessage('BUSTED', '#2f6fd0', 'Arrested by the Polizei');
    this.char.pose = 'handsup';
    if (G.missions) G.missions.fail('You were arrested.');
  }

  respawn() {
    const busted = this.busted;
    const svcType = busted ? 'police' : 'hospital';
    const pos = this.vehicle ? this.vehicle.pos : this.char.pos;
    let best = null, bd = Infinity;
    for (const s of G.world.services) {
      if (s.type !== svcType) continue;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < bd) { bd = d; best = s; }
    }
    const fee = busted ? Math.min(G.money, 500) : Math.min(G.money, 250);
    G.money -= fee;
    if (busted) {
      // lose some weapons
      for (const id of Object.keys(this.inv)) if (id !== 'fist' && id !== 'pistol') delete this.inv[id];
      if (this.inv.pistol) this.inv.pistol.ammo = Math.min(this.inv.pistol.ammo, 24);
    }
    const c = this.char;
    c.alive = true; c.health = c.maxHealth; c.armor = 0; c.fling = null; c.pose = 'normal';
    c.root.rotation.set(0, 0, 0);
    if (best) c.pos.set(best.x, best.y + 0.1, best.z - 0.5);
    c.vel.set(0, 0, 0);
    c.heading = Math.PI;
    c.setVisible(true);
    this.cam.yaw = Math.PI;
    this.dead = false;
    this.busted = false;
    this.weapon = 'fist';
    c.setWeapon('fist');
    G.police.clear();
    G.hud.notify(busted ? `Released from police custody. Bail: €${fee}` : `Hospital bill: €${fee}`, 5);
    G.hud.clearBig();
    G.clock = (G.clock + 5) % 24;
    if (G.save) G.save.autosave();
  }

  // ---------------- per-frame ----------------
  update(dt) {
    const I = G.input;
    this.cooldown -= dt;
    this.enterCooldown -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const w = WEAPONS[this.weapon], s = this.inv[this.weapon];
        if (s) { const take = Math.min(w.mag - s.mag, s.ammo); s.mag += take; s.ammo -= take; }
      }
    }
    if (this.dead || this.busted) {
      this.deadT += dt;
      this.char.animate(dt, 0);
      if (this.deadT > 5) this.respawn();
      return;
    }
    // health regeneration up to 50%
    this.regenT += dt;
    const c = this.char;
    if (this.regenT > 6 && c.health < c.maxHealth * 0.5) c.health = Math.min(c.maxHealth * 0.5, c.health + dt * 4);

    // look
    const sens = G.settings.sensitivity;
    const [lx, ly] = I.consumeLook(dt, sens);
    if (Math.abs(lx) + Math.abs(ly) > 0.0005) this.cam.lastLook = G.time;
    const scopeMul = this.scoped ? 0.3 : 1;
    this.cam.yaw -= lx * scopeMul;
    this.cam.pitch = clamp(this.cam.pitch - ly * scopeMul * (G.settings.invertY ? -1 : 1), -1.25, 1.0);

    // weapon selection
    if (I.wheel) this.cycleWeapon(I.wheel > 0 ? 1 : -1);
    if (I.pressed('wnext')) this.cycleWeapon(1);
    if (I.pressed('wprev')) this.cycleWeapon(-1);
    for (let k = 0; k < 8; k++) if (I.pressed('w' + k)) this.switchTo(WEAPON_ORDER[k]);
    if (I.pressed('w0')) this.switchTo('fist');
    if (I.pressed('reload')) this.reload();

    if (this.vehicle) this.updateVehicle(dt);
    else this.updateFoot(dt);
  }

  updateFoot(dt) {
    const I = G.input, c = this.char;
    const w = WEAPONS[this.weapon];
    const aiming = I.aiming() && !w.melee && !c.swimming;
    this.scoped = aiming && w.scope;
    const yaw = this.cam.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const mx = I.moveX(), my = I.moveY();
    let wx = fx * my + rx * mx, wz = fz * my + rz * mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    let speed = aiming ? 2.8 : I.key('sprint') ? 7.6 : 4.8;
    if (c.swimming) speed = I.key('sprint') ? 3.4 : 2.4;
    if (G.flags.slowmo) speed *= 0.5;
    c.move(dt, wx * speed, wz * speed, I.pressed('jump'));
    this.keepInWorld(c.pos);

    const firing = I.firing() && !c.swimming;
    const recent = G.time - this.lastFire < 0.8;
    if (aiming || firing || recent) {
      c.heading = lerpAngle(c.heading, yaw, Math.min(1, dt * 22));
    } else if (wl > 0.1) {
      c.heading = lerpAngle(c.heading, Math.atan2(wx, wz), Math.min(1, dt * 11));
    }
    c.aim = aiming || firing || (recent && !w.melee);
    c.aimPitch = clamp(this.cam.pitch + 0.08, -1.1, 1.1);

    if (!c.swimming) {
      if (w.auto ? firing : (I.firePressed() || (firing && w.melee))) this.tryFire();
    }
    if (I.pressed('enter') && this.enterCooldown <= 0) this.tryEnter();
    c.animate(dt, Math.hypot(c.vel.x, c.vel.z));
  }

  keepInWorld(p) {
    if ((G.time - (this._bt || 0)) < 0.2) return;
    this._bt = G.time;
    const E = G.world.edges;
    p.x = Math.min(E.x1, Math.max(E.x0, p.x));
    p.z = Math.min(E.z1, Math.max(E.z0, p.z));
    const bi = G.world.borderInfo(p.x, p.z);
    if (!bi.inside && bi.t === 'l' && bi.d > 1) {
      const dx = bi.x - p.x, dz = bi.z - p.z, l = Math.hypot(dx, dz) || 1;
      p.x = bi.x + (dx / l) * 1.5; p.z = bi.z + (dz / l) * 1.5;
      G.hud.notify('Border closed! Turn back into Germany.', 3);
    }
  }

  aimDirection(out) {
    const cp = Math.cos(this.cam.pitch);
    out.set(Math.sin(this.cam.yaw) * cp, Math.sin(this.cam.pitch), Math.cos(this.cam.yaw) * cp);
    // use the actual camera orientation (includes collisions/shake)
    G.camera.getWorldDirection(out);
    return out;
  }

  tryFire(fromVehicle = false) {
    if (this.cooldown > 0 || this.reloadT > 0) return;
    const w = WEAPONS[this.weapon];
    const c = this.char;
    if (w.melee) {
      if (fromVehicle) return;
      c.punchT = 0.35;
      this.cooldown = w.rate;
      this.lastFire = G.time;
      G.weapons.melee(c);
      return;
    }
    const s = this.inv[this.weapon];
    if (!s) return;
    if (s.mag <= 0) {
      if (s.ammo > 0) this.reload();
      else { G.audio.shot('empty', c.pos); this.cooldown = 0.3; if (!w.throw) this.cycleWeapon(1); else this.switchTo('fist'); }
      return;
    }
    s.mag--;
    this.cooldown = w.rate;
    this.lastFire = G.time;
    // Aim: ray from camera, find target point, then shoot from muzzle.
    this.aimDirection(_dir);
    const cam = G.camera.position;
    const origin = this.vehicle ? this.vehicle.pos : c.pos;
    const skip = Math.max(0, (origin.x - cam.x) * _dir.x + (origin.y + 1.4 - cam.y) * _dir.y + (origin.z - cam.z) * _dir.z) + 0.8;
    const tr = G.weapons.trace(cam.x + _dir.x * skip, cam.y + _dir.y * skip, cam.z + _dir.z * skip, _dir.x, _dir.y, _dir.z, (w.range || 100) + 20, c, this.vehicle);
    _t.set(tr.x, tr.y, tr.z);
    if (this.vehicle) {
      const v = this.vehicle;
      _m.set(v.pos.x + _dir.x * (v.def.W * 0.6 + 0.5), v.pos.y + v.def.H * 0.75, v.pos.z + _dir.z * (v.def.W * 0.6 + 0.5));
    } else {
      c.muzzle(_dir, _m);
    }
    _tmp.subVectors(_t, _m);
    if (_tmp.lengthSq() < 0.5) _tmp.copy(_dir);
    _tmp.normalize();
    if (w.throw) {
      G.weapons.fire(c, this.weapon, _m, _tmp, {});
      if (s.mag <= 0 && s.ammo <= 0) this.switchTo('fist');
    } else {
      const moving = Math.hypot(c.vel.x, c.vel.z) > 3 || this.vehicle;
      G.weapons.fire(c, this.weapon, _m, _tmp, { extraSpread: (moving ? 0.015 : 0) + (G.input.aiming() ? 0 : 0.01), vehicle: this.vehicle });
    }
    // recoil
    const kick = w.id === 'sniper' ? 0.05 : w.id === 'shotgun' ? 0.04 : w.id === 'rpg' ? 0.05 : 0.012;
    this.cam.pitch = clamp(this.cam.pitch + kick, -1.25, 1.0);
    this.cam.yaw += (Math.random() - 0.5) * kick * 0.4;
    if (s.mag <= 0 && s.ammo > 0 && !w.throw) this.reload();
  }

  nearestVehicle() {
    const c = this.char;
    let best = null, bd = Infinity;
    for (const v of G.vehicles.list) {
      if (v.dead || v.sinkT > 0) continue;
      const reach = v.def.cls === 'heli' ? 5 : Math.max(3.2, v.def.L / 2 + 1.2);
      const dx = v.pos.x - c.pos.x, dz = v.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach || Math.abs(v.pos.y - c.pos.y) > 3) continue;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  tryEnter() {
    const v = this.nearestVehicle();
    if (!v) return;
    if (v.locked) { G.hud.notify('This vehicle is locked.', 2); return; }
    const occupied = v.driver && v.driver !== 'player';
    if (occupied && v.ai && v.ai.onCarjack) v.ai.onCarjack();
    if (v.isPolice) G.police.crime('stealCop', v.pos, 1);
    else if (occupied) G.police.crime('carjack', v.pos, 0.5);
    else G.police.crime('theft', v.pos, 0);
    this.enterVehicle(v);
  }

  enterVehicle(v) {
    this.vehicle = v;
    v.driver = 'player';
    v.mode = 'physics';
    v.ai = null;
    v.persist = true;
    if (G.traffic) G.traffic.release(v);
    const c = this.char;
    c.vel.set(0, 0, 0);
    c.setVisible(v.def.cls === 'bike');
    c.aim = false;
    if (v !== this.lastVehicle) G.stats.carsStolen++;
    if (this.lastVehicle && this.lastVehicle !== v && !this.lastVehicle.mission) this.lastVehicle.persist = false;
    this.lastVehicle = v;
    this.cam.yaw = v.heading;
    this.cam.pitch = -0.2;
    this.enterCooldown = 0.5;
    G.audio.setRadio(v.def.cls !== 'bike');
    G.hud.vehicleName(v.def.name, v.def.cls !== 'bike' && G.audio.stations[G.audio.station].name);
    if (v.def.cls === 'heli') G.hud.notify('Helicopter: W/S forward/back · A/D turn · Space climb · Shift/Ctrl descend.', 6);
    if (v.def.taxi) G.hud.notify('Taxi! Press J to start picking up fares.', 5);
    if (v.isPolice && v.cls !== 'heli') G.hud.notify('Police car! Press J for vigilante missions, N for the siren.', 5);
  }

  exitVehicle() {
    const v = this.vehicle;
    if (!v) return;
    if (v.cls === 'heli' && !v.onGround && v.pos.y - G.physics.groundAt(v.pos.x, v.pos.z) > 4) {
      G.hud.notify('Too high to jump out! Land first (Shift/Ctrl).', 2);
      return;
    }
    this.forceExit(true);
  }

  forceExit(safe) {
    const v = this.vehicle;
    if (!v) return;
    const c = this.char;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lx = fz, lz = -fx; // left side
    const off = v.def.W / 2 + 0.7;
    const tries = [[lx * off, lz * off], [-lx * off, -lz * off], [fx * (v.def.L / 2 + 1), fz * (v.def.L / 2 + 1)], [0, 0]];
    let placed = false;
    for (const [ox, oz] of tries) {
      const x = v.pos.x + ox, z = v.pos.z + oz;
      _tmp.set(x, v.pos.y + 0.2, z);
      const h = G.physics.collideCircle(_tmp, 0.35, 1.8, 0.45);
      if (!h.hit || (ox === 0 && oz === 0)) {
        c.pos.set(x, Math.max(v.pos.y, G.physics.groundAt(x, z, v.pos.y + 1.5)), z);
        placed = true;
        break;
      }
    }
    if (!placed) c.pos.set(v.pos.x, v.pos.y + v.def.H + 0.2, v.pos.z);
    c.heading = v.heading;
    c.setVisible(true);
    c.vel.set(v.vel.x * 0.5, 0, v.vel.z * 0.5);
    const spd = Math.hypot(v.vel.x, v.vel.z);
    if (spd > 12 && safe) c.damage((spd - 12) * 3, null, null, false, 'fall');
    v.driver = null;
    v.ctrl.throttle = 0; v.ctrl.brake = 0; v.ctrl.steer = 0; v.ctrl.handbrake = true; v.ctrl.lift = 0;
    v.siren = false;
    this.vehicle = null;
    this.enterCooldown = 0.5;
    this.cam.yaw = v.heading;
    G.audio.setEngine(false);
    G.audio.setRadio(false);
    G.audio.setHorn(false);
    G.audio.setHeli(false);
  }

  ejectFromBike(impact) {
    const v = this.vehicle;
    if (!v) return;
    const vx = v.vel.x, vz = v.vel.z;
    this.forceExit(false);
    const c = this.char;
    c.pos.y += 1;
    c.vel.set(vx * 0.4, 0, vz * 0.4);
    c.vy = 4;
    c.damage(impact * 2.5, null, null, false, 'fall');
    G.hud.notify('You fell off the bike!', 2);
  }

  updateVehicle(dt) {
    const I = G.input, v = this.vehicle, c = this.char;
    if (v.dead) {
      this.forceExit(false);
      c.damage(200, v.lastHitBy, null, false, 'explosion');
      return;
    }
    if (v.sinkT > 1.2) {
      this.forceExit(false);
      G.hud.notify('Your vehicle is sinking! Swim to the shore.', 3);
      return;
    }
    const ct = v.ctrl;
    if (v.cls === 'heli') {
      ct.throttle = I.key('forward') ? 1 : Math.max(0, -(I.gpMoveY || 0));
      ct.brake = I.key('back') ? 1 : Math.max(0, I.gpMoveY || 0);
      ct.steer = I.moveX();
      ct.lift = (I.key('jump') || I.gpRT > 0.3 ? 1 : 0) - (I.key('descend') || I.key('sprint') || I.gpLT > 0.3 ? 1 : 0);
      ct.strafe = 0;
      G.audio.setHeli(true, v.rotorSpeed, v.pos);
    } else {
      ct.throttle = I.throttle();
      ct.brake = I.brake();
      ct.steer = I.moveX();
      ct.handbrake = I.key('jump');
      const rpm = clamp(Math.abs(v.speed) / v.def.maxSpeed, 0, 1);
      const gearRpm = v.cls === 'boat' ? rpm : (rpm * 4) % 1 * 0.6 + rpm * 0.4;
      G.audio.setEngine(true, gearRpm, ct.throttle, v.def.sound, v.pos);
    }
    // horn / siren / radio / camera
    const horn = I.key('horn');
    if (horn !== this.hornHeld) { this.hornHeld = horn; G.audio.setHorn(horn, v.def.sound); }
    if (horn && G.peds) G.peds.honk(v.pos);
    if (I.pressed('siren') && v.isPolice) { v.siren = !v.siren; }
    if (I.pressed('radio') && v.cls !== 'bike') {
      const st = G.audio.cycleStation();
      G.hud.vehicleName(null, st.name);
    }
    if (I.pressed('camera')) this.cam.mode = (this.cam.mode + 1) % 3;
    if (I.pressed('enter') && this.enterCooldown <= 0) { this.exitVehicle(); return; }
    if (I.pressed('job') && v.def.taxi && G.missions) G.missions.toggleTaxi();
    else if (I.pressed('job') && v.isPolice && v.cls !== 'heli' && G.missions) G.missions.toggleVigilante();

    // drive-by
    const w = WEAPONS[this.weapon];
    this.scoped = false;
    if (I.aiming() && (this.weapon === 'pistol' || this.weapon === 'smg') && v.cls !== 'heli') {
      if (w.auto ? I.firing() : I.firePressed()) this.tryFire(true);
    }
    c.pos.copy(v.pos);
    if (v.cls === 'bike') {
      c.pos.y += 0.35;
      c.heading = v.heading;
      c.animate(dt, 0, { seated: true });
      c.root.rotation.z = v.group.rotation.z;
      c.root.rotation.x = -v.pitch;
      c.root.position.copy(c.pos);
      c.root.position.x -= Math.sin(v.heading) * 0.2;
      c.root.position.z -= Math.cos(v.heading) * 0.2;
    }
    // stats
    G.stats.distance += Math.hypot(v.vel.x, v.vel.z) * dt;
    const kmh = Math.abs(v.speed) * 3.6;
    if (kmh > G.stats.topSpeed) G.stats.topSpeed = kmh;
  }

  // Camera after vehicles moved.
  updateCamera(dt) {
    const cam = G.camera;
    const c = this.char;
    let pivot = _tmp;
    let dist, shoulder = 0, fov = 70;
    let yaw = this.cam.yaw, pitch = this.cam.pitch;
    if (this.vehicle) {
      const v = this.vehicle;
      const idle = G.time - this.cam.lastLook > 1.3;
      const spd = Math.hypot(v.vel.x, v.vel.z);
      if (idle && (spd > 2 || v.cls === 'heli')) {
        const back = v.speed < -3 && v.cls !== 'heli';
        const target = back ? v.heading + Math.PI : v.cls === 'heli' ? Math.atan2(v.vel.x, v.vel.z) : v.heading;
        const useT = v.cls === 'heli' && spd < 4 ? v.heading : target;
        this.cam.yaw = lerpAngle(this.cam.yaw, useT, Math.min(1, dt * 2.4));
        this.cam.pitch = lerp(this.cam.pitch, v.cls === 'heli' ? -0.3 : -0.18, Math.min(1, dt * 1.5));
      }
      yaw = this.cam.yaw; pitch = this.cam.pitch;
      const big = v.def.L;
      dist = v.cls === 'heli' ? 17 : big * 1.15 + 3.6;
      if (this.cam.mode === 1) dist *= 1.6;
      pivot.set(v.pos.x, v.pos.y + v.def.H * 0.85 + 0.7, v.pos.z);
      fov = 70 + clamp(spd / 70, 0, 1) * 16;
      if (this.cam.mode === 2 && v.cls !== 'heli') {
        // hood cam
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        pivot.set(v.pos.x + fx * (v.def.L * 0.1), v.pos.y + v.def.H * 0.85, v.pos.z + fz * (v.def.L * 0.1));
        dist = 0.01;
        if (G.time - this.cam.lastLook > 0.6) { this.cam.yaw = lerpAngle(this.cam.yaw, v.heading, Math.min(1, dt * 8)); this.cam.pitch = lerp(this.cam.pitch, -0.05 - v.pitch, dt * 4); }
      }
    } else {
      const aiming = G.input.aiming() && !WEAPONS[this.weapon].melee && !c.swimming && !this.dead;
      pivot.set(c.pos.x, c.pos.y + (c.swimming ? 0.9 : 1.62), c.pos.z);
      dist = aiming ? 2.0 : 4.2;
      shoulder = aiming ? 0.62 : 0.38;
      fov = aiming ? 58 : 70;
      if (this.scoped) { dist = 0.01; shoulder = 0; fov = 14; pivot.y = c.pos.y + 1.72; }
      if (this.dead || this.busted) { dist = 6; yaw += this.deadT * 0.2; pitch = -0.45; }
    }
    this.cam.dist = lerp(this.cam.dist, dist, Math.min(1, dt * 8));
    this.cam.shoulder = lerp(this.cam.shoulder, shoulder, Math.min(1, dt * 10));
    const cp = Math.cos(pitch);
    const dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(yaw) * cp;
    const rx = -Math.cos(yaw), rz = Math.sin(yaw);
    let d = this.cam.dist;
    const sh = this.cam.shoulder;
    // camera collision
    const ex = -dx * d + rx * sh, ey = -dy * d, ez = -dz * d + rz * sh;
    const el = Math.sqrt(ex * ex + ey * ey + ez * ez);
    let k = 1;
    if (el > 0.05) {
      const h = G.physics.raycast(pivot.x, pivot.y, pivot.z, ex / el, ey / el, ez / el, el, this._camHit || (this._camHit = {}), { ignore: null });
      if (h.hit) k = Math.max(0.05, (h.t - 0.3) / el);
    }
    let px = pivot.x + ex * k, py = pivot.y + ey * k, pz = pivot.z + ez * k;
    const gy = G.physics.terrain.heightAt(px, pz) + 0.4;
    if (py < gy) py = gy;
    if (py < 0.3 && G.physics.waterDepth(px, pz, py) > 0) py = Math.max(py, 0.3);
    // shake
    const sa = G.fx.shakeAmt * (G.settings.shake ? 1 : 0);
    if (sa > 0) { px += (Math.random() - 0.5) * sa * 0.5; py += (Math.random() - 0.5) * sa * 0.5; pz += (Math.random() - 0.5) * sa * 0.5; }
    cam.position.set(px, py, pz);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(pitch, yaw + Math.PI, 0);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 8));
      cam.updateProjectionMatrix();
    }
  }
}
