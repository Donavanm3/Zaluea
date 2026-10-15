// Personal vehicles: the garage (saved with the game), performance mods and the
// mechanic who delivers your car wherever you are.
import { G } from './game.js';
import { VEHICLES } from './vehicle.js';

export const GARAGE_SIZE = 6;
// Autohaus stock: vehicle id, price.
export const DEALER = [['rennpappe', 1800], ['pendler', 2600], ['kombi', 3400], ['adler', 5200], ['transporter', 4200], ['blitz', 6500], ['falke', 18000], ['libelle', 45000]];
export const MODS = {
  engine: { name: 'Engine tuning', levels: [1500, 3200, 5500], desc: 'Top speed and acceleration' },
  brakes: { name: 'Race brakes', levels: [800, 1700, 3000], desc: 'Shorter stopping distance' },
  armor: { name: 'Armour plating', levels: [1200, 2600, 4800], desc: '+25% durability per level' },
  turbo: { name: 'Turbo', levels: [6000], desc: 'Big boost to acceleration' },
};
export const PAINTS = [['Signal Red', 0xd01c1c], ['Jet Black', 0x111214], ['Alpine White', 0xf2f2f2], ['Racing Blue', 0x1f4fd0], ['British Green', 0x1f5a3a],
  ['Taxi Yellow', 0xf2c200], ['Ultraviolet', 0x6a2cbf], ['Silver', 0xc0c4c8], ['Signal Orange', 0xff7a1a], ['Gunmetal', 0x3a3f45]];
const NO_MODS = () => ({ engine: 0, brakes: 0, armor: 0, turbo: 0 });

export function moddable(v) { return v && (v.cls === 'car' || v.cls === 'bike'); }

export class Garage {
  constructor() {
    this.cars = [];
    this.nextId = 1;
    this.personal = null;
  }

  load(data) {
    this.cars = ((data && data.cars) || []).filter((c) => VEHICLES[c.type]).map((c) => ({ id: c.id, type: c.type, color: c.color, mods: { ...NO_MODS(), ...(c.mods || {}) }, live: null }));
    this.nextId = this.cars.reduce((m, c) => Math.max(m, c.id), 0) + 1;
    this.personal = data && this.cars.some((c) => c.id === data.personal) ? data.personal : this.cars.length ? this.cars[0].id : null;
  }
  save() { return { cars: this.cars.map(({ id, type, color, mods }) => ({ id, type, color, mods })), personal: this.personal }; }

  get full() { return this.cars.length >= GARAGE_SIZE; }
  byId(id) { return this.cars.find((c) => c.id === id) || null; }
  entryFor(v) { return v && v.garageId ? this.byId(v.garageId) : null; }
  name(e) { return VEHICLES[e.type].name; }

  add(type, color, mods) {
    if (this.full) return null;
    const e = { id: this.nextId++, type, color, mods: mods || NO_MODS(), live: null };
    this.cars.push(e);
    this.personal = e.id;
    return e;
  }

  remove(e) {
    const i = this.cars.indexOf(e);
    if (i >= 0) this.cars.splice(i, 1);
    if (e.live) { e.live.owned = false; e.live.persist = false; e.live.garageId = null; }
    if (this.personal === e.id) this.personal = this.cars.length ? this.cars[0].id : null;
  }

  // Make a vehicle instance one of yours (e.g. after modding a stolen car).
  own(v) {
    const have = this.entryFor(v);
    if (have) return have;
    const e = this.add(v.type, v.color, v.mods || NO_MODS());
    if (!e) return null;
    this.apply(v, e);
    return e;
  }

  apply(v, e) {
    v.mods = e.mods;
    v.garageId = e.id;
    v.owned = true;
    v.persist = true;
    v.maxHp = VEHICLES[e.type].hp * (1 + 0.25 * e.mods.armor);
    v.hp = Math.max(v.hp, v.maxHp);
    e.live = v;
  }

  spawn(e, x, y, z, h) {
    const v = G.vehicles.spawn(e.type, x, y, z, h, e.color);
    this.apply(v, e);
    return v;
  }

  // A roadside spot near (but preferably out of view of) the player.
  deliverSpot(minD = 28) {
    const P = G.player.pos, net = G.world.roads, yaw = G.player.cam.yaw;
    for (let k = 0; k < 14; k++) {
      const a = yaw + Math.PI + (k % 2 ? 1 : -1) * Math.floor(k / 2) * 0.45;
      const d = minD + (k % 3) * 12;
      const near = net.nearestOnRoad(P.x + Math.sin(a) * d, P.z + Math.cos(a) * d, 35);
      if (!near) continue;
      const p = net.pointAt(near.edge, near.s);
      const off = near.edge.type === 'autobahn' ? near.edge.half + 2.5 : near.edge.type === 'city' ? 2.6 : 2.2;
      const x = p.x + p.rx * off, z = p.z + p.rz * off;
      if (Math.hypot(x - P.x, z - P.z) < 15) continue;
      if (G.vehicles.list.some((o) => Math.hypot(o.pos.x - x, o.pos.z - z) < 6)) continue;
      return { x, y: G.physics.groundAt(x, z, p.y + 2), z, h: Math.atan2(p.tx, p.tz) };
    }
    return null;
  }

  // Mechanic call. Returns a message for the phone.
  deliver(e) {
    const P = G.player;
    if (e.live && !e.live.dead && G.vehicles.list.includes(e.live)) {
      const d = Math.hypot(e.live.pos.x - P.pos.x, e.live.pos.z - P.pos.z);
      if (P.vehicle === e.live) return 'You are already sitting in it.';
      if (d < 120) { G.hud.setWaypoint(e.live.pos.x, e.live.pos.z); return `Your ${this.name(e)} is only ${Math.round(d)} m away — waypoint set.`; }
      G.vehicles.remove(e.live);
      e.live = null;
    }
    const heli = VEHICLES[e.type].cls === 'heli';
    let spot = null;
    if (heli) {
      let best = null, bd = Infinity;
      for (const p of G.world.pads) if (p.type === 'helipad') { const q = Math.hypot(p.x - P.pos.x, p.z - P.pos.z); if (q < bd) { bd = q; best = p; } }
      if (best) spot = { x: best.x, y: best.y + 0.3, z: best.z, h: 0 };
    } else spot = this.deliverSpot();
    if (!spot) return 'The mechanic can\'t find a road near you. Try again somewhere else.';
    let fee = 0;
    if (e.destroyed) { fee = Math.min(G.money, 250); G.money -= fee; e.destroyed = false; }
    const v = this.spawn(e, spot.x, spot.y, spot.z, spot.h);
    v.ctrl.handbrake = true;
    this.personal = e.id;
    G.hud.setWaypoint(spot.x, spot.z);
    return `Jürgen dropped off your ${this.name(e)}${heli ? ' on the nearest helipad' : ' nearby'}${fee ? ` · insurance €${fee}` : ''}. Waypoint set.`;
  }

  update() {
    const v = G.player.vehicle;
    const e = this.entryFor(v);
    if (e) this.personal = e.id;
    for (const c of this.cars) {
      if (c.live && c.live.dead) { c.live = null; c.destroyed = true; G.hud.notify(`Your ${this.name(c)} was destroyed. Call the mechanic (phone) to get it back via insurance.`, 5); }
      else if (c.live && !G.vehicles.list.includes(c.live)) c.live = null;
    }
  }

  blips() {
    const out = [];
    for (const c of this.cars) {
      const v = c.live;
      if (!v || v === G.player.vehicle) continue;
      out.push({ x: v.pos.x, z: v.pos.z, color: c.id === this.personal ? '#3b82f6' : '#64748b', text: VEHICLES[c.type].cls === 'heli' ? '🚁' : '🚗', label: this.name(c) });
    }
    return out;
  }
}
