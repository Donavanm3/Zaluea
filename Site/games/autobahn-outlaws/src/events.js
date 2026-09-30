// Free-roam gameplay: car export contracts, cash-truck robberies and driving
// bonuses (near misses, drifts, big air, top speed) with a combo multiplier.
import { G } from './game.js';
import { VEHICLES } from './vehicle.js';
import { CITY_BY_ID } from './geo.js';
import { clamp, formatMoney, pick } from './util.js';

const EXPORT_POOL = ['pendler', 'adler', 'kombi', 'falke', 'rennpappe', 'taxi', 'transporter', 'blitz', 'polizei', 'rtw', 'brummi', 'bus'];
const DOCK_CITIES = ['hamburg', 'bremen', 'rostock', 'kiel', 'berlin', 'koeln', 'frankfurt', 'muenchen', 'stuttgart', 'leipzig', 'nuernberg', 'hannover'];

export function exportPrice(id) {
  const d = VEHICLES[id];
  let p = d.maxSpeed * 18 + d.hp * 0.3;
  if (d.police) p *= 1.6;
  if (id === 'rennpappe') p *= 1.8;
  return Math.round(p / 50) * 50;
}

export class Events {
  constructor() {
    this.exportList = [];
    while (this.exportList.length < 3) {
      const id = pick(EXPORT_POOL);
      if (!this.exportList.includes(id)) this.exportList.push(id);
    }
    const net = G.world.roads;
    this.docks = [];
    for (const id of DOCK_CITIES) {
      const c = CITY_BY_ID[id];
      if (!c || !net.grids[id]) continue;
      const n = net.nearestNode(c.x + c.r * 0.35, c.z + c.r * 0.45, (q) => q.city === id);
      if (n) this.docks.push({ city: c, x: n.x, y: n.y, z: n.z });
    }
    this.dockMarker = null;
    this.truck = null;
    this.truckT = 100;
    this.near = new Map();
    this.drift = 0; this.driftEnd = 0; this.air = 0; this.stuntAir = false; this.fastT = 0; this.fastCool = 0;
    this.combo = 1; this.comboT = 0;
  }

  // ---------- queries used by the HUD ----------
  wantedCar() {
    const v = G.player.vehicle;
    return v && !v.dead && !v.mission && this.exportList.includes(v.type) ? v : null;
  }
  nearestDock(p) {
    let best = null, bd = Infinity;
    for (const d of this.docks) {
      const q = Math.hypot(d.x - p.x, d.z - p.z);
      if (q < bd) { bd = q; best = d; }
    }
    return best;
  }
  gpsTarget() {
    if (G.missions.active) return null;
    const t = this.truck;
    if (t && !t.dropped && !t.v.dead) return t.v.pos;
    if (this.wantedCar()) return this.nearestDock(G.player.pos);
    return null;
  }
  objective() {
    if (G.missions.active || G.missions.taxi || G.missions.vigil) return null;
    const t = this.truck;
    if (t && !t.dropped) return { label: 'Cash truck', text: `A <b>Geldtransporter</b> is on the road nearby. Wreck it and grab the cash. <span class="sub">${Math.ceil(t.t)} s before it reaches the depot</span>` };
    const v = this.wantedCar();
    if (v) {
      const d = this.nearestDock(G.player.pos);
      const hot = G.police.level > 0 ? '<span class="sub">Lose the police before you deliver.</span>' : '';
      return { label: 'Export contract', text: `Deliver this <b>${v.def.name}</b> to the export dock in <b>${d ? d.city.name : '?'}</b> for up to <b>${formatMoney(exportPrice(v.type))}</b>.${hot}` };
    }
    return null;
  }
  exportLine() {
    return `<span class="sub">Export wanted: ${this.exportList.map((id) => VEHICLES[id].name).join(' · ')}</span>`;
  }
  blips() {
    const out = [];
    const t = this.truck;
    if (t && !t.dropped && !t.v.dead) out.push({ x: t.v.pos.x, z: t.v.pos.z, color: '#22c55e', text: '€', always: true, label: 'Geldtransporter' });
    if (this.wantedCar()) {
      const d = this.nearestDock(G.player.pos);
      if (d) out.push({ x: d.x, z: d.z, color: '#3ec5ff', text: 'X', always: true, label: 'Export dock' });
    }
    return out;
  }

  // ---------- per frame ----------
  update(dt) {
    const P = G.player;
    G.hud.eventPrompt = null;
    if (P.dead || P.busted) { this.drift = 0; this.air = 0; return; }
    this.updateExport(dt);
    this.updateTruck(dt);
    this.updateBonuses(dt);
  }

  updateExport() {
    const v = this.wantedCar();
    const dock = v ? this.nearestDock(v.pos) : null;
    if (!dock || G.missions.active) {
      if (this.dockMarker) { G.hud.removeMarker(this.dockMarker); this.dockMarker = null; }
      return;
    }
    if (!this.dockMarker || this.dockMarker.x !== dock.x || this.dockMarker.z !== dock.z) {
      if (this.dockMarker) G.hud.removeMarker(this.dockMarker);
      this.dockMarker = G.hud.addMarker(dock.x, dock.y, dock.z, { r: 4, color: 0x3ec5ff, beam: true });
    }
    const d = Math.hypot(v.pos.x - dock.x, v.pos.z - dock.z);
    if (d > 7) return;
    if (G.police.level > 0) { G.hud.eventPrompt = 'Lose the police first — the buyer won\'t take a hot car.'; return; }
    if (Math.abs(v.speed) > 3) { G.hud.eventPrompt = 'Stop the car in the marker to hand it over.'; return; }
    const hpF = clamp(v.hp / v.def.hp, 0.3, 1);
    const pay = Math.round((exportPrice(v.type) * hpF) / 10) * 10;
    G.money += pay;
    G.stats.exports = (G.stats.exports || 0) + 1;
    G.audio.ui('pass');
    G.hud.bigMessage('CAR EXPORTED', '#3ec5ff', `${v.def.name} · condition ${Math.round(hpF * 100)}% · +${formatMoney(pay)}`, 4);
    P_exit(v);
    const i = this.exportList.indexOf(v.type);
    let n;
    do n = pick(EXPORT_POOL); while (this.exportList.includes(n));
    this.exportList[i] = n;
    G.hud.notify(`New on the export list: ${VEHICLES[n].name}.`, 4);
    G.hud.removeMarker(this.dockMarker);
    this.dockMarker = null;
    if (G.save) G.save.autosave();
  }

  updateTruck(dt) {
    const P = G.player;
    const t = this.truck;
    if (!t) {
      this.truckT -= dt;
      if (this.truckT > 0 || G.missions.active || G.police.level > 1 || P.vehicle && P.vehicle.cls === 'heli') return;
      this.truckT = 30;
      const v = G.traffic.spawnNear(P.pos, 150, 300, 'transporter', 0x2f4638);
      if (!v) return;
      v.persist = true;
      v.cashTruck = true;
      v.hp = v.def.hp * 1.3; // armoured
      this.truck = { v, t: 150, dropped: false, cleanup: 0 };
      G.audio.ui('phone');
      G.hud.notify('📻 Police scanner: a Geldtransporter (cash truck) is driving nearby. Follow the green € blip.', 6);
      return;
    }
    const v = t.v;
    const d = Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z);
    if (!t.dropped) {
      t.t -= dt;
      if (v.dead || v.hp < v.def.hp * 0.75) {
        t.dropped = true;
        const n = 4 + Math.floor(Math.random() * 3);
        const total = 1800 + Math.floor(Math.random() * 14) * 100;
        const bx = -Math.sin(v.heading), bz = -Math.cos(v.heading);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = v.pos.x + bx * (v.def.L / 2 + 1.5) + Math.cos(a) * 2, z = v.pos.z + bz * (v.def.L / 2 + 1.5) + Math.sin(a) * 2;
          G.pickups.spawn('money', x, v.pos.y + 1, z, Math.round(total / n / 10) * 10, null, { life: 90 });
        }
        if (v.ai && v.ai.alive) v.ai.alive = false;
        G.police.setLevel(Math.max(G.police.level, 2));
        G.hud.notify('The cash truck\'s doors burst open — grab the money bags!', 5);
        v.persist = false;
      } else if (t.t <= 0 || d > 650) {
        G.hud.notify(t.t <= 0 ? 'The Geldtransporter reached its depot.' : 'You lost the Geldtransporter.', 4);
        v.persist = false;
        v.cashTruck = false;
        this.truck = null;
        this.truckT = 240 + Math.random() * 180;
      }
    } else if ((t.cleanup += dt) > 20) {
      this.truck = null;
      this.truckT = 240 + Math.random() * 180;
    }
  }

  award(text, amount) {
    this.combo = this.comboT > 0 ? Math.min(5, this.combo + 1) : 1;
    this.comboT = 4;
    const pay = Math.round(amount * this.combo);
    G.money += pay;
    G.stats.bonus = (G.stats.bonus || 0) + pay;
    G.hud.bonus(this.combo > 1 ? `${text} ×${this.combo}` : text, pay, this.combo > 1);
  }

  updateBonuses(dt) {
    if ((this.comboT -= dt) <= 0) this.combo = 1;
    const v = G.player.vehicle;
    if (!v || v.dead || v.cls === 'heli' || v.cls === 'boat') { this.drift = 0; this.air = 0; this.near.clear(); return; }
    const spd = Math.abs(v.speed);
    const recentHit = (x) => G.time - (x.hitT || -99) < 1.5;
    // Near misses: another vehicle passes within a hair at speed without touching.
    for (const o of G.vehicles.list) {
      if (o === v || o.dead) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
      const d2 = dx * dx + dz * dz;
      const rec = this.near.get(o);
      if (d2 > 144) {
        if (rec) {
          this.near.delete(o);
          if (rec.min < rec.thr && rec.rel > 8 && !recentHit(v) && !recentHit(o)) this.award('Near miss', 25);
        }
        continue;
      }
      if (spd < 19) continue;
      const rel = Math.hypot(v.vel.x - o.vel.x, v.vel.z - o.vel.z);
      const d = Math.sqrt(d2);
      if (rec) { rec.min = Math.min(rec.min, d); rec.rel = Math.max(rec.rel, rel); }
      else this.near.set(o, { min: d, rel, thr: (v.def.W + o.def.W) / 2 + 1.1 });
    }
    if (this.near.size > 40) this.near.clear();
    // Drifting
    if (v.cls === 'car') {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const sp = Math.hypot(v.vel.x, v.vel.z);
      const slip = sp > 1 ? Math.acos(clamp((v.vel.x * fx + v.vel.z * fz) / sp, -1, 1)) : 0;
      if (sp > 11 && slip > 0.32 && slip < 1.9 && v.onGround) { this.drift += dt; this.driftEnd = 0; }
      else if (this.drift > 0 && (this.driftEnd += dt) > 0.35) {
        if (this.drift > 1 && G.time - (v.hitT || -99) > this.drift + 0.3) this.award(`Drift ${this.drift.toFixed(1)} s`, Math.round(this.drift * 30));
        this.drift = 0;
      }
    }
    // Big air (stunt ramps pay out on their own)
    if (!v.onGround) { this.air += dt; if (G.stunts && G.stunts.jump) this.stuntAir = true; }
    else if (this.air > 0) {
      if (this.air > 1.1 && !this.stuntAir) this.award(`Big air ${this.air.toFixed(1)} s`, Math.round(this.air * 40));
      this.air = 0; this.stuntAir = false;
    }
    // Flat out on the Autobahn
    this.fastCool -= dt;
    if (spd * 3.6 > 200 && v.onGround) {
      if ((this.fastT += dt) > 4 && this.fastCool <= 0) { this.award(`Kein Tempolimit ${Math.round(spd * 3.6)} km/h`, 100); this.fastCool = 30; this.fastT = 0; }
    } else this.fastT = 0;
  }
}

function P_exit(v) {
  const P = G.player;
  P.forceExit(true);
  P.lastVehicle = null;
  v.persist = false;
  v.locked = true;
  G.traffic.release(v);
  G.vehicles.remove(v);
}
