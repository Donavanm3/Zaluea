// Save games and settings in localStorage (guarded: storage may be unavailable).
import { G, SAVE_KEY, SETTINGS_KEY } from './game.js';

export const DEFAULT_SETTINGS = {
  quality: 'medium', drawDistance: 1300, sensitivity: 1, invertY: false,
  master: 0.8, music: 0.55, sfx: 0.9, shake: true, fps: false,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (s) return { ...DEFAULT_SETTINGS, ...s };
  } catch (e) { /* ignore */ }
  // pick a default quality from the device
  const s = { ...DEFAULT_SETTINGS };
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile) { s.quality = 'low'; s.drawDistance = 800; }
  return s;
}

export function storeSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export class SaveSystem {
  constructor() { this.lastAuto = 0; }

  has() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  read() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; }
  }

  write() {
    const P = G.player;
    const p = P.vehicle ? P.vehicle.pos : P.char.pos;
    const data = {
      v: 1,
      date: Date.now(),
      money: Math.floor(G.money),
      inv: P.inv,
      weapon: P.weapon,
      health: P.char.health,
      armor: P.char.armor,
      progress: G.missions.progress,
      bestTimes: G.missions.bestTimes,
      gnomes: [...(G.pickups.collected || [])],
      stunts: G.stunts ? [...G.stunts.done] : [],
      stats: G.stats,
      clock: G.clock,
      pos: { x: p.x, y: p.y + 0.5, z: p.z },
      flags: { finished: !!G.flags.finished },
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  autosave() {
    if (G.state !== 'play' && G.state !== 'pause') return;
    if (G.player.dead || G.player.busted) return;
    if (this.write()) G.hud.notify('💾 Game saved', 2);
  }

  wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  }
}
