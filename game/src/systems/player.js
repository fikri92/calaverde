// The player on foot: a capsule that accelerates toward a camera-relative wish direction,
// sprints with stamina, jumps, lands, and collides with the city through the collider grid.
// It owns the rig's pose, the aim state and the weapon the player is holding; damage, health
// and armour live on the same object because they are the player's, not the world's.

import * as THREE from 'three';
import { HumanRig } from './character.js';
import { clamp, damp, dampAngle } from '../core/random.js';
import { axis } from '../core/input.js';
import { WALK_Y, ROAD_Y } from '../city/roads.js';
import { TILE, tileAt } from '../city/layout.js';

const SPEED_WALK = 3.4;
const SPEED_RUN = 6.4;
const SPEED_SPRINT = 9.4;
const ACCEL = 26;
const AIR_ACCEL = 6;
const JUMP_V = 5.6;
const GRAVITY = 18;

export class Player {
  constructor({ scene, colliders, layout, cameraRig }) {
    this.layout = layout;
    this.colliders = colliders;
    this.cameraRig = cameraRig;
    this.rig = new HumanRig({ role: 'player', height: 1.82, build: 1.02, hat: null });
    this.rig.root.position.set(layout.originX + 60, WALK_Y, layout.originZ + 60);
    scene.add(this.rig.root);

    this.pos = new THREE.Vector3(this.rig.root.position.x, WALK_Y, this.rig.root.position.z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.radius = 0.38;
    this.height = 1.82;

    this.health = 100;
    this.armour = 0;
    this.maxHealth = 100;
    this.stamina = 100;
    this.money = 500;

    this.aiming = false;
    this.aimPitch = 0;
    this.speed = 0;
    this.state = 'idle';
    this.vehicle = null;
    this.dead = false;
    this.fireCooldown = 0;
    this.stagger = 0;
    this.footstepTimer = 0;
    this.wantFootstep = false;

    // Weapons the player can carry. Ammo is per weapon, the pistol is never empty.
    this.weapons = [
      { id: 'pistol', name: 'Pistola', damage: 24, rpm: 260, spread: 0.012, mag: 12, ammo: 12, reserve: 60, auto: false },
      { id: 'smg', name: 'Subfusil', damage: 14, rpm: 620, spread: 0.032, mag: 30, ammo: 30, reserve: 90, auto: true },
      { id: 'shotgun', name: 'Escopeta', damage: 11, pellets: 7, rpm: 78, spread: 0.09, mag: 6, ammo: 6, reserve: 24, auto: false },
    ];
    this.weaponIndex = 0;

    // A simple pistol model in the right hand.
    this.gun = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.09, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.45, metalness: 0.6 }),
    );
    body.position.set(0, 0, 0.08);
    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.13, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.8 }),
    );
    grip.position.set(0, -0.09, -0.01);
    grip.rotation.x = 0.22;
    body.castShadow = true;
    grip.castShadow = true;
    this.gun.add(body, grip);
    this.gun.position.set(0, -0.17, 0.03);
    this.gun.rotation.x = -0.1;
    this.gun.visible = false;
    this.rig.arms.right.hand.add(this.gun);
  }

  get weapon() {
    return this.weapons[this.weaponIndex];
  }

  setPosition(x, z, yaw = 0) {
    this.pos.set(x, WALK_Y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.rig.root.rotation.y = yaw;
    this.rig.placeRoot(this.pos.x, this.pos.y, this.pos.z);
    this.grounded = true;
  }

  groundY(x, z) {
    const t = tileAt(this.layout, x, z);
    if (t === TILE.road) return ROAD_Y;
    if (t === TILE.beach) return 0.12;
    return WALK_Y;
  }

  update(dt, input, camForward) {
    if (this.dead) {
      this.rig.animate(dt, 0, 'idle');
      return;
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.stagger = Math.max(0, this.stagger - dt);

    // Mouse look turns the camera; the character faces where the camera looks while aiming or
    // moving forward, so movement is always camera-relative.
    if (input.locked) this.cameraRig.rotate(input.mouse.dx, input.mouse.dy);
    this.aiming = input.mouse.right || input.down('KeyQ');

    const fwd = axis(input, 'KeyS', 'KeyW');
    const side = axis(input, 'KeyA', 'KeyD');
    const camYaw = this.cameraRig.yaw;
    const sinY = Math.sin(camYaw);
    const cosY = Math.cos(camYaw);
    // Camera yaw 0 looks toward +z, so forward is (sin, cos).
    let wishX = sinY * fwd + cosY * side;
    let wishZ = cosY * fwd - sinY * side;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.001) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    const sprinting = input.down('ShiftLeft') && this.stamina > 2 && wishLen > 0.1 && !this.aiming;
    const maxSpeed = this.aiming ? SPEED_WALK * 0.75 : sprinting ? SPEED_SPRINT : wishLen > 0.1 ? SPEED_RUN : 0;

    // Stamina drains while sprinting, refills otherwise.
    if (sprinting) this.stamina = Math.max(0, this.stamina - dt * 17);
    else this.stamina = Math.min(100, this.stamina + dt * 12);

    const accel = this.grounded ? ACCEL : AIR_ACCEL;
    const targetVX = wishX * maxSpeed;
    const targetVZ = wishZ * maxSpeed;
    this.vel.x = damp(this.vel.x, targetVX, accel / Math.max(1, maxSpeed || 1) * 2.2, dt);
    this.vel.z = damp(this.vel.z, targetVZ, accel / Math.max(1, maxSpeed || 1) * 2.2, dt);
    if (wishLen < 0.01 && this.grounded) {
      this.vel.x = damp(this.vel.x, 0, 14, dt);
      this.vel.z = damp(this.vel.z, 0, 14, dt);
    }

    if (this.grounded && input.hit('Space') && this.stagger <= 0) {
      this.vel.y = JUMP_V;
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // Collide horizontally, then settle on the ground.
    const solved = this.colliders.resolveCircle(this.pos.x, this.pos.z, this.radius, this.pos.y, this.height);
    if (solved.hit) {
      // Kill the velocity component that was pushed back so we don't stick to walls.
      const dx = solved.x - this.pos.x;
      const dz = solved.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d;
      const nz = dz / d;
      const into = this.vel.x * nx + this.vel.z * nz;
      if (into < 0) {
        this.vel.x -= nx * into;
        this.vel.z -= nz * into;
      }
    }
    this.pos.x = solved.x;
    this.pos.z = solved.z;

    const gy = this.groundY(this.pos.x, this.pos.z);
    if (this.pos.y <= gy + 0.001) {
      this.pos.y = gy;
      if (this.vel.y < -6) this.cameraRig.addShake(Math.min(0.35, -this.vel.y * 0.02));
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y > gy + 0.06) {
      this.grounded = false;
    }
    const maxX = this.layout.seaEdge - 3;
    this.pos.x = clamp(this.pos.x, this.layout.minX + 2, maxX);
    this.pos.z = clamp(this.pos.z, this.layout.minZ + 2, this.layout.maxZ - 2);

    // Heading: while aiming or shooting, face the camera; otherwise face the direction of travel.
    const moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.speed = moveSpeed;
    let targetYaw = this.yaw;
    if (this.aiming) targetYaw = camYaw + Math.PI;
    else if (moveSpeed > 0.6) targetYaw = Math.atan2(this.vel.x, this.vel.z);
    this.yaw = dampAngle(this.yaw, targetYaw, 12, dt);

    // Pose the rig.
    let state = 'idle';
    if (!this.grounded) state = 'walk';
    else if (this.aiming) state = 'aim';
    else if (moveSpeed > 7.6) state = 'sprint';
    else if (moveSpeed > 0.4) state = 'walk';
    if (this.aiming && moveSpeed < 0.4) state = 'aim';
    this.state = state;
    this.rig.placeRoot(this.pos.x, this.pos.y, this.pos.z);
    this.rig.root.rotation.y = this.yaw;
    this.rig.animate(dt, moveSpeed, state, { pitch: this.aiming ? this.aimPitch : 0 });
    this.gun.visible = this.aiming || this.weapon.id !== 'pistol' ? true : this.gun.visible;

    // Aim pitch follows the camera look.
    this.aimPitch = clamp(-this.cameraRig.pitch * 0.85, -0.7, 0.7);

    // Footsteps make noise the peds and cops can hear.
    if (this.grounded && moveSpeed > 0.6) {
      this.footstepTimer -= dt * (moveSpeed / SPEED_RUN + 0.4);
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.42;
        this.wantFootstep = true;
      }
    } else {
      this.footstepTimer = 0.1;
    }
  }

  get eyePosition() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.55, this.pos.z);
  }

  // Where the muzzle points: from the gun to the point under the camera's crosshair.
  aimRay(camera) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.42, this.pos.z);
    origin.addScaledVector(forward, 0.35);
    return { origin, dir: forward };
  }

  takeDamage(amount) {
    if (this.dead) return;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, amount * 0.7);
      this.armour -= absorbed;
      amount -= absorbed;
    }
    this.health = Math.max(0, this.health - amount);
    this.stagger = 0.25;
    this.cameraRig.addShake(0.5);
    if (this.health <= 0) {
      this.die();
    }
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  die() {
    this.dead = true;
    this.rig.die();
    this.gun.visible = false;
  }

  respawn(x, z) {
    this.dead = false;
    this.health = this.maxHealth;
    this.armour = 0;
    this.rig.revive();
    this.setPosition(x, z, this.yaw);
    this.stamina = 100;
  }

  enterVehicle(vehicle) {
    this.vehicle = vehicle;
    this.rig.root.visible = false;
  }

  exitVehicle(x, z, yaw) {
    this.vehicle = null;
    this.rig.root.visible = true;
    this.setPosition(x, z, yaw);
  }
}
