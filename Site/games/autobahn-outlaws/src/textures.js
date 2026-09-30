// Procedurally drawn textures (no external image assets).
import * as THREE from 'three';
import { canvasTexture, mulberry32 } from './util.js';

const cache = {};

// 8x8 window cells. Diffuse and a matching emissive "lights on" map.
export function facadeTextures() {
  if (cache.facade) return cache.facade;
  const rng = mulberry32(1234);
  const lit = [];
  for (let i = 0; i < 64; i++) lit.push(rng() < 0.38 ? 0.55 + rng() * 0.45 : 0);
  const S = 512, C = S / 8;
  const map = canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#f2efe8';
    ctx.fillRect(0, 0, S, S);
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const x = gx * C, y = gy * C;
        // subtle plaster variation
        ctx.fillStyle = `rgba(0,0,0,${0.008 + rng() * 0.014})`;
        ctx.fillRect(x, y, C, C);
        // window frame + glass
        ctx.fillStyle = '#e9e5dc';
        ctx.fillRect(x + C * 0.22, y + C * 0.16, C * 0.56, C * 0.62);
        ctx.fillStyle = '#3b4552';
        ctx.fillRect(x + C * 0.26, y + C * 0.2, C * 0.48, C * 0.54);
        ctx.fillStyle = 'rgba(160,190,220,0.25)';
        ctx.fillRect(x + C * 0.26, y + C * 0.2, C * 0.2, C * 0.54);
        ctx.fillStyle = '#e9e5dc';
        ctx.fillRect(x + C * 0.49, y + C * 0.2, C * 0.03, C * 0.54);
        ctx.fillRect(x + C * 0.26, y + C * 0.42, C * 0.48, C * 0.03);
        // sill
        ctx.fillStyle = '#cfc9bd';
        ctx.fillRect(x + C * 0.19, y + C * 0.78, C * 0.62, C * 0.05);
        // floor band
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(x, y + C * 0.96, C, C * 0.04);
      }
    }
  }, { repeat: true, anisotropy: 8 });
  const emissive = canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const v = lit[gy * 8 + gx];
        if (!v) continue;
        const x = gx * C, y = gy * C;
        const warm = rng();
        ctx.fillStyle = warm < 0.7 ? `rgba(255,${190 + Math.floor(40 * v)},${110 + Math.floor(60 * v)},${v})` : `rgba(200,220,255,${v})`;
        ctx.fillRect(x + C * 0.26, y + C * 0.2, C * 0.48, C * 0.54);
      }
    }
  }, { repeat: true });
  // Glossy window panes, matte plaster.
  const rough = canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#262626';
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) ctx.fillRect(gx * C + C * 0.26, gy * C + C * 0.2, C * 0.48, C * 0.54);
    }
  }, { repeat: true, linear: true });
  cache.facade = { map, emissive, rough };
  return cache.facade;
}

export function glassTextures() {
  if (cache.glass) return cache.glass;
  const rng = mulberry32(777);
  const S = 512, C = S / 8;
  const lit = [];
  for (let i = 0; i < 64; i++) lit.push(rng() < 0.45 ? 0.5 + rng() * 0.5 : 0);
  const map = canvasTexture(S, S, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#5f7f9e');
    g.addColorStop(0.5, '#86a7c4');
    g.addColorStop(1, '#4e6d8c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        ctx.fillStyle = `rgba(255,255,255,${rng() * 0.08})`;
        ctx.fillRect(gx * C + 2, gy * C + 2, C - 4, C - 4);
      }
    }
    ctx.fillStyle = '#c8d0d8';
    for (let i = 0; i <= 8; i++) {
      ctx.fillRect(i * C - 2, 0, 4, S);
      ctx.fillRect(0, i * C - 3, S, 6);
    }
  }, { repeat: true, anisotropy: 8 });
  const emissive = canvasTexture(S, S, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const v = lit[gy * 8 + gx];
        if (!v) continue;
        ctx.fillStyle = `rgba(235,240,255,${v * 0.9})`;
        ctx.fillRect(gx * C + 3, gy * C + 4, C - 6, C - 8);
      }
    }
  }, { repeat: true });
  cache.glass = { map, emissive };
  return cache.glass;
}

// Tileable ripple normal map for water (sum of integer-frequency waves).
export function waterNormalTexture() {
  if (cache.waterN) return cache.waterN;
  const S = 256, rng = mulberry32(42), waves = [];
  while (waves.length < 16) {
    const kx = Math.round((rng() - 0.5) * 18), kz = Math.round((rng() - 0.5) * 18);
    if (kx || kz) waves.push([kx, kz, rng() * Math.PI * 2, 1 / Math.hypot(kx, kz)]);
  }
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const w of waves) v += Math.sin(((w[0] * x + w[1] * y) / S) * Math.PI * 2 + w[2]) * w[3];
      h[y * S + x] = v;
    }
  }
  cache.waterN = canvasTexture(S, S, (ctx) => {
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)];
        const dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
        const nx = -dx * 6, ny = -dy * 6, l = Math.hypot(nx, ny, 1);
        const i = (y * S + x) * 4;
        img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: true, linear: true, anisotropy: 8 });
  return cache.waterN;
}

// Round soft particle sprite.
export function particleTexture() {
  if (cache.particle) return cache.particle;
  cache.particle = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }, { linear: true });
  return cache.particle;
}

// Sign atlas for shops/services on building fronts.
export function serviceSignTexture() {
  if (cache.service) return cache.service;
  const items = [
    ['KRANKENHAUS', '#ffffff', '#d62020', 'cross'],
    ['POLIZEI', '#ffffff', '#1f4f9a', 'star'],
    ['WAFFENLADEN', '#1a1a1a', '#f0a020', 'gun'],
    ['LACKIEREREI', '#ffffff', '#7b2cbf', 'spray'],
    ['WOHNUNG', '#ffffff', '#2a9d4b', 'house'],
    ['TANKSTELLE', '#ffffff', '#e05a00', 'fuel'],
    ['CLUB', '#ff4fd8', '#15151f', 'note'],
    ['BANK', '#ffffff', '#0b3d2e', 'euro'],
  ];
  const W = 512, H = 128;
  const tex = canvasTexture(W, H * items.length, (ctx) => {
    items.forEach(([text, fg, bg], i) => {
      const y = i * H;
      ctx.fillStyle = bg;
      ctx.fillRect(0, y, W, H);
      ctx.strokeStyle = fg;
      ctx.lineWidth = 6;
      ctx.strokeRect(8, y + 8, W - 16, H - 16);
      ctx.fillStyle = fg;
      ctx.font = 'bold 64px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, y + H / 2 + 4, W - 40);
    });
  });
  cache.service = { tex, items: items.map((i) => i[0]), rows: items.length };
  return cache.service;
}

export function labelTexture(text, opts = {}) {
  const w = opts.w || 256, h = opts.h || 64;
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = opts.bg || 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = opts.fg || '#fff';
    ctx.font = `bold ${opts.size || 40}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2, w - 10);
  });
}
