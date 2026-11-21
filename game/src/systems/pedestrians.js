// Pedestrians: people walking the sidewalk rings around each block, pausing to idle, crossing at
// junctions, and bolting when they hear gunfire or see a body. Each ped is a HumanRig with a
// tiny state machine; they are pooled and recycled around the player like traffic is.

import * as THREE from 'three';
import { makeRng, clamp, dampAngle } from '../core/random.js';
import { HumanRig, randomAppearance } from './character.js';
import { WALK_Y } from '../city/roads.js';
import { randomSidewalkPoint } from '../city/layout.js';

const SPEED = 1.35;
const PANIC_SPEED = 4.4;

export class Pedestrians {
  constructor({ scene, layout, count = 26, camera }) {
    this.scene = scene;
    this.layout = layout;
    this.camera = camera;
    this.rng = makeRng(4477);
    this.peds = [];
    this.maxCount = count;
    this.alertTimer = 0;

    for (let i = 0; i < count; i++) this.spawnNear(layout.originX + 160, layout.originZ + 160);
  }

  // Spawn a walker at or near a point. With no point the walker lands on a random sidewalk; with
  // one, the walker is planted within a couple of metres of it so staged crowds and missions can
  // actually put people where they are needed.
  spawnNear(x = null, z = null, spread = 2.4) {
    let px;
    let pz;
    if (Number.isFinite(x) && Number.isFinite(z)) {
      px = x + this.rng.range(-spread, spread);
      pz = z + this.rng.range(-spread, spread);
    } else {
      const p = randomSidewalkPoint(this.layout, this.rng);
      px = p.x;
      pz = p.z;
    }
    const appearance = randomAppearance(this.rng, 'ped');
    const rig = new HumanRig(appearance);
    rig.placeRoot(px, WALK_Y, pz);
    this.scene.add(rig.root);
    const ped = {
      rig,
      pos: new THREE.Vector3(px, WALK_Y, pz),
      yaw: this.rng() * Math.PI * 2,
      speed: 0,
      state: 'walk',
      stateTimer: this.rng.range(1, 5),
      target: null,
      fleeFrom: null,
      dead: false,
      hp: 40,
      radius: 0.34,
      pickTarget: true,
      homeBlock: null,
    };
    rig.root.rotation.y = ped.yaw;
    this.peds.push(ped);
    return ped;
  }

  // Pick a fresh destination: a point on a block's sidewalk ring.
  chooseTarget(ped, awayFrom = null) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = randomSidewalkPoint(this.layout, this.rng);
      const d = Math.hypot(p.x - ped.pos.x, p.z - ped.pos.z);
      if (d < 14 || d > 90) continue;
      let score = d;
      if (awayFrom) score = Math.hypot(p.x - awayFrom.x, p.z - awayFrom.z);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    ped.target = best ?? randomSidewalkPoint(this.layout, this.rng);
  }

  // Any ped can be shot; the ones nearby react.
  alertAround(x, z, radius = 26, fleePoint = null) {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < radius) {
        ped.state = 'flee';
        ped.stateTimer = this.rng.range(4, 8);
        ped.fleeFrom = fleePoint ?? new THREE.Vector3(x, 0, z);
        this.chooseTarget(ped, ped.fleeFrom);
      }
    }
  }

  hurtPed(ped, damage) {
    ped.hp -= damage;
    if (ped.hp <= 0 && !ped.dead) {
      ped.dead = true;
      ped.state = 'dead';
      ped.rig.die();
      this.alertAround(ped.pos.x, ped.pos.z, 18);
      return true;
    }
    ped.state = 'flee';
    ped.fleeFrom = new THREE.Vector3(ped.pos.x, 0, ped.pos.z);
    return false;
  }

  update(dt, playerPos) {
    const camPos = this.camera?.position;
    for (const ped of this.peds) {
      if (ped.dead) {
        ped.rig.animate(dt, 0, 'idle');
        continue;
      }
      const dPlayer = Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
      const dCam = camPos ? Math.hypot(ped.pos.x - camPos.x, ped.pos.z - camPos.z) : dPlayer;

      // Recycle peds that are far away so the crowd stays around the player.
      if (dCam > 190) {
        const p = randomSidewalkPoint(this.layout, this.rng);
        ped.pos.set(p.x, WALK_Y, p.z);
        ped.rig.placeRoot(ped.pos.x, WALK_Y, ped.pos.z);
        ped.state = 'walk';
        ped.target = null;
        ped.speed = 0;
        ped.dead = false;
        ped.hp = 40;
        ped.rig.revive();
        continue;
      }

      ped.stateTimer -= dt;
      let moveSpeed = 0;

      if (ped.state === 'idle') {
        if (ped.stateTimer <= 0) {
          ped.state = 'walk';
          ped.target = null;
        }
        ped.rig.animate(dt, 0, 'idle', { lookUp: 0 });
        continue;
      }

      if (!ped.target) this.chooseTarget(ped, ped.state === 'flee' ? ped.fleeFrom : null);
      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.2) {
        if (ped.state === 'flee' && ped.stateTimer > 0.5) {
          this.chooseTarget(ped, ped.fleeFrom);
        } else {
          ped.state = this.rng.chance(0.25) ? 'idle' : 'walk';
          ped.stateTimer = this.rng.range(1.6, 5.5);
          ped.target = null;
          ped.speed = 0;
        }
        ped.rig.animate(dt, 0, ped.state === 'idle' ? 'idle' : 'walk');
        continue;
      }

      const wantYaw = Math.atan2(dx, dz);
      ped.yaw = dampAngle(ped.yaw, wantYaw, 6, dt);
      const targetSpeed = ped.state === 'flee' ? PANIC_SPEED : SPEED;
      ped.speed = clamp(dist > 4 ? targetSpeed : targetSpeed * 0.5, 0, PANIC_SPEED);
      // Fleeing peds jink a little so they don't run in a straight line.
      const jink = ped.state === 'flee' ? Math.sin(ped.pos.x * 0.4 + ped.pos.z * 0.3) * 0.5 : 0;

      ped.pos.x += (Math.sin(ped.yaw) + jink * 0.15) * ped.speed * dt;
      ped.pos.z += (Math.cos(ped.yaw) + jink * 0.15) * ped.speed * dt;
      ped.pos.x = clamp(ped.pos.x, this.layout.minX + 3, this.layout.seaEdge - 3);
      ped.pos.z = clamp(ped.pos.z, this.layout.minZ + 3, this.layout.maxZ - 3);

      ped.rig.placeRoot(ped.pos.x, WALK_Y, ped.pos.z);
      ped.rig.root.rotation.y = ped.yaw;
      ped.rig.animate(dt, ped.speed, ped.state === 'flee' ? 'run' : 'walk');
    }
  }

  // The closest living ped to a ray, for hitscan.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null;
    let bestT = maxDist;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      // Treat each ped as a vertical capsule of radius 0.4 from y to y+1.85.
      const cx = ped.pos.x - ox;
      const cz = ped.pos.z - oz;
      const tProj = cx * dx + cz * dz;
      if (tProj < 0 || tProj > maxDist) continue;
      const px = ox + dx * tProj;
      const pz = oz + dz * tProj;
      const d = Math.hypot(px - ped.pos.x, pz - ped.pos.z);
      if (d > 0.55) continue;
      const py = oy + dy * tProj;
      if (py < ped.pos.y - 0.1 || py > ped.pos.y + 1.95) continue;
      if (tProj < bestT) {
        bestT = tProj;
        best = ped;
      }
    }
    return best ? { ped: best, dist: bestT } : null;
  }

  get livingCount() {
    return this.peds.reduce((n, p) => n + (p.dead ? 0 : 1), 0);
  }
}
