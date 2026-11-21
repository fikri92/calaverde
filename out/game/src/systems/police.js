// The heat: a wanted level from zero to five stars. Each star brings more cruisers, officers who
// get out and shoot, and at four stars a roadblock ahead of the player. The search cools when the
// player breaks line of sight and stays out of the area; it never cools while a cop can see you.

import * as THREE from 'three';
import { makeRng, clamp, dampAngle } from '../core/random.js';
import { HumanRig, randomAppearance } from './character.js';
import { WALK_Y } from '../city/roads.js';
import { spawnVehicle } from './vehicles.js';
import { laneNear } from './traffic.js';

const COP_SPEED = 3.7;
const COP_COUNT_FOR_STARS = [0, 2, 3, 4, 5, 6];

export class Police {
  constructor({ scene, colliders, layout, traffic, combat, player, camera }) {
    this.scene = scene;
    this.colliders = colliders;
    this.layout = layout;
    this.traffic = traffic;
    this.combat = combat;
    this.player = player;
    this.camera = camera;
    this.rng = makeRng(6613);
    this.stars = 0;
    this.heat = 0;
    this.units = [];
    this.officers = [];
    this.roadblock = null;
    this.searchTimer = 0;
    this.searching = false;
    this.lastSeen = null;
    this.cooldown = 0;
    this.bustTimer = 0;
    this.spawnTimer = 0;
    this.flashTime = 0;

    this.copVehicle = null;
  }

  addHeat(amount) {
    const before = this.stars;
    this.heat += amount;
    const next = clamp(Math.floor(this.heat / 22), 1, 5);
    if (next > this.stars) {
      this.stars = Math.min(5, next);
      this.searchTimer = 0;
      this.searching = false;
      this.spawnTimer = 0;
      if (this.stars >= 4) this.tryRoadblock();
    } else if (this.stars === 0) {
      this.stars = 1;
    }
    if (before === 0 && this.stars > 0) this.flashTime = 2.2;
  }

  clearWanted() {
    this.stars = 0;
    this.heat = 0;
    this.searching = false;
    this.searchTimer = 0;
    this.roadblock = null;
    for (const unit of this.units) this.despawnUnit(unit);
    this.units = [];
    for (const cop of this.officers) this.despawnOfficer(cop, false);
    this.officers = [];
  }

  tryRoadblock() {
    if (this.roadblock) return;
    const p = this.player;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    // A point ahead of the player on the nearest road line.
    const aheadX = p.pos.x + fx * 90;
    const aheadZ = p.pos.z + fz * 90;
    const node = laneNear(this.traffic.graph, this.layout, aheadX, aheadZ, this.rng);
    if (!node) return;
    const dir = node.out[0]?.dir ?? [1, 0];
    const heading = Math.atan2(dir[0], dir[1]) + Math.PI / 2;
    const cars = [];
    for (let i = -1; i <= 1; i++) {
      const car = spawnVehicle(this.scene, this.colliders, {
        type: 'van',
        x: node.x + Math.cos(heading) * i * 3.4,
        z: node.z - Math.sin(heading) * i * 3.4,
        heading,
        police: true,
      });
      car.setBounds(this.layout.minX, this.layout.seaEdge);
      car.ai = null;
      car.roadblock = true;
      car.siren = false;
      this.units.push({ car, officers: [] });
      cars.push(car);
    }
    this.roadblock = { x: node.x, z: node.z, cars };
  }

  spawnUnit() {
    const p = this.player;
    // Spawn off-screen behind the player, on a lane.
    const backX = p.pos.x - Math.sin(p.yaw) * 120;
    const backZ = p.pos.z - Math.cos(p.yaw) * 120;
    const node = laneNear(this.traffic.graph, this.layout, backX, backZ, this.rng);
    if (!node || !node.out.length) return null;
    const dir = node.out[0].dir;
    const car = spawnVehicle(this.scene, this.colliders, {
      type: this.stars >= 3 && this.rng.chance(0.35) ? 'muscle' : 'sedan',
      x: node.x,
      z: node.z,
      heading: Math.atan2(dir[0], dir[1]),
      police: true,
    });
    car.setBounds(this.layout.minX, this.layout.seaEdge);
    const unit = { car, officers: [], state: 'pursue', stuck: 0, shootTimer: 1.2 };
    this.units.push(unit);
    return unit;
  }

  deployOfficers(unit) {
    if (!unit.car || unit.officers.length > 0) return;
    const car = unit.car;
    const count = this.stars >= 3 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const appearance = randomAppearance(this.rng, 'cop');
      // A recognisable uniform at dusk: pale blue shirt under a dark vest, near-black trousers so
      // the legs still read as uniform, and a light cap. Bright enough to separate from shadow.
      appearance.shirt = 0x4a6f9c;
      appearance.pants = 0x232c3a;
      appearance.hat = 'cap';
      appearance.hatColor = 0x2b3d55;
      appearance.skin ??= 0xc79a72;
      const rig = new HumanRig(appearance);
      const side = i === 0 ? 1 : -1;
      const x = car.pos.x + Math.cos(car.heading) * 1.5 * side;
      const z = car.pos.z - Math.sin(car.heading) * 1.5 * side;
      rig.placeRoot(x, WALK_Y, z);
      this.scene.add(rig.root);

      // A pistol in the officer's hand.
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.09, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.5, metalness: 0.5 }),
      );
      gun.position.set(0, -0.16, 0.05);
      gun.castShadow = true;
      rig.arms.right.hand.add(gun);
      rig.arms.right.hand.rotateX(-1.35);

      const cop = {
        rig,
        pos: new THREE.Vector3(x, WALK_Y, z),
        yaw: car.heading,
        speed: 0,
        hp: 60,
        dead: false,
        fireTimer: this.rng.range(0.6, 1.8),
        aimTimer: 0,
        radius: 0.36,
        gun,
        unit,
        state: 'engage',
      };
      this.officers.push(cop);
      unit.officers.push(cop);
    }
  }

  despawnOfficer(cop, removeRig = true) {
    if (removeRig) {
      this.scene.remove(cop.rig.root);
      cop.rig.dispose();
    }
    cop.gone = true;
  }

  despawnUnit(unit) {
    if (!unit.car) return;
    this.scene.remove(unit.car.group);
    unit.car.disposed = true;
    for (const cop of unit.officers) this.despawnOfficer(cop);
  }

  update(dt, { playerVisible = true } = {}) {
    this.flashTime = Math.max(0, this.flashTime - dt);
    if (this.stars === 0) {
      for (const unit of this.units) this.despawnUnit(unit);
      this.units = [];
      this.officers = [];
      this.roadblock = null;
      return;
    }
    const p = this.player;
    this.heat = Math.max(0, this.heat - dt * 0.35);

    // Target officer count by star level.
    const wantUnits = COP_COUNT_FOR_STARS[Math.min(5, this.stars)];
    this.spawnTimer -= dt;
    const liveUnits = this.units.filter((u) => u.car && !u.car.disposed);
    this.units = liveUnits;
    if (liveUnits.length < wantUnits && this.spawnTimer <= 0) {
      const dist = this.searching ? 60 : 999;
      if (!this.searching || Math.hypot(p.pos.x, p.pos.z) > 0) {
        this.spawnUnit();
        this.spawnTimer = this.searching ? 2.6 : 1.4;
      }
    }

    let anySees = false;
    const playerCar = p.vehicle;

    for (const unit of liveUnits) {
      const car = unit.car;
      if (!car || car.disposed) continue;
      const dx = p.pos.x - car.pos.x;
      const dz = p.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 46 && this.hasLineOfSight(car.pos, p.pos)) anySees = true;

      // Pursue: drive at the player's position.
      const wantHeading = Math.atan2(dx, dz);
      let diff = wantHeading - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const blocked = dist < 16 && Math.abs(diff) > 0.7;
      let throttle = 1;
      let brake = 0;
      if (dist < 9) {
        throttle = playerCar ? 0.4 : 0;
        brake = playerCar ? 0 : 1;
      }
      if (blocked) throttle = 0.15;
      car.drive(dt, {
        throttle,
        brake,
        steer: clamp(diff * 2.4, -1, 1),
        handbrake: dist < 12 && Math.abs(diff) > 1.5,
      });

      // Deploy officers when close and stopped-ish.
      if (dist < 26 && car.speed < 9) {
        this.deployOfficers(unit);
        if (!playerCar) {
          // Cops on foot close in and try to bust you.
          if (dist < 6.5) {
            this.bustTimer += dt;
          }
        }
      }
      if (dist > 60) {
        // Let a far unit recycle behind the player.
        const node = laneNear(this.traffic.graph, this.layout, p.pos.x - Math.sin(p.yaw) * 90, p.pos.z - Math.cos(p.yaw) * 90, this.rng);
        if (node && node.out.length && dist > 110) {
          car.pos.set(node.x, 0, node.z);
          car.heading = Math.atan2(node.out[0].dir[0], node.out[0].dir[1]);
          car.collider.place(node.x, node.z);
          unit.officers.forEach((c) => {
            c.pos.set(node.x + 2, WALK_Y, node.z + 2);
          });
        }
      }
    }

    if (!anySees && playerVisible === false) anySees = false;

    // Search / cooldown logic.
    if (anySees) {
      this.searching = false;
      this.searchTimer = 0;
      this.lastSeen = { x: p.pos.x, z: p.pos.z };
      this.cooldown = 0;
    } else {
      this.searching = true;
      this.searchTimer += dt;
      // Cools off after 14 s out of sight at 1 star, longer at higher heat.
      const needed = 12 + this.stars * 5;
      if (this.searchTimer > needed) {
        this.cooldown += dt;
        if (this.cooldown > 1.6) {
          this.heat = Math.max(0, this.heat - 30);
          this.stars = Math.max(0, this.stars - 1);
          this.cooldown = 0;
          this.searchTimer = 0;
          if (this.stars === 0) this.clearWanted();
        }
      }
    }

    // Busting: cops on foot within reach for long enough, player on foot.
    if (!playerCar && this.stars > 0) {
      let close = false;
      for (const cop of this.officers) {
        if (cop.dead) continue;
        if (Math.hypot(cop.pos.x - p.pos.x, cop.pos.z - p.pos.z) < 2.6) close = true;
      }
      if (close) this.bustTimer += dt;
      else this.bustTimer = Math.max(0, this.bustTimer - dt * 0.8);
    } else {
      this.bustTimer = 0;
    }

    this.updateOfficers(dt, anySees);
  }

  hasLineOfSight(from, to) {
    return this.colliders.clearLine(from.x, 1.5, from.z, to.x, 1.4, to.z);
  }

  updateOfficers(dt, anySees) {
    const p = this.player;
    for (const cop of this.officers) {
      if (cop.gone) continue;
      if (cop.dead) {
        cop.rig.animate(dt, 0, 'idle');
        continue;
      }
      const dx = p.pos.x - cop.pos.x;
      const dz = p.pos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      const sees = dist < 34 && this.colliders.clearLine(cop.pos.x, 1.5, cop.pos.z, p.pos.x, 1.4, p.pos.z);
      const wantYaw = Math.atan2(dx, dz);
      cop.yaw = dampAngle(cop.yaw, wantYaw, 9, dt);

      // Close the distance, but hold at pistol range.
      const holdAt = 7.5;
      let move = 0;
      if (sees && dist > holdAt) move = 1;
      else if (!sees) move = 0.85;
      if (dist < 3.4 && !p.vehicle) move = 0;
      cop.speed = move * COP_SPEED;
      cop.pos.x += Math.sin(cop.yaw) * cop.speed * dt;
      cop.pos.z += Math.cos(cop.yaw) * cop.speed * dt;
      // Keep cops on walkable ground.
      const solved = this.colliders.resolveCircle(cop.pos.x, cop.pos.z, cop.radius, 0.17, 1.8);
      cop.pos.x = solved.x;
      cop.pos.z = solved.z;
      cop.pos.x = clamp(cop.pos.x, this.layout.minX + 3, this.layout.seaEdge - 3);
      cop.pos.z = clamp(cop.pos.z, this.layout.minZ + 3, this.layout.maxZ - 3);
      cop.rig.placeRoot(cop.pos.x, WALK_Y, cop.pos.z);
      cop.rig.root.rotation.y = cop.yaw;

      // Shoot at the player when in range and in sight.
      cop.fireTimer -= dt;
      const canShoot = sees && dist < 30 && cop.speed < 1.4;
      const state = canShoot ? 'aim' : cop.speed > 0.3 ? 'walk' : 'idle';
      cop.rig.animate(dt, cop.speed, state, { pitch: 0 });
      if (canShoot && cop.fireTimer <= 0) {
        cop.fireTimer = this.rng.range(0.85, 2.2) / (1 + this.stars * 0.12);
        const origin = new THREE.Vector3(cop.pos.x, 1.42, cop.pos.z);
        const dir = new THREE.Vector3(p.pos.x - cop.pos.x, (p.pos.y + 1.15) - 1.42, p.pos.z - cop.pos.z).normalize();
        // Cops are not perfect shots.
        dir.x += this.rng.range(-0.055, 0.055);
        dir.y += this.rng.range(-0.03, 0.03);
        dir.z += this.rng.range(-0.055, 0.055);
        dir.normalize();
        this.combat.fire(origin, dir, { spread: 0.02, damage: 7 }, { player: p });
        // Apply a hit probabilistically so a burst doesn't always land.
        if (this.rng.chance(0.42 + this.stars * 0.05)) {
          p.takeDamage(this.rng.range(4, 8));
        }
      }
    }
  }

  // Called when the player kills a civilian or cop, or fires in public.
  onCrime(kind) {
    const heat = { civilian: 20, cop: 34, gunshot: 9, vehicle: 12, chase: 4 }[kind] ?? 8;
    this.addHeat(heat);
  }

  // Cops on foot nearest a point, for the player's hitscan.
  get shootable() {
    return this.officers.filter((c) => !c.dead && !c.gone);
  }

  get anyAlerted() {
    return this.stars > 0;
  }
}
