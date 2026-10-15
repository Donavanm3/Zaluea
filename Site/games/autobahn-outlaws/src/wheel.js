// GTA-style weapon wheel: hold Tab (or the left bumper) to open, point with the mouse
// or right stick, release to equip. Time slows down while the wheel is open.
import { G } from './game.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class WeaponWheel {
  constructor() {
    this.open = false;
    this.sel = { x: 0, y: 0 };
    this.hover = -1;
    this.lbT = -1;
    this.el = $('wheel');
    this.slots = WEAPON_ORDER.map((id, i) => {
      const a = (i / WEAPON_ORDER.length) * Math.PI * 2 - Math.PI / 2;
      const d = document.createElement('div');
      d.className = 'wh-slot';
      d.style.left = `calc(50% + ${Math.cos(a) * 118}px)`;
      d.style.top = `calc(50% + ${Math.sin(a) * 118}px)`;
      d.innerHTML = `<i>${WEAPONS[id].icon}</i><small>${i}</small>`;
      this.el.appendChild(d);
      return d;
    });
    this.name = $('wh-name');
    this.ammo = $('wh-ammo');
  }

  owned(id) {
    const P = G.player;
    return id === 'fist' || (P.inv[id] && P.totalAmmo(id) > 0);
  }

  show(on) {
    this.open = on;
    this.el.classList.toggle('show', on);
    if (on) {
      this.sel.x = 0; this.sel.y = 0;
      const i = WEAPON_ORDER.indexOf(G.player.weapon);
      this.hover = i;
      this.render();
    }
  }

  render() {
    const P = G.player;
    WEAPON_ORDER.forEach((id, i) => {
      const s = this.slots[i];
      s.classList.toggle('off', !this.owned(id));
      s.classList.toggle('on', i === this.hover);
      s.classList.toggle('cur', id === P.weapon);
    });
    const id = WEAPON_ORDER[this.hover];
    if (!id) { this.name.textContent = ''; this.ammo.textContent = ''; return; }
    const w = WEAPONS[id];
    this.name.textContent = this.owned(id) ? w.name : `${w.name} (not owned)`;
    const inv = P.inv[id];
    this.ammo.textContent = w.melee ? '' : inv ? (w.throw ? `${inv.mag}` : `${inv.mag} / ${inv.ammo}`) : w.price ? `Waffenladen €${w.price}` : '';
  }

  update() {
    const I = G.input, P = G.player;
    // Gamepad left bumper: tap = previous weapon, hold = wheel.
    const lb = !!(I.gp && I.gp.buttons[4] && I.gp.buttons[4].pressed);
    let want = I.key('wheel');
    if (lb) { if (this.lbT < 0) this.lbT = performance.now(); if (performance.now() - this.lbT > 200) want = true; }
    else if (this.lbT >= 0) { if (performance.now() - this.lbT <= 200 && !this.open) P.cycleWeapon(-1); this.lbT = -1; }
    if (P.dead || P.busted || G.state !== 'play' || (G.phone && G.phone.open)) want = false;
    if (want && !this.open) this.show(true);
    if (!want && this.open) {
      const id = WEAPON_ORDER[this.hover];
      if (id && this.owned(id) && id !== P.weapon) P.switchTo(id);
      this.show(false);
      return;
    }
    if (!this.open) return;
    // Point at a slot; the mouse movement is consumed so the camera stays still.
    this.sel.x += I.mouseDX; this.sel.y += I.mouseDY;
    I.mouseDX = 0; I.mouseDY = 0;
    if (Math.abs(I.gpLookX) + Math.abs(I.gpLookY) > 0.5) { this.sel.x = I.gpLookX * 100; this.sel.y = I.gpLookY * 100; }
    const l = Math.hypot(this.sel.x, this.sel.y);
    if (l > 120) { this.sel.x *= 120 / l; this.sel.y *= 120 / l; }
    if (l > 28) {
      const a = Math.atan2(this.sel.y, this.sel.x) + Math.PI / 2;
      const n = WEAPON_ORDER.length;
      const i = ((Math.round((a / (Math.PI * 2)) * n) % n) + n) % n;
      if (i !== this.hover) { this.hover = i; G.audio.ui('select'); }
    }
    this.render();
  }
}
