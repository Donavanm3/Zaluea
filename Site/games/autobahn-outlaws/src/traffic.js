// AI traffic: lane following on the road graph with smooth corners,
// obstacle awareness, honking, panic and carjack reactions.
import { G } from './game.js';
import { Vehicle } from './vehicle.js';
import { clamp, lerp, lerpAngle, wrapAngle, pick, rand } from './util.js';
import { randomLook } from './models.js';
import { toLonLat } from './geo.js';

const CITY_LANE = 2.9;
const AB_LANES = [2.9, 6.6];

function lanePoints(e, dir, off, fromS = 0) {
  // Returns lane-offset points along edge in travel direction starting at distance fromS.
  const src = e.pts;
  const n = src.length;
  const out = [];
  const idx = (k) => (dir > 0 ? k : n - 1 - k);
  for (let k = 0; k < n; k++) {
    const i = idx(k);
    const sAlong = dir > 0 ? e.cum[i] : e.len - e.cum[i];
    if (sAlong < fromS - 0.01) continue;
    const a = src[idx(Math.max(0, k - 1))], b = src[idx(Math.min(n - 1, k + 1))];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const rx = -tz, rz = tx;
    out.push({ x: src[i].x + rx * off, z: src[i].z + rz * off, y: src[i].y, tx, tz });
  }
  return out;
}

function trimFront(pts, d) {
  // remove the first d metres of a polyline
  let acc = 0;
  while (pts.length > 1) {
    const a = pts[0], b = pts[1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + L > d) {
      const t = (d - acc) / L;
      pts[0] = { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), y: lerp(a.y, b.y, t), tx: b.tx, tz: b.tz };
      return pts;
    }
    acc += L;
    pts.shift();
  }
  return pts;
}
function trimBack(pts, d) {
  pts.reverse();
  trimFront(pts, d);
  pts.reverse();
  return pts;
}

function bezierCorner(p0, d0x, d0z, p2, d2x, d2z) {
  // control point = intersection of the two lane lines
  const den = d0x * d2z - d0z * d2x;
  let cx, cz;
  if (Math.abs(den) < 0.15) { cx = (p0.x + p2.x) / 2; cz = (p0.z + p2.z) / 2; }
  else {
    const t = ((p2.x - p0.x) * d2z - (p2.z - p0.z) * d2x) / den;
    cx = p0.x + d0x * t; cz = p0.z + d0z * t;
  }
  const out = [];
  for (let i = 1; i < 6; i++) {
    const t = i / 6, u = 1 - t;
    out.push({ x: u * u * p0.x + 2 * u * t * cx + t * t * p2.x, z: u * u * p0.z + 2 * u * t * cz + t * t * p2.z, y: lerp(p0.y, p2.y, t) });
  }
  return out;
}

export class TrafficAI {
  constructor(veh, edge, dir, s, lane) {
    this.type = 'traffic';
    this.veh = veh;
    this.edge = edge;
    this.dir = dir;
    this.lane = lane;
    this.route = [];
    this.node = dir > 0 ? edge.b : edge.a; // node at end of current edge
    this.speed = 0;
    this.base = edge.speed * rand(0.85, 1.1) * (lane === 0 && edge.type === 'autobahn' ? 1.15 : 1);
    this.target = this.base;
    this.stuckT = 0;
    this.ignoreT = 0;
    this.honkT = 0;
    this.panic = 0;
    this.driverLook = randomLook();
    this.alive = true;
    const pts = lanePoints(edge, dir, this.laneOffset(edge), s);
    this.route = pts;
    this.lastPts = pts;
    if (pts.length) {
      veh.pos.set(pts[0].x, pts[0].y, pts[0].z);
      veh.heading = Math.atan2(pts[0].tx, pts[0].tz);
    }
    this.extend();
  }

  laneOffset(e) {
    if (e.type === 'autobahn') return AB_LANES[this.lane] || AB_LANES[1];
    if (e.type === 'land') return 2.5;
    return CITY_LANE;
  }

  // Append the next edge's lane with a smooth corner.
  extend() {
    let guard = 0;
    while (this.routeLength() < 60 && guard++ < 4) {
      const net = G.world.roads;
      const node = net.nodes[this.node];
      const options = node.edges.map((id) => net.edges[id]).filter((e) => e !== this.edge);
      let next = options.length ? pick(options) : this.edge;
      // Prefer continuing on autobahns into cities; avoid u-turns unless dead end
      const ndir = next.a === this.node ? 1 : -1;
      if (next.type === 'autobahn' && this.lane > 1) this.lane = 1;
      if (next.type === 'autobahn' && this.edge.type !== 'autobahn') this.lane = Math.random() < 0.5 ? 0 : 1;
      const pts = lanePoints(next, ndir, this.laneOffset(next));
      if (pts.length < 2 || this.route.length < 2) { this.route.push(...pts); this.edge = next; this.dir = ndir; this.node = ndir > 0 ? next.b : next.a; continue; }
      const cut = Math.min(7, next.len * 0.3);
      trimBack(this.route, Math.min(cut, this.routeLength() * 0.3));
      trimFront(pts, cut);
      const p0 = this.route[this.route.length - 1];
      const pr = this.route[this.route.length - 2] || p0;
      let d0x = p0.x - pr.x, d0z = p0.z - pr.z; const l0 = Math.hypot(d0x, d0z) || 1; d0x /= l0; d0z /= l0;
      const p2 = pts[0], p3 = pts[1] || p2;
      let d2x = p3.x - p2.x, d2z = p3.z - p2.z; const l2 = Math.hypot(d2x, d2z) || 1; d2x /= l2; d2z /= l2;
      const corner = bezierCorner(p0, d0x, d0z, p2, d2x, d2z);
      // sharpness for speed planning
      const turn = Math.abs(wrapAngle(Math.atan2(d2x, d2z) - Math.atan2(d0x, d0z)));
      if (turn > 0.4) corner.forEach((c) => (c.slow = true));
      this.route.push(...corner, ...pts);
      this.edge = next;
      this.dir = ndir;
      this.node = ndir > 0 ? next.b : next.a;
    }
  }

  routeLength() {
    let L = 0;
    const r = this.route;
    const v = this.veh;
    if (r.length) L += Math.hypot(r[0].x - v.pos.x, r[0].z - v.pos.z);
    for (let i = 0; i < r.length - 1; i++) L += Math.hypot(r[i + 1].x - r[i].x, r[i + 1].z - r[i].z);
    return L;
  }

  // Look ahead for obstacles; returns clear distance.
  clearance() {
    const v = this.veh;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    let best = 999;
    const look = 10 + this.speed * 1.4;
    const check = (px, pz, halfLen, width) => {
      const dx = px - v.pos.x, dz = pz - v.pos.z;
      const ahead = dx * fx + dz * fz;
      if (ahead <= 0 || ahead > look + halfLen) return;
      const lat = Math.abs(dx * -fz + dz * fx);
      if (lat > width) return;
      const d = ahead - halfLen - v.def.L / 2;
      if (d < best) best = d;
    };
    for (const o of G.vehicles.list) {
      if (o === v || o.dead) continue;
      if (Math.abs(o.pos.x - v.pos.x) > 40 || Math.abs(o.pos.z - v.pos.z) > 40) continue;
      if (o.cls === 'heli' && o.pos.y - v.pos.y > 3) continue;
      // ignore oncoming traffic in the other lane
      const hdiff = Math.abs(wrapAngle(o.heading - v.heading));
      const lateralW = hdiff > 2.2 ? 1.2 : 2.0;
      check(o.pos.x, o.pos.z, o.def.L / 2, lateralW);
    }
    const P = G.player;
    if (!P.vehicle && P.char.alive) check(P.char.pos.x, P.char.pos.z, 0.4, 1.6);
    for (const p of G.peds.list) {
      if (!p.alive) continue;
      if (Math.abs(p.pos.x - v.pos.x) > 25 || Math.abs(p.pos.z - v.pos.z) > 25) continue;
      check(p.pos.x, p.pos.z, 0.4, 1.4);
    }
    return best;
  }

  update(dt) {
    const v = this.veh;
    if (!this.alive || v.dead) return;
    if (v.mode === 'physics') return this.updatePhysics(dt);
    if (this.route.length < 2) { this.extend(); if (this.route.length < 2) return; }
    this.ignoreT -= dt;
    this.honkT -= dt;
    // desired speed
    let target = this.base * (G.sky && G.sky.weather > 0.5 ? 0.85 : 1);
    if (this.panic > 0) { target *= 1.4; this.panic -= dt; }
    // slow for upcoming corners
    let acc = Math.hypot(this.route[0].x - v.pos.x, this.route[0].z - v.pos.z);
    for (let i = 0; i < this.route.length && acc < 22; i++) {
      if (this.route[i].slow) { target = Math.min(target, 6.5 + acc * 0.35); break; }
      if (i < this.route.length - 1) acc += Math.hypot(this.route[i + 1].x - this.route[i].x, this.route[i + 1].z - this.route[i].z);
    }
    if (this.ignoreT <= 0) {
      const clear = this.clearance();
      if (clear < 999) {
        target = Math.min(target, Math.max(0, (clear - 2.2) * 0.9));
        if (clear < 4 && this.speed < 0.5) {
          this.stuckT += dt;
          if (this.stuckT > 1.5 && this.honkT <= 0 && Math.random() < 0.02) { G.audio.npcHorn(v.pos); this.honkT = 3; }
          if (this.stuckT > 7) { this.ignoreT = 2.5; this.stuckT = 0; }
        } else this.stuckT = Math.max(0, this.stuckT - dt);
      }
    }
    const dv = target - this.speed;
    this.speed += clamp(dv, -14 * dt, 3.5 * dt);
    if (this.speed < 0) this.speed = 0;
    // advance along route
    let move = this.speed * dt;
    let hx = 0, hz = 0;
    while (move > 0 && this.route.length) {
      const p = this.route[0];
      const dx = p.x - v.pos.x, dz = p.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      if (d <= move) {
        v.pos.x = p.x; v.pos.z = p.z;
        move -= d;
        this.route.shift();
        if (d > 0.01) { hx = dx; hz = dz; }
      } else {
        v.pos.x += (dx / d) * move; v.pos.z += (dz / d) * move;
        hx = dx; hz = dz;
        move = 0;
      }
    }
    if (hx || hz) v.heading = lerpAngle(v.heading, Math.atan2(hx, hz), Math.min(1, dt * 10));
    v.speed = this.speed;
    v.steerAngle = 0;
    if (this.route.length < 8) this.extend();
  }

  // After a collision the car is simulated; the driver steers back onto the route.
  updatePhysics(dt) {
    const v = this.veh;
    const c = v.ctrl;
    if (!this.route.length) this.extend();
    // pick a look-ahead target
    while (this.route.length > 1 && Math.hypot(this.route[0].x - v.pos.x, this.route[0].z - v.pos.z) < 5) this.route.shift();
    const t = this.route[Math.min(1, this.route.length - 1)] || this.route[0];
    if (!t) return;
    const off = Math.hypot(t.x - v.pos.x, t.z - v.pos.z);
    this.recoverT = (this.recoverT || 0) + dt;
    if (off > 30 || this.recoverT > 25) { c.throttle = 0; c.brake = 1; c.steer = 0; this.alive = false; return; }
    const want = Math.atan2(t.x - v.pos.x, t.z - v.pos.z);
    const err = wrapAngle(want - v.heading);
    c.steer = clamp(-err * 2, -1, 1);
    const tgt = (this.panic > 0 ? this.base * 1.3 : this.base * 0.6) * (Math.abs(err) > 0.8 ? 0.4 : 1);
    c.throttle = v.speed < tgt ? 0.8 : 0;
    c.brake = v.speed > tgt + 3 ? 0.5 : 0;
    c.handbrake = false;
    if (this.panic > 0) this.panic -= dt;
    // Back to kinematic when settled on the lane
    if (off < 6 && Math.abs(err) < 0.25 && v.onGround && v.hp > 300 && this.recoverT > 3) {
      v.mode = 'kinematic';
      this.speed = Math.max(0, v.speed);
      this.recoverT = 0;
    }
  }

  onShot(shooter) {
    this.panic = 10;
    if (this.veh.mode === 'kinematic') this.veh.mode = 'physics';
  }

  onCarjack() {
    // Driver gets out and flees (or fights).
    const v = this.veh;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const x = v.pos.x + fz * (v.def.W / 2 + 0.8), z = v.pos.z - fx * (v.def.W / 2 + 0.8);
    const ped = G.peds.spawnAt(x, v.pos.y, z, this.driverLook);
    if (ped) {
      ped.ai.state = Math.random() < 0.15 ? 'fight' : 'flee';
      ped.ai.threat = G.player.char;
      ped.ai.timer = 8;
    }
    this.alive = false;
  }
}

export class Traffic {
  constructor() {
    this.ais = [];
    this.spawnT = 0;
  }

  max() {
    const q = G.settings.quality;
    return q === 'low' ? 10 : q === 'medium' ? 18 : 26;
  }

  release(v) {
    const i = this.ais.findIndex((a) => a.veh === v);
    if (i >= 0) { this.ais[i].alive = false; this.ais.splice(i, 1); }
  }

  pickType(edge, x, z) {
    const r = Math.random();
    const { lon, lat } = toLonLat(x, z);
    const east = lon > 11.3 && lat > 50.4;
    if (edge.type === 'autobahn') {
      if (r < 0.22) return 'brummi';
      if (r < 0.32) return 'transporter';
      if (r < 0.4) return 'falke';
      if (r < 0.44) return 'blitz';
      if (r < 0.62) return 'adler';
      if (r < 0.78) return 'kombi';
      return 'pendler';
    }
    if (r < 0.05) return 'bus';
    if (r < 0.14) return 'taxi';
    if (r < 0.22) return 'transporter';
    if (r < (east ? 0.34 : 0.25)) return 'rennpappe';
    if (r < 0.3 + (east ? 0.04 : 0)) return 'blitz';
    if (r < 0.32 + (east ? 0.04 : 0)) return 'falke';
    if (r < 0.5) return 'adler';
    if (r < 0.66) return 'kombi';
    return 'pendler';
  }

  spawnNear(center, minD, maxD) {
    const net = G.world.roads;
    // random edge point near the centre
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = Math.random() * Math.PI * 2, d = rand(minD, maxD);
      const x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d;
      const near = net.nearestOnRoad(x, z, 40);
      if (!near) continue;
      const e = near.edge;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const s = dir > 0 ? near.s : e.len - near.s;
      const lane = e.type === 'autobahn' ? (Math.random() < 0.55 ? 1 : 0) : 0;
      const p = net.pointAt(e, near.s);
      // not too close to player or visible directly?
      if (Math.hypot(p.x - center.x, p.z - center.z) < minD * 0.8) continue;
      // check free space
      let blocked = false;
      for (const o of G.vehicles.list) if (Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 12) { blocked = true; break; }
      if (blocked) continue;
      const type = this.pickType(e, p.x, p.z);
      if (type === 'bus' && e.type !== 'city') continue;
      const v = new Vehicle(type, p.x, p.y, p.z, 0);
      v.mode = 'kinematic';
      const ai = new TrafficAI(v, e, dir, s, lane);
      v.ai = ai;
      v.driver = ai;
      v.groundFollow(0.016, true);
      v.sync();
      G.vehicles.add(v);
      this.ais.push(ai);
      return v;
    }
    return null;
  }

  update(dt) {
    const P = G.player.pos;
    this.spawnT -= dt;
    const inCity = G.hud && G.hud.currentCity;
    if (this.spawnT <= 0 && this.ais.length < this.max()) {
      this.spawnT = 0.4;
      const fast = G.player.vehicle && Math.abs(G.player.vehicle.speed) > 25;
      this.spawnNear(P, fast ? 140 : 90, fast ? 320 : (inCity ? 200 : 260));
    }
    for (let i = this.ais.length - 1; i >= 0; i--) {
      const ai = this.ais[i];
      if (ai.alive) ai.update(dt);
      const v = ai.veh;
      const d = Math.hypot(v.pos.x - P.x, v.pos.z - P.z);
      if (!ai.alive || v.dead || d > 420) {
        this.ais.splice(i, 1);
        if (d > 420 && !v.persist) G.vehicles.remove(v);
        else if (v.driver === ai) v.driver = null;
      }
    }
  }
}
