// Businesses for sale around Germany. Each one you own pays out every morning at 06:00.
import { G } from './game.js';
import { CITY_BY_ID } from './geo.js';
import { formatMoney } from './util.js';

export const PROPERTIES = [
  { id: 'spaeti_b', name: 'Späti Kreuzberg', city: 'berlin', price: 5000, income: 250, icon: '🏪', off: [0.5, 0.3] },
  { id: 'imbiss_hh', name: 'Imbiss „Zum Fischkopp“', city: 'hamburg', price: 6000, income: 300, icon: '🍟', off: [0.45, -0.35] },
  { id: 'kneipe_k', name: 'Kölsch-Kneipe am Dom', city: 'koeln', price: 9000, income: 420, icon: '🍺', off: [0.4, -0.3] },
  { id: 'hafen_hb', name: 'Hafenlager Bremen', city: 'bremen', price: 14000, income: 650, icon: '📦', off: [-0.4, 0.4] },
  { id: 'taxi_h', name: 'Taxizentrale Hannover', city: 'hannover', price: 18000, income: 800, icon: '🚕', off: [0.3, 0.4] },
  { id: 'wein_ko', name: 'Weingut an der Mosel', city: 'koblenz', price: 20000, income: 900, icon: '🍷', off: [0.3, 0.3] },
  { id: 'werk_s', name: 'Tuning-Werkstatt Stuttgart', city: 'stuttgart', price: 25000, income: 1200, icon: '🔧', off: [-0.4, 0.3] },
  { id: 'bier_m', name: 'Biergarten an der Isar', city: 'muenchen', price: 30000, income: 1500, icon: '🍻', off: [0.4, 0.45] },
  { id: 'club_b', name: 'Techno-Club „Bunker“', city: 'berlin', price: 45000, income: 2200, icon: '🎧', off: [-0.45, -0.45] },
  { id: 'wechsel_f', name: 'Wechselstube Frankfurt', city: 'frankfurt', price: 60000, income: 3000, icon: '💶', off: [-0.3, -0.4] },
];

export class Properties {
  constructor() {
    const net = G.world.roads;
    this.list = [];
    for (const p of PROPERTIES) {
      const c = CITY_BY_ID[p.city];
      if (!c || !net.grids[p.city]) continue;
      const tx = c.x + p.off[0] * c.r, tz = c.z + p.off[1] * c.r;
      const n = net.nearestOnRoad(tx, tz, 200, (e) => e.type === 'city' && e.city === p.city);
      if (!n) continue;
      const q = net.pointAt(n.edge, n.s);
      // step from the street centre onto the sidewalk, towards the target point
      const side = (tx - q.x) * q.rx + (tz - q.z) * q.rz >= 0 ? 1 : -1;
      const x = q.x + q.rx * side * (n.edge.half + 1.6), z = q.z + q.rz * side * (n.edge.half + 1.6);
      this.list.push({ ...p, x, z, y: G.physics.groundAt(x, z, q.y + 3), mk: null });
    }
    this.owned = new Set();
    this.reset(9);
  }

  reset(clock) {
    this.day = 0;
    this.lastClock = clock;
    this.nextPay = clock < 6 ? 6 : 30;
  }

  load(ids) {
    this.owned = new Set((ids || []).filter((id) => this.list.some((p) => p.id === id)));
    this.reset(G.clock);
  }
  save() { return [...this.owned]; }
  get income() { return this.list.filter((p) => this.owned.has(p.id)).reduce((s, p) => s + p.income, 0); }

  buy(p) {
    if (this.owned.has(p.id) || G.money < p.price) return false;
    G.money -= p.price;
    this.owned.add(p.id);
    G.audio.ui('pass');
    G.hud.bigMessage('PROPERTY PURCHASED', '#22c55e', `${p.name} · earns ${formatMoney(p.income)} every day at 06:00`, 4);
    if (p.mk) { G.hud.removeMarker(p.mk); p.mk = null; }
    if (G.save) G.save.autosave();
    return true;
  }

  update() {
    // Business day ends at 06:00 (sleeping and respawning move the clock forward too).
    if (G.clock < this.lastClock - 1e-6) this.day++;
    this.lastClock = G.clock;
    const now = this.day * 24 + G.clock;
    if (now >= this.nextPay) {
      this.nextPay = (Math.floor((now - 6) / 24) + 1) * 24 + 6;
      const inc = this.income;
      if (inc > 0) {
        G.money += inc;
        G.stats.income = (G.stats.income || 0) + inc;
        G.hud.notify(`📈 Your businesses earned ${formatMoney(inc)} overnight.`, 5);
        G.audio.ui('money');
      }
    }
    // Markers and purchase prompt for nearby businesses that are for sale.
    const P = G.player, pp = P.pos;
    for (const p of this.list) {
      const d = Math.hypot(p.x - pp.x, p.z - pp.z);
      const want = d < 140 && !this.owned.has(p.id);
      if (want && !p.mk) p.mk = G.hud.addMarker(p.x, p.y, p.z, { r: 1.2, color: 0x22c55e, h: 1.6 });
      else if (!want && p.mk) { G.hud.removeMarker(p.mk); p.mk = null; }
      if (d > 2.4 || P.vehicle || P.dead || G.hud.missionPrompt || G.hud.eventPrompt) continue;
      if (this.owned.has(p.id)) {
        G.hud.eventPrompt = `${p.icon} <b>${p.name}</b> — yours · earns ${formatMoney(p.income)} a day`;
      } else {
        G.hud.eventPrompt = `Press <b>E</b> to buy ${p.icon} <b>${p.name}</b> for ${formatMoney(p.price)} <small>(earns ${formatMoney(p.income)} a day)</small>`;
        if (G.input.pressed('interact')) { if (!this.buy(p)) G.hud.notify(`You need ${formatMoney(p.price)} to buy ${p.name}.`, 3); }
      }
    }
  }

  blips(all = false) {
    const out = [];
    const pp = G.player.pos;
    for (const p of this.list) {
      if (!all && Math.hypot(p.x - pp.x, p.z - pp.z) > 400) continue;
      const own = this.owned.has(p.id);
      out.push({ x: p.x, z: p.z, color: own ? '#22c55e' : '#15803d', text: own ? '★' : '€', label: p.name });
    }
    return out;
  }
}
