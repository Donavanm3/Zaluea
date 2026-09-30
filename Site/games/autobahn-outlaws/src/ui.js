// Menus (title, pause, settings, controls, credits), shops and service interactions.
import { G } from './game.js';
import { WEAPONS, WEAPON_ORDER } from './weapons.js';
import { storeSettings } from './save.js';
import { formatMoney, pick } from './util.js';
import { buildVehicleModel } from './models.js';
import { VEHICLES } from './vehicle.js';
import { exportPrice } from './events.js';

// Autohaus stock: vehicle id, price. Helicopters are delivered to the nearest helipad.
const DEALER = [['rennpappe', 1800], ['pendler', 2600], ['kombi', 3400], ['adler', 5200], ['transporter', 4200], ['blitz', 6500], ['falke', 18000], ['libelle', 45000]];

const $ = (id) => document.getElementById(id);

const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look / aim'], ['Left click', 'Shoot / punch'], ['Right click', 'Aim (hold)'],
  ['Shift', 'Sprint · (heli: descend)'], ['Space', 'Jump · handbrake · (heli: climb)'], ['F', 'Enter / exit / steal vehicle'],
  ['E', 'Interact · start mission · skip dialogue'], ['R', 'Reload'], ['1–7 / Wheel', 'Select weapon (0 = fists)'], ['H', 'Horn'],
  ['Q', 'Change radio station'], ['C', 'Change vehicle camera'], ['N', 'Police siren (police vehicles)'], ['J', 'Taxi job (taxi) · Vigilante (police car)'],
  ['Ctrl / Z', 'Helicopter descend'], ['M', 'Map (click to set waypoint)'], ['Esc / P', 'Pause'],
];

export class UI {
  constructor() {
    this.screens = ['menu', 'intro', 'pause', 'settings', 'controls', 'credits', 'shop', 'loading'];
    this.back = null;
    this.shopType = null;
    this.bindButtons();
    this.fillControls();
  }

  show(id) {
    for (const s of this.screens) { const el = $('scr-' + s); if (el) el.classList.toggle('show', s === id); }
    this.current = id;
  }
  hideAll() { this.show(null); }

  bindButtons() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      G.audio.init();
      G.audio.ui('click');
      this.action(b.dataset.act, b);
    });
    for (const id of ['set-quality', 'set-draw', 'set-sens', 'set-invert', 'set-master', 'set-music', 'set-sfx', 'set-shake', 'set-fps']) {
      const el = $(id);
      if (el) el.addEventListener('input', () => this.readSettings());
    }
  }

  action(act, el) {
    switch (act) {
      case 'new':
        if (G.save.has() && !confirm('Start a new game? Your saved progress will be overwritten.')) return;
        this.back = 'menu';
        this.show('intro');
        break;
      case 'intro-go':
        G.save.wipe();
        G.startGame(null);
        break;
      case 'continue': G.startGame(G.save.read()); break;
      case 'settings': this.back = this.current; this.syncSettings(); this.show('settings'); break;
      case 'controls': this.back = this.current; this.show('controls'); break;
      case 'credits': this.back = this.current; this.show('credits'); break;
      case 'back': this.show(this.back || 'menu'); break;
      case 'resume': this.resume(); break;
      case 'map': this.resume(); G.hud.openMap(true); G.state = 'map'; G.input.unlock(true); break;
      case 'save': if (G.save.write()) { el.textContent = 'Saved ✓'; setTimeout(() => (el.textContent = 'Save game'), 1500); } break;
      case 'quit': G.save.write(); location.reload(); break;
      case 'fullscreen':
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.();
        break;
      case 'buy': this.buy(el.dataset.item, el.dataset.kind); break;
      case 'closeshop': this.closeShop(); break;
      case 'closemap': G.hud.openMap(false); G.state = 'play'; G.input.lock(); break;
    }
  }

  // ---------- pause ----------
  pause() {
    if (G.state !== 'play') return;
    G.state = 'pause';
    this.pausedAt = performance.now();
    G.input.pressedSet.clear();
    G.audio.setHorn(false);
    this.show('pause');
    this.updatePauseStats();
    G.input.unlock(true);
  }
  resume() {
    this.hideAll();
    G.state = 'play';
    G.input.lock();
  }

  updatePauseStats() {
    const s = G.stats;
    const M = G.missions;
    const done = M.progress + (G.pickups.collected ? G.pickups.collected.size : 0) / 30 + (G.stunts ? G.stunts.done.size / Math.max(1, G.stunts.ramps.length) : 0);
    const pct = Math.round((done / 12) * 100);
    const f = M.freeInfo();
    const next = M.active ? `Current mission: <b>${M.active.def.title}</b>` : f ? f.text.replace(/<span class="sub">.*<\/span>/, '') : '';
    const ex = G.events ? G.events.exportList.map((id) => `${VEHICLES[id].name} (${formatMoney(exportPrice(id))})`).join(' · ') : '';
    $('pause-stats').innerHTML = `
      <div class="progress"><span>Game progress · ${pct}%</span><div class="pbar"><i style="width:${pct}%"></i></div><div class="next">${next}</div>${ex ? `<div class="next small">Export list: ${ex}</div>` : ''}</div>
      <div><span>Money</span><b>${formatMoney(G.money)}</b></div>
      <div><span>Story missions</span><b>${G.missions.progress} / 10</b></div>
      <div><span>Garden gnomes</span><b>${G.pickups.collected ? G.pickups.collected.size : 0} / 30</b></div>
      <div><span>Stunt jumps</span><b>${G.stunts ? G.stunts.done.size : 0} / ${G.stunts ? G.stunts.ramps.length : 0}</b></div>
      <div><span>Kills</span><b>${s.kills}</b></div>
      <div><span>Vehicles stolen</span><b>${s.carsStolen}</b></div>
      <div><span>Cars exported</span><b>${s.exports || 0}</b></div>
      <div><span>Driving bonuses</span><b>${formatMoney(s.bonus || 0)}</b></div>
      <div><span>Distance driven</span><b>${(s.distance * 0.1545).toFixed(1)} km</b></div>
      <div><span>Top speed</span><b>${Math.round(s.topSpeed)} km/h</b></div>
      <div><span>Highest wanted level</span><b>${'★'.repeat(s.wantedMax) || '—'}</b></div>
      <div><span>Wasted / Busted</span><b>${s.deaths} / ${s.arrests}</b></div>`;
  }

  // ---------- settings ----------
  syncSettings() {
    const s = G.settings;
    $('set-quality').value = s.quality;
    $('set-draw').value = s.drawDistance;
    $('set-sens').value = s.sensitivity;
    $('set-invert').checked = s.invertY;
    $('set-master').value = s.master;
    $('set-music').value = s.music;
    $('set-sfx').value = s.sfx;
    $('set-shake').checked = s.shake;
    $('set-fps').checked = s.fps;
    this.labels();
  }
  labels() {
    const s = G.settings;
    $('lbl-draw').textContent = s.drawDistance + ' m';
    $('lbl-sens').textContent = s.sensitivity.toFixed(2);
    $('lbl-master').textContent = Math.round(s.master * 100) + '%';
    $('lbl-music').textContent = Math.round(s.music * 100) + '%';
    $('lbl-sfx').textContent = Math.round(s.sfx * 100) + '%';
  }
  readSettings() {
    const s = G.settings;
    const oldQ = s.quality;
    s.quality = $('set-quality').value;
    s.drawDistance = +$('set-draw').value;
    s.sensitivity = +$('set-sens').value;
    s.invertY = $('set-invert').checked;
    s.master = +$('set-master').value;
    s.music = +$('set-music').value;
    s.sfx = +$('set-sfx').value;
    s.shake = $('set-shake').checked;
    s.fps = $('set-fps').checked;
    storeSettings(s);
    G.audio.vol = { master: s.master, sfx: s.sfx, music: s.music };
    G.audio.applyVolumes();
    G.applyGraphics && G.applyGraphics();
    $('set-quality-note').style.display = oldQ !== s.quality || $('set-quality-note').style.display === 'block' ? 'block' : 'none';
    this.labels();
  }

  fillControls() {
    $('controls-list').innerHTML = CONTROLS.map(([k, v]) => `<div class="ctl"><kbd>${k}</kbd><span>${v}</span></div>`).join('') +
      '<p class="small">Gamepad supported: sticks move/look, RT shoot/accelerate, LT aim/brake, Y enter vehicle, A jump/handbrake, X interact, B reload, LB/RB weapons, Back map, Start pause.</p>';
  }

  // ---------- shops ----------
  openShop(type) {
    this.shopType = type;
    G.state = 'shop';
    G.input.unlock(true);
    this.renderShop();
    this.show('shop');
  }
  closeShop() {
    if (G.state !== 'shop') return;
    this.hideAll();
    G.state = 'play';
    G.input.lock();
  }
  renderShop() {
    const P = G.player;
    const rows = [];
    if (this.shopType === 'autohaus') {
      $('shop-title').textContent = 'Autohaus';
      $('shop-sub').textContent = 'Car dealer — brand new, full tank, no questions asked. Delivered to the street outside.';
      for (const [id, price] of DEALER) {
        const d = VEHICLES[id];
        const kmh = Math.round(d.maxSpeed * 3.6);
        rows.push(`<div class="shop-row"><div class="sn">${d.cls === 'heli' ? '🚁' : d.cls === 'bike' ? '🏍️' : '🚗'} ${d.name}<small>Top speed ${kmh} km/h · ${d.cls === 'heli' ? 'delivered to the nearest helipad' : `export value ${formatMoney(exportPrice(id))}`}</small></div>
          <button data-act="buy" data-kind="car" data-item="${id}" ${G.money < price ? 'disabled' : ''}>Buy · ${formatMoney(price)}</button></div>`);
      }
    } else if (this.shopType === 'gunshop') {
      $('shop-title').textContent = 'Waffenladen';
      $('shop-sub').textContent = 'Gun shop — weapons & ammunition';
      for (const id of WEAPON_ORDER) {
        const w = WEAPONS[id];
        if (!w.price) continue;
        const owned = !!P.inv[id];
        const total = owned ? P.totalAmmo(id) : 0;
        rows.push(`<div class="shop-row"><div class="sn">${w.icon} ${w.name}<small>${owned ? `Ammo: ${total}` : `Damage ${w.dmg}${w.pellets ? '×' + w.pellets : ''} · Mag ${w.mag}`}</small></div>
          ${owned ? `<button data-act="buy" data-kind="ammo" data-item="${id}" ${G.money < w.ammoPrice ? 'disabled' : ''}>+${w.ammoPack} ammo · ${formatMoney(w.ammoPrice)}</button>`
            : `<button data-act="buy" data-kind="weapon" data-item="${id}" ${G.money < w.price ? 'disabled' : ''}>Buy · ${formatMoney(w.price)}</button>`}</div>`);
      }
      rows.push(`<div class="shop-row"><div class="sn">🦺 Body armour<small>Current: ${Math.round(P.char.armor)}%</small></div><button data-act="buy" data-kind="armor" data-item="armor" ${G.money < 600 || P.char.armor >= 100 ? 'disabled' : ''}>Buy · ${formatMoney(600)}</button></div>`);
    }
    $('shop-money').textContent = formatMoney(G.money);
    $('shop-list').innerHTML = rows.join('');
  }
  buy(item, kind) {
    const P = G.player;
    const w = WEAPONS[item];
    if (kind === 'weapon' && G.money >= w.price) { G.money -= w.price; P.giveWeapon(item, w.ammoPack); P.switchTo(item); G.audio.ui('buy'); }
    else if (kind === 'ammo' && G.money >= w.ammoPrice) { G.money -= w.ammoPrice; P.giveWeapon(item, w.ammoPack); G.audio.ui('buy'); }
    else if (kind === 'armor' && G.money >= 600) { G.money -= 600; P.char.armor = 100; G.audio.ui('buy'); }
    else if (kind === 'car') {
      const e = DEALER.find((d) => d[0] === item);
      if (e && G.money >= e[1] && this.deliverCar(item)) { G.money -= e[1]; G.audio.ui('buy'); }
    }
    this.renderShop();
  }

  // Spawn a bought vehicle on the street in front of the dealer (or on a helipad).
  deliverCar(id) {
    const P = G.player.char;
    const d = VEHICLES[id];
    let x, y, z, h;
    if (d.cls === 'heli') {
      let best = null, bd = Infinity;
      for (const p of G.world.pads) if (p.type === 'helipad') { const q = Math.hypot(p.x - P.pos.x, p.z - P.pos.z); if (q < bd) { bd = q; best = p; } }
      if (!best) return false;
      x = best.x; y = best.y + 0.3; z = best.z; h = 0;
    } else {
      const net = G.world.roads;
      const near = net.nearestOnRoad(P.pos.x, P.pos.z, 40);
      if (!near) return false;
      const p = net.pointAt(near.edge, near.s);
      x = p.x + p.rx * 2.6; z = p.z + p.rz * 2.6; y = p.y; h = Math.atan2(p.tx, p.tz);
    }
    const blocking = G.vehicles.list.filter((o) => o !== G.player.vehicle && !o.persist && Math.hypot(o.pos.x - x, o.pos.z - z) < 5);
    for (const o of blocking) { G.traffic.release(o); G.vehicles.remove(o); }
    const v = G.vehicles.spawn(id, x, y, z, h);
    v.persist = true; v.owned = true;
    G.hud.notify(`Your new ${d.name} is waiting ${d.cls === 'heli' ? 'on the helipad (GPS set)' : 'outside'}. Enjoy!`, 5);
    if (d.cls === 'heli') G.hud.setWaypoint(x, z);
    return true;
  }

  // ---------- world interactions (E) ----------
  updateInteractions() {
    const P = G.player;
    if (P.dead || P.busted || G.missions.active && G.missions.active.def.id === 'bankjob') { G.hud.prompt(G.hud.missionPrompt || null); return; }
    let best = null, bd = Infinity;
    const pp = P.pos;
    for (const s of G.world.services) {
      const d = Math.hypot(s.x - pp.x, s.z - pp.z);
      const reach = s.type === 'respray' || s.type === 'fuel' ? 7 : 2.6;
      if (d < reach && d < bd && Math.abs(s.y - pp.y) < 3) { bd = d; best = s; }
    }
    let text = G.hud.missionPrompt || G.hud.eventPrompt || null;
    if (best && !text) {
      const inV = !!P.vehicle;
      switch (best.type) {
        case 'gunshop': if (!inV) text = 'Press <b>E</b> — <b>Waffenladen</b> (gun shop)'; break;
        case 'respray': text = inV ? `Press <b>E</b> — <b>Lackiererei</b>: respray car ${formatMoney(250)}${G.police.level ? ' (loses the cops if unseen)' : ''}` : 'Press <b>E</b> — <b>Autohaus</b>: buy a car · drive in to respray'; break;
        case 'hospital': if (!inV) text = `Press <b>E</b> — <b>Krankenhaus</b>: full heal ${formatMoney(100)}`; break;
        case 'safehouse': if (!inV) text = 'Press <b>E</b> — <b>Wohnung</b>: save game & sleep 6 hours'; break;
        case 'fuel': text = `Press <b>E</b> — <b>Tankstelle</b>: Currywurst ${formatMoney(15)} (+50 health)${inV ? ' · repair car ' + formatMoney(200) : ''}`; break;
        case 'police': if (!inV) text = 'Polizeiwache (police station)'; break;
        case 'club': if (!inV) text = 'Club — Svetlana\'s place'; break;
        case 'bank': if (!inV) text = 'Europa Bank'; break;
      }
      if (G.input.pressed('interact') && !G.hud.missionPrompt) this.interact(best);
    }
    G.hud.prompt(text);
  }

  interact(s) {
    const P = G.player;
    const c = P.char;
    switch (s.type) {
      case 'gunshop': if (!P.vehicle) this.openShop('gunshop'); break;
      case 'respray':
        if (!P.vehicle) { this.openShop('autohaus'); return; }
        if (G.money < 250) { G.hud.notify('Not enough money.', 2); return; }
        G.money -= 250;
        {
          const v = P.vehicle;
          const col = pick([0xd01c1c, 0x1a1a1c, 0xf2f2f2, 0x2a6ad0, 0x2aa04a, 0xf2c200, 0x7b2cbf, 0xc0c4c8]);
          v.model.body.geometry.dispose();
          const nm = buildVehicleModel(v.def, col);
          v.model.body.geometry = nm.body.geometry;
          if (nm.glass) nm.glass.geometry.dispose();
          nm.lights.geometry.dispose();
          v.color = col;
          v.hp = v.def.hp;
          v.burning = 0;
          if (G.police.level > 0 && !G.police.seen) { G.police.clear(); G.hud.notify('New paint, new plates — the police lost you!', 4); }
          else if (G.police.level > 0) G.hud.notify('The cops saw you drive in! Respray didn\'t help.', 3);
          else G.hud.notify('Car resprayed and repaired.', 3);
          G.audio.ui('buy');
        }
        break;
      case 'hospital':
        if (G.money < 100) { G.hud.notify('Not enough money.', 2); return; }
        if (c.health >= c.maxHealth) { G.hud.notify('You are already healthy.', 2); return; }
        G.money -= 100; c.health = c.maxHealth; G.audio.ui('buy');
        break;
      case 'safehouse':
        if (G.police.level > 0) { G.hud.notify('You cannot save while wanted by the police.', 3); return; }
        G.clock = (G.clock + 6) % 24;
        c.health = c.maxHealth;
        G.save.autosave();
        G.hud.notify('You slept for 6 hours. Game saved.', 3);
        break;
      case 'fuel':
        if (P.vehicle) {
          if (G.money < 200) { G.hud.notify('Not enough money.', 2); return; }
          G.money -= 200; P.vehicle.hp = P.vehicle.def.hp; P.vehicle.burning = 0; G.hud.notify('Vehicle repaired.', 2); G.audio.ui('buy');
        } else {
          if (G.money < 15) return;
          G.money -= 15; c.health = Math.min(c.maxHealth, c.health + 50); G.hud.notify('Mmh, Currywurst mit Pommes! +50 health', 2); G.audio.ui('buy');
        }
        break;
    }
  }
}
