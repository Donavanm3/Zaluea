// Static collision world: axis-aligned boxes, vertical cylinders and bridge decks
// stored in a spatial hash, plus terrain-aware ground and ray queries.
const CELL = 32;
const key = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

export class Physics {
  constructor(terrain) {
    this.terrain = terrain;
    this.cells = new Map();
    this.stamp = 1;
    this.count = 0;
  }

  _insert(o, minX, minZ, maxX, maxZ) {
    const ix0 = Math.floor(minX / CELL), ix1 = Math.floor(maxX / CELL);
    const iz0 = Math.floor(minZ / CELL), iz1 = Math.floor(maxZ / CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = key(ix, iz);
        let arr = this.cells.get(k);
        if (!arr) { arr = []; this.cells.set(k, arr); }
        arr.push(o);
      }
    }
    o._s = 0;
    this.count++;
    return o;
  }

  addBox(minX, minZ, maxX, maxZ, minY, maxY, props = {}) {
    return this._insert({ k: 0, minX, minZ, maxX, maxZ, minY, maxY, ...props }, minX, minZ, maxX, maxZ);
  }
  addCircle(x, z, r, minY, maxY, props = {}) {
    return this._insert({ k: 1, x, z, r, minY, maxY, ...props }, x - r, z - r, x + r, z + r);
  }
  addDeck(ax, az, bx, bz, ya, yb, half) {
    const dx = bx - ax, dz = bz - az;
    return this._insert({ k: 2, ax, az, bx, bz, ya, yb, half, dx, dz, l2: dx * dx + dz * dz || 1 },
      Math.min(ax, bx) - half, Math.min(az, bz) - half, Math.max(ax, bx) + half, Math.max(az, bz) + half);
  }
  remove(o) {
    o.dead = true;
  }

  query(minX, minZ, maxX, maxZ, cb) {
    const s = ++this.stamp;
    const ix0 = Math.floor(minX / CELL), ix1 = Math.floor(maxX / CELL);
    const iz0 = Math.floor(minZ / CELL), iz1 = Math.floor(maxZ / CELL);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const arr = this.cells.get(key(ix, iz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const o = arr[i];
          if (o._s === s || o.dead) continue;
          o._s = s;
          cb(o);
        }
      }
    }
  }

  deckHeight(o, x, z) {
    let t = ((x - o.ax) * o.dx + (z - o.az) * o.dz) / o.l2;
    if (t < -0.02 || t > 1.02) return -Infinity;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = o.ax + o.dx * t - x, cz = o.az + o.dz * t - z;
    if (cx * cx + cz * cz > o.half * o.half) return -Infinity;
    return o.ya + (o.yb - o.ya) * t;
  }

  // Highest walkable surface at (x,z) not above yRef + step.
  groundAt(x, z, yRef = 1e9, step = 0.6) {
    let g = this.terrain.heightAt(x, z);
    const lim = yRef + step;
    const arr = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const o = arr[i];
        if (o.dead) continue;
        let top = -Infinity;
        if (o.k === 0) {
          if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && !o.noWalk) top = o.maxY;
        } else if (o.k === 1) {
          if (!o.noWalk) { const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < o.r * o.r) top = o.maxY; }
        } else {
          top = this.deckHeight(o, x, z);
        }
        if (top > g && top <= lim) g = top;
      }
    }
    return g;
  }

  // Water depth at (x,z). A bridge deck only counts when standing on it (deck top near yRef).
  waterDepth(x, z, yRef = 1e9) {
    const h = this.terrain.heightAt(x, z);
    if (h >= 0) return 0;
    const arr = this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (arr) {
      for (const o of arr) {
        if (o.k !== 2) continue;
        const top = this.deckHeight(o, x, z);
        if (top > -Infinity && top <= yRef + 1.2) return 0;
      }
    }
    return -h;
  }

  // Push a vertical cylinder (feet at y, given height) out of static geometry.
  // Returns accumulated push {x,z} or null.
  collideCircle(p, r, height, step = 0.5, out = { x: 0, z: 0, hit: false, obj: null }) {
    out.x = 0; out.z = 0; out.hit = false; out.obj = null;
    const y0 = p.y + step, y1 = p.y + height;
    this.query(p.x - r, p.z - r, p.x + r, p.z + r, (o) => {
      if (o.k === 2 || o.maxY <= y0 || o.minY >= y1 || o.ghost) return;
      if (o.k === 0) {
        const cx = Math.max(o.minX, Math.min(p.x, o.maxX));
        const cz = Math.max(o.minZ, Math.min(p.z, o.maxZ));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) return;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          dx /= d; dz /= d;
          p.x += dx * push; p.z += dz * push;
          out.x += dx * push; out.z += dz * push;
        } else {
          // centre inside the box: push out along the smallest axis
          const l = p.x - o.minX, rr = o.maxX - p.x, t = p.z - o.minZ, b = o.maxZ - p.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) { p.x = o.minX - r; out.x -= l + r; }
          else if (m === rr) { p.x = o.maxX + r; out.x += rr + r; }
          else if (m === t) { p.z = o.minZ - r; out.z -= t + r; }
          else { p.z = o.maxZ + r; out.z += b + r; }
        }
        out.hit = true; out.obj = o;
      } else {
        let dx = p.x - o.x, dz = p.z - o.z;
        const rr = r + o.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) return;
        const d = Math.sqrt(d2) || 0.001;
        const push = rr - d;
        dx /= d; dz /= d;
        p.x += dx * push; p.z += dz * push;
        out.x += dx * push; out.z += dz * push;
        out.hit = true; out.obj = o;
      }
    });
    return out;
  }

  // Ray against statics and terrain. dir must be normalised.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, hit = {}, opts = {}) {
    let best = maxDist;
    let bobj = null, bnx = 0, bny = 0, bnz = 0;
    const s = ++this.stamp;
    // DDA over cells
    let ix = Math.floor(ox / CELL), iz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tDZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tMX = dx !== 0 ? ((dx > 0 ? (ix + 1) * CELL - ox : ox - ix * CELL) / Math.abs(dx)) : Infinity;
    let tMZ = dz !== 0 ? ((dz > 0 ? (iz + 1) * CELL - oz : oz - iz * CELL) / Math.abs(dz)) : Infinity;
    let tCell = 0;
    for (let guard = 0; guard < 400; guard++) {
      const arr = this.cells.get(key(ix, iz));
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          const o = arr[i];
          if (o._s === s || o.dead || o.k === 2 || (opts.ignore && o === opts.ignore)) continue;
          o._s = s;
          if (o.k === 0) {
            // slab test (unrolled, allocation free)
            let t0 = 0, t1 = best, nx = 0, ny = 0, nz = 0;
            let ok = true;
            if (Math.abs(dx) < 1e-9) { if (ox < o.minX || ox > o.maxX) ok = false; }
            else {
              let ta = (o.minX - ox) / dx, tb = (o.maxX - ox) / dx, sg = -1;
              if (ta > tb) { const q = ta; ta = tb; tb = q; sg = 1; }
              if (ta > t0) { t0 = ta; nx = sg; ny = 0; nz = 0; }
              if (tb < t1) t1 = tb;
              if (t0 > t1) ok = false;
            }
            if (ok) {
              if (Math.abs(dy) < 1e-9) { if (oy < o.minY || oy > o.maxY) ok = false; }
              else {
                let ta = (o.minY - oy) / dy, tb = (o.maxY - oy) / dy, sg = -1;
                if (ta > tb) { const q = ta; ta = tb; tb = q; sg = 1; }
                if (ta > t0) { t0 = ta; nx = 0; ny = sg; nz = 0; }
                if (tb < t1) t1 = tb;
                if (t0 > t1) ok = false;
              }
            }
            if (ok) {
              if (Math.abs(dz) < 1e-9) { if (oz < o.minZ || oz > o.maxZ) ok = false; }
              else {
                let ta = (o.minZ - oz) / dz, tb = (o.maxZ - oz) / dz, sg = -1;
                if (ta > tb) { const q = ta; ta = tb; tb = q; sg = 1; }
                if (ta > t0) { t0 = ta; nx = 0; ny = 0; nz = sg; }
                if (tb < t1) t1 = tb;
                if (t0 > t1) ok = false;
              }
            }
            if (ok && t0 < best && t0 > 0) { best = t0; bobj = o; bnx = nx; bny = ny; bnz = nz; }
          } else {
            const fx = ox - o.x, fz = oz - o.z;
            const a = dx * dx + dz * dz;
            if (a < 1e-9) continue;
            const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - o.r * o.r;
            const disc = b * b - 4 * a * c;
            if (disc < 0) continue;
            const t = (-b - Math.sqrt(disc)) / (2 * a);
            if (t > 0 && t < best) {
              const y = oy + dy * t;
              if (y >= o.minY && y <= o.maxY) {
                best = t; bobj = o;
                const hx = ox + dx * t - o.x, hz = oz + dz * t - o.z, hl = Math.hypot(hx, hz) || 1;
                bnx = hx / hl; bny = 0; bnz = hz / hl;
              }
            }
          }
        }
      }
      // next cell
      if (tMX < tMZ) { tCell = tMX; tMX += tDX; ix += stepX; }
      else { tCell = tMZ; tMZ += tDZ; iz += stepZ; }
      if (tCell > best) break;
    }
    // terrain march
    if (opts.terrain !== false) {
      const T = this.terrain;
      const stp = 1.5;
      let prevT = 0, prevAbove = oy - T.heightAt(ox, oz);
      if (prevAbove > 0) {
        for (let t = stp; t < best; t += stp) {
          const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
          const above = y - T.heightAt(x, z);
          if (above < 0) {
            // bisection refine
            let lo = prevT, hi = t;
            for (let k = 0; k < 8; k++) {
              const m = (lo + hi) / 2;
              const ab = oy + dy * m - T.heightAt(ox + dx * m, oz + dz * m);
              if (ab < 0) hi = m; else lo = m;
            }
            best = hi; bobj = 'terrain'; bnx = 0; bny = 1; bnz = 0;
            break;
          }
          prevT = t; prevAbove = above;
        }
      }
    }
    hit.hit = bobj !== null;
    hit.t = best;
    hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    hit.nx = bnx; hit.ny = bny; hit.nz = bnz;
    hit.obj = bobj;
    return hit;
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (L < 0.01) return true;
    const h = this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L - 0.3, this._losHit || (this._losHit = {}));
    return !h.hit;
  }
}
