// Asphalt, sidewalks, curbs, lane markings, crosswalks, manholes and storm drains. Everything is
// merged into a handful of meshes: one for each carriageway, one for the walk strips, one for the
// painted markings. The right-of-way is a carriageway down the middle with a raised sidewalk on
// each side, so a street reads as a street at eye height.

import * as THREE from 'three';
import { GeometryBuilder } from '../core/merge.js';
import { asphaltTexture, pavementTexture } from '../render/textures.js';
import { TILE, tileAt } from './layout.js';

export const ROAD_Y = 0.02;
export const MARK_Y = 0.052;
export const WALK_Y = 0.17;
const asphaltMetresPerTile = 7.2;
const walkMetresPerTile = 6.0;

export function buildRoads(layout, scene) {
  const asphalt = asphaltTexture();
  asphalt.repeat.set(1, 1);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, color: 0xffffff, roughness: 0.9, metalness: 0.02 });
  const walkTex = pavementTexture();
  walkTex.repeat.set(1, 1);
  const walkMat = new THREE.MeshStandardMaterial({ map: walkTex, color: 0xffffff, roughness: 0.88 });

  const roadB = new GeometryBuilder({ uv: true });
  const yellowB = new GeometryBuilder({ uv: false, color: true });
  const whiteB = new GeometryBuilder({ uv: false, color: true });
  const curbB = new GeometryBuilder({ uv: false, color: true });
  const walkB = new GeometryBuilder({ uv: true });
  const drainB = new GeometryBuilder({ uv: false, color: true });

  const x0 = layout.roadsX[0];
  const x1 = layout.landEdge;
  const z0 = layout.roadsZ[0];
  const z1 = layout.roadsZ[layout.roadsZ.length - 1];
  const drive = layout.driveHalf;
  const walk = layout.walkWidth;

  // Carriageways: one asphalt sheet per avenue, plus the short marina access road.
  for (const rx of layout.roadsX) {
    if (rx - drive > layout.landEdge) continue;
    const right = Math.min(rx + drive, layout.landEdge);
    roadB.slab((rx - drive + right) / 2, ROAD_Y, (z0 + z1) / 2, Math.max(0.1, right - (rx - drive)), z1 - z0 + drive * 2, [1, 1, 1], 1 / asphaltMetresPerTile);
  }
  for (const rz of layout.roadsZ) {
    roadB.slab((x0 + layout.landEdge) / 2, ROAD_Y, rz, layout.landEdge - x0, drive * 2, [1, 1, 1], 1 / asphaltMetresPerTile);
  }
  if (layout.marina) {
    const mz = layout.marina.cz;
    roadB.slab((layout.landEdge + layout.marina.x0 + 10) / 2, ROAD_Y, mz, 12, drive * 2, [1, 1, 1], 1 / asphaltMetresPerTile);
  }

  // Sidewalks: raised strips along both sides of every avenue, and a ring around each block.
  const walkColor = [1, 1, 1];
  const curbColor = [0.82, 0.76, 0.65];
  for (const rx of layout.roadsX) {
    if (rx > layout.landEdge) continue;
    for (const side of [-1, 1]) {
      const cx = rx + side * (drive + walk / 2);
      if (cx > layout.landEdge + 2) continue;
      walkB.slab(cx, WALK_Y, (z0 + z1) / 2, walk, z1 - z0, walkColor, 1 / walkMetresPerTile);
      const kerbX = rx + side * drive;
      curbB.box(kerbX, (WALK_Y - 0.02) / 2 + 0.02, (z0 + z1) / 2, 0.42, WALK_Y + 0.06, z1 - z0, curbColor);
    }
  }
  for (const rz of layout.roadsZ) {
    for (const side of [-1, 1]) {
      const cz = rz + side * (drive + walk / 2);
      const cx = (x0 + layout.landEdge) / 2;
      walkB.slab(cx, WALK_Y, cz, layout.landEdge - x0, walk, walkColor, 1 / walkMetresPerTile);
      const kerbZ = rz + side * drive;
      curbB.box(cx, (WALK_Y - 0.02) / 2 + 0.02, kerbZ, layout.landEdge - x0, WALK_Y + 0.06, 0.42, curbColor);
    }
  }
  // The coastal promenade: a raised walk along the back of the sand.
  walkB.slab(layout.landEdge - walk / 2, WALK_Y, (z0 + z1) / 2, walk, z1 - z0, walkColor, 1 / walkMetresPerTile);
  curbB.box(layout.landEdge - walk, (WALK_Y - 0.02) / 2 + 0.02, (z0 + z1) / 2, 0.42, WALK_Y + 0.06, z1 - z0, curbColor);

  // Diagonal parking bays along the wide avenues (painted only, they read from the driver's seat).
  const bayColor = [0.9, 0.89, 0.84];
  for (const rx of layout.roadsX) {
    if (rx > layout.landEdge || rx === layout.roadsX[0]) continue;
    for (let z = layout.roadsZ[0] + 16; z < layout.roadsZ[layout.roadsZ.length - 1] - 10; z += 9.5) {
      whiteB.slab(rx - drive + 2.6, MARK_Y - 0.004, z, 0.1, 4.6, bayColor, 0.1);
      whiteB.slab(rx - drive + 5.2, MARK_Y - 0.004, z, 0.1, 4.6, bayColor, 0.1);
    }
  }

  // Double yellow centre line down each avenue, broken at junctions.
  const yellow = [0.98, 0.78, 0.24];
  const white = [0.95, 0.94, 0.89];
  for (const rx of layout.roadsX) {
    if (rx > layout.landEdge - 2) continue;
    for (let i = 0; i < layout.roadsZ.length - 1; i++) {
      const a = layout.roadsZ[i] + drive + 5.5;
      const b = layout.roadsZ[i + 1] - drive - 5.5;
      if (b <= a) continue;
      yellowB.slab(rx - 0.2, MARK_Y, (a + b) / 2, 0.15, b - a, yellow, 0.1);
      yellowB.slab(rx + 0.2, MARK_Y, (a + b) / 2, 0.15, b - a, yellow, 0.1);
      // dashed lane dividers
      for (let z = a + 2; z < b - 2; z += 9.4) {
        whiteB.slab(rx - 3.7, MARK_Y, z + 2.1, 0.11, 3.6, white, 0.1);
        whiteB.slab(rx + 3.7, MARK_Y, z + 2.1, 0.11, 3.6, white, 0.1);
      }
      // stop bars on the approach side
      whiteB.slab(rx + 4.4, MARK_Y, b + 1.2, 7.2, 0.42, white, 0.1);
      whiteB.slab(rx - 4.4, MARK_Y, a - 1.2, 7.2, 0.42, white, 0.1);
    }
  }
  for (const rz of layout.roadsZ) {
    for (let i = 0; i < layout.roadsX.length - 1; i++) {
      const a = layout.roadsX[i] + drive + 5.5;
      const b = layout.roadsX[i + 1] - drive - 5.5;
      if (b <= a) continue;
      yellowB.slab((a + b) / 2, MARK_Y, rz - 0.2, b - a, 0.15, yellow, 0.1);
      yellowB.slab((a + b) / 2, MARK_Y, rz + 0.2, b - a, 0.15, yellow, 0.1);
      for (let x = a + 2; x < b - 2; x += 9.4) {
        whiteB.slab(x + 2.1, MARK_Y, rz - 3.7, 3.6, 0.11, white, 0.1);
        whiteB.slab(x + 2.1, MARK_Y, rz + 3.7, 3.6, 0.11, white, 0.1);
      }
    }
  }

  // Crosswalks at every junction: zebra bars in the four arms, just outside the junction box.
  const zebra = [0.96, 0.95, 0.91];
  for (const rx of layout.roadsX) {
    for (const rz of layout.roadsZ) {
      if (rx > layout.landEdge - 1) continue;
      const bar = 0.62;
      const gap = 0.78;
      const span = drive - 1.4;
      for (let off = -span; off <= span - bar; off += bar + gap) {
        // across the north-south carriageway, on the north and south approaches
        whiteB.slab(rx + off + bar / 2, MARK_Y + 0.003, rz - drive - 2.6, bar, 4.2, zebra, 0.1);
        whiteB.slab(rx + off + bar / 2, MARK_Y + 0.003, rz + drive + 2.6, bar, 4.2, zebra, 0.1);
        // across the east-west carriageway, on the east and west approaches
        whiteB.slab(rx - drive - 2.6, MARK_Y + 0.003, rz + off + bar / 2, 4.2, bar, zebra, 0.1);
        whiteB.slab(rx + drive + 2.6, MARK_Y + 0.003, rz + off + bar / 2, 4.2, bar, zebra, 0.1);
      }
    }
  }

  // Manholes and storm drains.
  const dark = [0.2, 0.19, 0.18];
  for (const rx of layout.roadsX) {
    if (rx > layout.landEdge) continue;
    for (let z = z0 + 14; z < z1 - 14; z += 37) {
      drainB.cylinder(rx + 4.4, MARK_Y + 0.004, z, 0.52, 0.02, 12, dark, 'y');
      drainB.box(rx - drive + 0.55, WALK_Y + 0.005, z + 9, 0.62, 0.012, 1.2, [0.3, 0.3, 0.31]);
    }
  }

  const group = new THREE.Group();
  group.name = 'roads';
  const roadMesh = new THREE.Mesh(roadB.build(), roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  const walkMesh = new THREE.Mesh(walkB.build(), walkMat);
  walkMesh.receiveShadow = true;
  group.add(walkMesh);
  const yl = new THREE.Mesh(yellowB.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }));
  yl.receiveShadow = true;
  group.add(yl);
  const wh = new THREE.Mesh(whiteB.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }));
  wh.receiveShadow = true;
  group.add(wh);
  const curb = new THREE.Mesh(curbB.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  curb.receiveShadow = true;
  curb.castShadow = true;
  group.add(curb);
  const drains = new THREE.Mesh(drainB.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }));
  drains.receiveShadow = true;
  group.add(drains);
  scene.add(group);
  return { group, roadY: ROAD_Y, walkY: WALK_Y, markY: MARK_Y };
}

// Ground height: asphalt on carriageways, raised pavement on sidewalks, sand on the beach.
export function groundHeightAt(layout, x, z) {
  const t = tileAt(layout, x, z);
  if (t === TILE.road) return ROAD_Y;
  if (t === TILE.beach) return 0.12;
  if (t === TILE.sea) return -1.0;
  return WALK_Y;
}
