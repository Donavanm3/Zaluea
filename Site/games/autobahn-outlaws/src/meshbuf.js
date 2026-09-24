// Growable non-indexed mesh buffer with automatic face normals.
import * as THREE from 'three';

const _c = new THREE.Color();
const _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class MeshBuf {
  constructor(withUV = true) {
    this.pos = []; this.nor = []; this.col = []; this.uv = withUV ? [] : null;
  }
  get count() { return this.pos.length / 3; }

  // Triangle; `expect` (optional [x,y,z]) flips winding to face that way.
  tri(p0, p1, p2, color, uv0, uv1, uv2, expect) {
    _a.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    _b.set(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    _n.crossVectors(_a, _b);
    if (expect && _n.x * expect[0] + _n.y * expect[1] + _n.z * expect[2] < 0) {
      const t = p1; p1 = p2; p2 = t;
      const tu = uv1; uv1 = uv2; uv2 = tu;
      _n.negate();
    }
    _n.normalize();
    _c.set(color);
    for (const p of [p0, p1, p2]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(_n.x, _n.y, _n.z);
      this.col.push(_c.r, _c.g, _c.b);
    }
    if (this.uv) {
      this.uv.push(uv0 ? uv0[0] : 0, uv0 ? uv0[1] : 0, uv1 ? uv1[0] : 0, uv1 ? uv1[1] : 0, uv2 ? uv2[0] : 0, uv2 ? uv2[1] : 0);
    }
  }

  // Quad a,b,c,d in loop order.
  quad(a, b, c, d, color, uvs, expect) {
    const u = uvs || [null, null, null, null];
    if (expect) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _n.crossVectors(_a, _b);
      if (_n.x * expect[0] + _n.y * expect[1] + _n.z * expect[2] < 0) {
        this.tri(a, c, b, color, u[0], u[2], u[1]);
        this.tri(a, d, c, color, u[0], u[3], u[2]);
        return;
      }
    }
    this.tri(a, b, c, color, u[0], u[1], u[2]);
    this.tri(a, c, d, color, u[0], u[2], u[3]);
  }

  // Axis aligned box (no UVs of note).
  box(x0, y0, z0, x1, y1, z1, color, top = true, bottom = false) {
    this.wallLoop(x0, z0, x1, z1, y0, y1, color, null);
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color, null, [0, 1, 0]);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, null, [0, -1, 0]);
  }

  // Four outward walls of a rectangle; uvFn(u0,u1,y0,y1) supplies UVs.
  wallLoop(x0, z0, x1, z1, y0, y1, color, uv) {
    const walls = [
      [x0, z1, x1, z1, 0, 1],
      [x1, z1, x1, z0, 1, 0],
      [x1, z0, x0, z0, 0, -1],
      [x0, z0, x0, z1, -1, 0],
    ];
    let u = uv ? uv.u0 : 0;
    for (const [ax, az, bx, bz, nx, nz] of walls) {
      const L = Math.hypot(bx - ax, bz - az);
      let uvs = null;
      if (uv) {
        const ua = u / uv.sx, ub = (u + L) / uv.sx;
        const va = 0, vb = (y1 - y0) / uv.sy;
        uvs = [[ua, va], [ub, va], [ub, vb], [ua, vb]];
      }
      this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], color, uvs, [nx, 0, nz]);
      u += L;
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}
