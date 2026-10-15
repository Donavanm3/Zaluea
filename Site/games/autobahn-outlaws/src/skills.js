// Player skills (driving, shooting, stamina, flying), the "Fokus" special ability
// (slow motion) and the global time scale the main loop applies to the world.
import { G } from './game.js';
import { clamp } from './util.js';

export const SKILLS = [
  ['driving', 'Driving', '🚗', 'Better grip and control at speed'],
  ['shooting', 'Shooting', '🎯', 'Tighter spread and faster reloads'],
  ['stamina', 'Stamina', '🏃', 'Run and swim faster, more health regeneration'],
  ['flying', 'Flying', '✈️', 'More responsive helicopters and planes'],
];
const LABEL = Object.fromEntries(SKILLS.map((s) => [s[0], s[1]]));

export class Skills {
  constructor() {
    this.v = { driving: 5, shooting: 5, stamina: 5, flying: 0 };
    this.special = 100;
    this.active = false;
    this.scale = 1;
    this.dist = { driving: 0, flying: 0, stamina: 0 };
  }

  load(s) {
    this.v = { driving: 5, shooting: 5, stamina: 5, flying: 0 };
    if (s) for (const k in this.v) if (typeof s[k] === 'number') this.v[k] = clamp(s[k], 0, 100);
    this.special = 100;
    this.active = false;
  }

  // 0..1
  get(k) { return this.v[k] / 100; }

  add(k, amt) {
    const old = this.v[k];
    this.v[k] = Math.min(100, old + amt);
    if (Math.floor(this.v[k] / 10) > Math.floor(old / 10)) {
      G.hud.notify(`📈 ${LABEL[k]} skill increased to ${Math.floor(this.v[k] / 10) * 10}%`, 3);
      G.audio.ui('pickup');
    }
  }

  charge(a) { this.special = Math.min(100, this.special + a); }

  toggle() {
    if (this.active) { this.active = false; return; }
    if (this.special < 15) { G.hud.notify('Fokus is still charging — kills, stunts and driving bonuses fill it faster.', 3); return; }
    this.active = true;
    G.audio.ui('select');
  }

  // dt = real (unscaled) frame time
  update(dt) {
    const P = G.player;
    if (G.input.pressed('special') && !P.dead && !P.busted) this.toggle();
    if (P.dead || P.busted) this.active = false;
    if (this.active) {
      this.special -= dt * 11;
      if (this.special <= 0) { this.special = 0; this.active = false; }
    } else this.special = Math.min(100, this.special + dt * 0.35);
    let target = this.active ? 0.4 : 1;
    if (G.wheel && G.wheel.open) target = Math.min(target, 0.2);
    this.scale += (target - this.scale) * Math.min(1, dt * 8);
    if (Math.abs(this.scale - target) < 0.005) this.scale = target;
    G.timeScale = this.scale;

    // Practice makes perfect: distance-based skill gains.
    const sdt = dt * this.scale;
    const v = P.vehicle;
    if (v && !v.dead) {
      const spd = Math.hypot(v.vel.x, v.vel.z);
      if ((v.cls === 'heli' || v.cls === 'plane') && !v.onGround) this.gain('flying', spd * sdt, 1000, 0.8);
      else if ((v.cls === 'car' || v.cls === 'bike') && spd > 8) this.gain('driving', spd * sdt, 1000, 0.6);
    } else if (!P.dead) {
      const c = P.char, spd = Math.hypot(c.vel.x, c.vel.z);
      if ((G.input.key('sprint') && spd > 5.5) || (c.swimming && spd > 1.5)) this.gain('stamina', spd * sdt, 150, 0.5);
    }
  }

  gain(k, meters, per, amt) {
    this.dist[k] += meters;
    while (this.dist[k] >= per) { this.dist[k] -= per; this.add(k, amt); }
  }
}
