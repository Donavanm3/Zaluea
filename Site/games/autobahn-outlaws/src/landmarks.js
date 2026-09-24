// Famous German landmarks built from primitives. Each builder adds geometry to a
// Builder (world coordinates) and colliders to the physics world.
import * as THREE from 'three';
import { UNIT_BOX, UNIT_CYL, UNIT_CONE, UNIT_SPHERE_HI } from './util.js';

const SAND = 0xd8c9a3, STONE_DARK = 0x57534c, COPPER = 0x4f8a75, BRICK = 0x8e4f3a, WHITE = 0xece7df;

function cylinder(B, rt, rb, h, x, y, z, color, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  B.geo(g, color, x, y + h / 2, z);
}
function cone(B, r, h, x, y, z, color, seg = 8, ry = 0) {
  const g = new THREE.ConeGeometry(r, h, seg);
  B.geo(g, color, x, y + h / 2, z, 0, ry, 0);
}
function sphere(B, r, x, y, z, color, sy = 1) {
  B.add(UNIT_SPHERE_HI, color, x, y, z, 0, 0, 0, r * 2, r * 2 * sy, r * 2);
}
function boxC(P, x0, z0, x1, z1, y0, y1, props) {
  P.addBox(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y0, y1, props);
}

// Rotated helper: local (lx,lz) around (cx,cz) by 0/90/180/270 deg steps.
function rot(cx, cz, lx, lz, r) {
  switch (r & 3) {
    case 0: return [cx + lx, cz + lz];
    case 1: return [cx + lz, cz - lx];
    case 2: return [cx - lx, cz - lz];
    default: return [cx - lz, cz + lx];
  }
}

export const LANDMARKS = {
  brandenburg(B, P, x, y, z) {
    B.box(28, 0.3, 12, x, y + 0.15, z, 0xbfb49a);
    const xs = [-12.5, -7.6, -2.9, 2.9, 7.6, 12.5];
    for (const cx of xs) {
      for (const cz of [-4, 4]) {
        cylinder(B, 0.8, 0.9, 13, x + cx, y + 0.3, z + cz, SAND, 12);
        P.addCircle(x + cx, z + cz, 0.95, y, y + 20);
      }
    }
    for (const sx of [-1, 1]) {
      B.box(1.6, 13, 8, x + sx * 12.5, y + 6.8, z, SAND);
      boxC(P, x + sx * 12.5 - 0.8, z - 4, x + sx * 12.5 + 0.8, z + 4, y, y + 20);
    }
    B.box(28.5, 2.6, 11, x, y + 14.6, z, SAND);
    B.box(27, 0.6, 10.6, x, y + 16.2, z, 0xc9b995);
    B.box(18, 2.8, 8, x, y + 17.9, z, SAND);
    // quadriga
    const qy = y + 19.3;
    B.box(2.6, 1.6, 1.8, x, qy + 0.8, z - 0.8, COPPER);
    for (let i = 0; i < 4; i++) {
      const hx = x - 2.4 + i * 1.6;
      B.box(0.7, 1.1, 2.4, hx, qy + 1.1, z + 1.3, COPPER);
      B.box(0.5, 0.9, 0.9, hx, qy + 1.9, z + 2.5, COPPER, 0, -0.5);
      for (const lz of [0.5, 2.1]) B.box(0.2, 0.8, 0.2, hx, qy + 0.4, z + lz, COPPER);
    }
    cylinder(B, 0.25, 0.35, 3, x, qy + 1.6, z - 0.8, COPPER, 6);
    B.box(3, 0.9, 0.2, x, qy + 4.2, z - 0.8, COPPER);
    B.box(0.15, 1.6, 1.0, x, qy + 5.2, z - 0.8, 0x2f2f2f);
  },

  fernsehturm(B, P, x, y, z) {
    cylinder(B, 6, 11, 12, x, y, z, 0x9da0a6, 16);
    cylinder(B, 2.8, 4.8, 140, x, y + 12, z, 0xc9cbcf, 16);
    const sy = y + 150;
    sphere(B, 14, x, sy, z, 0xb7bcc6);
    cylinder(B, 14.3, 14.3, 3.4, x, sy - 1.7, z, 0x2a3440, 24);
    cylinder(B, 1.6, 2.2, 20, x, sy + 12, z, 0xc9cbcf, 10);
    for (let i = 0; i < 6; i++) cylinder(B, 0.5, 0.5, 6, x, sy + 32 + i * 6, z, i % 2 ? 0xd23c32 : 0xf0f0f0, 8);
    P.addCircle(x, z, 5, y, y + 150);
    P.addCircle(x, z, 14, sy - 14, sy + 14, { noWalk: true });
    P.addCircle(x, z, 11, y, y + 12);
  },

  reichstag(B, P, x, y, z) {
    const w = 34, d = 24, h = 17;
    B.box(w, h, d, x, y + h / 2, z, 0xcdbf9d);
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      B.box(7, h + 6, 7, x + cx * (w / 2 - 3), y + (h + 6) / 2, z + cz * (d / 2 - 3), 0xc4b591);
    }
    // portico facing south
    for (let i = 0; i < 6; i++) cylinder(B, 0.6, 0.7, 12, x - 7.5 + i * 3, y, z + d / 2 + 2.5, 0xdcd0b3, 10);
    B.box(18, 3, 4, x, y + 13.5, z + d / 2 + 2.5, 0xcdbf9d);
    B.box(18, 0.6, 4.5, x, y + 15.3, z + d / 2 + 2.5, 0xb9ab89);
    sphere(B, 8.5, x, y + h, z, 0x9ebfd6, 0.8);
    B.box(20, 0.8, 16, x, y + h + 0.4, z, 0x8f8f8f);
    // flag
    cylinder(B, 0.12, 0.12, 9, x - 12, y + h + 6, z, 0xcccccc, 6);
    B.box(0.05, 0.6, 2.8, x - 12, y + h + 14.4, z - 1.5, 0x111111);
    B.box(0.05, 0.6, 2.8, x - 12, y + h + 13.8, z - 1.5, 0xdd0000);
    B.box(0.05, 0.6, 2.8, x - 12, y + h + 13.2, z - 1.5, 0xffcc00);
    boxC(P, x - w / 2, z - d / 2, x + w / 2, z + d / 2, y, y + h + 6);
  },

  dom(B, P, x, y, z) {
    // nave along z, facade (towers) to the south
    B.box(14, 26, 30, x, y + 13, z - 3, STONE_DARK);
    B.geo(prism(14, 8, 30), 0x3b3936, x, y + 26, z - 3);
    B.box(28, 24, 9, x, y + 12, z - 6, STONE_DARK);
    B.geo(prismX(28, 7, 9), 0x3b3936, x, y + 24, z - 6);
    cylinder(B, 5, 6, 22, x, y, z - 17, STONE_DARK, 8);
    for (const sx of [-1, 1]) {
      const tx = x + sx * 5.2, tz = z + 12;
      B.box(8.5, 56, 8.5, tx, y + 28, tz, 0x5f5b54);
      B.box(7.5, 8, 7.5, tx, y + 60, tz, 0x57534c);
      cone(B, 5.4, 34, tx, y + 64, tz, 0x4d4a44, 4, Math.PI / 4);
      for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cone(B, 0.7, 7, tx + px * 3.8, y + 56, tz + pz * 3.8, 0x5f5b54, 4);
      B.box(0.6, 1.6, 0.6, tx, y + 98.6, tz, 0xc9a646);
    }
    // portal
    B.box(5, 14, 0.4, x, y + 7, z + 16.4, 0x2b2926);
    boxC(P, x - 7, z - 18, x + 7, z + 12, y, y + 34);
    boxC(P, x - 14, z - 10.5, x + 14, z - 1.5, y, y + 30);
    boxC(P, x - 9.5, z + 7.7, x + 9.5, z + 16.3, y, y + 64);
  },

  rathaus(B, P, x, y, z, color = 0xc9b28a, roof = 0x4a5a52) {
    B.box(26, 16, 18, x, y + 8, z, color);
    B.geo(prismX(26, 6, 18), roof, x, y + 16, z);
    B.box(7, 40, 7, x, y + 20, z + 5.5, color);
    B.box(7.6, 2, 7.6, x, y + 40.5, z + 5.5, 0x9d9480);
    cone(B, 5.2, 12, x, y + 41.5, z + 5.5, roof, 4, Math.PI / 4);
    // clock faces
    for (const [fx, fz] of [[0, 3.55], [3.55, 0], [-3.55, 0]]) {
      B.cyl(1.6, 0.15, x + fx, y + 34, z + 5.5 + fz, 0xf2efe6, Math.PI / 2, fx !== 0 ? Math.PI / 2 : 0, 0);
    }
    boxC(P, x - 13, z - 9, x + 13, z + 9, y, y + 22);
    boxC(P, x - 3.5, z + 2, x + 3.5, z + 9, y, y + 52);
  },

  elbphilharmonie(B, P, x, y, z) {
    B.box(34, 24, 22, x, y + 12, z, 0x7a4b3a);
    const hs = [12, 16, 20, 17, 13, 10];
    for (let i = 0; i < hs.length; i++) {
      B.box(34 / hs.length + 0.02, hs[i], 22, x - 17 + (i + 0.5) * (34 / hs.length), y + 24 + hs[i] / 2, z, 0x9ec2d8);
      B.box(34 / hs.length + 0.2, 0.6, 22.4, x - 17 + (i + 0.5) * (34 / hs.length), y + 24 + hs[i], z, 0xe8eef2);
    }
    boxC(P, x - 17, z - 11, x + 17, z + 11, y, y + 45);
  },

  crane(B, P, x, y, z, ry = 0) {
    const col = Math.random() < 0.5 ? 0xc0392b : 0x2266aa;
    const pts = [[-6, -8], [6, -8], [6, 8], [-6, 8]];
    for (const [lx, lz] of pts) {
      B.box(1.1, 32, 1.1, x + lx, y + 16, z + lz, col);
      P.addBox(x + lx - 0.6, z + lz - 0.6, x + lx + 0.6, z + lz + 0.6, y, y + 32);
    }
    B.box(13, 1.4, 1.4, x, y + 12, z - 8, col);
    B.box(13, 1.4, 1.4, x, y + 12, z + 8, col);
    B.box(2, 2.2, 52, x, y + 33, z - 8, col);
    B.box(3.2, 3, 4, x, y + 30, z - 14, 0xdddddd);
    B.box(0.2, 14, 0.2, x, y + 25, z - 22, 0x333333);
    B.box(3, 1, 6.5, x, y + 18, z - 22, 0x444444);
  },

  containers(B, P, x0, z0, x1, z1, y) {
    const cols = [0xb03a2e, 0x1f618d, 0x117a65, 0xd68910, 0x7f8c8d, 0x6c3483, 0xa04000, 0x2e4053];
    for (let zz = z0 + 2; zz < z1 - 3; zz += 3.2) {
      for (let xx = x0 + 2; xx < x1 - 6; xx += 6.8) {
        if (Math.random() < 0.2) continue;
        const n = 1 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) B.box(6.1, 2.55, 2.45, xx + 3, y + 1.3 + k * 2.6, zz + 1.2, cols[Math.floor(Math.random() * cols.length)]);
        P.addBox(xx, zz, xx + 6.1, zz + 2.45, y, y + n * 2.6);
      }
    }
  },

  frauenkirche_muc(B, P, x, y, z) {
    B.box(20, 26, 40, x, y + 13, z - 4, BRICK);
    B.geo(prism(20, 14, 40), 0x7a3f2f, x, y + 26, z - 4);
    for (const sx of [-1, 1]) {
      const tx = x + sx * 5.5, tz = z + 18;
      B.box(8.5, 52, 8.5, tx, y + 26, tz, 0x94553d);
      cylinder(B, 4, 4.2, 5, tx, y + 52, tz, 0x94553d, 12);
      sphere(B, 4.1, tx, y + 57, tz, COPPER, 1.25);
      cylinder(B, 0.8, 1.0, 4, tx, y + 61.5, tz, COPPER, 8);
      B.box(0.3, 1.8, 0.3, tx, y + 66.3, tz, 0xc9a646);
    }
    boxC(P, x - 10, z - 24, x + 10, z + 22.5, y, y + 40);
  },

  arena(B, P, x, y, z) {
    const g = new THREE.CylinderGeometry(22, 19, 20, 28, 1, true);
    B.geo(g, 0xf1f1f1, x, y + 10, z);
    const g2 = new THREE.CylinderGeometry(22.1, 21.4, 3, 28, 1, true);
    B.geo(g2, 0xd62020, x, y + 16, z);
    cylinder(B, 18, 18, 0.6, x, y + 19.7, z, 0xe8e8e8, 28);
    cylinder(B, 17, 17, 0.4, x, y + 0.2, z, 0x3e8e3e, 28);
    P.addCircle(x, z, 21, y, y + 20);
  },

  frauenkirche_dd(B, P, x, y, z) {
    B.box(24, 18, 24, x, y + 9, z, 0xd8cfb5);
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) cylinder(B, 2.2, 2.4, 24, x + cx * 11, y, z + cz * 11, 0xcfc6ab, 10);
    cylinder(B, 10, 12, 6, x, y + 18, z, 0xd8cfb5, 20);
    sphere(B, 10, x, y + 26, z, 0xcfc6ab, 1.3);
    cylinder(B, 2, 2.4, 8, x, y + 38, z, 0xd8cfb5, 10);
    sphere(B, 2.1, x, y + 46.5, z, 0xcfc6ab);
    B.box(0.4, 2.5, 0.4, x, y + 49.5, z, 0xc9a646);
    boxC(P, x - 13, z - 13, x + 13, z + 13, y, y + 40);
  },

  tvtower(B, P, x, y, z) {
    cylinder(B, 1.8, 3.6, 105, x, y, z, 0xdedede, 12);
    cylinder(B, 6, 4, 10, x, y + 95, z, 0xcfcfcf, 16);
    cylinder(B, 6.2, 6.2, 2, x, y + 100, z, 0x2a3440, 16);
    cylinder(B, 0.6, 0.9, 40, x, y + 105, z, 0xd23c32, 8);
    P.addCircle(x, z, 3.7, y, y + 105);
  },

  voelkerschlacht(B, P, x, y, z) {
    B.box(38, 2, 38, x, y + 1, z, 0x6d6960);
    B.box(34, 1.2, 10, x, y + 2.6, z + 22, 0x3b6f9a);
    B.box(30, 22, 30, x, y + 12, z, 0x6a655c);
    B.box(26, 6, 26, x, y + 26, z, 0x625d55);
    cylinder(B, 11, 13, 16, x, y + 29, z, 0x5f5a52, 16);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      B.box(2, 7, 2, x + Math.cos(a) * 11, y + 48, z + Math.sin(a) * 11, 0x5a554d);
    }
    boxC(P, x - 17, z - 17, x + 17, z + 17, y, y + 50);
  },

  kaiserburg(B, P, x, y, z) {
    B.box(34, 3, 34, x, y + 1.5, z, 0x8a7f6f);
    const walls = [[-15, -15, 15, -13.5], [-15, 13.5, 15, 15], [-15, -15, -13.5, 15], [13.5, -15, 15, 15]];
    for (const [a, b, c, d] of walls) {
      B.box(c - a, 10, d - b, x + (a + c) / 2, y + 8, z + (b + d) / 2, 0xa0634c);
      boxC(P, x + a, z + b, x + c, z + d, y, y + 13);
    }
    for (const [cx, cz] of [[-15, -15], [15, -15], [15, 15], [-15, 15]]) {
      cylinder(B, 3.5, 3.8, 20, x + cx, y + 3, z + cz, 0xa86a52, 10);
      cone(B, 4.5, 8, x + cx, y + 23, z + cz, 0x6a3a2c, 10);
      P.addCircle(x + cx, z + cz, 3.8, y, y + 23);
    }
    B.box(12, 24, 10, x, y + 15, z - 4, 0xb07157);
    B.geo(prismX(12, 6, 10), 0x6a3a2c, x, y + 27, z - 4);
    cylinder(B, 4, 4.5, 34, x + 6, y + 3, z + 6, 0xa86a52, 12);
    cone(B, 5, 10, x + 6, y + 37, z + 6, 0x6a3a2c, 12);
    boxC(P, x - 6, z - 9, x + 6, z + 1, y, y + 30);
    P.addCircle(x + 6, z + 6, 4.5, y, y + 37);
  },

  lighthouse(B, P, x, y, z) {
    for (let i = 0; i < 6; i++) cylinder(B, 2.6 - i * 0.12, 2.72 - i * 0.12, 5, x, y + i * 5, z, i % 2 ? 0xffffff : 0xc0392b, 12);
    cylinder(B, 2.2, 2.2, 3, x, y + 30, z, 0xfff3b0, 12);
    cone(B, 2.6, 3, x, y + 33, z, 0x333333, 12);
    P.addCircle(x, z, 2.8, y, y + 36);
  },

  euro(B, P, x, y, z) {
    B.box(6, 1, 3, x, y + 0.5, z, 0x777777);
    const t = new THREE.TorusGeometry(5, 0.9, 8, 24, Math.PI * 1.55);
    t.rotateZ(Math.PI * 0.225);
    B.geo(t, 0x1d3f9a, x, y + 7, z);
    B.box(8, 1, 1, x - 1.5, y + 7.8, z, 0x1d3f9a);
    B.box(8, 1, 1, x - 1.5, y + 5.8, z, 0x1d3f9a);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      B.box(0.9, 0.9, 0.3, x + Math.cos(a) * 7.2, y + 7 + Math.sin(a) * 7.2, z, 0xffd700, 0, 0, Math.PI / 4);
    }
    boxC(P, x - 3, z - 1.5, x + 3, z + 1.5, y, y + 14);
  },

  wall(B, P, x0, z, x1, y) {
    const cols = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];
    for (let xx = x0; xx < x1; xx += 1.25) {
      B.box(1.2, 3.6, 0.35, xx + 0.6, y + 1.8, z, cols[Math.floor(Math.random() * cols.length)]);
    }
    B.box(x1 - x0, 0.5, 0.6, (x0 + x1) / 2, y + 3.85, z, 0xcfcfcf);
    P.addBox(x0, z - 0.3, x1, z + 0.3, y, y + 4);
  },

  neuschwanstein(B, P, x, y, z) {
    B.box(46, 6, 30, x, y + 3, z, 0xb9b1a3);
    B.box(34, 18, 12, x, y + 15, z - 4, WHITE);
    B.geo(prismX(34, 9, 12), 0x56677a, x, y + 24, z - 4);
    B.box(12, 30, 12, x - 17, y + 21, z - 4, WHITE);
    cone(B, 7, 14, x - 17, y + 36, z - 4, 0x56677a, 4, Math.PI / 4);
    const towers = [[12, -12, 3.2, 38], [16, 6, 2.6, 30], [-8, 9, 2.4, 26], [2, 10, 3, 34], [-20, 10, 2.2, 22], [20, -4, 2, 28]];
    for (const [tx, tz, r, h] of towers) {
      cylinder(B, r, r * 1.05, h, x + tx, y + 6, z + tz, WHITE, 12);
      cone(B, r * 1.3, r * 3.2, x + tx, y + 6 + h, z + tz, 0x56677a, 12);
      P.addCircle(x + tx, z + tz, r * 1.05, y, y + 6 + h);
    }
    B.box(10, 14, 8, x + 4, y + 13, z + 12, 0xc98f7c);
    B.geo(prismX(10, 5, 8), 0x56677a, x + 4, y + 20, z + 12);
    boxC(P, x - 23, z - 15, x + 23, z + 15, y, y + 6);
    boxC(P, x - 23, z - 10, x + 17, z + 2, y, y + 34);
  },

  summitcross(B, P, x, y, z) {
    B.box(8, 2, 8, x, y + 1, z, 0x6d6d6d);
    B.box(0.5, 7, 0.5, x, y + 5.5, z, 0xd4af37);
    B.box(3.4, 0.45, 0.45, x, y + 7, z, 0xd4af37);
    B.box(6, 3.5, 5, x + 7, y + 1.75, z + 3, 0x8f7a60);
    B.geo(prismX(6, 2, 5), 0x6a4a3a, x + 7, y + 3.5, z + 3);
    boxC(P, x - 4, z - 4, x + 4, z + 4, y - 3, y + 2);
    P.addBox(x + 4, z + 0.5, x + 10, z + 5.5, y, y + 5);
  },

  brocken(B, P, x, y, z) {
    cylinder(B, 4, 5, 30, x, y, z, 0xd8d8d8, 12);
    sphere(B, 6, x, y + 32, z, 0xf0f0f0);
    cylinder(B, 0.5, 0.5, 20, x, y + 36, z, 0xd23c32, 6);
    P.addCircle(x, z, 5, y, y + 38);
  },

  windturbine(B, x, y, z) {
    cylinder(B, 1.1, 2.0, 70, x, y, z, 0xf2f2f2, 10);
    B.box(2.4, 2.6, 6, x, y + 71, z, 0xeeeeee);
  },
};

// Triangular prism roof: ridge along z (width w along x, height h, length L)
export function prism(w, h, L) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
  g.translate(0, 0, -L / 2);
  return g;
}
// Ridge along x
export function prismX(L, h, w) {
  const g = prism(w, h, L);
  g.rotateY(Math.PI / 2);
  return g;
}

export { rot };
