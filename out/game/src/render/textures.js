// Canvas-drawn textures shared by every model: facade sheets, asphalt, sand, water normals,
// palm fronds, signage and sprites. Nothing here loads a file; each function paints into an
// offscreen canvas and returns a THREE.CanvasTexture (cached by key so the city is cheap).

import * as THREE from 'three';
import { makeRng } from '../core/random.js';

const cache = new Map();

function canvasOf(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function finish(canvas, { repeat = [1, 1], srgb = true, aniso = 4 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function cached(key, build) {
  if (cache.has(key)) return cache.get(key);
  const value = build();
  cache.set(key, value);
  return value;
}

const FACADE_STYLES = [
  // warm sand stucco with shutters
  { base: '#e8c9a0', trim: '#f6e4c8', glass: '#3d5d70', accent: '#c96a4e', balcony: true, shutter: true, name: 'sand' },
  // coral plaster, arched windows
  { base: '#d9825f', trim: '#f2cbb0', glass: '#2f4f63', accent: '#7a3b34', balcony: true, shutter: false, name: 'coral' },
  // turquoise tile, art-deco bands
  { base: '#7fb9ae', trim: '#d8efe7', glass: '#22475a', accent: '#2f7d7a', balcony: false, shutter: false, name: 'turquoise' },
  // pale cream condo tower
  { base: '#f1e3cb', trim: '#ffffff', glass: '#3a6076', accent: '#b8a074', balcony: true, shutter: false, name: 'cream' },
  // terracotta brick
  { base: '#b9784f', trim: '#e7c9a5', glass: '#33505f', accent: '#6e3f2d', balcony: false, shutter: true, name: 'brick' },
  // white modernist
  { base: '#e7e6df', trim: '#fbfaf5', glass: '#40657a', accent: '#8f9a95', balcony: true, shutter: false, name: 'modern' },
];

export function facadeStyleNames() {
  return FACADE_STYLES.map((s) => s.name);
}

// A facade sheet: 8 columns x 6 floors, painted windows with glass gradient, sills, shutters,
// balcony rails and a ground floor of awnings and shopfronts. Each style has its own sheet.
export function facadeTexture(styleIndex = 0, variant = 0) {
  const key = `facade:${styleIndex}:${variant}`;
  return cached(key, () => {
    const style = FACADE_STYLES[styleIndex % FACADE_STYLES.length];
    const cols = 8;
    const rows = 6;
    const cw = 64;
    const ch = 72;
    const w = cols * cw;
    const h = rows * ch;
    const canvas = canvasOf(w, h);
    const ctx = canvas.getContext('2d');
    const rng = makeRng(1013 + styleIndex * 977 + variant * 31);

    ctx.fillStyle = style.base;
    ctx.fillRect(0, 0, w, h);
    // subtle stucco mottling
    for (let i = 0; i < 2600; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const a = rng.range(0.02, 0.08);
      ctx.fillStyle = rng.chance(0.5) ? `rgba(255,255,255,${a})` : `rgba(60,40,30,${a})`;
      ctx.fillRect(x, y, rng.range(2, 9), rng.range(1, 4));
    }
    // floor bands
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(0, r * ch, w, 3);
      ctx.fillStyle = style.trim;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, r * ch + 3, w, 2);
      ctx.globalAlpha = 1;
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        const y = r * ch;
        const ground = r === rows - 1;
        if (ground) {
          // shopfront band
          const shop = rng.chance(0.62);
          ctx.fillStyle = shop ? '#2a3742' : style.base;
          ctx.fillRect(x + 4, y + 16, cw - 8, ch - 22);
          if (shop) {
            const grad = ctx.createLinearGradient(x, y + 16, x, y + ch);
            grad.addColorStop(0, 'rgba(255,238,200,0.55)');
            grad.addColorStop(1, 'rgba(40,50,60,0.1)');
            ctx.fillStyle = grad;
            ctx.fillRect(x + 6, y + 18, cw - 12, ch - 28);
            ctx.fillStyle = style.accent;
            ctx.fillRect(x + 2, y + 8, cw - 4, 10);
            // awning stripes
            const stripe = rng.chance(0.5) ? '#f4e6cf' : '#d8563f';
            ctx.fillStyle = stripe;
            ctx.beginPath();
            ctx.moveTo(x + 2, y + 8);
            ctx.lineTo(x + cw - 2, y + 8);
            ctx.lineTo(x + cw - 8, y + 20);
            ctx.lineTo(x + 8, y + 20);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(x + 2, y + 18, cw - 4, 3);
          }
          continue;
        }
        // window recess
        const wx = x + 12;
        const wy = y + 14;
        const ww = cw - 24;
        const wh = ch - 26;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        const grad = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
        const lit = rng.chance(0.22);
        grad.addColorStop(0, lit ? '#ffe9b8' : style.glass);
        grad.addColorStop(0.55, lit ? '#f0cf8f' : shade(style.glass, -14));
        grad.addColorStop(1, lit ? '#c9a05d' : shade(style.glass, 18));
        ctx.fillStyle = grad;
        ctx.fillRect(wx, wy, ww, wh);
        // reflection slash
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#dff2ff';
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh);
        ctx.lineTo(wx + ww * 0.55, wy);
        ctx.lineTo(wx + ww, wy);
        ctx.lineTo(wx + ww * 0.45, wy + wh);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // mullions
        ctx.fillStyle = 'rgba(250,246,238,0.85)';
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        ctx.fillRect(wx, wy + wh * 0.46, ww, 2);
        // sill
        ctx.fillStyle = style.trim;
        ctx.fillRect(wx - 4, wy + wh, ww + 8, 4);
        // shutters
        if (style.shutter && rng.chance(0.6)) {
          ctx.fillStyle = style.accent;
          ctx.fillRect(wx - 10, wy, 7, wh);
          ctx.fillRect(wx + ww + 3, wy, 7, wh);
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          for (let s = 0; s < wh; s += 6) {
            ctx.fillRect(wx - 10, wy + s, 7, 1);
            ctx.fillRect(wx + ww + 3, wy + s, 7, 1);
          }
        }
        // balcony rail
        if (style.balcony && rng.chance(0.7)) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillRect(x + 6, y + ch - 12, cw - 12, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          for (let bx = x + 8; bx < x + cw - 8; bx += 6) ctx.fillRect(bx, y + ch - 12, 1, 9);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(x + 6, y + ch - 4, cw - 12, 4);
        }
      }
    }
    // top cornice
    ctx.fillStyle = style.trim;
    ctx.fillRect(0, 0, w, 6);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(0, 6, w, 3);
    return finish(canvas, { repeat: [1, 1] });
  });
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

export function asphaltTexture() {
  return cached('asphalt', () => {
    const canvas = canvasOf(256, 256);
    const ctx = canvas.getContext('2d');
    const rng = makeRng(4242);
    ctx.fillStyle = '#6a6a70';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const v = rng.int(78, 140);
      ctx.fillStyle = `rgba(${v},${v},${v + 4},${rng.range(0.15, 0.5)})`;
      ctx.fillRect(rng() * 256, rng() * 256, rng.range(1, 2.6), rng.range(1, 2.6));
    }
    // faint tar seams
    ctx.strokeStyle = 'rgba(44,44,48,0.32)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = rng() * 256;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < 256) {
        x += rng.range(-14, 14);
        y += rng.range(18, 40);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return finish(canvas, { repeat: [1, 1] });
  });
}

export function pavementTexture() {
  return cached('pavement', () => {
    const canvas = canvasOf(256, 256);
    const ctx = canvas.getContext('2d');
    const rng = makeRng(9911);
    ctx.fillStyle = '#cbbba4';
    ctx.fillRect(0, 0, 256, 256);
    const tile = 32;
    for (let y = 0; y < 256; y += tile) {
      for (let x = 0; x < 256; x += tile) {
        const v = rng.range(-10, 10);
        ctx.fillStyle = `rgb(${203 + v},${187 + v},${164 + v})`;
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
    ctx.strokeStyle = 'rgba(120,104,84,0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 256; i += tile) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(90,76,58,${rng.range(0.03, 0.12)})`;
      ctx.fillRect(rng() * 256, rng() * 256, rng.range(1, 4), rng.range(1, 4));
    }
    return finish(canvas, { repeat: [1, 1] });
  });
}

export function sandTexture() {
  return cached('sand', () => {
    const canvas = canvasOf(256, 256);
    const ctx = canvas.getContext('2d');
    const rng = makeRng(777);
    ctx.fillStyle = '#ead7b0';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12000; i++) {
      const v = rng.range(-24, 18);
      ctx.fillStyle = `rgba(${230 + v},${212 + v},${174 + v},0.7)`;
      ctx.fillRect(rng() * 256, rng() * 256, 1.6, 1.6);
    }
    // ripples
    ctx.strokeStyle = 'rgba(196,172,130,0.5)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = rng.range(1, 2.5);
      ctx.beginPath();
      const y0 = rng() * 256;
      ctx.moveTo(0, y0);
      for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 5);
      ctx.stroke();
    }
    return finish(canvas, { repeat: [1, 1] });
  });
}

// A ripple normal map for the sea, derived from summed sine ridges.
export function waterNormalTexture() {
  return cached('waterNormal', () => {
    const size = 256;
    const canvas = canvasOf(size, size);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const height = (x, y) => {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      return (
        Math.sin(u * 3 + Math.cos(v * 2) * 1.4) * 0.5 +
        Math.sin(v * 5 + Math.sin(u * 4) * 0.9) * 0.32 +
        Math.sin((u + v) * 7) * 0.14
      );
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const hL = height((x - 1 + size) % size, y);
        const hR = height((x + 1) % size, y);
        const hD = height(x, (y - 1 + size) % size);
        const hU = height(x, (y + 1) % size);
        const nx = (hL - hR) * 1.6;
        const ny = (hD - hU) * 1.6;
        const nz = 1;
        const len = Math.hypot(nx, ny, nz);
        const i = (y * size + x) * 4;
        img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finish(canvas, { srgb: false, repeat: [1, 1] });
  });
}

export function frondTexture() {
  return cached('frond', () => {
    const w = 128;
    const h = 256;
    const canvas = canvasOf(w, h);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2, h);
    const rng = makeRng(515);
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 26; i++) {
        const t = i / 26;
        const len = 118 * (1 - t * 0.45);
        const ang = s * (0.42 + t * 0.55);
        const x = Math.sin(ang) * len * 0.55;
        const y = -Math.cos(ang) * len;
        ctx.strokeStyle = `rgba(${52 + rng.int(0, 30)},${104 + rng.int(0, 40)},${44 + rng.int(0, 22)},0.95)`;
        ctx.lineWidth = 4 - t * 2.2;
        ctx.beginPath();
        ctx.moveTo(0, -t * 8);
        ctx.quadraticCurveTo(x * 0.55, y * 0.6, x, y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(96,124,58,0.9)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -h * 0.95);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  });
}

// A billboard sheet: a painted ad with the game's own brand, drawn entirely in canvas.
export function billboardTexture(kind = 0) {
  return cached(`billboard:${kind}`, () => {
    const w = 512;
    const h = 256;
    const canvas = canvasOf(w, h);
    const ctx = canvas.getContext('2d');
    const ads = [
      { bg: ['#0e5d7a', '#39b6c9'], text: 'AZUL', sub: 'AGUA MINERAL', fg: '#f7f2e2', accent: '#ffd166' },
      { bg: ['#c0392b', '#f2833e'], text: 'SOLAR', sub: 'CERVEZA FRIA', fg: '#fff6e2', accent: '#2b1b12' },
      { bg: ['#1c3f5e', '#2f7d7a'], text: 'VERDE', sub: 'RADIO 98.3', fg: '#d9f4ea', accent: '#ffd166' },
      { bg: ['#e8b04b', '#f7d99a'], text: 'CALA', sub: 'REAL ESTATE', fg: '#2b2419', accent: '#b8562f' },
      { bg: ['#3b2f4a', '#7a5f8f'], text: 'NOCHE', sub: 'CLUB & LOUNGE', fg: '#ffe8f2', accent: '#63e0c8' },
      { bg: ['#14504a', '#4bb09a'], text: 'PESCA', sub: 'DEL MAR', fg: '#f2ffe9', accent: '#ffcf6b' },
    ];
    const ad = ads[kind % ads.length];
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, ad.bg[0]);
    grad.addColorStop(1, ad.bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // graphic motif
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = ad.accent;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(w * 0.78, h * 0.5, 26 + i * 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = ad.fg;
    ctx.font = 'bold 84px "Trebuchet MS", "DejaVu Sans", sans-serif';
    ctx.fillText(ad.text, 28, 118);
    ctx.fillStyle = ad.accent;
    ctx.font = 'bold 30px "Trebuchet MS", "DejaVu Sans", sans-serif';
    ctx.fillText(ad.sub, 32, 166);
    ctx.strokeStyle = ad.fg;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    return finish(canvas, { repeat: [1, 1] });
  });
}

export function radialSprite(color = '#fff6d0', size = 64) {
  return cached(`radial:${color}:${size}`, () => {
    const canvas = canvasOf(size, size);
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, `${color}cc`);
    grad.addColorStop(1, `${color}00`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return finish(canvas, { repeat: [1, 1] });
  });
}

export function starSprite(color = '#ffd76a') {
  return cached(`star:${color}`, () => {
    const size = 64;
    const canvas = canvasOf(size, size);
    const ctx = canvas.getContext('2d');
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 26 : 11;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    return finish(canvas, { repeat: [1, 1] });
  });
}

export function graffitiTexture() {
  return cached('graffiti', () => {
    const w = 256;
    const h = 128;
    const canvas = canvasOf(w, h);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const rng = makeRng(8181);
    const words = ['CV', 'AZUL', 'RIO', 'PALMA', 'SOL'];
    const colors = ['#ff5d5d', '#ffd166', '#4ecdc4', '#c77dff', '#f7f2e2'];
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(rng.range(20, 200), rng.range(30, 100));
      ctx.rotate(rng.range(-0.25, 0.25));
      ctx.font = `bold ${rng.int(28, 54)}px "Trebuchet MS", sans-serif`;
      ctx.fillStyle = colors[i % colors.length];
      ctx.globalAlpha = 0.85;
      ctx.fillText(words[rng.int(0, words.length - 1)], 0, 0);
      ctx.restore();
    }
    return finish(canvas, { repeat: [1, 1] });
  });
}
