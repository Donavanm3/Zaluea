// The phone (T / D-pad up): contacts (taxi fast travel, mechanic, lawyer, story
// contacts) and apps (map, garage, businesses, skills, camera mode, quick save).
import { G } from './game.js';
import { CITIES, CITY_BY_ID, REAL_KM_PER_M } from './geo.js';
import { VEHICLES } from './vehicle.js';
import { CONTACTS, STORY } from './missions.js';
import { SKILLS } from './skills.js';
import { DEALER, MODS } from './garage.js';
import { exportPrice } from './events.js';
import { formatMoney, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const CHAT = {
  hans: ['Luka! Keep your head down, mein Junge.', 'The harbour misses you. Well, the fish do.'],
  kalle: ['The A2 is calling, Kumpel. Bring something fast.', 'Tuned your car yet? A Falke with a turbo is poetry.'],
  svetlana: ['Berlin never sleeps, and neither do I.', 'The club is busy tonight. Come by sometime.'],
  richter: ['Herr Kaiser. Money never sleeps. Neither does the BKA.', 'Diversify, Luka. Buy a business or two.'],
  sepp: ['Servus! The beer is cold and the Weißwurst is warm.', 'Bavaria is beautiful in summer. Fly over the Alps sometime!'],
  jens: ['Blue skies, Luka. The planes are fuelled.', 'Remember: throttle up, nose up gently. Gently!'],
  weber: ['Not on this line, Kaiser.', 'I only call when there is money to be made. Be patient.'],
};

export class Phone {
  constructor() {
    this.el = $('phone');
    this.body = $('ph-body');
    this.title = $('ph-title');
    this.clock = $('ph-clock');
    this.open = false;
    this.stack = [];
    this.sel = 0;
    this.items = [];
    this.body.addEventListener('click', (e) => {
      const it = e.target.closest('.ph-item');
      if (!it) return;
      this.sel = +it.dataset.i;
      this.activate();
    });
    $('ph-back').addEventListener('click', () => this.back());
  }

  toggle(on = !this.open) {
    if (on && (G.player.dead || G.player.busted)) return;
    this.open = on;
    this.el.classList.toggle('show', on);
    if (on) { this.stack = []; this.screen = null; this.go('home'); G.audio.ui('select'); }
  }

  go(screen, arg) {
    if (this.screen) this.stack.push([this.screen, this.arg, this.sel]);
    this.screen = screen; this.arg = arg; this.sel = 0;
    this.render();
  }
  back() {
    const s = this.stack.pop();
    if (!s) { this.toggle(false); return; }
    [this.screen, this.arg, this.sel] = s;
    this.render();
  }

  render() {
    const [title, items] = this.build(this.screen, this.arg);
    this.items = items;
    this.sel = clamp(this.sel, 0, Math.max(0, items.length - 1));
    while (this.sel < items.length - 1 && items[this.sel].info) this.sel++;
    this.title.textContent = title;
    this.body.innerHTML = items.map((it, i) => `<div class="ph-item${it.info ? ' info' : ''}${i === this.sel ? ' sel' : ''}" data-i="${i}"><i>${it.icon || ''}</i><div><b>${it.label}</b>${it.sub ? `<small>${it.sub}</small>` : ''}</div></div>`).join('');
    const s = this.body.querySelector('.sel');
    if (s) s.scrollIntoView({ block: 'nearest' });
  }

  move(d) {
    if (!this.items.length) return;
    let i = this.sel;
    for (let k = 0; k < this.items.length; k++) {
      i = (i + d + this.items.length) % this.items.length;
      if (!this.items[i].info) break;
    }
    this.sel = i;
    G.audio.ui('select');
    this.render();
  }

  activate() {
    const it = this.items[this.sel];
    if (!it || it.info) return;
    G.audio.ui('click');
    if (it.go) this.go(it.go, it.arg);
    else if (it.act) { const r = it.act(); if (r !== false && this.open) this.render(); }
  }

  msg(text, dur = 4) { G.hud.notify(text, dur); }

  update() {
    const I = G.input;
    if (G.state !== 'play') { if (this.open) this.toggle(false); return; }
    if (!this.open) {
      if (I.pressed('phone')) this.toggle(true);
      return;
    }
    const gp = I.gpBtn;
    if (I.pressedSet.has('KeyT') || I.pressed('pause') && !this.stack.length) { this.toggle(false); I.pressedSet.delete('Escape'); I.pressedSet.delete('KeyP'); I.gpPressed.delete('pause'); return; }
    if (I.pressedSet.has('ArrowUp') || gp.has(12)) this.move(-1);
    if (I.pressedSet.has('ArrowDown') || gp.has(13)) this.move(1);
    if (I.wheel) { this.move(I.wheel > 0 ? 1 : -1); I.wheel = 0; }
    if (I.pressed('confirm') || gp.has(0)) this.activate();
    else if (I.pressed('back') || gp.has(1) || I.pressed('pause')) { this.back(); I.pressedSet.delete('Escape'); I.pressedSet.delete('KeyP'); I.gpPressed.delete('pause'); }
    // keep gamepad navigation from also triggering actions in the world
    for (const a of ['job', 'reload', 'interact', 'phone', 'radio']) I.gpPressed.delete(a);
    if (G.frame % 15 === 0) {
      const hh = Math.floor(G.clock), mm = Math.floor((G.clock - hh) * 60);
      this.clock.textContent = `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
      if (this.screen === 'garage' || this.screen === 'skills' || this.screen === 'props') this.render();
    }
  }

  // ---------- screens ----------
  build(screen, arg) {
    switch (screen) {
      case 'home': return ['Telekomm', [
        { icon: '👤', label: 'Contacts', sub: 'Taxi, mechanic, lawyer, friends', go: 'contacts' },
        { icon: '🗺️', label: 'Map', sub: 'Set a waypoint', act: () => { this.toggle(false); G.hud.openMap(true); G.state = 'map'; G.input.unlock(true); } },
        { icon: '🚗', label: 'Garage', sub: `${G.garage.cars.length} vehicles`, go: 'garage' },
        { icon: '🏢', label: 'Businesses', sub: `${G.properties.owned.size} owned · ${formatMoney(G.properties.income)}/day`, go: 'props' },
        { icon: '📊', label: 'Skills & stats', go: 'skills' },
        { icon: '📷', label: document.body.classList.contains('nohud') ? 'Show HUD' : 'Camera mode (hide HUD)', act: () => { document.body.classList.toggle('nohud'); } },
        { icon: '💾', label: 'Quick save', act: () => this.quickSave() },
      ]];
      case 'contacts': {
        const items = [
          { icon: '🚕', label: 'Taxi Blitz', sub: 'Fast travel anywhere in Germany', go: 'taxi' },
          { icon: '🔧', label: 'Mechaniker Jürgen', sub: 'Delivers your vehicles', go: 'garage' },
          { icon: '⚖️', label: 'Anwalt Dr. Krause', sub: G.police.level ? `Make the police forget you · ${formatMoney(this.lawyerFee())}` : 'Clears your wanted level (for a fee)', act: () => this.lawyer() },
        ];
        const next = G.missions.startMarker && G.missions.startMarker.def;
        for (const id in CONTACTS) {
          if (!this.knows(id)) continue;
          const c = CONTACTS[id];
          items.push({ icon: c.letter, label: c.name, sub: next && next.contact === id ? `Has a job for you: ${next.title}` : 'Call', act: () => this.call(id) });
        }
        return ['Contacts', items];
      }
      case 'taxi': return ['Taxi Blitz', this.taxiItems()];
      case 'garage': {
        const items = G.garage.cars.map((e) => ({ icon: VEHICLES[e.type].cls === 'heli' ? '🚁' : VEHICLES[e.type].cls === 'bike' ? '🏍️' : '🚗', label: `${G.garage.name(e)}${e.id === G.garage.personal ? ' ★' : ''}`, sub: this.carStatus(e), go: 'car', arg: e.id }));
        if (!items.length) items.push({ info: true, icon: 'ℹ️', label: 'No vehicles yet', sub: 'Buy one at an Autohaus (on foot at any Lackiererei) or tune a car to keep it.' });
        return ['Garage', items];
      }
      case 'car': {
        const e = G.garage.byId(arg);
        if (!e) return ['Garage', [{ info: true, label: 'Sold.' }]];
        const m = e.mods;
        const mods = Object.keys(MODS).filter((k) => m[k]).map((k) => `${MODS[k].name}${MODS[k].levels.length > 1 ? ' ' + m[k] : ''}`).join(', ') || 'stock';
        return [G.garage.name(e), [
          { info: true, icon: '⚙️', label: 'Upgrades', sub: mods },
          { icon: '📦', label: 'Deliver to me', sub: e.destroyed ? 'Insurance claim · €250' : 'Jürgen brings it to you', act: () => { this.msg(G.garage.deliver(e), 5); this.toggle(false); } },
          { icon: '★', label: 'Make personal vehicle', act: () => { G.garage.personal = e.id; this.msg(`${G.garage.name(e)} is now your personal vehicle.`, 3); } },
          { icon: '💶', label: `Sell for ${formatMoney(this.sellValue(e))}`, act: () => this.sell(e) },
        ]];
      }
      case 'props': {
        const items = G.properties.list.map((p) => {
          const own = G.properties.owned.has(p.id);
          return { icon: p.icon, label: p.name, sub: `${CITY_BY_ID[p.city].name} · ${own ? `yours · ${formatMoney(p.income)}/day` : `for sale ${formatMoney(p.price)} · ${formatMoney(p.income)}/day`}`, act: () => { G.hud.setWaypoint(p.x, p.z); this.msg(`Waypoint set: ${p.name}.`, 3); this.toggle(false); } };
        });
        items.unshift({ info: true, icon: '📈', label: `Income ${formatMoney(G.properties.income)} per day`, sub: 'Paid every morning at 06:00' });
        return ['Businesses', items];
      }
      case 'skills': {
        const items = SKILLS.map(([k, name, icon, desc]) => ({ info: true, icon, label: `${name} · ${Math.floor(G.skills.v[k])}%`, sub: `<span class="ph-bar"><i style="width:${G.skills.v[k]}%"></i></span>${desc}` }));
        items.push({ info: true, icon: '⚡', label: `Fokus · ${Math.round(G.skills.special)}%`, sub: '<span class="ph-bar sp"><i style="width:' + G.skills.special + '%"></i></span>Press X for slow motion' });
        const s = G.stats;
        items.push({ info: true, icon: '🏁', label: `Story ${G.missions.progress}/${STORY.length} · Gnomes ${G.pickups.collected ? G.pickups.collected.size : 0}/30`, sub: `Kills ${s.kills} · Cars stolen ${s.carsStolen} · Exported ${s.exports || 0} · Top speed ${Math.round(s.topSpeed)} km/h` });
        return ['Skills & stats', items];
      }
    }
    return ['', []];
  }

  knows(id) {
    const idx = STORY.findIndex((d) => d.contact === id);
    return idx >= 0 && idx <= G.missions.progress;
  }

  call(id) {
    const c = CONTACTS[id];
    const s = G.missions.startMarker;
    G.audio.ui('phone');
    if (s && s.def.contact === id && !G.missions.active) {
      const city = CITY_BY_ID[s.def.city];
      G.hud.subtitle(`Luka! I have a job for you — "${s.def.title}". Come see me${city ? ' in ' + city.name : ''}, I'll put it on your GPS.`, 5, c.name);
      G.hud.waypoint = null;
    } else {
      const lines = CHAT[id] || ['…'];
      G.hud.subtitle(lines[Math.floor(Math.random() * lines.length)], 4, c.name);
    }
    this.toggle(false);
  }

  lawyerFee() { return 800 * G.police.level; }
  lawyer() {
    if (!G.police.level) { this.msg('Dr. Krause: "You are not wanted, Herr Kaiser. Keep it that way."', 4); return; }
    if (G.missions.active) { this.msg('Dr. Krause: "Not while you are on a job. Call me afterwards."', 4); return; }
    const fee = this.lawyerFee();
    if (G.money < fee) { this.msg(`Dr. Krause wants ${formatMoney(fee)} up front.`, 3); return; }
    G.money -= fee;
    this.toggle(false);
    G.hud.subtitle('Leave it with me. A few phone calls and this never happened.', 4, 'Anwalt Dr. Krause');
    setTimeout(() => { if (G.police.level) { G.police.clear(); G.hud.notify('Your lawyer made the problem go away. Wanted level cleared.', 4); } }, 4000);
  }

  quickSave() {
    if (G.police.level) { this.msg('You cannot save while wanted.', 3); return; }
    if (G.missions.active) { this.msg('You cannot save during a mission.', 3); return; }
    if (G.save.write()) this.msg('💾 Game saved', 2);
  }

  carStatus(e) {
    if (e.destroyed) return 'Destroyed · insurance claim available';
    const v = e.live;
    if (v && v === G.player.vehicle) return 'You are driving it';
    if (v) return `${(Math.hypot(v.pos.x - G.player.pos.x, v.pos.z - G.player.pos.z) * REAL_KM_PER_M).toFixed(1)} km away`;
    return 'In storage — call Jürgen';
  }

  sellValue(e) {
    const d = DEALER.find((q) => q[0] === e.type);
    let v = d ? d[1] * 0.5 : exportPrice(e.type);
    for (const k in MODS) for (let i = 0; i < (e.mods[k] || 0); i++) v += MODS[k].levels[i] * 0.4;
    return Math.round(v / 50) * 50;
  }
  sell(e) {
    if (e.live && e.live === G.player.vehicle) { this.msg('Get out of the car before you sell it.', 3); return; }
    const val = this.sellValue(e);
    if (e.live) G.vehicles.remove(e.live);
    G.garage.remove(e);
    G.money += val;
    this.msg(`Sold your ${G.garage.name(e)} for ${formatMoney(val)}.`, 3);
    this.back();
    return false;
  }

  // ---------- taxi fast travel ----------
  taxiItems() {
    const P = G.player.pos;
    const out = [];
    const add = (icon, label, t) => {
      const d = Math.hypot(t.x - P.x, t.z - P.z);
      const fee = Math.round((40 + d * 0.08) / 5) * 5;
      out.push({ icon, label, sub: `${(d * REAL_KM_PER_M).toFixed(0)} km · ${formatMoney(fee)}`, act: () => this.ride(t, fee, label) });
    };
    if (G.hud.waypoint) add('📍', 'Waypoint', G.hud.waypoint);
    const s = G.missions.active ? G.missions.active.gpsTarget : G.missions.startMarker;
    if (s) add('⭐', G.missions.active ? 'Mission objective' : `Next mission: ${G.missions.startMarker.def.title}`, s);
    for (const c of [...CITIES].filter((q) => q.r >= 75).sort((a, b) => a.name.localeCompare(b.name))) add('🏙️', c.name, c);
    return out;
  }

  ride(t, fee, label) {
    if (G.police.level) { this.msg('No taxi will stop for you while the police are after you.', 3); return; }
    if (G.money < fee) { this.msg(`The ride costs ${formatMoney(fee)}.`, 3); return; }
    const net = G.world.roads;
    const n = net.nearestOnRoad(t.x, t.z, 600);
    if (!n) { this.msg('The driver doesn\'t know that place.', 3); return; }
    const q = net.pointAt(n.edge, n.s);
    const off = n.edge.half + (n.edge.type === 'city' ? 1.6 : 2.5);
    const x = q.x + q.rx * off, z = q.z + q.rz * off;
    G.money -= fee;
    this.toggle(false);
    const P = G.player;
    const fade = $('fade');
    fade.classList.add('show');
    G.hud.notify(`🚕 Taxi to ${label} — ${formatMoney(fee)}`, 3);
    setTimeout(() => {
      if (P.vehicle) P.forceExit(false);
      const d = Math.hypot(x - P.char.pos.x, z - P.char.pos.z);
      P.char.pos.set(x, G.physics.groundAt(x, z, q.y + 3), z);
      P.char.vel.set(0, 0, 0);
      P.char.heading = Math.atan2(-q.rx, -q.rz);
      P.cam.yaw = P.char.heading;
      G.clock = (G.clock + Math.min(5, 0.25 + d / 1500)) % 24;
      setTimeout(() => fade.classList.remove('show'), 350);
    }, 650);
  }
}
