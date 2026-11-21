// The blocks themselves: buildings from stacked, tapered volumes with procedural facade textures,
// roof plant, awnings, corner shops, neon signs, and rooftop props. Also records a collider box
// for every solid volume. No image files are read; the facade sheets come from canvas textures.

import * as THREE from 'three';
import { GeometryBuilder } from '../core/merge.js';
import { makeRng } from '../core/random.js';
import { facadeTexture, facadeStyleNames } from '../render/textures.js';
import { addBoxCollider } from './colliders.js';

const FLOOR_H = 3.2;
const TILE_W = 8 * 3.15; // facade sheet spans 8 window bays
const TILE_H = 6 * FLOOR_H;

export function buildBuildings(layout, scene, colliders) {
  const rng = makeRng(layout.seed ^ 0x5eed);
  const group = new THREE.Group();
  group.name = 'buildings';

  // One merged mesh per facade style keeps the draw calls low while preserving variety.
  const styleCount = facadeStyleNames().length;
  const builders = [];
  const materials = [];
  for (let s = 0; s < styleCount; s++) {
    builders.push(new GeometryBuilder({ uv: true }));
    materials.push(
      new THREE.MeshStandardMaterial({
        map: facadeTexture(s, s % 3),
        roughness: 0.82,
        metalness: 0.05,
        side: THREE.FrontSide,
      }),
    );
  }

  const trimB = new GeometryBuilder({ uv: false, color: true });
  const glassB = new GeometryBuilder({ uv: false, color: true });
  const signB = new GeometryBuilder({ uv: false, color: true });
  const neonB = new GeometryBuilder({ uv: false, color: true });
  const awnB = new GeometryBuilder({ uv: false, color: true });

  const buildings = [];

  for (const block of layout.blocks) {
    if (block.kind !== 'urban') continue;
    const count = block.downtown ? 1 : rng.int(2, 3);
    const pads = splitBlock(block, count, rng);
    for (const pad of pads) {
      const style = block.downtown ? (rng.chance(0.5) ? 5 : 3) : rng.int(0, 4);
      const baseH = Math.max(8, block.height * rng.range(0.55, 1.0));
      const inset = rng.range(0.6, 2.2);
      const w = Math.max(10, pad.w - inset * 2);
      const d = Math.max(10, pad.d - inset * 2);
      const cx = pad.cx;
      const cz = pad.cz;
      const floors = Math.max(2, Math.round(baseH / FLOOR_H));
      const h = floors * FLOOR_H;
      const b = builders[style];
      // Podium: ground floor slightly wider, a setback tower above.
      const podiumH = Math.min(h, FLOOR_H * rng.int(1, 2));
      b.walls(cx, cz, w, d, 0, podiumH, TILE_W, TILE_H, rng.range(0, 1), 0);
      const towerInset = block.downtown ? rng.range(2, 6) : rng.range(0.5, 2.2);
      const tw = Math.max(8, w - towerInset * 2);
      const td = Math.max(8, d - towerInset * 2);
      if (h > podiumH) {
        b.walls(cx, cz, tw, td, podiumH, h, TILE_W, TILE_H, rng.range(0, 1), podiumH / TILE_H);
        // podium roof ring
        trimB.box(cx, podiumH - 0.15, cz, w, 0.3, d, [1, 1, 1]);
      }
      // roof slab + parapet
      const rw = h > podiumH ? tw : w;
      const rd = h > podiumH ? td : d;
      trimB.roof(cx, cz, rw, rd, h, 0.12);
      const pc = [0.86, 0.80, 0.70];
      trimB.box(cx, h + 0.28, cz + rd / 2 - 0.2, rw, 0.56, 0.4, pc);
      trimB.box(cx, h + 0.28, cz - rd / 2 + 0.2, rw, 0.56, 0.4, pc);
      trimB.box(cx + rw / 2 - 0.2, h + 0.28, cz, 0.4, 0.56, rd, pc);
      trimB.box(cx - rw / 2 + 0.2, h + 0.28, cz, 0.4, 0.56, rd, pc);

      // Roof plant: AC units, water tanks, stair housings.
      const roofY = h;
      const plant = rng.int(1, 3);
      for (let i = 0; i < plant; i++) {
        const px = cx + rng.range(-rw / 2 + 3, rw / 2 - 3);
        const pz = cz + rng.range(-rd / 2 + 3, rd / 2 - 3);
        const pw = rng.range(1.6, 3.6);
        trimB.box(px, roofY + 0.7, pz, pw, 1.4, pw * rng.range(0.7, 1.3), [0.72, 0.69, 0.63]);
      }
      if (h > 34 && rng.chance(0.55)) {
        // rooftop water tank on legs
        const tx = cx + rng.range(-rw / 3, rw / 3);
        const tz = cz + rng.range(-rd / 3, rd / 3);
        trimB.cylinder(tx, roofY + 4.2, tz, 1.9, 3.2, 10, [0.86, 0.82, 0.72], 'y');
        trimB.box(tx, roofY + 1.4, tz, 0.3, 2.4, 0.3, [0.5, 0.47, 0.42]);
        trimB.box(tx + 1.2, roofY + 1.4, tz, 0.3, 2.4, 0.3, [0.5, 0.47, 0.42]);
      }
      if (block.downtown && rng.chance(0.75)) {
        // antenna and beacon
        trimB.cylinder(cx, h + 7, cz, 0.16, 14, 6, [0.8, 0.8, 0.82], 'y');
        neonB.box(cx, h + 14.2, cz, 0.4, 0.4, 0.4, [1, 0.25, 0.2]);
      }
      // Ground floor treatment: striped awnings and a corner shop sign.
      const sides = [
        { n: [0, 0, 1], x: cx, z: cz + d / 2 },
        { n: [0, 0, -1], x: cx, z: cz - d / 2 },
        { n: [1, 0, 0], x: cx + w / 2, z: cz },
        { n: [-1, 0, 0], x: cx - w / 2, z: cz },
      ];
      const shopSide = sides[rng.int(0, 3)];
      const awnColor = rng.chance(0.5) ? [0.94, 0.93, 0.88] : [0.85, 0.36, 0.28];
      addAwning(awnB, shopSide, w, d, rng, awnColor);
      if (rng.chance(0.7)) {
        const col = rng.pick([
          [0.95, 0.42, 0.27],
          [0.2, 0.72, 0.68],
          [0.98, 0.78, 0.35],
          [0.92, 0.92, 0.88],
        ]);
        addSign(signB, shopSide, w, d, col);
        if (rng.chance(0.35)) addSign(neonB, sides[(rng.int(0, 3))], w, d, [1, 0.55, 0.35]);
      }

      // Store a few balconies as real geometry on the street face, catching the sun.
      if (!block.downtown && floors > 3 && rng.chance(0.6)) {
        const face = sides[rng.int(0, 3)];
        for (let f = 2; f < Math.min(floors, 6); f += 2) {
          const y = f * FLOOR_H;
          const along = rng.range(-0.22, 0.22);
          const bw = 3.2;
          if (Math.abs(face.n[0]) > 0) {
            trimB.box(face.x + face.n[0] * 0.7, y, cz + along * d, 1.3, 0.16, bw, [0.95, 0.92, 0.85]);
            trimB.box(face.x + face.n[0] * 1.3, y + 0.55, cz + along * d, 0.1, 1.0, bw, [0.9, 0.88, 0.82]);
          } else {
            trimB.box(cx + along * w, y, face.z + face.n[2] * 0.7, bw, 0.16, 1.3, [0.95, 0.92, 0.85]);
            trimB.box(cx + along * w, y + 0.55, face.z + face.n[2] * 1.3, bw, 1.0, 0.1, [0.9, 0.88, 0.82]);
          }
        }
      }

      addBoxCollider(colliders, cx, cz, w, d, h, 'building');
      buildings.push({ cx, cz, w, d, h, style, block });
    }
  }

  for (let s = 0; s < styleCount; s++) {
    if (builders[s].isEmpty()) continue;
    const mesh = new THREE.Mesh(builders[s].build(), materials[s]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `buildings-${facadeStyleNames()[s]}`;
    group.add(mesh);
  }

  const trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const trim = new THREE.Mesh(trimB.build(), trimMat);
  trim.castShadow = true;
  trim.receiveShadow = true;
  group.add(trim);

  const awnMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const awn = new THREE.Mesh(awnB.build(), awnMat);
  awn.castShadow = true;
  awn.receiveShadow = true;
  group.add(awn);

  const signMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x101010 });
  const signs = new THREE.Mesh(signB.build(), signMat);
  signs.castShadow = true;
  group.add(signs);

  const neonMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.4 });
  const neon = new THREE.Mesh(neonB.build(), neonMat);
  group.add(neon);

  scene.add(group);
  return { group, buildings };
}

// Split a block pad into 1-3 building footprints with a shared alley.
function splitBlock(block, count, rng) {
  const padW = block.x1 - block.x0;
  const padD = block.z1 - block.z0;
  const margin = 3;
  const inner = { x0: block.x0 + margin, x1: block.x1 - margin, z0: block.z0 + margin, z1: block.z1 - margin };
  if (count === 1) {
    return [{ cx: block.cx, cz: block.cz, w: padW - margin * 2, d: padD - margin * 2 }];
  }
  const pads = [];
  if (count === 2) {
    if (rng.chance(0.5)) {
      const gap = rng.range(4, 8);
      const w0 = (inner.x1 - inner.x0 - gap) * rng.range(0.42, 0.58);
      pads.push({ cx: inner.x0 + w0 / 2, cz: block.cz, w: w0, d: inner.z1 - inner.z0 });
      pads.push({ cx: inner.x0 + w0 + gap + (inner.x1 - inner.x0 - w0 - gap) / 2, cz: block.cz, w: inner.x1 - inner.x0 - w0 - gap, d: inner.z1 - inner.z0 });
    } else {
      const gap = rng.range(4, 8);
      const d0 = (inner.z1 - inner.z0 - gap) * rng.range(0.42, 0.58);
      pads.push({ cx: block.cx, cz: inner.z0 + d0 / 2, w: inner.x1 - inner.x0, d: d0 });
      pads.push({ cx: block.cx, cz: inner.z0 + d0 + gap + (inner.z1 - inner.z0 - d0 - gap) / 2, w: inner.x1 - inner.x0, d: inner.z1 - inner.z0 - d0 - gap });
    }
    return pads;
  }
  // three: a tall one on one half and two small ones stacked on the other
  const gap = rng.range(3, 6);
  const bigAtLeft = rng.chance(0.5);
  const halfW = (inner.x1 - inner.x0 - gap) * rng.range(0.5, 0.6);
  const leftCx = inner.x0 + halfW / 2;
  const rightCx = inner.x0 + halfW + gap + (inner.x1 - inner.x0 - halfW - gap) / 2;
  const rightW = inner.x1 - inner.x0 - halfW - gap;
  const dGap = rng.range(3, 6);
  const dTop = (inner.z1 - inner.z0 - dGap) * rng.range(0.45, 0.6);
  if (bigAtLeft) {
    pads.push({ cx: leftCx, cz: block.cz, w: halfW, d: inner.z1 - inner.z0 });
    pads.push({ cx: rightCx, cz: inner.z0 + dTop / 2, w: rightW, d: dTop });
    pads.push({ cx: rightCx, cz: inner.z0 + dTop + dGap + (inner.z1 - inner.z0 - dTop - dGap) / 2, w: rightW, d: inner.z1 - inner.z0 - dTop - dGap });
  } else {
    pads.push({ cx: rightCx, cz: block.cz, w: rightW, d: inner.z1 - inner.z0 });
    pads.push({ cx: leftCx, cz: inner.z0 + dTop / 2, w: halfW, d: dTop });
    pads.push({ cx: leftCx, cz: inner.z0 + dTop + dGap + (inner.z1 - inner.z0 - dTop - dGap) / 2, w: halfW, d: inner.z1 - inner.z0 - dTop - dGap });
  }
  return pads;
}

function addAwning(builder, side, w, d, rng, color) {
  const y = 3.0;
  if (Math.abs(side.n[0]) > 0) {
    const span = Math.min(w, 12);
    const x = side.x + side.n[0] * 0.9;
    builder.box(x, y, side.z, 1.9, 0.12, span, color);
    builder.box(x + side.n[0] * 0.2, y - 0.55, side.z, 0.08, 0.9, span, [0.35, 0.3, 0.26]);
  } else {
    const span = Math.min(d, 12);
    const z = side.z + side.n[2] * 0.9;
    builder.box(side.x, y, z, span, 0.12, 1.9, color);
    builder.box(side.x, y - 0.55, z + side.n[2] * 0.2, span, 0.9, 0.08, [0.35, 0.3, 0.26]);
  }
}

function addSign(builder, side, w, d, color) {
  const y = 4.4;
  if (Math.abs(side.n[0]) > 0) {
    const span = Math.min(w * 0.5, 6);
    const x = side.x + side.n[0] * 0.12;
    builder.box(x, y, side.z, 0.12, 1.1, span, color);
  } else {
    const span = Math.min(d * 0.5, 6);
    const z = side.z + side.n[2] * 0.12;
    builder.box(side.x, y, z, span, 1.1, 0.12, color);
  }
}
