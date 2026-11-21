// The horizon: a far ground plane, a ring of dry hills behind the city, low suburban sprawl
// between the grid and the hills, and a distant headland across the bay. Without this the city
// reads as a diorama floating in fog; with it the fog has something to hold.

import * as THREE from 'three';
import { GeometryBuilder } from '../core/merge.js';
import { makeRng } from '../core/random.js';

export function buildBackdrop(layout, scene) {
  const rng = makeRng(layout.seed ^ 0xba5e);
  const group = new THREE.Group();
  group.name = 'backdrop';

  // Far ground: a very large disc of dry coastal scrub under everything.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xc4a982, roughness: 1, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(layout.originX + layout.width * 0.4, -0.12, (layout.minZ + layout.maxZ) / 2);
  ground.receiveShadow = false;
  group.add(ground);

  // Distant hills: a ring of squat cones and ridges around the landward side, tinted to the fog
  // so they sit back in the haze.
  const hillB = new GeometryBuilder({ uv: false, color: true });
  const cx = layout.originX + layout.width * 0.35;
  const cz = (layout.minZ + layout.maxZ) / 2;
  for (let i = 0; i < 26; i++) {
    const ang = -Math.PI * 0.95 + (i / 25) * Math.PI * 1.9;
    const radius = 780 + rng.range(-120, 220);
    const hx = cx + Math.cos(ang) * radius;
    const hz = cz + Math.sin(ang) * radius;
    if (hx > layout.seaEdge - 60) continue;
    const h = rng.range(45, 130);
    const w = rng.range(200, 380);
    hill(hillB, hx, hz, w, h, 9, [0.72, 0.62, 0.5]);
  }
  const hillMesh = new THREE.Mesh(
    hillB.build(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  );
  group.add(hillMesh);

  // A headland across the bay to the north-east, so the sea has a far shore.
  const headB = new GeometryBuilder({ uv: false, color: true });
  for (let i = 0; i < 9; i++) {
    const hx = layout.seaEdge + 560 + rng.range(-160, 260);
    const hz = layout.minZ - 260 + i * 130;
    hill(headB, hx, hz, rng.range(240, 420), rng.range(38, 96), 8, [0.55, 0.6, 0.58]);
  }
  const head = new THREE.Mesh(
    headB.build(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  );
  group.add(head);

  // Outlying low sprawl beyond the grid: little roofs and walls fading into haze.
  const sprawlB = new GeometryBuilder({ uv: false, color: true });
  const roofs = [
    [0.72, 0.4, 0.32],
    [0.85, 0.8, 0.72],
    [0.55, 0.58, 0.6],
    [0.86, 0.72, 0.55],
  ];
  for (let i = 0; i < 190; i++) {
    const side = rng.int(0, 2);
    let x;
    let z;
    if (side === 0) {
      x = layout.minX - rng.range(20, 300);
      z = rng.range(layout.minZ - 260, layout.maxZ + 260);
    } else if (side === 1) {
      x = rng.range(layout.minX - 220, layout.landEdge - 20);
      z = layout.minZ - rng.range(24, 300);
    } else {
      x = rng.range(layout.minX - 220, layout.landEdge - 20);
      z = layout.maxZ + rng.range(24, 300);
    }
    const w = rng.range(9, 24);
    const d = rng.range(9, 22);
    const h = rng.range(4, 11);
    const col = roofs[rng.int(0, roofs.length - 1)];
    sprawlB.box(x, h / 2, z, w, h, d, col, 0.12);
  }
  const sprawl = new THREE.Mesh(
    sprawlB.build(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
  );
  sprawl.receiveShadow = false;
  group.add(sprawl);

  scene.add(group);
  return { group };
}

// A cone-ish hill built from triangles: cheap, flat shaded, and honest about being scenery.
function hill(b, cx, cz, width, height, segments, color) {
  const rings = 3;
  for (let r = 0; r < rings; r++) {
    const t0 = r / rings;
    const t1 = (r + 1) / rings;
    const y0 = height * Math.sin(t0 * Math.PI * 0.5) * 0.72;
    const y1 = height * Math.sin(t1 * Math.PI * 0.5) * 0.72;
    const w0 = width * (1 - t0 * 0.62);
    const w1 = width * (1 - t1 * 0.62);
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * w0, y0, cz + Math.sin(a0) * w0];
      const p1 = [cx + Math.cos(a1) * w0, y0, cz + Math.sin(a1) * w0];
      const q0 = [cx + Math.cos(a0) * w1, y1, cz + Math.sin(a0) * w1];
      const q1 = [cx + Math.cos(a1) * w1, y1, cz + Math.sin(a1) * w1];
      const shade = 0.82 + ((i * 7 + r * 3) % 5) * 0.04;
      b.quad(p0, p1, q1, q0, [Math.cos(a0), 0.4, Math.sin(a0)],
        [0, 0], [1, 0], [1, 1], [0, 1],
        [color[0] * shade, color[1] * shade, color[2] * shade]);
    }
  }
}
