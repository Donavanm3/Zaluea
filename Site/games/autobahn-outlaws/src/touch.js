// On-screen touch controls: floating move stick, drag-to-look and action buttons.
import { G } from './game.js';

const BUTTONS = [
  { id: 'fire', label: '🔫', hold: true, cls: 'big' },
  { id: 'aim', label: '◎', toggle: true },
  { id: 'jump', label: '⤒', key: 'Space', hold: true },
  { id: 'enter', label: '🚗', key: 'KeyF' },
  { id: 'act', label: 'E', key: 'KeyE' },
  { id: 'wpn', label: '⇄', action: 'wnext' },
  { id: 'sprint', label: '»', key: 'ShiftLeft', hold: true },
  { id: 'map', label: '🗺', key: 'KeyM' },
  { id: 'pause', label: 'II', key: 'KeyP' },
];

export class TouchControls {
  constructor(input) {
    this.I = input;
    this.enabled = false;
    this.stick = null;
    this.look = null;
    this.aimOn = false;
    input.touch = null;
    const start = () => { if (!this.enabled) this.enable(); };
    addEventListener('touchstart', start, { once: true, passive: true });
  }

  enable() {
    this.enabled = true;
    document.body.classList.add('touch');
    const I = this.I;
    I.touch = { mx: 0, my: 0, lx: 0, ly: 0, fire: false, aim: false };
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `<div id="t-stick"><div id="t-knob"></div></div>` +
      BUTTONS.map((b) => `<button class="tbtn ${b.cls || ''}" data-t="${b.id}">${b.label}</button>`).join('');
    document.body.appendChild(root);
    this.root = root;
    this.stickEl = root.querySelector('#t-stick');
    this.knob = root.querySelector('#t-knob');
    const canvas = document.getElementById('game');

    canvas.addEventListener('touchstart', (e) => {
      if (G.state !== 'play') return;
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && !this.stick) {
          this.stick = { id: t.identifier, x: t.clientX, y: t.clientY };
          this.stickEl.style.display = 'block';
          this.stickEl.style.left = t.clientX - 60 + 'px';
          this.stickEl.style.top = t.clientY - 60 + 'px';
        } else if (!this.look) {
          this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) {
          let dx = (t.clientX - this.stick.x) / 55, dy = (t.clientY - this.stick.y) / 55;
          const l = Math.hypot(dx, dy);
          if (l > 1) { dx /= l; dy /= l; }
          I.touch.mx = dx; I.touch.my = -dy;
          this.knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
        } else if (this.look && t.identifier === this.look.id) {
          I.touch.lx += (t.clientX - this.look.x) * 1.6;
          I.touch.ly += (t.clientY - this.look.y) * 1.6;
          this.look.x = t.clientX; this.look.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) {
          this.stick = null;
          I.touch.mx = 0; I.touch.my = 0;
          this.stickEl.style.display = 'none';
          this.knob.style.transform = '';
        }
        if (this.look && t.identifier === this.look.id) this.look = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    for (const el of root.querySelectorAll('.tbtn')) {
      const b = BUTTONS.find((q) => q.id === el.dataset.t);
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        G.audio && G.audio.init();
        el.classList.add('on');
        if (b.id === 'fire') { I.touch.fire = true; I.mousePressed |= 1; }
        else if (b.toggle) { this.aimOn = !this.aimOn; I.touch.aim = this.aimOn; el.classList.toggle('lock', this.aimOn); }
        else if (b.action) I.gpPressed.add(b.action);
        else if (b.key) {
          I.pressedSet.add(b.key);
          if (b.hold) I.down.add(b.key);
        }
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        el.classList.remove('on');
        if (b.id === 'fire') I.touch.fire = false;
        else if (b.key && b.hold) I.down.delete(b.key);
      };
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
    this.update();
  }

  update() {
    if (!this.root) return;
    this.root.style.display = G.state === 'play' ? 'block' : 'none';
  }
}
