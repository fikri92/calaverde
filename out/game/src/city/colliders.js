// Collision world: a uniform XZ grid of axis-aligned boxes. Buildings, props, palms and vehicles
// all register here. Queries resolve a circle (the player or a car) out of the boxes it overlaps,
// and a ray is cast against the same boxes for camera occlusion and line of sight.

const CELL = 16;

export class ColliderGrid {
  constructor(minX, minZ, maxX, maxZ) {
    this.minX = minX;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxZ = maxZ;
    this.cols = Math.ceil((maxX - minX) / CELL) + 1;
    this.rows = Math.ceil((maxZ - minZ) / CELL) + 1;
    this.cells = new Map();
    this.boxes = [];
  }

  key(cx, cz) {
    return cx * 4096 + cz;
  }

  insert(box) {
    box.id = this.boxes.length;
    this.boxes.push(box);
    const x0 = Math.floor((box.minX - this.minX) / CELL);
    const x1 = Math.floor((box.maxX - this.minX) / CELL);
    const z0 = Math.floor((box.minZ - this.minZ) / CELL);
    const z1 = Math.floor((box.maxZ - this.minZ) / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(box);
      }
    }
  }

  // Re-file a movable box after its bounds change. Cheap: only touches cells when the set of
  // covered cells actually differs, which for a car happens every few frames.
  moveBox(box, owner) {
    const x0 = Math.floor((box.minX - this.minX) / CELL);
    const x1 = Math.floor((box.maxX - this.minX) / CELL);
    const z0 = Math.floor((box.minZ - this.minZ) / CELL);
    const z1 = Math.floor((box.maxZ - this.minZ) / CELL);
    const prev = owner.cells;
    if (prev.x0 === x0 && prev.x1 === x1 && prev.z0 === z0 && prev.z1 === z1 && prev.filed) return;
    if (prev.filed) {
      for (let cx = prev.x0; cx <= prev.x1; cx++) {
        for (let cz = prev.z0; cz <= prev.z1; cz++) {
          const list = this.cells.get(this.key(cx, cz));
          if (!list) continue;
          const i = list.indexOf(box);
          if (i !== -1) list.splice(i, 1);
        }
      }
    } else {
      box.id = this.boxes.length;
      this.boxes.push(box);
    }
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(box);
      }
    }
    owner.cells = { x0, x1, z0, z1, filed: true };
  }

  // Boxes near a point, within a radius, deduplicated.
  near(x, z, radius, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - radius - this.minX) / CELL);
    const x1 = Math.floor((x + radius - this.minX) / CELL);
    const z0 = Math.floor((z - radius - this.minZ) / CELL);
    const z1 = Math.floor((z + radius - this.minZ) / CELL);
    const seen = this._seen ?? (this._seen = new Set());
    seen.clear();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (!list) continue;
        for (const box of list) {
          if (seen.has(box.id)) continue;
          seen.add(box.id);
          out.push(box);
        }
      }
    }
    return out;
  }

  // Push a circle at (x,z) with radius r out of every overlapping box. Returns the corrected
  // position and whether a hit happened, using the shallowest axis of penetration.
  resolveCircle(x, z, r, y = 0, height = 1.8) {
    const list = this.near(x, z, r + 1);
    let px = x;
    let pz = z;
    let hit = false;
    for (const b of list) {
      if (y + height < b.minY || y > b.maxY) continue;
      const nx = Math.max(b.minX, Math.min(px, b.maxX));
      const nz = Math.max(b.minZ, Math.min(pz, b.maxZ));
      const dx = px - nx;
      const dz = pz - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = r - d;
        px += (dx / d) * push;
        pz += (dz / d) * push;
      } else {
        // centre inside the box: push out along the shallowest side
        const left = px - b.minX;
        const right = b.maxX - px;
        const back = pz - b.minZ;
        const front = b.maxZ - pz;
        const m = Math.min(left, right, back, front);
        if (m === left) px = b.minX - r;
        else if (m === right) px = b.maxX + r;
        else if (m === back) pz = b.minZ - r;
        else pz = b.maxZ + r;
      }
    }
    return { x: px, z: pz, hit };
  }

  // Nearest solid box along a ray, up to maxDist. Returns {dist, box} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    let bestBox = null;
    const step = 12;
    const seen = new Set();
    for (let t = 0; t <= maxDist + step; t += step) {
      const x = ox + dx * t;
      const z = oz + dz * t;
      const list = this.near(x, z, step + 2, []);
      for (const b of list) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        const hit = rayBox(ox, oy, oz, dx, dy, dz, b);
        if (hit !== null && hit < best) {
          best = hit;
          bestBox = b;
        }
      }
      if (bestBox) break;
    }
    return bestBox ? { dist: best, box: bestBox } : null;
  }

  // Whether a segment between two points is unobstructed.
  clearLine(ax, ay, az, bx, by, bz) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
    return hit === null;
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return tmin > 0 ? tmin : 0;
}

export function addBoxCollider(grid, cx, cz, w, d, h, kind = 'solid', solidBase = true) {
  const box = {
    minX: cx - w / 2,
    maxX: cx + w / 2,
    minZ: cz - d / 2,
    maxZ: cz + d / 2,
    minY: solidBase ? -1 : 0,
    maxY: h,
    kind,
    hidden: false,
    id: -1,
  };
  grid.insert(box);
  return box;
}

// A limb-width box that can be moved each frame (used for vehicles). The grid files it into the
// cells its current bounds cover, and re-files it only when it crosses a cell edge, so moving
// cars stay queryable without reallocating a list entry per frame.
export class DynamicCollider {
  constructor(grid, w, d, h, kind = 'vehicle') {
    this.grid = grid;
    this.halfW = w / 2;
    this.halfD = d / 2;
    this.h = h;
    this.kind = kind;
    this.box = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: -1, maxY: h, kind, id: -1, hidden: false };
    this.cells = [];
  }

  place(cx, cz) {
    this.box.minX = cx - this.halfW;
    this.box.maxX = cx + this.halfW;
    this.box.minZ = cz - this.halfD;
    this.box.maxZ = cz + this.halfD;
    this.grid.moveBox(this.box, this);
  }

  setHidden(hidden) {
    this.box.maxY = hidden ? -0.5 : this.h;
  }
}
