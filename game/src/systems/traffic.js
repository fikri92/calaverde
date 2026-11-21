// Traffic: a pool of cars that follow the road grid lane by lane. Each car picks a lane, drives
// along it to the next junction, decides a turn, and recycles to a lane near the player when it
// gets too far away. Cars are real Vehicle instances, so you can steal any of them and the
// police can chase them.

import * as THREE from 'three';
import { makeRng, clamp, damp } from '../core/random.js';
import { spawnVehicle } from './vehicles.js';

const LANE = 3.4;

// Build the drivable lane graph once: each avenue (vertical) and street (horizontal) is a lane
// in each direction, split at every junction.
export function buildLaneGraph(layout) {
  const nodes = [];
  const nodeAt = new Map();
  const key = (x, z) => `${Math.round(x * 4)}:${Math.round(z * 4)}`;
  const getNode = (x, z, axis) => {
    const k = key(x, z) + axis;
    let n = nodeAt.get(k);
    if (!n) {
      n = { id: nodes.length, x, z, axis, out: [] };
      nodes.push(n);
      nodeAt.set(k, n);
    }
    return n;
  };

  // Vertical avenues run along Z at every roadsX; horizontal streets along X at every roadsZ.
  const vX = layout.roadsX.filter((x) => x <= layout.landEdge);
  const hZ = layout.roadsZ;

  for (const x of vX) {
    for (let i = 0; i < hZ.length - 1; i++) {
      // southbound (+z) lane is right of centre when travelling +z: offset -LANE
      const a = getNode(x - LANE, hZ[i], 'v');
      const b = getNode(x - LANE, hZ[i + 1], 'v');
      a.out.push({ to: b, dir: [0, 1] });
      // northbound (-z): offset +LANE
      const c = getNode(x + LANE, hZ[i + 1], 'v');
      const d = getNode(x + LANE, hZ[i], 'v');
      c.out.push({ to: d, dir: [0, -1] });
    }
  }
  for (const z of hZ) {
    for (let i = 0; i < vX.length - 1; i++) {
      const a = getNode(vX[i], z + LANE, 'h');
      const b = getNode(vX[i + 1], z + LANE, 'h');
      a.out.push({ to: b, dir: [1, 0] });
      const c = getNode(vX[i + 1], z - LANE, 'h');
      const d = getNode(vX[i], z - LANE, 'h');
      c.out.push({ to: d, dir: [-1, 0] });
    }
  }
  return { nodes, nodeAt };
}

// A lane a car can be dropped into, somewhere within `radius` of a point, heading away from it.
export function laneNear(graph, layout, x, z, rand = Math.random) {
  const candidates = graph.nodes.filter((n) => n.out.length && Math.hypot(n.x - x, n.z - z) < 180);
  if (!candidates.length) return null;
  const node = candidates[Math.floor(rand() * candidates.length)];
  return node;
}

export class Traffic {
  constructor({ scene, colliders, layout, count = 16, camera }) {
    this.scene = scene;
    this.colliders = colliders;
    this.layout = layout;
    this.camera = camera;
    this.graph = buildLaneGraph(layout);
    this.rng = makeRng(9981);
    this.cars = [];
    this.maxCount = count;

    this.types = ['sedan', 'sedan', 'sedan', 'muscle', 'sports', 'van', 'van', 'bike'];

    for (let i = 0; i < count; i++) {
      this.spawnSomewhere();
    }
  }

  spawnSomewhere(anchor = null) {
    const ax = anchor ? anchor.x : this.layout.originX + 180;
    const az = anchor ? anchor.z : this.layout.originZ + 180;
    for (let attempt = 0; attempt < 60; attempt++) {
      const node = laneNear(this.graph, this.layout, ax + this.rng.range(-200, 200), az + this.rng.range(-200, 200), this.rng);
      if (!node) continue;
      const edge = node.out[0];
      if (!edge) continue;
      const x = node.x;
      const z = node.z;
      if (this.cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 22)) continue;
      const heading = Math.atan2(edge.dir[0], edge.dir[1]);
      const type = this.rng.pick(this.types);
      const car = spawnVehicle(this.scene, this.colliders, { type, x, z, heading });
      car.setBounds(this.layout.minX, this.layout.seaEdge);
      car.ai = {
        node,
        edge,
        targetSpeed: this.rng.range(9, 19) * (type === 'sports' ? 1.35 : type === 'van' ? 0.8 : 1),
        stuckFor: 0,
        laneOffset: this.rng.range(-0.3, 0.3),
        indicator: 0,
      };
      car.traffic = true;
      this.cars.push(car);
      return car;
    }
    return null;
  }

  // Hand a car back to the lane graph in place: find the lane node nearest the car, aim it at that
  // node's outgoing edge and let the normal driving take over. Used when the player abandons a car,
  // so it rejoins traffic instead of sitting dead or crashing the AI on a null edge.
  adopt(car) {
    const node = laneNear(this.graph, this.layout, car.pos.x, car.pos.z, this.rng);
    if (!node || !node.out.length) return null;
    const edge = node.out[0];
    car.ai = {
      node,
      edge,
      targetSpeed: this.rng.range(9, 19),
      stuckFor: 0,
      laneOffset: this.rng.range(-0.3, 0.3),
      indicator: 0,
    };
    car.traffic = true;
    return edge;
  }

  // Keep the population near the player: recycle the furthest cars.
  recycle(anchor) {
    for (const car of this.cars) {
      if (car.occupied || car.isPolice) continue;
      const d = Math.hypot(car.pos.x - anchor.x, car.pos.z - anchor.z);
      if (d > 340 || car.wrecked) {
        car.group.visible = false;
        this.scene.remove(car.group);
        car.disposed = true;
      }
    }
    const alive = this.cars.filter((c) => !c.disposed);
    this.cars = alive;
    let guard = 0;
    while (this.cars.length < this.maxCount && guard++ < 60) {
      if (!this.spawnSomewhere(anchor)) break;
    }
  }

  update(dt, anchor) {
    this.recycleTimer = (this.recycleTimer ?? 0) + dt;
    if (this.recycleTimer > 2.5) {
      this.recycleTimer = 0;
      this.recycle(anchor);
    }

    for (const car of this.cars) {
      if (car.disposed) continue;
      if (car.occupied || car.wrecked) {
        if (car.wrecked) car.drive(dt, { throttle: 0, brake: 1 });
        continue;
      }
      const ai = car.ai;
      if (!ai) continue;
      // Somebody handing a car a half-built AI must not take down the frame: drop it from traffic
      // and let the next recycle give it a proper lane.
      if (!ai.edge || !ai.edge.to || !ai.node) { car.ai = null; continue; }
      const target = ai.edge.to;
      // Steer toward the lane's next junction point.
      const dx = target.x + ai.laneOffset - car.pos.x;
      const dz = target.z + ai.laneOffset - car.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      // Look ahead for a car in the way, and for a red-light-ish gap at junctions.
      let block = 1;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      for (const other of this.cars) {
        if (other === car || other.disposed) continue;
        const ox = other.pos.x - car.pos.x;
        const oz = other.pos.z - car.pos.z;
        const along = ox * fx + oz * fz;
        if (along < 0.5 || along > 13) continue;
        const lat = Math.abs(ox * -fz + oz * fx);
        if (lat < 2.1) block = Math.min(block, clamp((along - 5.5) / 7, 0, 1));
      }
      // The player on foot matters too.
      if (anchor) {
        const ox = anchor.x - car.pos.x;
        const oz = anchor.z - car.pos.z;
        const along = ox * fx + oz * fz;
        const lat = Math.abs(ox * -fz + oz * fx);
        if (along > 0.5 && along < 11 && lat < 1.9) block = Math.min(block, clamp((along - 5) / 5, 0, 1));
      }

      const steer = clamp(diff * 2.1, -1, 1);
      const speedErr = car.speed - ai.targetSpeed * block;
      let throttle = speedErr < 0 ? 1 : 0;
      let brake = speedErr > 2.4 ? 1 : 0;
      if (Math.abs(diff) > 0.7) throttle *= 0.42;
      if (car.speed < 0.4 && block < 0.1) brake = 1;

      car.drive(dt, { throttle, brake, steer, handbrake: false });

      // Junction reached: choose the next edge.
      if (dist < 7.5) {
        const outs = ai.node.out;
        // Prefer straight on, then a turn that stays off the sea.
        const straight = outs.find((e) => e.dir[0] === ai.edge.dir[0] && e.dir[1] === ai.edge.dir[1]);
        const choices = outs.filter((e) => e.to.x >= this.layout.minX + 2 && e.to.x <= this.layout.landEdge);
        const pick = straight ?? (choices.length ? this.rng.pick(choices) : outs[0]);
        if (pick) {
          ai.node = target;
          ai.edge = pick;
          ai.targetSpeed = this.rng.range(9, 19) * (car.type === 'sports' ? 1.3 : car.type === 'van' ? 0.82 : 1);
          ai.laneOffset = this.rng.range(-0.3, 0.3);
        }
      }

      // Stuck detection: if barely moving for a while, hop to a fresh lane near the player.
      if (car.speed < 0.6) ai.stuckFor += dt;
      else ai.stuckFor = 0;
      if (ai.stuckFor > 9) {
        const node = laneNear(this.graph, this.layout, anchor?.x ?? car.pos.x, anchor?.z ?? car.pos.z, this.rng);
        if (node && node.out.length) {
          ai.node = node;
          ai.edge = node.out[0];
          car.pos.set(node.x, 0, node.z);
          car.heading = Math.atan2(ai.edge.dir[0], ai.edge.dir[1]);
          car.vel.set(0, 0, 0);
          car.collider.place(node.x, node.z);
          ai.stuckFor = 0;
        }
      }
    }
  }

  // Nearest car to a point that the player can enter.
  nearest(x, z, maxDist = 4.2) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      if (car.disposed || car.wrecked || car.occupied) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }
}
