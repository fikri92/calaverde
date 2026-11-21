// Cars, built from primitives and driven with arcade physics: a bicycle-model steering feel,
// engine force by type, lateral grip, brakes, handbrake slides and simple damage. Each car owns
// a mesh group (body, cabin, wheels that spin and steer, lights), a dynamic collider used by the
// player, traffic and cops, and the numbers the HUD's speedometer reads.

import * as THREE from 'three';
import { GeometryBuilder } from '../core/merge.js';
import { clamp, damp } from '../core/random.js';
import { DynamicCollider } from '../city/colliders.js';
import { WALK_Y } from '../city/roads.js';

// The five vehicle classes. Everything is derived from these numbers, so handling is tunable
// in one place.
export const VEHICLE_TYPES = {
  sedan: {
    label: 'Sedán',
    length: 4.5, width: 1.86, height: 1.42,
    mass: 1, engine: 26000, maxSpeed: 41, reverseSpeed: 11,
    grip: 7.2, steer: 1.5, brake: 26,
    bodyColor: [0.82, 0.82, 0.8],
    seats: 4,
  },
  muscle: {
    label: 'Músculo',
    length: 4.9, width: 1.98, height: 1.3,
    mass: 1.12, engine: 40000, maxSpeed: 54, reverseSpeed: 13,
    grip: 5.6, steer: 1.25, brake: 24,
    bodyColor: [0.78, 0.24, 0.18],
    seats: 2,
  },
  sports: {
    label: 'Deportivo',
    length: 4.4, width: 1.94, height: 1.16,
    mass: 0.9, engine: 46000, maxSpeed: 62, reverseSpeed: 12,
    grip: 9.4, steer: 1.35, brake: 30,
    bodyColor: [0.95, 0.76, 0.22],
    seats: 2,
  },
  van: {
    label: 'Furgoneta',
    length: 5.4, width: 2.06, height: 2.2,
    mass: 1.5, engine: 24000, maxSpeed: 34, reverseSpeed: 10,
    grip: 6.2, steer: 1.3, brake: 22,
    bodyColor: [0.93, 0.93, 0.9],
    seats: 2,
  },
  bike: {
    label: 'Moto',
    length: 2.0, width: 0.8, height: 1.15,
    mass: 0.55, engine: 30000, maxSpeed: 58, reverseSpeed: 6,
    grip: 10.5, steer: 1.9, brake: 26,
    bodyColor: [0.16, 0.52, 0.7],
    seats: 1,
  },
};

const PAINTS = [
  [0.86, 0.86, 0.84], [0.1, 0.11, 0.13], [0.72, 0.18, 0.16], [0.16, 0.42, 0.6],
  [0.9, 0.88, 0.8], [0.5, 0.52, 0.55], [0.2, 0.5, 0.28], [0.94, 0.7, 0.2],
  [0.36, 0.24, 0.5], [0.7, 0.42, 0.2],
];

// One shared soft puff texture for damage smoke; building it once keeps wrecks cheap.
let smokeTexture = null;
function getSmokeTexture() {
  if (smokeTexture) return smokeTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(70,70,74,0.85)');
  grad.addColorStop(0.45, 'rgba(52,52,56,0.45)');
  grad.addColorStop(1, 'rgba(40,40,44,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  smokeTexture = new THREE.CanvasTexture(canvas);
  smokeTexture.colorSpace = THREE.SRGBColorSpace;
  return smokeTexture;
}

export function buildVehicleMesh(type, paint, police = false) {
  const spec = VEHICLE_TYPES[type];
  const group = new THREE.Group();
  group.name = `vehicle-${type}`;
  const L = spec.length;
  const W = spec.width;

  const bodyB = new GeometryBuilder({ uv: false, color: true });
  const glassB = new GeometryBuilder({ uv: false, color: true });
  const trimB = new GeometryBuilder({ uv: false, color: true });
  const dark = [0.1, 0.1, 0.11];
  const chrome = [0.72, 0.74, 0.76];

  if (type === 'bike') {
    bodyB.box(0, 0.72, 0, 0.34, 0.5, 1.6, paint);
    bodyB.box(0, 0.98, -0.2, 0.3, 0.16, 0.7, dark);
    bodyB.box(0, 1.02, -0.62, 0.26, 0.2, 0.3, paint);
    trimB.box(0, 0.55, 0.18, 0.5, 0.5, 0.35, chrome);
    trimB.cylinder(0, 0.62, 0.72, 0.06, 0.9, 6, chrome, 'y');
    trimB.cylinder(0, 1.06, 0.72, 0.06, 0.72, 6, dark, 'x');
  } else {
    const bodyH = type === 'van' ? 1.5 : type === 'sports' ? 0.58 : 0.66;
    const bodyY = type === 'van' ? 0.92 : 0.62;
    // Lower body: a long box with slightly tapered ends.
    bodyB.box(0, bodyY, 0, W, bodyH, L, paint);
    // Shoulder line / hood step.
    if (type === 'van') {
      bodyB.box(0, bodyY + 0.95, 0, W - 0.06, 1.0, L - 0.3, paint);
      glassB.box(0, bodyY + 0.86, L / 2 - 0.28, W - 0.18, 0.62, 0.08, [0.12, 0.18, 0.22]);
      glassB.box(0, bodyY + 0.86, -L / 2 + 0.28, W - 0.2, 0.5, 0.08, [0.12, 0.18, 0.22]);
    } else {
      // Cabin: a shorter, narrower box with slanted windscreens drawn as dark glass panels.
      const cabH = type === 'sports' ? 0.5 : 0.66;
      const cabY = bodyY + bodyH / 2 - 0.02;
      const cabL = L * (type === 'sports' ? 0.42 : 0.46);
      bodyB.box(0, cabY + cabH / 2, -L * 0.04, W - 0.16, cabH, cabL, paint);
      // windscreen and backlight
      glassB.box(0, cabY + cabH / 2, -L * 0.04 + cabL / 2, W - 0.3, cabH * 0.82, 0.06, [0.11, 0.16, 0.2]);
      glassB.box(0, cabY + cabH / 2, -L * 0.04 - cabL / 2, W - 0.3, cabH * 0.7, 0.06, [0.11, 0.16, 0.2]);
      // side glass
      for (const s of [-1, 1]) {
        glassB.box(s * (W / 2 - 0.08), cabY + cabH / 2, -L * 0.04, 0.06, cabH * 0.72, cabL * 0.86, [0.11, 0.16, 0.2]);
      }
    }
    // bumpers and sills
    trimB.box(0, bodyY - bodyH / 2 + 0.06, L / 2 - 0.05, W - 0.06, 0.2, 0.16, chrome);
    trimB.box(0, bodyY - bodyH / 2 + 0.06, -L / 2 + 0.05, W - 0.06, 0.2, 0.16, chrome);
    // headlights and tail lights
    for (const s of [-1, 1]) {
      bodyB.box(s * (W / 2 - 0.34), bodyY + 0.2, L / 2 - 0.03, 0.42, 0.16, 0.07, [1, 0.96, 0.82]);
      bodyB.box(s * (W / 2 - 0.32), bodyY + 0.2, -L / 2 + 0.02, 0.4, 0.14, 0.06, [0.85, 0.14, 0.12]);
    }
    // roof rack on the van, spoiler on the sports car
    if (type === 'van') {
      trimB.box(0, bodyY + 1.5, -0.4, W - 0.24, 0.08, L - 1.4, [0.4, 0.4, 0.42]);
    }
    if (type === 'sports') {
      trimB.box(0, bodyY + bodyH / 2 + 0.06, -L / 2 + 0.5, W - 0.2, 0.07, 0.42, dark);
    }
  }

  const bodyMesh = new THREE.Mesh(bodyB.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.3 }));
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  const glassMesh = new THREE.Mesh(glassB.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.5 }));
  glassMesh.castShadow = false;
  group.add(glassMesh);

  const trimMesh = new THREE.Mesh(trimB.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55 }));
  trimMesh.castShadow = true;
  group.add(trimMesh);

  // Wheels: separate objects so they can spin and steer.
  const wheels = [];
  const wheelR = type === 'bike' ? 0.34 : type === 'van' ? 0.42 : 0.36;
  const wb = spec.length * (type === 'bike' ? 0.62 : 0.58);
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.24, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.92 });
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.6, wheelR * 0.6, 0.26, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xa8aaae, roughness: 0.35, metalness: 0.8 });
  const layoutWheels = type === 'bike'
    ? [{ x: 0, z: wb / 2, steer: true }, { x: 0, z: -wb / 2, steer: false }]
    : [
        { x: -spec.width / 2 + 0.12, z: wb / 2, steer: true },
        { x: spec.width / 2 - 0.12, z: wb / 2, steer: true },
        { x: -spec.width / 2 + 0.12, z: -wb / 2, steer: false },
        { x: spec.width / 2 - 0.12, z: -wb / 2, steer: false },
      ];
  for (const w of layoutWheels) {
    const hub = new THREE.Group();
    hub.position.set(w.x, wheelR, w.z);
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    hub.add(tyre, rim);
    group.add(hub);
    wheels.push({ hub, steer: w.steer, spin: 0, radius: wheelR });
  }

  // A soft contact shadow under the car so it doesn't look pasted on the road.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.5, L * 1.25),
    new THREE.MeshBasicMaterial({ color: 0x0a0c10, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  // Police livery: a light bar on the roof with separate red and blue lamps, plus door panels.
  let lightbar = null;
  if (police) {
    // The bar has to sit on the roof, not inside it: work the cabin top out from the same
    // numbers the body is built from, then stand the bar just above that line.
    const bodyY = type === 'van' ? 0.92 : 0.62;
    const bodyH = type === 'van' ? 1.5 : type === 'sports' ? 0.58 : 0.66;
    const roofTop =
      type === 'van'
        ? bodyY + 0.95 + 1.0 / 2
        : bodyY + bodyH / 2 - 0.02 + (type === 'sports' ? 0.5 : 0.66);
    const barY = roofTop + 0.11;
    const barL = type === 'van' ? 1.5 : 1.15;
    const red = new THREE.MeshStandardMaterial({ color: 0x8e1414, emissive: 0xd8241c, emissiveIntensity: 1.4, roughness: 0.4 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x102a6e, emissive: 0x2a52d8, emissiveIntensity: 1.4, roughness: 0.4 });
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.68, 0.09, barL),
      new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.7 }),
    );
    housing.position.set(0, barY, -L * 0.04);
    housing.castShadow = true;
    // Lamps are chunky on purpose: at 1280x720 a slim bar disappears into the roof line.
    const lampL = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 0.16, barL * 0.86), red);
    lampL.position.set(-W * 0.17, barY + 0.06, -L * 0.04);
    const lampR = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 0.16, barL * 0.86), blue);
    lampR.position.set(W * 0.17, barY + 0.06, -L * 0.04);
    group.add(housing, lampL, lampR);

    // White doors with a dark stripe, the way a municipal cruiser reads from the side.
    for (const s of [-1, 1]) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.44, L * 0.44),
        new THREE.MeshStandardMaterial({ color: 0x1b2b4a, roughness: 0.6 }),
      );
      panel.position.set(s * (W / 2 + 0.005), type === 'van' ? 1.1 : 0.62, 0);
      group.add(panel);
    }
    lightbar = { red, blue, lampL, lampR };
  }

  return { group, wheels, wheelRadius: wheelR, spec, lightbar, shadow, bodyMesh, trimMesh, glassMesh };
}

export class Vehicle {
  constructor({ scene, colliders, type = 'sedan', paint = null, x = 0, z = 0, heading = 0, police = false }) {
    this.type = type;
    this.spec = VEHICLE_TYPES[type];
    this.police = police;
    const chosen = police ? [0.94, 0.94, 0.92] : paint ?? PAINTS[Math.floor(Math.random() * PAINTS.length)];
    const built = buildVehicleMesh(type, chosen, police);
    this.group = built.group;
    this.wheels = built.wheels;
    this.wheelRadius = built.wheelRadius;
    this.lightbar = built.lightbar;
    this.shadow = built.shadow;
    this.bodyMesh = built.bodyMesh;
    this.meshParts = { bodyMesh: built.bodyMesh, trimMesh: built.trimMesh, glassMesh: built.glassMesh };
    this.dents = [];
    this.smoke = [];
    this.scene = scene;
    scene.add(this.group);

    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.heading = heading;
    this.steer = 0;
    this.speed = 0;
    this.yawRate = 0;
    this.throttle = 0;
    this.brakeInput = 0;
    this.handbrake = false;
    this.health = 100;
    this.wrecked = false;
    this.driver = null;
    this.isPolice = police;
    this.occupied = false;
    this.siren = police;
    this.sirenPhase = 0;
    this.travel = 0;

    this.collider = new DynamicCollider(colliders, this.spec.width, this.spec.length, this.spec.height, 'vehicle');
    this.collider.box.hidden = false;
    this.collider.place(x, z);

    this.syncMesh();
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  // Arcade driving: throttle accelerates along the nose, steering turns the heading in
  // proportion to speed, and lateral velocity is bled off by grip.
  drive(dt, { throttle = 0, brake = 0, steer = 0, handbrake = false } = {}) {
    if (this.wrecked) {
      this.vel.multiplyScalar(1 - 2.4 * dt);
      this.integrate(dt);
      return;
    }
    this.throttle = throttle;
    this.brakeInput = brake;
    this.handbrake = handbrake;
    const spec = this.spec;

    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let forwardSpeed = this.vel.x * fx + this.vel.z * fz;
    const lateralX = this.vel.x - fx * forwardSpeed;
    const lateralZ = this.vel.z - fz * forwardSpeed;

    // Engine: force falls off near top speed.
    const top = spec.maxSpeed;
    let accel = 0;
    if (throttle !== 0) {
      const dir = Math.sign(throttle);
      const limit = dir > 0 ? top : -spec.reverseSpeed;
      if (Math.abs(forwardSpeed) < Math.abs(limit) || Math.sign(forwardSpeed) !== dir) {
        accel = (spec.engine / (spec.mass * 1000)) * dir;
        const fade = 1 - clamp(Math.abs(forwardSpeed) / Math.abs(limit), 0, 1) * 0.82;
        accel *= fade;
      }
    }
    if (brake !== 0) {
      // Brake opposes motion; if nearly stopped it becomes reverse.
      if (Math.abs(forwardSpeed) > 0.8) accel -= Math.sign(forwardSpeed) * spec.brake;
      else accel -= spec.brake * 0.42;
    }
    if (handbrake) accel -= Math.sign(forwardSpeed) * spec.brake * 0.5;

    forwardSpeed += accel * dt;
    // Drag and rolling resistance.
    forwardSpeed *= 1 - (this.handbrake ? 0.6 : 1.4) * dt;
    forwardSpeed = clamp(forwardSpeed, -spec.reverseSpeed * 1.4, top * 1.06);

    // Steering: the yaw rate scales with speed and is gentler at the limit.
    const speedFactor = clamp(Math.abs(forwardSpeed) / 9, 0, 1);
    const steerRate = spec.steer * (1 - clamp(Math.abs(forwardSpeed) / top, 0, 1) * 0.52);
    this.steer = damp(this.steer, steer, 10, dt);
    const dirSign = forwardSpeed < 0 ? -1 : 1;
    this.yawRate = this.steer * steerRate * speedFactor * dirSign * (this.handbrake ? 1.7 : 1);
    this.heading += this.yawRate * dt;
    if (this.heading > Math.PI) this.heading -= Math.PI * 2;
    if (this.heading < -Math.PI) this.heading += Math.PI * 2;

    // Rebuild velocity with reduced lateral component (grip).
    const gripRate = this.handbrake ? spec.grip * 0.35 : spec.grip;
    const latKeep = Math.exp(-gripRate * dt);
    const newFx = Math.sin(this.heading);
    const newFz = Math.cos(this.heading);
    this.vel.x = newFx * forwardSpeed + lateralX * latKeep;
    this.vel.z = newFz * forwardSpeed + lateralZ * latKeep;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    this.integrate(dt);
    this.animateWheels(dt);
  }

  integrate(dt) {
    const px = this.pos.x;
    const pz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collider.place(this.pos.x, this.pos.z);
    this.syncMesh();
    if (this.siren) {
      this.sirenPhase += dt * 9;
      // Alternate red and blue lamps, biased by investigating/steady state.
      const on = Math.sin(this.sirenPhase) > 0;
      if (this.lightbar) {
        this.lightbar.red.emissiveIntensity = on ? 2.6 : 0.25;
        this.lightbar.blue.emissiveIntensity = on ? 0.25 : 2.6;
      }
    }
    // World bounds.
    const b = this.collider.box;
    if (b.minX < this.boundsMinX || b.maxX > this.boundsMaxX) {
      this.vel.x *= -0.2;
      this.pos.x = px;
      this.collider.place(px, this.pos.z);
    }
    // Store distance travelled for traffic/tyre effects.
    this.travel += Math.hypot(this.pos.x - px, this.pos.z - pz);
  }

  animateWheels(dt) {
    const spin = (this.speed / this.wheelRadius) * dt;
    for (const w of this.wheels) {
      w.spin += spin;
      w.hub.rotation.x = w.spin;
      if (w.steer) w.hub.rotation.y = this.steer * 0.52;
    }
  }

  syncMesh() {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.group.rotation.y = this.heading;
  }

  // The seat the player sits in: slightly right of centre, behind the wheel.
  seatPosition() {
    return new THREE.Vector3(
      this.pos.x + Math.cos(this.heading) * 0.36,
      0,
      this.pos.z - Math.sin(this.heading) * 0.36,
    );
  }

  // Visible damage: every hard hit dents the bodywork by shoving a panel in and leaving a
  // crumple scar, and a badly damaged car starts venting smoke from the bonnet.
  dent(intensity = 1) {
    if (this.wrecked) return;
    const built = this.meshParts;
    if (!built) return;
    const b = built.bodyMesh;
    if (!b) return;
    // Scale shrink on one axis reads as a pushed-in panel from any angle.
    const dentCount = Math.min(6, Math.floor((100 - this.health) / 16));
    while (this.dents.length < dentCount) {
      const g = b.geometry;
      const pos = g.attributes.position;
      const vertex = Math.floor(Math.random() * (pos.count / 3)) * 3;
      const cx = pos.getX(vertex);
      const cy = pos.getY(vertex);
      const cz = pos.getZ(vertex);
      const depth = 0.06 + Math.random() * 0.05;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - cx;
        const dy = pos.getY(i) - cy;
        const dz = pos.getZ(i) - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > 0.75) continue;
        const falloff = (1 - d / 0.75) * depth * intensity;
        pos.setX(i, pos.getX(i) - Math.sign(dx || 1) * falloff * 0.4);
        pos.setY(i, Math.max(0.12, pos.getY(i) - falloff));
        pos.setZ(i, pos.getZ(i) - Math.sign(dz || 1) * falloff * 0.4);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
      this.dents.push({ x: cx, y: cy, z: cz });
    }
    // Darken the paint as it takes punishment.
    const wear = 1 - (100 - this.health) / 100 * 0.3;
    for (const m of [built.bodyMesh, built.trimMesh]) {
      if (m?.material) {
        m.material = m.material.clone();
        m.material.color = new THREE.Color(1, 1, 1).multiplyScalar(wear);
      }
    }
  }

  // A puddle of dark smoke over a damaged car. `dt` drives the puff animation.
  updateDamageFx(dt, time) {
    if (!this.smokeGroup) {
      this.smokeGroup = new THREE.Group();
      this.group.add(this.smokeGroup);
    }
    const wantSmoke = this.wrecked || this.health < 45;
    if (!wantSmoke) {
      if (this.smokeGroup.children.length) this.smokeGroup.clear();
      return;
    }
    const rate = this.wrecked ? 0.055 : 0.16;
    const normal = Math.round(dt / rate);
    for (let i = 0; i < Math.min(2, Math.max(0, normal)); i++) {
      if (this.smoke.length > 14) break;
      const mat = new THREE.SpriteMaterial({
        map: getSmokeTexture(),
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      });
      const puff = new THREE.Sprite(mat);
      puff.position.set((Math.random() - 0.5) * 0.7, this.spec.height * 0.7, this.spec.length * 0.3);
      puff.scale.setScalar(0.5);
      this.smokeGroup.add(puff);
      this.smoke.push({ s: puff, life: 0, ttl: 1.4 + Math.random() * 1.2, rise: 1.1 + Math.random() });
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const p = this.smoke[i];
      p.life += dt;
      const t = p.life / p.ttl;
      if (t >= 1) {
        this.smokeGroup.remove(p.s);
        p.s.material.dispose();
        this.smoke.splice(i, 1);
        continue;
      }
      p.s.position.y += p.rise * dt;
      p.s.position.x += Math.sin(time * 1.7 + i) * 0.25 * dt;
      p.s.scale.setScalar(0.5 + t * 1.5);
      p.s.material.opacity = 0.55 * (1 - t) * (1 - t);
    }
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.dent(amount / 30);
    if (this.health <= 0 && !this.wrecked) {
      this.wrecked = true;
      this.vel.multiplyScalar(0.4);
      // A wrecked car sits lower and darkens.
      this.group.position.y = -0.16;
      this.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) {
          o.material = o.material.clone();
          o.material.color.multiplyScalar(0.55);
        }
      });
    }
  }

  setBounds(minX, maxX) {
    this.boundsMinX = minX;
    this.boundsMaxX = maxX;
  }

  get travelDistance() {
    return this.travel ?? 0;
  }
}

export function spawnVehicle(scene, colliders, { type, x, z, heading = 0, paint = null, police = false }) {
  const v = new Vehicle({ scene, colliders, type, x, z, heading, paint, police });
  v.setBounds(-100000, 100000);
  return v;
}
