// The plan of Puerto Azul: a grid of blocks and roads, with the sea to the east.
// Everything downstream (roads, buildings, props, water, minimap) reads this one structure,
// so the city is described once and drawn from that description.
import { makeRng } from '../core/random.js';

export const CITY = {
  seed: 20260214,
  blocksX: 6, // built-up block columns, west to east
  blocksZ: 7, // built-up block rows, north to south
  blockSize: 84,
  roadWidth: 26, // full right of way: carriageway plus a sidewalk each side
  carriageway: 14, // asphalt width
  walkWidth: 6, // one sidewalk
  originX: -340,
  originZ: -324,
  beachWidth: 54, // sand, east of the last road
};

export const TILE = {
  road: 0,
  sidewalk: 1,
  block: 2,
  beach: 3,
  sea: 4,
  park: 5,
  marina: 6,
};

export const DISTRICT_NAMES = [
  'La Custodia',
  'Vista Mar',
  'El Faro',
  'Barrio del Sol',
  'Muelle Viejo',
  'Playa Dorada',
  'Cerro Azul',
];

export function buildLayout(seed = CITY.seed) {
  const rng = makeRng(seed);
  const { blocksX, blocksZ, blockSize, roadWidth, carriageway, walkWidth, originX, originZ, beachWidth } = CITY;
  const pitch = blockSize + roadWidth;
  const driveHalf = carriageway / 2;
  const walkOuter = roadWidth / 2;

  // Road centre lines. Columns run north-south, rows run east-west.
  const roadsX = [];
  for (let i = 0; i <= blocksX; i++) roadsX.push(originX + i * pitch);
  const roadsZ = [];
  for (let i = 0; i <= blocksZ; i++) roadsZ.push(originZ + i * pitch);

  const landEdge = roadsX[roadsX.length - 1] + walkOuter; // back of the coastal sidewalk
  const beachX1 = landEdge + beachWidth;
  const seaEdge = beachX1;
  const zMin = roadsZ[0] - driveHalf;
  const zMax = roadsZ[roadsZ.length - 1] + driveHalf;

  const marinaCz = roadsZ[5];
  const marina = {
    x0: landEdge,
    x1: seaEdge + 52,
    z0: marinaCz - 13,
    z1: marinaCz + 13,
    cz: marinaCz,
  };
  marina.cx = (marina.x0 + marina.x1) / 2;

  const blocks = [];
  for (let bx = 0; bx < blocksX; bx++) {
    for (let bz = 0; bz < blocksZ; bz++) {
      const x0 = roadsX[bx] + walkOuter;
      const x1 = roadsX[bx + 1] - walkOuter;
      const z0 = roadsZ[bz] + walkOuter;
      const z1 = roadsZ[bz + 1] - walkOuter;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;

      const isPark = (bx === 2 && bz === 1) || (bx === 0 && bz === 4) || (bx === 4 && bz === 5) || (bx === 1 && bz === 2);
      const district = DISTRICT_NAMES[(bx + bz * 2) % DISTRICT_NAMES.length];

      // Height bands: towers in the middle, low-rise near the beach and the marina.
      const distC = Math.hypot((bx - 2.5) / 2.4, (bz - 3) / 3.2);
      const downtown = distC < 0.72 && !isPark;
      const waterfront = bz >= 5 || bx >= blocksX - 1;
      let height;
      if (isPark) height = 0;
      else if (downtown) height = rng.range(46, 106);
      else if (waterfront) height = rng.range(10, 22);
      else height = rng.range(20, 44);
      const style = isPark ? 0 : downtown ? (rng.chance(0.5) ? 5 : 3) : rng.int(0, 4);

      blocks.push({
        bx, bz, x0, x1, z0, z1, cx, cz,
        kind: isPark ? 'park' : 'urban',
        district: isPark ? 'Parque Verde' : district,
        height,
        style,
        downtown,
      });
    }
  }

  const layout = {
    seed,
    roadsX,
    roadsZ,
    blocks,
    pitch,
    blockSize,
    roadWidth,
    carriageway,
    driveHalf,
    walkInner: driveHalf,
    walkOuter,
    halfRoad: driveHalf,
    rightOfWay: walkOuter,
    walkWidth,
    originX,
    originZ,
    width: landEdge - originX,
    depth: zMax - zMin,
    minX: originX - driveHalf,
    maxX: seaEdge + 460,
    minZ: zMin,
    maxZ: zMax,
    landEdge,
    beach: { x0: landEdge, x1: beachX1, z0: zMin, z1: zMax },
    seaEdge,
    seaStart: seaEdge,
    districts: DISTRICT_NAMES,
    marina,
    parks: blocks.filter((b) => b.kind === 'park'),
  };

  layout.tileAt = (x, z) => tileAt(layout, x, z);
  layout.roadAt = (x, z) => tileAt(layout, x, z) === TILE.road;
  layout.blockAt = (x, z) => blocks.find((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) ?? null;
  layout.districtAt = (x, z) => {
    if (x > seaEdge) return 'Mar Abierto';
    if (x > landEdge) return 'Playa Dorada';
    if (x >= marina.x0 && z >= marina.z0 && z <= marina.z1) return 'Muelle Viejo';
    const b = layout.blockAt(x, z);
    return b ? b.district : 'Vista Mar';
  };
  return layout;
}

// What kind of ground is at a world point.
export function tileAt(layout, x, z) {
  if (x > layout.seaEdge) return TILE.sea;
  if (x > layout.landEdge) {
    const m = layout.marina;
    if (x <= m.x1 && z >= m.z0 && z <= m.z1) return TILE.marina;
    return TILE.beach;
  }
  if (x < layout.minX || z < layout.minZ || z > layout.maxZ) return TILE.sidewalk;

  for (const rx of layout.roadsX) {
    if (Math.abs(x - rx) <= layout.driveHalf) {
      if (z >= layout.minZ && z <= layout.maxZ) return TILE.road;
    }
  }
  for (const rz of layout.roadsZ) {
    if (Math.abs(z - rz) <= layout.driveHalf) {
      if (x >= layout.minX && x <= layout.landEdge) return TILE.road;
    }
  }

  for (const rx of layout.roadsX) {
    if (Math.abs(x - rx) <= layout.rightOfWay) {
      if (z >= layout.minZ && z <= layout.maxZ) return TILE.sidewalk;
    }
  }
  for (const rz of layout.roadsZ) {
    if (Math.abs(z - rz) <= layout.rightOfWay) {
      if (x >= layout.minX && x <= layout.landEdge) return TILE.sidewalk;
    }
  }

  const block = layout.blockAt(x, z);
  if (block) return block.kind === 'park' ? TILE.park : TILE.block;
  return TILE.sidewalk;
}

export function isWalkable(layout, x, z) {
  const t = tileAt(layout, x, z);
  return t === TILE.road || t === TILE.sidewalk || t === TILE.beach || t === TILE.park || t === TILE.marina;
}

// Walking surface height at a point: sidewalks, the promenade and the marina are raised.
export function groundHeight(layout, x, z) {
  const t = tileAt(layout, x, z);
  if (t === TILE.road) return 0.02;
  if (t === TILE.sea) return -1.2;
  return 0.17;
}

// A point on the sidewalk ring around a random block: a good spawn for pedestrians.
export function randomSidewalkPoint(layout, rand = Math.random) {
  const urban = layout.blocks.filter((b) => b.kind === 'urban');
  const b = urban[Math.floor(rand() * urban.length)] ?? layout.blocks[0];
  const side = Math.floor(rand() * 4);
  const mid = (layout.driveHalf + layout.rightOfWay) / 2;
  const t = rand();
  switch (side) {
    case 0:
      return { x: b.x0 - mid, z: b.z0 + (b.z1 - b.z0) * t };
    case 1:
      return { x: b.x1 + mid, z: b.z0 + (b.z1 - b.z0) * t };
    case 2:
      return { x: b.x0 + (b.x1 - b.x0) * t, z: b.z0 - mid };
    default:
      return { x: b.x0 + (b.x1 - b.x0) * t, z: b.z1 + mid };
  }
}

// A point in the middle of a random carriageway, the axis it runs along, and its heading.
export function randomRoadPoint(layout, rand = Math.random) {
  const xSpan = layout.landEdge - layout.originX;
  const zSpan = layout.maxZ - layout.minZ;
  if (rand() < 0.5) {
    const road = layout.roadsX[Math.floor(rand() * layout.roadsX.length)];
    const lane = rand() < 0.5 ? 3.4 : -3.4;
    return {
      x: road + lane,
      z: layout.minZ + rand() * zSpan,
      axis: 'z',
      dir: lane > 0 ? 1 : -1,
    };
  }
  const road = layout.roadsZ[Math.floor(rand() * layout.roadsZ.length)];
  const lane = rand() < 0.5 ? 3.4 : -3.4;
  return {
    x: layout.originX + rand() * xSpan,
    z: road + lane,
    axis: 'x',
    dir: lane > 0 ? 1 : -1,
  };
}

// The road centre lines as segments, for traffic lanes and the minimap.
export function roadSegments(layout) {
  const segs = [];
  for (const x of layout.roadsX) {
    segs.push({ x0: x, z0: layout.minZ, x1: x, z1: layout.maxZ, vertical: true });
  }
  for (const z of layout.roadsZ) {
    segs.push({ x0: layout.minX, z0: z, x1: layout.landEdge, z1: z, vertical: false });
  }
  return segs;
}
