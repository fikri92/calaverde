// Assembles the city: layout, roads, buildings, props, water and colliders, in that order.
// One entry point so main.js does not need to know how the city is layered.

import { ColliderGrid, addBoxCollider } from './colliders.js';
import { buildLayout } from './layout.js';
import { buildRoads } from './roads.js';
import { buildBuildings } from './buildings.js';
import { buildProps } from './props.js';
import { buildWater } from './water.js';
import { buildBackdrop } from './backdrop.js';

export function buildCity(scene, seed) {
  const layout = buildLayout(seed);
  const colliders = new ColliderGrid(layout.minX - 40, layout.minZ - 40, layout.maxX + 40, layout.maxZ + 40);

  const backdrop = buildBackdrop(layout, scene);
  const roads = buildRoads(layout, scene);
  const buildings = buildBuildings(layout, scene, colliders);
  const props = buildProps(layout, scene, colliders);
  const water = buildWater(layout, scene, colliders);

  // Invisible walls keep the player inside the block grid and off the open water.
  const edge = 0.6;
  addBoxCollider(colliders, layout.minX - 4, (layout.minZ + layout.maxZ) / 2, edge, layout.maxZ - layout.minZ, 12, 'bound');
  addBoxCollider(colliders, (layout.minX + layout.landEdge) / 2, layout.minZ - 4, layout.landEdge - layout.minX, edge, 12, 'bound');
  addBoxCollider(colliders, (layout.minX + layout.landEdge) / 2, layout.maxZ + 4, layout.landEdge - layout.minX, edge, 12, 'bound');
  addBoxCollider(colliders, layout.seaEdge + 1, (layout.minZ + layout.maxZ) / 2, edge, layout.maxZ - layout.minZ, 12, 'bound');

  return {
    layout,
    colliders,
    roads,
    buildings,
    props,
    water,
    backdrop,
    update(dt) {
      water.update(dt);
    },
  };
}
