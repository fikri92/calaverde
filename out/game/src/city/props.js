// Street furniture: palms, benches, parasols, hydrants, lamps, bollards, containers, market
// stalls, planters and billboards. Palms get their own instanced trunk + frond meshes so the
// boulevards read at a glance. Each solid prop registers a collider.

import * as THREE from 'three';
import { GeometryBuilder } from '../core/merge.js';
import { makeRng } from '../core/random.js';
import { billboardTexture, graffitiTexture } from '../render/textures.js';
import { addBoxCollider } from './colliders.js';
import { TILE } from './layout.js';
import { WALK_Y } from './roads.js';

export function buildProps(layout, scene, colliders) {
  const rng = makeRng(layout.seed ^ 0xa11ce);
  const group = new THREE.Group();
  group.name = 'props';

  const trunkGeo = new THREE.CylinderGeometry(0.26, 0.42, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.95 });
  const frondGeo = makeFrondGeometry();
  const frondMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });

  const palms = [];
  const palmTarget = 168;
  let guard = 0;
  while (palms.length < palmTarget && guard++ < 9000) {
    const b = layout.blocks[Math.floor(rng() * layout.blocks.length)];
    if (b.kind !== 'urban' && b.kind !== 'park') continue;
    const along = rng();
    const side = rng.int(0, 3);
    // Palms stand in the sidewalk band between the kerb and the building line.
    const inset = rng.range(1.6, 5.0);
    let x;
    let z;
    if (side === 0) {
      x = b.x0 - inset;
      z = b.z0 + (b.z1 - b.z0) * along;
    } else if (side === 1) {
      x = b.x1 + inset;
      z = b.z0 + (b.z1 - b.z0) * along;
    } else if (side === 2) {
      x = b.x0 + (b.x1 - b.x0) * along;
      z = b.z0 - inset;
    } else {
      x = b.x0 + (b.x1 - b.x0) * along;
      z = b.z1 + inset;
    }
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue;
    palms.push({ x, z, h: rng.range(8.5, 14), lean: rng.range(-0.07, 0.07), rot: rng() * Math.PI * 2 });
  }
  // beach palms
  for (let i = 0; i < 34; i++) {
    const x = rng.range(layout.beach.x0 + 10, layout.beach.x1 - 6);
    const z = rng.range(layout.beach.z0 + 20, layout.beach.z1 - 20);
    palms.push({ x, z, h: rng.range(9, 13.5), lean: rng.range(-0.12, 0.12), rot: rng() * Math.PI * 2 });
  }

  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, palms.length);
  trunkMesh.castShadow = true;
  trunkMesh.receiveShadow = true;
  const frondMesh = new THREE.InstancedMesh(frondGeo, frondMat, palms.length);
  frondMesh.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  palms.forEach((palm, i) => {
    // Trunks stand plumb: a leaning cylinder separates from its crown at these heights, and a
    // 10 m palm with half a metre of lean reads as a broken tree at any camera distance. Only the
    // yaw varies, so the fronds do not all point the same way.
    e.set(0, palm.rot, 0);
    q.setFromEuler(e);
    p.set(palm.x, 0.1, palm.z);
    s.set(1, palm.h, 1);
    m.compose(p, q, s);
    trunkMesh.setMatrixAt(i, m);
    // The crown sits exactly on the trunk's top: the trunk geometry is a unit cylinder scaled to
    // `palm.h`, so its apex is at the base height plus the full height, with no lateral offset.
    const crown = new THREE.Vector3(palm.x, palm.h + 0.1, palm.z);
    const scale = palm.h / 11;
    m.compose(crown, q, new THREE.Vector3(scale, scale, scale));
    frondMesh.setMatrixAt(i, m);
    addBoxCollider(colliders, palm.x, palm.z, 0.9, 0.9, palm.h, 'palm');
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  frondMesh.instanceMatrix.needsUpdate = true;
  group.add(trunkMesh, frondMesh);

  // Everything else in vertex-coloured merged geometry.
  const b = new GeometryBuilder({ uv: false, color: true });
  const glow = new GeometryBuilder({ uv: false, color: true });

  const placeOnWalk = () => {
    const b0 = layout.blocks[Math.floor(rng() * layout.blocks.length)];
    if (b0.kind !== 'urban' && b0.kind !== 'park') return null;
    const side = rng.int(0, 3);
    const inset = rng.range(1.0, 5.2);
    const t = rng();
    if (side === 0) return { x: b0.x0 - inset, z: b0.z0 + (b0.z1 - b0.z0) * t, block: b0 };
    if (side === 1) return { x: b0.x1 + inset, z: b0.z0 + (b0.z1 - b0.z0) * t, block: b0 };
    if (side === 2) return { x: b0.x0 + (b0.x1 - b0.x0) * t, z: b0.z0 - inset, block: b0 };
    return { x: b0.x0 + (b0.x1 - b0.x0) * t, z: b0.z1 + inset, block: b0 };
  };

  // Street lamps along the main avenues, on the sidewalk, arm over the carriageway.
  for (const rx of layout.roadsX) {
    for (let z = layout.roadsZ[0] + 18; z < layout.roadsZ[layout.roadsZ.length - 1]; z += 34) {
      for (const side of [-1, 1]) {
        if (rx > layout.landEdge) continue;
        const x = rx + side * (layout.driveHalf + 1.15);
        if (x > layout.landEdge - 2) continue;
        b.cylinder(x, 3.4 + WALK_Y, z, 0.09, 6.8, 6, [0.42, 0.42, 0.44], 'y');
        b.box(x - side * 0.75, 6.7 + WALK_Y, z, 1.7, 0.14, 0.16, [0.4, 0.4, 0.42]);
        glow.box(x - side * 1.35, 6.55 + WALK_Y, z, 0.5, 0.16, 0.34, [1, 0.86, 0.58]);
        addBoxCollider(colliders, x, z, 0.5, 0.5, 7, 'lamp');
      }
    }
  }

  // Hydrants, benches, planters, bollards and trash cans.
  for (let i = 0; i < 70; i++) {
    const at = placeOnWalk();
    if (!at) continue;
    const kind = rng.int(0, 4);
    if (kind === 0) {
      b.cylinder(at.x, 0.42, at.z, 0.19, 0.8, 8, [0.85, 0.25, 0.18], 'y');
      b.box(at.x, 0.75, at.z, 0.5, 0.1, 0.2, [0.7, 0.2, 0.16]);
      addBoxCollider(colliders, at.x, at.z, 0.5, 0.5, 0.9, 'prop');
    } else if (kind === 1) {
      // bench facing the road
      b.box(at.x, 0.55, at.z, 1.9, 0.12, 0.55, [0.75, 0.56, 0.34]);
      b.box(at.x, 0.9, at.z - 0.24, 1.9, 0.55, 0.1, [0.72, 0.53, 0.32]);
      b.box(at.x - 0.8, 0.28, at.z, 0.12, 0.55, 0.5, [0.32, 0.32, 0.34]);
      b.box(at.x + 0.8, 0.28, at.z, 0.12, 0.55, 0.5, [0.32, 0.32, 0.34]);
      addBoxCollider(colliders, at.x, at.z, 2.0, 0.7, 1.1, 'prop');
    } else if (kind === 2) {
      b.box(at.x, 0.5, at.z, 1.8, 0.7, 0.7, [0.72, 0.68, 0.58]);
      b.box(at.x, 0.9, at.z, 1.7, 0.1, 0.6, [0.35, 0.48, 0.22]);
      addBoxCollider(colliders, at.x, at.z, 1.9, 0.8, 1.0, 'prop');
    } else if (kind === 3) {
      b.cylinder(at.x, 0.18, at.z, 0.13, 0.4, 8, [0.55, 0.55, 0.56], 'y');
      b.cylinder(at.x, 0.25, at.z + 1.4, 0.13, 0.4, 8, [0.55, 0.55, 0.56], 'y');
    } else {
      b.cylinder(at.x, 0.45, at.z, 0.34, 0.9, 10, [0.22, 0.34, 0.3], 'y');
      b.cylinder(at.x, 0.93, at.z, 0.37, 0.08, 10, [0.16, 0.24, 0.22], 'y');
      addBoxCollider(colliders, at.x, at.z, 0.7, 0.7, 1.0, 'prop');
    }
  }

  // Beach furniture: parasols and loungers on the sand.
  for (let i = 0; i < 40; i++) {
    const x = rng.range(layout.beach.x0 + 12, layout.beach.x1 - 5);
    const z = rng.range(layout.beach.z0 + 24, layout.beach.z1 - 24);
    if (rng.chance(0.55)) {
      const col = rng.pick([
        [0.95, 0.42, 0.35],
        [0.28, 0.78, 0.72],
        [0.98, 0.82, 0.44],
        [0.94, 0.93, 0.88],
      ]);
      b.cylinder(x, 1.2, z, 0.05, 2.4, 5, [0.85, 0.85, 0.82], 'y');
      b.cylinder(x, 2.35, z, 1.25, 0.14, 10, col, 'y');
      b.cylinder(x, 2.47, z, 0.55, 0.1, 10, [1, 0.98, 0.92], 'y');
      const layX = x + rng.range(-1.6, 1.6);
      const layZ = z + 1.5;
      b.box(layX, 0.3, layZ, 0.68, 0.16, 1.9, col);
      addBoxCollider(colliders, x, z, 0.3, 0.3, 2.4, 'prop');
    } else {
      b.box(x, 0.3, z, 0.7, 0.14, 1.9, [0.85, 0.82, 0.74]);
      b.box(x, 0.55, z - 0.7, 0.7, 0.5, 0.14, [0.85, 0.82, 0.74]);
    }
  }

  // Marina containers and crates (the heist's set dressing).
  const marina = layout.marina;
  if (marina) {
    const containerCols = [
      [0.78, 0.28, 0.2],
      [0.2, 0.45, 0.6],
      [0.85, 0.62, 0.2],
      [0.3, 0.55, 0.4],
    ];
    for (let i = 0; i < 9; i++) {
      const cx = marina.x0 + rng.range(4, 26);
      const cz = marina.z0 + rng.range(-34, -14);
      const stack = rng.int(1, 2);
      for (let k = 0; k < stack; k++) {
        const col = containerCols[rng.int(0, 3)];
        b.box(cx, 1.45 + k * 2.9, cz, rng.range(5, 9), 2.8, 2.5, col);
        for (let r = 0; r < 6; r++) {
          b.box(cx - 4 + r * 1.6, 1.45 + k * 2.9, cz + 1.28, 0.12, 2.7, 0.06, [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
        }
      }
      addBoxCollider(colliders, cx, cz, 9, 2.6, 1.5 + stack * 2.9, 'container');
    }
    // crates on the quay
    for (let i = 0; i < 7; i++) {
      const cx = marina.x0 + rng.range(3, 30);
      const cz = marina.cz + rng.range(16, 40);
      b.box(cx, 0.5, cz, 1.3, 0.9, 1.1, [0.62, 0.5, 0.32]);
      addBoxCollider(colliders, cx, cz, 1.4, 1.2, 1.0, 'prop');
    }
  }

  // Market stalls in the parks.
  for (const block of layout.blocks) {
    if (block.kind !== 'park') continue;
    for (let i = 0; i < 5; i++) {
      const x = block.x0 + 10 + rng.range(0, block.x1 - block.x0 - 20);
      const z = block.z0 + 10 + rng.range(0, block.z1 - block.z0 - 20);
      const col = rng.pick([
        [0.9, 0.35, 0.3],
        [0.95, 0.8, 0.35],
        [0.25, 0.7, 0.65],
      ]);
      b.box(x, 0.85, z, 2.6, 0.12, 1.8, [0.8, 0.62, 0.4]);
      b.box(x, 1.9, z, 2.9, 0.14, 2.1, col);
      for (const dx of [-1.25, 1.25]) {
        for (const dz of [-0.9, 0.9]) b.cylinder(x + dx, 0.9, z + dz, 0.06, 1.8, 5, [0.55, 0.5, 0.42], 'y');
      }
      addBoxCollider(colliders, x, z, 2.8, 2.0, 1.8, 'stall');
    }
  }

  // Billboards on the big roads.
  const billboards = [];
  for (let i = 0; i < 7; i++) {
    const rx = layout.roadsX[rng.int(1, layout.roadsX.length - 2)];
    const z = layout.roadsZ[0] + 25 + rng.range(0, layout.roadsZ[layout.roadsZ.length - 1] - layout.roadsZ[0] - 50);
    const x = rx + (rng.chance(0.5) ? 1 : -1) * (layout.driveHalf + 4.2);
    if (x > layout.landEdge - 4) continue;
    const side = rng.chance(0.5) ? 1 : -1;
    b.cylinder(x, 4.6, z, 0.22, 9.2, 6, [0.4, 0.4, 0.42], 'y');
    const tex = billboardTexture(i);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 5.5),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0x2a2a2a }),
    );
    panel.position.set(x + side * 0.3, 8.2, z);
    panel.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    panel.castShadow = true;
    group.add(panel);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 5.9, 11.4),
      new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.7 }),
    );
    frame.position.set(x, 8.2, z);
    frame.castShadow = true;
    group.add(frame);
    addBoxCollider(colliders, x, z, 0.7, 11.4, 9.4, 'billboard');
    billboards.push({ x, z, side });
  }

  // Graffiti panels on a few walls keep the backstreets from reading as clean.
  const graffiti = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 3.5),
    new THREE.MeshStandardMaterial({ map: graffitiTexture(), transparent: true, roughness: 0.9 }),
  );
  graffiti.position.set(layout.blocks[7].x0 - 3.6, 2.4, layout.blocks[7].cz + 6);
  graffiti.rotation.y = -Math.PI / 2;
  group.add(graffiti);

  // Park trees: low, wide canopies in the green squares.
  for (const block of layout.blocks) {
    if (block.kind !== 'park') continue;
    for (let i = 0; i < 12; i++) {
      const x = block.x0 + 7 + rng.range(0, block.x1 - block.x0 - 14);
      const z = block.z0 + 7 + rng.range(0, block.z1 - block.z0 - 14);
      b.cylinder(x, 1.5, z, 0.22, 3, 6, [0.42, 0.32, 0.22], 'y');
      b.cylinder(x, 3.6, z, 2.4, 2.2, 8, [0.28, 0.46, 0.24], 'y');
      addBoxCollider(colliders, x, z, 0.6, 0.6, 3, 'tree');
    }
  }

  // Bus shelters and a couple of food carts on the busiest corners.
  for (let i = 0; i < 6; i++) {
    const at = placeOnWalk();
    if (!at) continue;
    b.box(at.x, 2.5, at.z, 3.4, 0.16, 1.4, [0.3, 0.34, 0.38]);
    b.box(at.x, 1.2, at.z - 0.7, 3.4, 2.2, 0.1, [0.55, 0.68, 0.72]);
    for (const dx of [-1.6, 1.6]) b.cylinder(at.x + dx, 1.25, at.z + 0.6, 0.07, 2.5, 5, [0.4, 0.4, 0.42], 'y');
    b.box(at.x, 0.55, at.z + 0.1, 2.6, 0.1, 0.5, [0.6, 0.5, 0.4]);
    addBoxCollider(colliders, at.x, at.z, 3.5, 1.5, 2.6, 'shelter');
  }

  const propMesh = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  propMesh.castShadow = true;
  propMesh.receiveShadow = true;
  group.add(propMesh);
  const glowMesh = new THREE.Mesh(
    glow.build(),
    new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffd9a0, emissiveIntensity: 0.9, roughness: 0.4 }),
  );
  group.add(glowMesh);

  scene.add(group);
  return { group, palms };
}

// One palm crown: solid, tapered leaves (no alpha, so they read at any distance), plus a
// coconut cluster. Vertex colours give the crown a little tonal variety without a texture.
function makeFrondGeometry() {
  const b = new GeometryBuilder({ uv: false, color: true });
  const blades = 11;
  for (let i = 0; i < blades; i++) {
    const ang = (i / blades) * Math.PI * 2 + (i % 2) * 0.16;
    const droop = 0.55 + (i % 4) * 0.13;
    const len = 3.3 + (i % 3) * 0.35;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const green = [0.16 + (i % 3) * 0.035, 0.42 + (i % 4) * 0.045, 0.15 + (i % 2) * 0.03];
    const dark = [green[0] * 0.72, green[1] * 0.78, green[2] * 0.7];
    // A leaf is a strip of four quads, arching out then drooping at the tip.
    const segs = 4;
    let prevL = null;
    let prevR = null;
    let prevC = null;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const out = Math.sin(t * 1.35) * len;
      const up = Math.cos(t * 1.1) * 1.15 - droop * t * t * 1.5;
      const halfW = 0.30 * (1 - t * 0.86) + 0.03;
      const c = [dx * out, up, dz * out];
      const l = [c[0] - dz * halfW, c[1] - halfW * 0.35, c[2] + dx * halfW];
      const r = [c[0] + dz * halfW, c[1] - halfW * 0.35, c[2] - dx * halfW];
      if (prevL) {
        b.quad(prevL, prevR, r, l, [0, 1, 0],
          [0, 0], [1, 0], [1, 1], [0, 1], green);
        b.quad(prevR, prevL, l, r, [0, -1, 0],
          [0, 0], [1, 0], [1, 1], [0, 1], dark);
      }
      prevL = l;
      prevR = r;
      prevC = c;
    }
  }
  // Coconut cluster at the crown's heart.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box(Math.cos(a) * 0.32, -0.22 + (i % 2) * 0.1, Math.sin(a) * 0.32, 0.26, 0.26, 0.26, [0.32, 0.24, 0.12]);
  }
  return b.build();
}
