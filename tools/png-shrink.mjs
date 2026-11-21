// PNG shrinker: decode a truecolour PNG with no dependencies, quantise it to an indexed palette
// with Floyd-Steinberg dithering, and re-encode it as a PNG-8. Chromium writes 1280x720 RGBA
// screenshots at 500-600 KiB; the deliverable caps each shot at 256 KiB, and a 256-colour indexed
// PNG of a shaded 3D scene lands comfortably under that without visible banding.
//
// Used by tools/shoot.mjs, and runnable on its own:
//   node tools/png-shrink.mjs in.png out.png [colours]
//
// Also exposes decodePng() so the shot audit can inspect the exact bytes that get shipped.

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ---------------------------------------------------------------- decode
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 0;
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  // A palette PNG carries its colours in PLTE; expand it back to RGB so callers always see RGB.
  let palette = null;
  if (colorType === 3) {
    let p = 8;
    while (p < buf.length) {
      const len = buf.readUInt32BE(p);
      const type = buf.toString('ascii', p + 4, p + 8);
      if (type === 'PLTE') {
        const raw = buf.subarray(p + 8, p + 8 + len);
        palette = [];
        for (let i = 0; i < raw.length; i += 3) palette.push([raw[i], raw[i + 1], raw[i + 2]]);
        break;
      }
      if (type === 'IEND') break;
      p += 12 + len;
    }
    if (!palette) throw new Error('indexed PNG without a PLTE chunk');
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  if (palette) {
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const p = palette[out[i]] ?? [0, 0, 0];
      rgb[i * 3] = p[0];
      rgb[i * 3 + 1] = p[1];
      rgb[i * 3 + 2] = p[2];
    }
    return { width, height, channels: 3, data: rgb };
  }
  return { width, height, channels, data: out };
}

// ---------------------------------------------------------------- palette
// Median cut over a 5-bit histogram: good enough for a scene, and fast in plain JS.
function buildPalette(pixels, channels, maxColours) {
  const hist = new Map();
  const count = pixels.length / channels;
  for (let i = 0; i < count; i++) {
    const o = i * channels;
    const r = pixels[o];
    const g = pixels[o + 1];
    const b = pixels[o + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = hist.get(key);
    if (e) {
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else {
      hist.set(key, { n: 1, r, g, b });
    }
  }
  let boxes = [{ colours: [...hist.values()] }];
  const extent = (box) => {
    let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
    for (const c of box.colours) {
      if (c.r / c.n < rmin) rmin = c.r / c.n;
      if (c.r / c.n > rmax) rmax = c.r / c.n;
      if (c.g / c.n < gmin) gmin = c.g / c.n;
      if (c.g / c.n > gmax) gmax = c.g / c.n;
      if (c.b / c.n < bmin) bmin = c.b / c.n;
      if (c.b / c.n > bmax) bmax = c.b / c.n;
    }
    return { r: rmax - rmin, g: gmax - gmin, b: bmax - bmin };
  };
  while (boxes.length < maxColours) {
    let bestIdx = -1;
    let bestScore = -1;
    let bestAxis = 'r';
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colours.length < 2) continue;
      const e = extent(boxes[i]);
      const axis = e.r >= e.g && e.r >= e.b ? 'r' : e.g >= e.b ? 'g' : 'b';
      const score = e[axis] * Math.log2(boxes[i].colours.length + 1);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestAxis = axis;
      }
    }
    if (bestIdx < 0) break;
    const box = boxes[bestIdx];
    box.colours.sort((p, q) => p[bestAxis] / p.n - q[bestAxis] / q.n);
    const total = box.colours.reduce((s, c) => s + c.n, 0);
    let acc = 0;
    let split = 0;
    for (let i = 0; i < box.colours.length - 1; i++) {
      acc += box.colours[i].n;
      if (acc >= total / 2) {
        split = i + 1;
        break;
      }
      split = i + 1;
    }
    const a = box.colours.slice(0, split);
    const b = box.colours.slice(split);
    if (!a.length || !b.length) {
      boxes.splice(bestIdx, 1);
      continue;
    }
    boxes.splice(bestIdx, 1, { colours: a }, { colours: b });
  }
  const result = boxes.map((box) => {
    let n = 0, r = 0, g = 0, b = 0;
    for (const c of box.colours) {
      n += c.n;
      r += c.r;
      g += c.g;
      b += c.b;
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
  // Order the palette along a luminance ramp. Adjacent indices then hold similar colours, so the
  // per-row filters in encodeIndexedPng produce small residuals and zlib has far less to do.
  result.sort((p, q) => p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114 - (q[0] * 0.299 + q[1] * 0.587 + q[2] * 0.114));
  return result;
}

function nearest(palette, r, g, b, cache) {
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  cache.set(key, best);
  return best;
}

// ---------------------------------------------------------------- encode
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

export function encodeIndexedPng(width, height, indices, palette) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 3;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const plte = Buffer.alloc(palette.length * 3);
  palette.forEach((p, i) => {
    plte[i * 3] = p[0];
    plte[i * 3 + 1] = p[1];
    plte[i * 3 + 2] = p[2];
  });
  // Adaptive per-row filtering: try each PNG filter and keep whichever yields the smallest
  // sum of absolute residuals. On palette data this typically trims another 10-20% versus
  // unfiltered rows, which is the difference between fitting the size cap or not.
  const stride = width;
  const raw = Buffer.alloc((width + 1) * height);
  const candidate = Buffer.alloc(stride);
  const best = Buffer.alloc(stride);
  let prevRow = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    const cur = indices.subarray(rowStart, rowStart + width);
    let bestFilter = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let x = 0; x < width; x++) {
        const a = x > 0 ? cur[x - 1] : 0;
        const b = prevRow[x];
        const c = x > 0 ? prevRow[x - 1] : 0;
        let v;
        if (f === 0) v = cur[x];
        else if (f === 1) v = cur[x] - a;
        else if (f === 2) v = cur[x] - b;
        else if (f === 3) v = cur[x] - ((a + b) >> 1);
        else {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          v = cur[x] - pred;
        }
        candidate[x] = v & 0xff;
        score += v < 128 ? v : 256 - v;
        if (score >= bestScore) break;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = f;
        candidate.copy(best);
      }
    }
    raw[y * (width + 1)] = bestFilter;
    best.copy(raw, y * (width + 1) + 1);
    prevRow = Buffer.from(cur);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- public helper
// Shrink to a hard byte budget by walking quality down until it fits: fewer palette entries
// first, then less dither (dither noise is what zlib struggles with most). Returns the first
// encoding under `budgetBytes`, or the smallest one tried.
export function shrinkPngToBudget(buf, budgetBytes = 250 * 1024) {
  const attempts = [
    [256, 0.5],
    [256, 0.25],
    [224, 0.2],
    [192, 0.15],
    [160, 0.1],
    [128, 0.05],
    [112, 0],
    [96, 0],
    [72, 0],
    [56, 0],
  ];
  let smallest = null;
  for (const [colours, dither] of attempts) {
    const out = shrinkPng(buf, colours, dither);
    if (!smallest || out.buffer.length < smallest.buffer.length) smallest = out;
    if (out.buffer.length < budgetBytes) {
      return { ...out, colours, dither, attempts: attempts.indexOf([colours, dither]) + 1 };
    }
  }
  return { ...smallest, colours: 56, dither: 0 };
}

export function shrinkPng(buf, maxColours = 256, dither = 0.9) {
  const img = decodePng(buf);
  const { width, height, channels, data } = img;
  const palette = buildPalette(data, channels, maxColours);
  const count = width * height;
  // Work in float to carry the dither error.
  const work = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = i * channels;
    work[i * 3] = data[o];
    work[i * 3 + 1] = data[o + 1];
    work[i * 3 + 2] = data[o + 2];
  }
  const indices = Buffer.alloc(count);
  const cache = new Map();
  const push = (i, er, eg, eb, w) => {
    work[i * 3] += er * w;
    work[i * 3 + 1] += eg * w;
    work[i * 3 + 2] += eb * w;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = Math.max(0, Math.min(255, work[i * 3]));
      const g = Math.max(0, Math.min(255, work[i * 3 + 1]));
      const b = Math.max(0, Math.min(255, work[i * 3 + 2]));
      const idx = nearest(palette, Math.round(r), Math.round(g), Math.round(b), cache);
      indices[i] = idx;
      const p = palette[idx];
      const er = (r - p[0]) * dither;
      const eg = (g - p[1]) * dither;
      const eb = (b - p[2]) * dither;
      if (x + 1 < width) push(i + 1, er, eg, eb, 7 / 16);
      if (y + 1 < height) {
        if (x > 0) push(i + width - 1, er, eg, eb, 3 / 16);
        push(i + width, er, eg, eb, 5 / 16);
        if (x + 1 < width) push(i + width + 1, er, eg, eb, 1 / 16);
      }
    }
  }
  return { buffer: encodeIndexedPng(width, height, indices, palette), width, height, colours: palette.length };
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && process.argv[1].endsWith('png-shrink.mjs')) {
  const [, , input, output, colours] = process.argv;
  const result = shrinkPng(readFileSync(input), Number(colours ?? 256));
  writeFileSync(output, result.buffer);
  console.log(`${output}: ${result.width}x${result.height} ${result.colours} colours ${result.buffer.length} bytes`);
}
