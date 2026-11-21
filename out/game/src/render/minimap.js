// A small canvas minimap drawn from the city plan: blocks as filled pads, roads as the gaps,
// the shoreline in turquoise, plus blips for the player (with a facing wedge), the objective,
// police and nearby vehicles. North is up, and the map is baked once at a world scale, so the
// window it shows can be changed without redrawing the city.

import { TILE } from '../city/layout.js';

export class Minimap {
  constructor(canvas, layout, { span = 170 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.layout = layout;
    this.span = span;
    this.baseSize = 1024;
    this.base = document.createElement('canvas');
    this.base.width = this.baseSize;
    this.base.height = this.baseSize;
    this.renderBase();
  }

  // Bake the whole city once: one pixel scale in metres, centred on the middle of the map.
  renderBase() {
    const c = this.base.getContext('2d');
    const S = this.baseSize;
    const l = this.layout;
    const cx = (l.minX + l.maxX) / 2;
    const cz = (l.minZ + l.maxZ) / 2;
    // One scale for both axes so streets stay square; the wider axis sets it.
    const px = (S - 16) / Math.max(l.maxX - l.minX, l.maxZ - l.minZ);
    this.px = px;
    this.centre = { x: cx, z: cz };
    const toX = (x) => S / 2 + (x - cx) * px;
    const toY = (z) => S / 2 + (z - cz) * px;

    // Sea everywhere, then land, then the sand strip of the beach.
    c.fillStyle = '#12455f';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#b9a482';
    c.fillRect(toX(l.minX), toY(l.minZ), (l.landEdge - l.minX) * px, (l.maxZ - l.minZ) * px);
    c.fillStyle = '#e4cd9e';
    c.fillRect(toX(l.landEdge), toY(l.minZ), (l.beach.x1 - l.landEdge) * px, (l.maxZ - l.minZ) * px);

    // A subtle urban grain so the land reads as built-up rather than a flat pad.
    const rng = mulberry(9911);
    c.fillStyle = 'rgba(120,116,108,0.30)';
    for (let i = 0; i < 2600; i++) {
      const x = l.minX + rng() * (l.landEdge - l.minX);
      const z = l.minZ + rng() * (l.maxZ - l.minZ);
      c.fillRect(toX(x), toY(z), 3, 3);
    }

    // Roads as light ribbons: avenues run in Z, streets run in X out to the coast.
    c.strokeStyle = '#98a0a8';
    c.lineCap = 'butt';
    c.lineWidth = l.carriageway * px;
    for (const x of l.roadsX) {
      if (x - l.carriageway / 2 > l.landEdge) continue;
      c.beginPath();
      c.moveTo(toX(x), toY(l.minZ));
      c.lineTo(toX(x), toY(l.maxZ));
      c.stroke();
    }
    for (const z of l.roadsZ) {
      c.beginPath();
      c.moveTo(toX(l.minX), toY(z));
      c.lineTo(toX(Math.min(l.landEdge, l.maxX)), toY(z));
      c.stroke();
    }

    // Blocks sit inside the grid; draw them after the roads so their edges are crisp.
    for (const b of l.blocks) {
      if (b.kind === 'park') c.fillStyle = '#3f6d4d';
      else if (b.kind === 'urban') c.fillStyle = '#5a5f66';
      else continue;
      const pad = 0.6;
      c.fillRect(toX(b.x0 + pad), toY(b.z0 + pad), (b.x1 - b.x0 - pad * 2) * px, (b.z1 - b.z0 - pad * 2) * px);
    }

    // The marina basin, a notch of water in the sand.
    const m = l.marina;
    if (m) {
      c.fillStyle = '#12455f';
      c.fillRect(toX(m.x0), toY(m.z0), (m.x1 - m.x0) * px, (m.z1 - m.z0) * px);
      c.fillStyle = 'rgba(160,206,196,0.55)';
      c.fillRect(toX(m.x0) - 1, toY(m.z0) - 1, (m.x1 - m.x0) * px + 2, 2);
    }

    // Coastline and surf.
    c.strokeStyle = '#6fe0d4';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(toX(l.landEdge), toY(l.minZ));
    c.lineTo(toX(l.landEdge), toY(l.maxZ));
    c.stroke();
    c.strokeStyle = 'rgba(214,248,244,0.65)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(toX(l.beach.x1), toY(l.minZ));
    c.lineTo(toX(l.beach.x1), toY(l.maxZ));
    c.stroke();
  }

  draw(player, { vehicles = [], cops = [], objective = null, heading = 0 } = {}) {
    const c = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const l = this.layout;
    const span = this.span;
    c.save();
    c.clearRect(0, 0, W, H);
    c.beginPath();
    c.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2);
    c.clip();

    // Source window of the baked map, `span` metres across, centred on the player.
    const srcW = span * this.px;
    const sx = this.baseSize / 2 + (player.x - this.centre.x) * this.px - srcW / 2;
    const sy = this.baseSize / 2 + (player.z - this.centre.z) * this.px - srcW / 2;
    c.fillStyle = '#12455f';
    c.fillRect(0, 0, W, H);
    c.drawImage(this.base, sx, sy, srcW, srcW, 0, 0, W, H);

    const mPerPx = W / span;
    const toScreen = (x, z) => [W / 2 + (x - player.x) * mPerPx, H / 2 + (z - player.z) * mPerPx];

    // Objective marker, clamped to the rim of the dial with an arrowhead.
    if (objective) {
      const [ox, oy] = toScreen(objective.x, objective.z);
      const dx = ox - W / 2;
      const dy = oy - H / 2;
      const len = Math.hypot(dx, dy) || 1;
      const maxR = W / 2 - 11;
      const edge = len > maxR;
      const mx = edge ? W / 2 + (dx / len) * maxR : ox;
      const my = edge ? H / 2 + (dy / len) * maxR : oy;
      c.fillStyle = '#ffd257';
      c.strokeStyle = 'rgba(22,18,10,0.95)';
      c.lineWidth = 2;
      c.beginPath();
      if (edge) {
        const a = Math.atan2(dy, dx);
        c.moveTo(mx + Math.cos(a) * 8, my + Math.sin(a) * 8);
        c.lineTo(mx + Math.cos(a + 2.5) * 6, my + Math.sin(a + 2.5) * 6);
        c.lineTo(mx + Math.cos(a - 2.5) * 6, my + Math.sin(a - 2.5) * 6);
        c.closePath();
      } else {
        c.arc(mx, my, 7, 0, Math.PI * 2);
      }
      c.fill();
      c.stroke();
      if (!edge) {
        c.fillStyle = '#20180c';
        c.font = 'bold 10px monospace';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('★', mx, my + 0.5);
      }
    }

    // Police blips read as police at a glance and keep both colours on screen at every instant: a
    // solid red core inside a blue ring. Alternating a single colour by wall clock (the previous
    // approach) meant a still could catch one colour only, which reads as a random dot.
    for (const cop of cops) {
      const [x, y] = toScreen(cop.x, cop.z);
      c.fillStyle = '#2f6dff';
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ff4d3d';
      c.beginPath();
      c.arc(x, y, 3.4, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(10,14,20,0.85)';
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.stroke();
    }

    // Traffic and parked cars as pale dashes.
    c.fillStyle = 'rgba(238,234,222,0.55)';
    for (const v of vehicles) {
      const [x, y] = toScreen(v.x, v.z);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      c.fillRect(x - 1.5, y - 1.5, 3, 3);
    }

    // The player: a white wedge pointing where they face.
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(-heading + Math.PI);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#101820';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(6.5, 7);
    c.lineTo(0, 3.5);
    c.lineTo(-6.5, 7);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();

    c.restore();
  }

  // The whole city at once for the map screen: the same baked base, fitted to the canvas, with the
  // road grid, the districts, the player and the mission marker. No scrolling and no clipping.
  drawFull(canvas, { player = null, objective = null, cops = [] } = {}) {
    const c = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const l = this.layout;
    c.fillStyle = '#0d3550';
    c.fillRect(0, 0, W, H);

    // Fit the city rectangle into the canvas with a small margin.
    const cityW = l.maxX - l.minX;
    const cityH = l.maxZ - l.minZ;
    const pad = 26;
    const scale = Math.min((W - pad * 2) / cityW, (H - pad * 2) / cityH);
    const offX = (W - cityW * scale) / 2 - l.minX * scale;
    const offY = (H - cityH * scale) / 2 - l.minZ * scale;
    const px = (x) => offX + x * scale;
    const py = (z) => offY + z * scale;

    c.imageSmoothingEnabled = true;
    c.drawImage(
      this.base,
      px(l.minX), py(l.minZ), cityW * scale, cityH * scale,
    );

    // A thin frame so the land reads as land and the sea as sea.
    c.strokeStyle = 'rgba(210,244,240,0.35)';
    c.lineWidth = 2;
    c.strokeRect(px(l.minX), py(l.minZ), cityW * scale, cityH * scale);

    // District labels, centred on their block clusters.
    c.font = '600 13px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let bx = 0; bx < l.blocksX; bx += 2) {
      for (let bz = 0; bz < l.blocksZ; bz += 2) {
        const block = l.blocks[bx + bz * l.blocksX];
        if (!block || !block.district) continue;
        const cx = px((block.x0 + block.x1) / 2);
        const cy = py((block.z0 + block.z1) / 2);
        c.fillStyle = 'rgba(255,246,226,0.62)';
        c.fillText(block.district.toUpperCase(), cx, cy);
      }
    }

    if (player) {
      const x = px(player.x);
      const y = py(player.z);
      c.save();
      c.translate(x, y);
      c.rotate(-(player.heading ?? 0) + Math.PI);
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#0b1a24';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(0, -13);
      c.lineTo(9, 10);
      c.lineTo(0, 5);
      c.lineTo(-9, 10);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }

    for (const cop of cops) {
      c.fillStyle = '#e8463c';
      c.beginPath();
      c.arc(px(cop.x), py(cop.z), 5, 0, Math.PI * 2);
      c.fill();
    }

    if (objective) {
      const x = px(objective.x);
      const y = py(objective.z);
      c.fillStyle = '#ffd257';
      c.strokeStyle = '#241a08';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#241a08';
      c.font = 'bold 12px system-ui, sans-serif';
      c.fillText('★', x, y + 0.5);
    }
  }
}

// A tiny deterministic PRNG so the grain is identical on every load.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
