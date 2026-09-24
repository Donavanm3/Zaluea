// Story missions, taxi fares and Autobahn races, built from reusable steps.
import * as THREE from 'three';
import { G } from './game.js';
import { CITY_BY_ID, REAL_KM_PER_M } from './geo.js';
import { randomLook } from './models.js';
import { rand, pick, formatMoney } from './util.js';

const CONTACTS = {
  hans: { name: 'Onkel Hans', color: '#f2c200', letter: 'H' },
  kalle: { name: 'Kalle', color: '#f2c200', letter: 'K' },
  svetlana: { name: 'Svetlana', color: '#f2c200', letter: 'S' },
  richter: { name: 'Dr. Richter', color: '#f2c200', letter: 'R' },
  sepp: { name: 'Sepp', color: '#f2c200', letter: 'B' },
};

// ---------- helpers ----------
function roadSpot(x, z, pull = 5.5) {
  const net = G.world.roads;
  const n = net.nearestOnRoad(x, z, 200);
  if (!n) return { x, z, y: G.physics.groundAt(x, z), heading: 0 };
  const p = net.pointAt(n.edge, n.s);
  const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz) || 1;
  const k = Math.min(pull, l);
  const sx = p.x + (dx / l) * k, sz = p.z + (dz / l) * k;
  return { x: sx, z: sz, y: G.physics.groundAt(sx, sz, p.y + 2), heading: Math.atan2(p.tx, p.tz), road: p };
}
function laneSpot(x, z) {
  const net = G.world.roads;
  const n = net.nearestOnRoad(x, z, 250);
  const p = net.pointAt(n.edge, n.s);
  const off = n.edge.type === 'autobahn' ? 6.6 : 2.9;
  return { x: p.x + p.rx * off, z: p.z + p.rz * off, y: p.y, heading: Math.atan2(p.tx, p.tz) };
}
function service(type, city) {
  return G.world.services.find((s) => s.type === type && (!city || s.city === city));
}
function landmark(type, city) {
  return G.world.landmarkSpots.find((l) => l.type === type && (!city || l.city === city));
}
function cityCenterSpot(id) {
  const c = CITY_BY_ID[id];
  return roadSpot(c.x + 12, c.z + 12);
}
function helipad(city) { return G.world.pads.find((p) => p.type === 'helipad' && p.city === city); }

const GUARD_LOOK = () => ({ ...randomLook(), shirt: pick([0x1a1a1a, 0x2a2a2a, 0x3a1a1a]), jacket: pick([0x111111, 0x2a2a2a]), pants: 0x1a1a1a, female: false, hairStyle: pick([0, 2]) });

// ---------- Step factories ----------
const S = {
  talk: (lines) => ({
    kind: 'talk',
    enter(m) { m.data.lines = lines.slice(); m.data.lineT = 0; },
    update(m, dt) {
      m.data.lineT -= dt;
      if (m.data.lineT <= 0) {
        const l = m.data.lines.shift();
        if (!l) return true;
        const who = CONTACTS[l[0]] ? CONTACTS[l[0]].name : l[0];
        const dur = Math.max(2.5, l[1].length * 0.055);
        G.hud.subtitle(l[1], dur, who);
        m.data.lineT = dur;
      }
      if (G.input.pressed('interact') && m.data.lineT > 0.6) m.data.lineT = 0.2;
      return false;
    },
  }),
  call: (who, lines) => ({
    kind: 'call',
    enter(m) { G.audio.ui('phone'); G.hud.notify(`📱 ${CONTACTS[who].name} is calling…`, 2); m.data.wait = 1.2; m.data.sub = S.talk(lines.map((t) => [who, t])); m.data.sub.enter(m); },
    update(m, dt) { if ((m.data.wait -= dt) > 0) return false; return m.data.sub.update(m, dt); },
  }),
  enterVehicle: (text, getVeh) => ({
    kind: 'enterVehicle',
    text,
    enter(m) { if (getVeh) { const v = getVeh(m); m.data.veh = v; m.blip(v, '#39a0ff', 'veh'); } },
    update(m) {
      const pv = G.player.vehicle;
      if (!pv) return false;
      if (getVeh && pv !== m.data.veh) return false;
      return true;
    },
    exit(m) { m.unblip('veh'); },
  }),
  goto: (text, getTarget, opts = {}) => ({
    kind: 'goto',
    text,
    enter(m) {
      const t = getTarget(m);
      m.data.target = t;
      m.data.mk = G.hud.addMarker(t.x, t.y, t.z, { r: opts.radius ? Math.min(opts.radius, 4) : 2.2, color: 0xf2c200 });
      m.gpsTarget = t;
      if (opts.time) m.timer = opts.time === 'auto' ? m.autoTime(t) : opts.time;
    },
    update(m) {
      const t = m.data.target;
      const P = G.player;
      if (opts.vehicle === 'require' && !P.vehicle) { G.hud.objective(text + '<br><small>Get back in a vehicle!</small>'); return false; }
      if (opts.veh && P.vehicle !== m.data[opts.veh]) {
        G.hud.objective(`${text}<br><small>Get back in the ${m.data[opts.veh] ? m.data[opts.veh].def.name : 'vehicle'}!</small>`);
        return false;
      }
      G.hud.objective(text);
      const d = Math.hypot(t.x - P.pos.x, t.z - P.pos.z);
      if (d < (opts.radius || 4) && Math.abs(P.pos.y - t.y) < 6) {
        if (opts.stop && P.vehicle && Math.abs(P.vehicle.speed) > 3) { G.hud.objective(text + '<br><small>Stop the vehicle!</small>'); return false; }
        return true;
      }
      return false;
    },
    exit(m) { G.hud.removeMarker(m.data.mk); m.gpsTarget = null; m.timer = null; },
  }),
  kill: (text, spawn) => ({
    kind: 'kill',
    text,
    enter(m) { m.data.targets = spawn(m); m.data.total = m.data.targets.length; },
    update(m) {
      const left = m.data.targets.filter((t) => (t.alive !== undefined ? t.alive : !t.dead)).length;
      G.hud.objective(`${text} <b>(${m.data.total - left}/${m.data.total})</b>`);
      const alive = m.data.targets.find((t) => (t.alive !== undefined ? t.alive : !t.dead));
      m.gpsTarget = alive ? { x: alive.pos.x, z: alive.pos.z, y: alive.pos.y } : null;
      return left === 0;
    },
    exit(m) { m.gpsTarget = null; },
  }),
  loseWanted: (text, level) => ({
    kind: 'loseWanted',
    text,
    enter() { if (level) G.police.setLevel(level); },
    update() { G.hud.objective(text); return G.police.level === 0; },
  }),
  survive: (text, getZone, secs) => ({
    kind: 'survive',
    text,
    enter(m) {
      const z = getZone(m);
      m.data.zone = z; m.data.t = secs;
      m.data.mk = G.hud.addMarker(z.x, z.y, z.z, { r: z.r, color: 0x40c0ff, h: 3 });
      m.gpsTarget = z;
    },
    update(m, dt) {
      const z = m.data.zone, P = G.player.pos;
      const inside = Math.hypot(z.x - P.x, z.z - P.z) < z.r + 1;
      if (inside) m.data.t -= dt;
      G.hud.objective(`${text}${inside ? '' : '<br><small>Get back in the zone!</small>'}`);
      G.hud.counter(`${Math.ceil(Math.max(0, m.data.t))} s`);
      return m.data.t <= 0;
    },
    exit(m) { G.hud.removeMarker(m.data.mk); G.hud.counter(null); m.gpsTarget = null; },
  }),
  checkpoints: (text, getPoints, opts = {}) => ({
    kind: 'checkpoints',
    text,
    enter(m) {
      m.data.cps = getPoints(m);
      m.data.ci = 0;
      m.data.total = m.data.cps.length;
      m.timer = opts.time ? opts.time(m) : null;
      m.data.cpMk = null;
      m.data.start = G.time;
    },
    update(m) {
      if (opts.vehicle && !G.player.vehicle) { G.hud.objective(text + '<br><small>Get in a vehicle!</small>'); return false; }
      const cp = m.data.cps[m.data.ci];
      if (!m.data.cpMk) { m.data.cpMk = G.hud.addMarker(cp.x, cp.y, cp.z, { r: 7, color: 0xf2c200, checkpoint: true }); m.gpsTarget = cp; }
      G.hud.objective(`${text} <b>${m.data.ci}/${m.data.total}</b>`);
      const P = G.player.pos;
      if (Math.hypot(cp.x - P.x, cp.z - P.z) < 12) {
        G.audio.ui('checkpoint');
        G.hud.removeMarker(m.data.cpMk); m.data.cpMk = null;
        m.data.ci++;
        if (m.timer !== null && opts.bonus) m.timer += opts.bonus;
        if (m.data.ci >= m.data.total) { m.data.raceTime = G.time - m.data.start; return true; }
      }
      return false;
    },
    exit(m) { if (m.data.cpMk) G.hud.removeMarker(m.data.cpMk); m.gpsTarget = null; m.timer = null; },
  }),
  action: (fn) => ({
    kind: 'action', enter(m) { fn(m); }, update() { return true; } }),
  wait: (secs) => ({
    kind: 'wait', enter(m) { m.data.w = secs; }, update(m, dt) { return (m.data.w -= dt) <= 0; } }),
  custom: (text, enter, update, exit) => ({
    kind: 'custom', text, enter, update, exit }),
};

// ---------- Story ----------
function hansSpot() {
  const l = landmark('elbphilharmonie', 'hamburg');
  return l ? roadSpot(l.x, l.z + 25) : cityCenterSpot('hamburg');
}
function harborCenter() {
  const g = G.world.roads.grids.hamburg;
  const hb = g.blocks.filter((b) => b.type === 'harbor');
  const b = hb[Math.floor(hb.length / 2)] || g.blocks[0];
  return { x: b.cx, z: b.cz, y: G.physics.groundAt(b.cx, b.cz), blocks: hb };
}

function spawnGuards(m, center, n, weapons, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), r = rand(opts.rmin || 4, opts.rmax || 14);
    const tmp = { x: center.x + Math.cos(a) * r, y: 0, z: center.z + Math.sin(a) * r };
    tmp.y = G.physics.groundAt(tmp.x, tmp.z, (center.y || 0) + 3);
    G.physics.collideCircle(tmp, 0.6, 1.8, 0.4);
    const g = m.spawnEnemy(tmp.x, tmp.z, pick(weapons), opts);
    out.push(g);
  }
  return out;
}

export const STORY = [
  {
    id: 'neuanfang', title: 'Neuanfang', subtitle: 'A Fresh Start', contact: 'hans', city: 'hamburg', reward: 500,
    start: () => { const s = service('safehouse', 'hamburg'); return s ? { x: s.x + 8, y: s.y, z: s.z } : cityCenterSpot('hamburg'); },
    steps: () => [
      S.talk([['hans', 'Luka! Four years in Santa Fu and you still look like trouble. Welcome back to Hamburg, mein Junge.'], ['hans', 'I have work for you. But first you need wheels. Any car will do — nobody walks in this business.']]),
      S.enterVehicle('Steal a car. <small>Walk up to one and press <b>F</b>.</small>'),
      S.talk([['hans', 'Good. Now come see me at the harbour, by the Elbphilharmonie. The GPS will show you the way.']]),
      S.goto('Drive to <b>Onkel Hans</b> at the harbour.', () => hansSpot(), { radius: 7 }),
      S.talk([['hans', 'Here. A P9 and a few magazines. Hamburg has changed while you were inside.'], ['hans', 'Hold the right mouse button to aim, left to shoot. Now go and get some rest.']]),
      S.action(() => G.player.giveWeapon('pistol', 60)),
    ],
  },
  {
    id: 'hafenratten', title: 'Hafenratten', subtitle: 'Harbour Rats', contact: 'hans', city: 'hamburg', reward: 2500,
    start: () => hansSpot(),
    steps: () => [
      S.talk([['hans', 'Russians. Smuggling through MY container terminal on the south bank.'], ['hans', 'Their boss calls himself "Der Graf". Send him a message he will understand.']]),
      S.goto('Go to the <b>container terminal</b>.', () => { const h = harborCenter(); return { ...h, y: h.y }; }, { radius: 30 }),
      S.kill('Kill the smugglers', (m) => { const h = harborCenter(); return spawnGuards(m, h, 6, ['pistol', 'pistol', 'smg'], { rmin: 6, rmax: 30, fight: true }); }),
      S.talk([['hans', 'Ha! The fish will eat well tonight. Come back when you are ready for real money.']]),
    ],
  },
  {
    id: 'kurier', title: 'Kurierfahrt', subtitle: 'Special Delivery to Bremen', contact: 'hans', city: 'hamburg', reward: 3000,
    start: () => hansSpot(),
    steps: () => [
      S.talk([['hans', 'A friend in Bremen needs this van. Do not ask what is inside and do NOT scratch it.'], ['hans', 'The A1 goes straight there. You have got limited time.']]),
      S.enterVehicle('Get in the <b>van</b>.', (m) => {
        const h = hansSpot();
        const s = laneSpot(h.x + 10, h.z);
        const v = m.spawnVehicle('transporter', s.x, s.y, s.z, s.heading, 0x2a4a8a);
        m.data.van = v;
        m.failIf(() => v.dead, 'The van was destroyed.');
        return v;
      }),
      S.goto('Deliver the van to <b>Bremen</b>.', () => { const c = CITY_BY_ID.bremen; return roadSpot(c.x - 20, c.z + 20); }, { radius: 7, veh: 'van', time: 'auto', stop: true }),
      S.talk([['Bremer Kontakt', 'Hans sends his regards? Gut. Leave the van, here is your money.']]),
      S.action((m) => { if (G.player.vehicle === m.data.van) G.player.exitVehicle(); m.data.van.locked = true; }),
      S.call('hans', ['Kalle in Hannover runs street races on the Autobahn. He wants to meet the new driver in town.']),
    ],
  },
  {
    id: 'rennen', title: 'Nordlicht-Rennen', subtitle: 'Autobahn Race to Berlin', contact: 'kalle', city: 'hannover', reward: 5000,
    start: () => cityCenterSpot('hannover'),
    steps: () => [
      S.talk([['kalle', 'So you are Hans\'s driver? No speed limit on the A2, Kumpel. Hannover to Berlin, beat my record.'], ['kalle', 'Take the Falke. Hit every checkpoint before the clock runs out.']]),
      S.enterVehicle('Get in the <b>Falke GT</b>.', (m) => {
        const c = CITY_BY_ID.hannover;
        const s = laneSpot(c.x + 30, c.z + 18);
        const v = m.spawnVehicle('falke', s.x, s.y, s.z, s.heading, 0xd01c1c);
        return v;
      }),
      S.checkpoints('Race to Berlin! Checkpoints', () => raceCheckpoints(['hannover', 'magdeburg', 'berlin'], 160), { vehicle: true, time: (m) => Math.round(m.routeLen / 34 + 18), bonus: 0 }),
      S.talk([['kalle', 'Unglaublich! You are the fastest thing on the A2. Svetlana in Berlin will want to meet you.']]),
    ],
  },
  {
    id: 'clubnacht', title: 'Clubnacht', subtitle: 'Club Night', contact: 'svetlana', city: 'berlin', reward: 4000,
    start: () => { const s = service('club', 'berlin'); return s ? { x: s.x, y: s.y, z: s.z - 1 } : cityCenterSpot('berlin'); },
    steps: () => [
      S.talk([['svetlana', 'Hans says you can drive. A famous DJ is waiting at the Brandenburger Tor.'], ['svetlana', 'Bring him to my club. The paparazzi must not follow you.']]),
      S.goto('Pick up the DJ at the <b>Brandenburger Tor</b>.', (m) => {
        const l = landmark('brandenburg', 'berlin');
        const s = roadSpot(l.x, l.z - 24, 6);
        const vip = m.spawnPed({ ...randomLook(), shirt: 0xff4fd8, jacket: 0x111111, female: false }, s.x, s.z, 'vip');
        vip.ai.blip = '#39a0ff';
        m.data.vip = vip;
        m.failIf(() => !vip.alive && !m.data.vipIn, 'The DJ died.');
        return s;
      }, { radius: 9, vehicle: 'require', stop: true }),
      S.custom('Stop next to the DJ.', (m) => {}, (m) => {
        const v = G.player.vehicle, vip = m.data.vip;
        if (!v) return false;
        if (Math.hypot(v.pos.x - vip.pos.x, v.pos.z - vip.pos.z) < 8 && Math.abs(v.speed) < 2) { m.data.vipIn = true; G.peds.remove(vip); return true; }
        return false;
      }),
      S.talk([['DJ Kraftwerk', 'Yo, thanks man. Uh… is that a camera flash behind us?']]),
      S.loseWanted('The paparazzi called the police! <b>Lose the cops.</b>', 2),
      S.goto('Take the DJ to <b>Svetlana\'s club</b>.', () => { const s = service('club', 'berlin'); return { x: s.x, y: s.y, z: s.z - 3 }; }, { radius: 7, vehicle: 'require' }),
      S.talk([['svetlana', 'Perfect. Berlin loves you already, Luka.']]),
    ],
  },
  {
    id: 'mauerfall', title: 'Mauerfall', subtitle: 'Bring Down the Wall', contact: 'svetlana', city: 'berlin', reward: 5000,
    start: () => { const s = service('club', 'berlin'); return { x: s.x, y: s.y, z: s.z - 1 }; },
    steps: () => [
      S.talk([['svetlana', 'Der Graf\'s men parked three cars full of cash around Berlin.'], ['svetlana', 'Here — a Panzerfaust and grenades. Make it loud.']]),
      S.action(() => { G.player.giveWeapon('rpg', 5); G.player.giveWeapon('grenade', 5); G.hud.notify('Received: Panzerfaust + Handgranaten (keys 6 / 7)', 4); }),
      S.kill('Destroy Der Graf\'s cars', (m) => {
        const c = CITY_BY_ID.berlin;
        const out = [];
        const offs = [[-180, -120], [160, -90], [60, 190]];
        for (const [ox, oz] of offs) {
          const s = laneSpot(c.x + ox, c.z + oz);
          const v = m.spawnVehicle('falke', s.x, s.y, s.z, s.heading, 0x111111);
          v.locked = true;
          v.parked = true;
          m.blip(v, '#ff3030');
          spawnGuards(m, s, 2, ['pistol', 'smg'], { rmin: 4, rmax: 7 });
          out.push(v);
        }
        return out;
      }),
      S.call('svetlana', ['Boom! The whole of Kreuzberg heard that. A banker in Frankfurt has been asking about you — Dr. Richter.']),
    ],
  },
  {
    id: 'bankjob', title: 'Der Bankjob', subtitle: 'The Frankfurt Heist', contact: 'richter', city: 'frankfurt', reward: 15000,
    start: () => { const e = landmark('euro', 'frankfurt'); return e ? roadSpot(e.x, e.z - 24) : cityCenterSpot('frankfurt'); },
    steps: () => [
      S.talk([['richter', 'Herr Kaiser. The Europa Bank tower keeps Der Graf\'s money in its vault.'], ['richter', 'I disabled the silent alarm — the loud one, unfortunately, still works. Take this armour and the MP.']]),
      S.action(() => { G.player.giveWeapon('smg', 150); G.player.char.armor = 100; }),
      S.goto('Go to the <b>Europa Bank</b>.', () => { const s = service('bank', 'frankfurt'); return { x: s.x, y: s.y, z: s.z }; }, { radius: 4 }),
      S.survive('Crack the vault — <b>stay in the zone</b>.', () => { const s = service('bank', 'frankfurt'); G.police.setLevel(3); return { x: s.x, y: s.y, z: s.z, r: 7 }; }, 25),
      S.talk([['richter', 'The vault is open! Now get out of Frankfurt before the SEK arrives.']]),
      S.loseWanted('Escape and <b>lose the police</b>.'),
    ],
  },
  {
    id: 'weisswurst', title: 'Weißwurst-Connection', subtitle: 'The Beer Baron', contact: 'sepp', city: 'muenchen', reward: 8000,
    start: () => { const s = service('safehouse', 'muenchen'); return s ? { x: s.x + 8, y: s.y, z: s.z } : cityCenterSpot('muenchen'); },
    steps: () => [
      S.talk([['sepp', 'Servus! Richter told me about you. A Prussian is trying to take over my beer halls.'], ['sepp', 'He is meeting his bodyguards at the stadium in the north. Make sure he never drinks another Maß.']]),
      S.goto('Go to the <b>stadium</b>.', () => { const a = landmark('arena', 'muenchen'); return roadSpot(a.x, a.z + 30); }, { radius: 25 }),
      S.kill('Kill the Prussian and his bodyguards', (m) => {
        const a = landmark('arena', 'muenchen');
        const s = roadSpot(a.x, a.z + 28);
        const boss = m.spawnEnemy(s.x, s.z, 'shotgun', { boss: true, look: { ...randomLook(), jacket: 0x5a1a1a, shirt: 0xffffff, female: false } });
        boss.health = 220;
        return [boss, ...spawnGuards(m, s, 5, ['pistol', 'smg', 'rifle'], { rmin: 5, rmax: 16 })];
      }),
      S.call('sepp', ['Wunderbar! Now for the real job. Come back to me when you are ready.']),
    ],
  },
  {
    id: 'schloss', title: 'Märchenschloss', subtitle: 'The Fairy-Tale Castle', contact: 'sepp', city: 'muenchen', reward: 10000,
    start: () => { const s = service('safehouse', 'muenchen'); return { x: s.x + 8, y: s.y, z: s.z }; },
    steps: () => [
      S.talk([['sepp', 'King Ludwig\'s lost painting is hidden in Neuschwanstein. Der Graf\'s men are guarding it.'], ['sepp', 'Drive south to the Alps, take the painting and bring it back here.']]),
      S.goto('Drive to <b>Schloss Neuschwanstein</b>.', () => { const p = G.world.pads.find((q) => q.type === 'neuschwanstein'); return { x: p.x, y: p.y, z: p.z + 22 }; }, { radius: 40 }),
      S.kill('Clear the castle guards', (m) => { const p = G.world.pads.find((q) => q.type === 'neuschwanstein'); return spawnGuards(m, { x: p.x, y: p.y, z: p.z + 22 }, 6, ['rifle', 'smg', 'shotgun'], { rmin: 6, rmax: 18 }); }),
      S.goto('Grab the <b>painting</b>.', () => { const p = G.world.pads.find((q) => q.type === 'neuschwanstein'); return { x: p.x + 8, y: p.y, z: p.z + 18 }; }, { radius: 2.5 }),
      S.action(() => { G.hud.notify('You took King Ludwig\'s painting!', 3); G.police.setLevel(2); }),
      S.goto('Bring the painting to <b>Sepp in München</b>.', () => { const s = service('safehouse', 'muenchen'); return { x: s.x + 8, y: s.y, z: s.z }; }, { radius: 6, time: 'auto' }),
      S.call('svetlana', ['Luka… Der Graf knows who you are. He is at the Fernsehturm in Berlin. End this.']),
    ],
  },
  {
    id: 'finale', title: 'Der Fernsehturm', subtitle: 'Finale', contact: 'svetlana', city: 'berlin', reward: 50000,
    start: () => { const s = service('club', 'berlin'); return { x: s.x, y: s.y, z: s.z - 1 }; },
    steps: () => [
      S.talk([['svetlana', 'Der Graf put you in prison four years ago. Tonight he is at the Fernsehturm with his whole army.'], ['svetlana', 'Take this rifle. For Hans. For all of us.']]),
      S.action(() => { G.player.giveWeapon('rifle', 240); G.player.char.armor = 100; G.player.char.health = G.player.char.maxHealth; }),
      S.goto('Go to the <b>Fernsehturm</b>.', () => { const f = landmark('fernsehturm', 'berlin'); return roadSpot(f.x, f.z + 26); }, { radius: 35 }),
      S.kill('Kill <b>Der Graf</b> and his men', (m) => {
        const f = landmark('fernsehturm', 'berlin');
        const s = roadSpot(f.x, f.z + 24);
        const boss = m.spawnEnemy(s.x, s.z, 'rifle', { boss: true, look: { ...randomLook(), jacket: 0xf2f2f2, shirt: 0x111111, hair: 0xaaaaaa, female: false } });
        boss.health = 350; boss.armor = 100;
        return [boss, ...spawnGuards(m, s, 9, ['smg', 'rifle', 'shotgun', 'pistol'], { rmin: 6, rmax: 28 })];
      }),
      S.talk([['svetlana', 'It is over, Luka. Now get out of there — the whole Bundespolizei is coming!']]),
      S.loseWanted('Escape! <b>Lose the police.</b>', 4),
      S.action(() => {
        G.hud.bigMessage('THE END', '#f2c200', 'Autobahn Outlaws — thanks for playing! Free roam continues.', 8);
        G.flags.finished = true;
      }),
    ],
  },
];

function raceCheckpoints(cityIds, spacing) {
  const net = G.world.roads;
  const pts = [];
  for (let i = 0; i < cityIds.length - 1; i++) {
    const e = net.edges.find((q) => q.type !== 'city' && ((q.from === cityIds[i] && q.to === cityIds[i + 1]) || (q.to === cityIds[i] && q.from === cityIds[i + 1])));
    if (!e) continue;
    const fwd = e.from === cityIds[i];
    for (let s = 60; s < e.len - 20; s += spacing) {
      const p = net.pointAt(e, fwd ? s : e.len - s);
      const lane = fwd ? 4.5 : -4.5;
      pts.push({ x: p.x + p.rx * lane, y: p.y, z: p.z + p.rz * lane });
    }
    const end = net.pointAt(e, fwd ? e.len - 12 : 12);
    pts.push({ x: end.x, y: end.y, z: end.z });
  }
  return pts;
}

// Repeatable Autobahn races
const RACES = [
  { id: 'r_a7', name: 'A7 Nordsprint', cities: ['kiel', 'hamburg', 'hannover'], reward: 2500 },
  { id: 'r_a9', name: 'A9 Leipzig–Berlin', cities: ['leipzig', 'berlin'], reward: 2000 },
  { id: 'r_a8', name: 'A8 Alpenrennen', cities: ['stuttgart', 'ulm', 'augsburg', 'muenchen'], reward: 3500 },
  { id: 'r_a3', name: 'A3 Domstadt-Rallye', cities: ['koeln', 'koblenz', 'frankfurt'], reward: 3000 },
];

export class Missions {
  get gpsTarget() {
    if (this.active) return this.active.gpsTarget || null;
    if (this.taxi) return this.taxiTarget || null;
    return null;
  }

  constructor() {
    this.progress = 0;
    this.active = null;
    this.taxiTarget = null;
    this.startMarker = null;
    this.raceMarkers = [];
    this.bestTimes = {};
    this.taxi = null;
    this.cooldown = 0;
  }

  init(progress, bestTimes) {
    this.progress = progress || 0;
    this.bestTimes = bestTimes || {};
    this.placeStartMarker();
    for (const r of RACES) {
      const c = CITY_BY_ID[r.cities[0]];
      const e = G.world.roads.edges.find((q) => q.type !== 'city' && ((q.from === r.cities[0] && q.to === r.cities[1]) || (q.to === r.cities[0] && q.from === r.cities[1])));
      if (!e) continue;
      const fwd = e.from === r.cities[0];
      const p = G.world.roads.pointAt(e, fwd ? 30 : e.len - 30);
      const mk = G.hud.addMarker(p.x + p.rx * (fwd ? 4.5 : -4.5), p.y, p.z + p.rz * (fwd ? 4.5 : -4.5), { r: 3.5, color: 0x40c0ff });
      this.raceMarkers.push({ race: r, mk, x: mk.x, z: mk.z, y: mk.y });
      void c;
    }
  }

  placeStartMarker() {
    if (this.startMarker) { G.hud.removeMarker(this.startMarker.mk); this.startMarker = null; }
    const def = STORY[this.progress];
    if (!def) return;
    const s = def.start();
    this.startMarker = { def, x: s.x, y: s.y, z: s.z, mk: G.hud.addMarker(s.x, s.y, s.z, { r: 1.6, color: 0xf2c200 }) };
  }

  blips() {
    const out = [];
    if (!this.active && this.startMarker) {
      const c = CONTACTS[this.startMarker.def.contact];
      out.push({ x: this.startMarker.x, z: this.startMarker.z, color: '#f2c200', text: c.letter, always: true, label: this.startMarker.def.title });
    }
    if (!this.active) for (const r of this.raceMarkers) out.push({ x: r.x, z: r.z, color: '#40c0ff', text: '🏁', label: r.race.name });
    if (this.active) {
      if (this.gpsTarget) out.push({ x: this.gpsTarget.x, z: this.gpsTarget.z, color: '#f2c200', size: 6, always: true });
      for (const b of this.active.blipList) {
        const e = b.ent;
        if (e.dead || e.alive === false) continue;
        out.push({ x: e.pos.x, z: e.pos.z, color: b.color, size: 5, always: b.always });
      }
    }
    if (this.taxi && this.taxi.target) out.push({ x: this.taxi.target.x, z: this.taxi.target.z, color: '#f2c200', size: 6, always: true });
    return out;
  }

  autoTime(t) {
    const P = G.player.pos;
    const net = G.world.roads;
    const a = net.nearestNode(P.x, P.z), b = net.nearestNode(t.x, t.z);
    const path = a && b ? net.findPath(a.id, b.id) : null;
    let L = Math.hypot(t.x - P.x, t.z - P.z);
    if (path) {
      const pts = net.pathPoints(path);
      L = 0;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    return Math.round(L / 20 + 25);
  }

  // --------- mission lifecycle ---------
  start(def, isRace = false) {
    if (this.taxi) this.toggleTaxi();
    const m = {
      def, isRace, stepIdx: -1, steps: def.steps(), data: {}, ents: [], vehs: [], blipList: [], fails: [], timer: null, gpsTarget: null,
      spawnVehicle: (type, x, y, z, h, color) => {
        const v = G.vehicles.spawn(type, x, y, z, h, color);
        v.persist = true; v.mission = true;
        m.vehs.push(v);
        return v;
      },
      spawnEnemy: (x, z, weapon, opts = {}) => {
        const y = G.physics.groundAt(x, z, 200);
        const c = G.peds.spawnAt(x, y, z, opts.look || GUARD_LOOK(), 'guard', weapon);
        c.ai.persist = true;
        c.ai.state = opts.fight ? 'fight' : 'idle';
        c.ai.target = G.player.char;
        c.ai.timer = 999;
        c.ai.accuracy = opts.boss ? 0.6 : 0.4;
        c.ai.blip = '#ff3030';
        c.ai.blipAlways = !!opts.boss;
        c.ai.guardAggro = 28;
        c.ai.dropMoney = opts.boss ? 1000 : 60;
        m.ents.push(c);
        return c;
      },
      spawnPed: (look, x, z, role) => {
        const y = G.physics.groundAt(x, z, 200);
        const c = G.peds.spawnAt(x, y, z, look, role);
        c.ai.persist = true; c.ai.state = 'idle';
        m.ents.push(c);
        return c;
      },
      blip: (ent, color, key) => { m.blipList.push({ ent, color, key }); },
      unblip: (key) => { m.blipList = m.blipList.filter((b) => b.key !== key); },
      failIf: (fn, reason) => m.fails.push({ fn, reason }),
      autoTime: (t) => this.autoTime(t),
      routeLen: 0,
    };
    if (isRace || def.id === 'rennen') {
      const pts = raceCheckpoints(def.cities || ['hannover', 'magdeburg', 'berlin'], 160);
      let L = 0;
      for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      m.routeLen = L;
    }
    this.active = m;
    if (this.startMarker) { G.hud.removeMarker(this.startMarker.mk); this.startMarker = null; }
    G.hud.bigMessage(def.title.toUpperCase(), '#f2c200', def.subtitle, 3);
    this.nextStep();
  }

  nextStep() {
    const m = this.active;
    if (!m) return;
    const cur = m.steps[m.stepIdx];
    if (cur && cur.exit) cur.exit(m);
    m.stepIdx++;
    m.data.lineT = 0;
    const st = m.steps[m.stepIdx];
    if (!st) { this.pass(); return; }
    if (st.enter) st.enter(m);
    G.hud.objective(st.text || '');
  }

  pass() {
    const m = this.active;
    if (!m) return;
    const def = m.def;
    let reward = def.reward;
    if (m.isRace) {
      const t = m.data.raceTime;
      const best = this.bestTimes[def.id];
      const first = !best;
      if (!best || t < best) this.bestTimes[def.id] = t;
      reward = first ? def.reward * 2 : def.reward;
      G.hud.bigMessage('RACE WON', '#40c0ff', `Time ${t.toFixed(1)} s${best ? ` · Best ${Math.min(best, t).toFixed(1)} s` : ''} · +${formatMoney(reward)}`, 5);
    } else {
      G.hud.bigMessage('MISSION PASSED', '#f2c200', `${def.title} · +${formatMoney(reward)}`, 5);
      this.progress++;
      G.stats.missions++;
    }
    G.money += reward;
    G.audio.ui('pass');
    this.cleanup(false);
    this.placeStartMarker();
    if (G.save) G.save.autosave();
  }

  fail(reason) {
    if (!this.active) {
      if (this.taxi) { this.taxi = null; G.hud.objective(''); }
      return;
    }
    if (G.player.dead || G.player.busted) G.hud.notify('Mission failed: ' + (reason || ''), 5);
    else G.hud.bigMessage('MISSION FAILED', '#c0392b', reason || '', 4);
    G.audio.ui('fail');
    this.cleanup(true);
    this.placeStartMarker();
  }

  cleanup(failed) {
    const m = this.active;
    if (!m) return;
    const cur = m.steps[m.stepIdx];
    if (cur && cur.exit) cur.exit(m);
    for (const e of m.ents) { e.ai.persist = false; e.ai.blip = null; if (e.ai.role === 'vip' && e.alive) e.ai.role = 'civ'; }
    for (const v of m.vehs) { v.persist = v === G.player.vehicle; v.mission = false; v.locked = false; }
    G.hud.objective('');
    G.hud.timer(null);
    G.hud.counter(null);
    this.active = null;
    this.cooldown = 3;
  }

  // --------- taxi side job ---------
  toggleTaxi() {
    if (this.taxi) {
      if (this.taxi.passenger && this.taxi.passenger.alive) G.peds.remove(this.taxi.passenger);
      if (this.taxi.mk) G.hud.removeMarker(this.taxi.mk);
      this.taxi = null;
      this.taxiTarget = null;
      G.hud.objective('');
      G.hud.timer(null);
      G.hud.notify('Taxi job ended.', 2);
      return;
    }
    if (this.active) return;
    this.taxi = { stage: 'find', fares: 0, earned: 0 };
    this.newFare();
  }

  newFare() {
    const T = this.taxi;
    const P = G.player.pos;
    let city = G.hud.currentCity;
    const grid = city ? G.world.roads.grids[city.id] : null;
    let spot;
    if (grid) {
      const bl = grid.blocks.filter((b) => !b.removed && Math.hypot(b.cx - P.x, b.cz - P.z) > 40 && Math.hypot(b.cx - P.x, b.cz - P.z) < 160);
      const b = pick(bl.length ? bl : grid.blocks);
      spot = roadSpot(b.cx, b.minZ - 1, 6);
    } else spot = roadSpot(P.x + rand(-80, 80), P.z + rand(-80, 80));
    const ped = G.peds.spawnAt(spot.x, spot.y, spot.z, randomLook(), 'vip');
    ped.ai.persist = true; ped.ai.state = 'idle'; ped.ai.blip = '#39a0ff'; ped.ai.blipAlways = true;
    T.passenger = ped;
    T.stage = 'pickup';
    T.target = spot;
    G.hud.objective('Taxi: pick up the <b>passenger</b> (blue).');
  }

  updateTaxi(dt) {
    const T = this.taxi;
    const v = G.player.vehicle;
    if (!v || !v.def.taxi) { G.hud.objective('Taxi: get back in your taxi!'); T.away = (T.away || 0) + dt; if (T.away > 15) this.toggleTaxi(); return; }
    T.away = 0;
    if (T.stage === 'pickup') {
      const p = T.passenger;
      if (!p || !p.alive) { this.newFare(); return; }
      T.target = { x: p.pos.x, z: p.pos.z, y: p.pos.y };
      if (Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < 8 && Math.abs(v.speed) < 2) {
        G.peds.remove(p);
        T.passenger = null;
        // destination: another block in this city or next city
        const P = G.player.pos;
        let dest;
        const city = G.hud.currentCity;
        if (city && Math.random() < 0.8) {
          const grid = G.world.roads.grids[city.id];
          const bl = grid.blocks.filter((b) => !b.removed && Math.hypot(b.cx - P.x, b.cz - P.z) > 120);
          const b = pick(bl.length ? bl : grid.blocks);
          dest = roadSpot(b.cx, b.maxZ + 1, 6);
        } else {
          const cities = Object.values(G.world.roads.grids).map((g) => g.city).filter((c) => Math.hypot(c.x - P.x, c.z - P.z) > 300 && Math.hypot(c.x - P.x, c.z - P.z) < 900);
          const c = pick(cities.length ? cities : [CITY_BY_ID.hamburg]);
          dest = roadSpot(c.x, c.z);
        }
        T.dest = dest;
        T.mk = G.hud.addMarker(dest.x, dest.y, dest.z, { r: 3, color: 0xf2c200 });
        T.stage = 'drive';
        T.time = this.autoTime(dest);
        T.dist = Math.hypot(dest.x - P.x, dest.z - P.z);
        G.hud.subtitle(pick(['Zum Hauptbahnhof, bitte! Schnell!', 'Take me there, and step on it!', 'Na los, ich hab\'s eilig!', 'Could you drive like you stole this car?']), 3, 'Fahrgast');
        this.taxiTarget = dest;
      }
      if (T.stage === 'pickup') this.taxiTarget = T.target;
    } else if (T.stage === 'drive') {
      T.time -= dt;
      G.hud.timer(Math.max(0, T.time));
      G.hud.objective(`Taxi: drive the passenger to the <b>destination</b>. Fare #${T.fares + 1}`);
      const d = Math.hypot(v.pos.x - T.dest.x, v.pos.z - T.dest.z);
      if (d < 7 && Math.abs(v.speed) < 3) {
        const pay = Math.round(40 + T.dist * 0.25 + Math.max(0, T.time) * 3);
        G.money += pay;
        T.fares++; T.earned += pay;
        G.audio.ui('money');
        G.hud.moneyPop(pay);
        G.hud.notify(`Fare complete! +€${pay}  (total €${T.earned})`, 3);
        G.hud.removeMarker(T.mk);
        G.hud.timer(null);
        this.taxiTarget = null;
        if (T.fares % 5 === 0) { G.money += 500; G.hud.notify('Bonus for 5 fares: +€500', 3); }
        this.newFare();
      } else if (T.time <= 0) {
        G.hud.notify('Too slow! The passenger jumped out.', 3);
        G.hud.removeMarker(T.mk);
        G.hud.timer(null);
        this.taxiTarget = null;
        this.newFare();
      }
    }
  }

  // --------- per frame ---------
  update(dt) {
    this.cooldown -= dt;
    const P = G.player;
    if (this.taxi && !this.active) this.updateTaxi(dt);
    if (!this.active) {
      if (P.dead || P.busted) return;
      let prompt = null;
      if (this.startMarker && this.cooldown <= 0) {
        const s = this.startMarker;
        if (Math.hypot(s.x - P.pos.x, s.z - P.pos.z) < (P.vehicle ? 5 : 2.5)) {
          prompt = `Press <b>E</b> to start mission: <b>${s.def.title}</b> <small>(${s.def.subtitle})</small>`;
          if (G.input.pressed('interact')) { this.start(s.def); prompt = null; }
        }
      }
      for (const r of this.raceMarkers) {
        if (Math.hypot(r.x - P.pos.x, r.z - P.pos.z) < 6 && this.cooldown <= 0) {
          const best = this.bestTimes[r.race.id];
          prompt = P.vehicle ? `Press <b>E</b> to start race: <b>${r.race.name}</b>${best ? ` · Best: ${best.toFixed(1)} s` : ''}` : `<b>${r.race.name}</b>: you need a vehicle to race.`;
          if (P.vehicle && G.input.pressed('interact')) {
            const race = r.race;
            const def = {
              id: race.id, title: race.name, subtitle: 'Autobahn race', reward: race.reward, cities: race.cities,
              steps: () => [S.checkpoints('Race! Checkpoints', () => raceCheckpoints(race.cities, 150), { vehicle: true, time: (m) => Math.round(m.routeLen / 33 + 15) })],
            };
            this.start(def, true);
            prompt = null;
          }
        }
      }
      G.hud.missionPrompt = prompt;
      return;
    }
    G.hud.missionPrompt = null;
    const m = this.active;
    for (const f of m.fails) if (f.fn()) { this.fail(f.reason); return; }
    if (m.timer !== null && m.timer !== undefined) {
      m.timer -= dt;
      G.hud.timer(Math.max(0, m.timer));
      if (m.timer <= 0) { this.fail('Time ran out.'); return; }
    } else G.hud.timer(null);
    // guards become aggressive when the player is near
    for (const e of m.ents) {
      if (e.alive && e.ai.role === 'guard' && e.ai.state === 'idle' && e.ai.guardAggro) {
        const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
        if (d < e.ai.guardAggro) { e.ai.state = 'fight'; e.ai.target = P.char; }
        else if (!e.ai.lookT || G.time > e.ai.lookT) { e.ai.lookT = G.time + 2; e.heading += rand(-1, 1); }
      }
    }
    const st = m.steps[m.stepIdx];
    if (st && st.update(m, dt)) this.nextStep();
  }
}

export { CONTACTS, RACES };
