// Keyboard, mouse (pointer lock) and gamepad input mapped to game actions.
import { G } from './game.js';

const BIND = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  enter: ['KeyF'],
  interact: ['KeyE'],
  reload: ['KeyR'],
  horn: ['KeyH'],
  radio: ['KeyQ'],
  camera: ['KeyC'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
  siren: ['KeyN'],
  job: ['KeyJ'],
  descend: ['ControlLeft', 'KeyZ'],
  phone: ['Tab'],
  w1: ['Digit1'], w2: ['Digit2'], w3: ['Digit3'], w4: ['Digit4'], w5: ['Digit5'], w6: ['Digit6'], w7: ['Digit7'], w8: ['Digit8'], w0: ['Digit0', 'Backquote'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.buttons = 0;
    this.mousePressed = 0;
    this.wheel = 0;
    this.locked = false;
    this.gp = null;
    this.gpPrev = [];
    this.gpPressed = new Set();
    this.gpHeld = new Set();
    this.lookX = 0; this.lookY = 0;
    this.usingGamepad = false;
    this.touch = null;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
        if (G.state === 'play') e.preventDefault();
      }
      if (!this.down.has(e.code)) this.pressedSet.add(e.code);
      this.down.add(e.code);
      this.usingGamepad = false;
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.buttons = 0; });
    canvas.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.mousePressed |= 1 << e.button;
      if (G.state === 'play' && !this.locked) this.lock();
    });
    addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    addEventListener('mousemove', (e) => {
      if (this.locked) {
        // clamp spikes some browsers report right after locking
        this.mouseDX += Math.max(-150, Math.min(150, e.movementX || 0));
        this.mouseDY += Math.max(-150, Math.min(150, e.movementY || 0));
      }
    });
    addEventListener('wheel', (e) => { if (G.state === 'play') this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && G.state === 'play' && G.ui && !this.suppressPause) G.ui.pause();
      this.suppressPause = false;
    });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignored */ }
  }
  unlock(silent = true) {
    if (document.pointerLockElement) {
      this.suppressPause = silent;
      document.exitPointerLock();
    }
  }

  key(action) {
    if (this.gpHeld.has(action)) return true;
    const k = BIND[action];
    if (!k) return false;
    for (const c of k) if (this.down.has(c)) return true;
    return false;
  }
  pressed(action) {
    const k = BIND[action];
    if (k) for (const c of k) if (this.pressedSet.has(c)) return true;
    return this.gpPressed.has(action);
  }

  // Poll gamepad and compute per-frame values. Call at start of frame.
  update() {
    this.gpPressed.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    this.gp = gp;
    if (gp) {
      const b = gp.buttons.map((x) => x.pressed);
      const map = { 0: 'jump', 1: 'reload', 2: 'interact', 3: 'enter', 4: 'wprev', 5: 'wnext', 9: 'pause', 8: 'map', 10: 'horn', 11: 'camera', 12: 'radio', 13: 'job', 14: 'siren' };
      for (const i in map) if (b[i] && !this.gpPrev[i]) { this.gpPressed.add(map[i]); this.usingGamepad = true; }
      this.gpPrev = b;
      this.gpHeld.clear();
      if (b[0]) this.gpHeld.add('jump');
      if (b[10]) { this.gpHeld.add('sprint'); this.gpHeld.add('horn'); }
      if (b[1]) this.gpHeld.add('descend');
      const ax = gp.axes;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      this.gpMoveX = dz(ax[0] || 0); this.gpMoveY = dz(ax[1] || 0);
      this.gpLookX = dz(ax[2] || 0); this.gpLookY = dz(ax[3] || 0);
      this.gpLT = gp.buttons[6] ? gp.buttons[6].value : 0;
      this.gpRT = gp.buttons[7] ? gp.buttons[7].value : 0;
      if (Math.abs(this.gpMoveX) + Math.abs(this.gpMoveY) + Math.abs(this.gpLookX) + Math.abs(this.gpLookY) + this.gpLT + this.gpRT > 0.2) this.usingGamepad = true;
    } else {
      this.gpMoveX = this.gpMoveY = this.gpLookX = this.gpLookY = this.gpLT = this.gpRT = 0;
      this.gpHeld.clear();
    }
  }

  moveX() {
    let v = (this.key('right') ? 1 : 0) - (this.key('left') ? 1 : 0);
    if (this.touch) v += this.touch.mx;
    return Math.max(-1, Math.min(1, v + (this.gpMoveX || 0)));
  }
  moveY() {
    let v = (this.key('forward') ? 1 : 0) - (this.key('back') ? 1 : 0);
    if (this.touch) v += this.touch.my;
    return Math.max(-1, Math.min(1, v - (this.gpMoveY || 0)));
  }
  firing() { return (this.buttons & 1) !== 0 || this.gpRT > 0.5 || (this.touch && this.touch.fire); }
  aiming() { return (this.buttons & 4) !== 0 || this.gpLT > 0.5 || (this.touch && this.touch.aim); }
  firePressed() { return (this.mousePressed & 1) !== 0 || (this.gpRT > 0.5 && !this._rtWas); }
  throttle() { return Math.max(this.key('forward') ? 1 : 0, this.gpRT || 0, this.touch ? Math.max(0, this.touch.my) : 0); }
  brake() { return Math.max(this.key('back') ? 1 : 0, this.gpLT || 0, this.touch ? Math.max(0, -this.touch.my) : 0); }

  // Look delta in radians-ish units, combining mouse and right stick.
  consumeLook(dt, sens) {
    let dx = this.mouseDX * 0.0022 * sens, dy = this.mouseDY * 0.0022 * sens;
    dx += (this.gpLookX || 0) * dt * 2.6 * sens;
    dy += (this.gpLookY || 0) * dt * 2.0 * sens;
    if (this.touch) { dx += this.touch.lx * 0.004 * sens; dy += this.touch.ly * 0.004 * sens; this.touch.lx = 0; this.touch.ly = 0; }
    this.mouseDX = 0; this.mouseDY = 0;
    return [dx, dy];
  }

  endFrame() {
    this.pressedSet.clear();
    this.mousePressed = 0;
    this.wheel = 0;
    this._rtWas = this.gpRT > 0.5;
  }
}
