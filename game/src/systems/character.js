// A jointed humanoid rig built from primitives, shared by the player, pedestrians, police
// officers and mission characters. The model is a hierarchy of capsules and boxes with named
// joints (hips, spine, head, shoulders, elbows, hips, knees) so one animation driver can pose
// everyone. Walk, run, sprint, aim and idle cycles are all procedural, driven by a phase value.

import * as THREE from 'three';
import { damp, dampAngle } from '../core/random.js';

const SKIN_TONES = [0xb87a56, 0x8a5a3c, 0xe0b08a, 0xf0cdaa, 0x6b4330, 0xc98f66, 0x53372a];
const SHIRT_COLORS = [
  0xf2f0e8, 0xd8493e, 0x2f7d8c, 0xf0b64a, 0x3a4a5c, 0x8d5ba8, 0x4d8c5a, 0xe0d6c2, 0x2a2f36, 0xc9683f,
];
const PANTS_COLORS = [0x2c3542, 0x3f4a58, 0x6f6558, 0xd9d3c4, 0x24323a, 0x5a4636, 0x8a8f96];
const HAIR_COLORS = [0x1e1712, 0x3a2a1c, 0x6b4a2a, 0x14100e, 0x9a7a4a, 0x2b2b2e, 0xb8b0a4];

export class HumanRig {
  constructor({ skin, shirt, pants, hair, height = 1.78, build = 1, hat = null, hatColor = null, role = 'ped' } = {}) {
    this.role = role;
    this.height = height;
    this.phase = Math.random() * Math.PI * 2;
    this.torso = new THREE.Group();
    this.root = new THREE.Group();
    this.root.name = `rig-${role}`;
    this.torso.position.y = height * 0.53;
    this.root.add(this.torso);

    const skinMat = new THREE.MeshStandardMaterial({ color: skin ?? SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)], roughness: 0.72 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirt ?? SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)], roughness: 0.82 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pants ?? PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)], roughness: 0.9 });
    const hairMat = new THREE.MeshStandardMaterial({ color: hair ?? HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)], roughness: 0.95 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 0.7 });
    this.materials = { skinMat, shirtMat, pantsMat, hairMat };
    const scaleW = build;

    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scaleW, height * 0.31, 0.24 * scaleW), shirtMat);
    torsoMesh.position.y = 0.02;
    torsoMesh.castShadow = true;
    this.torso.add(torsoMesh);

    const hipMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38 * scaleW, height * 0.12, 0.25 * scaleW), pantsMat);
    hipMesh.position.y = -height * 0.17;
    hipMesh.castShadow = true;
    this.torso.add(hipMesh);

    this.neck = new THREE.Group();
    this.neck.position.y = height * 0.175;
    this.torso.add(this.neck);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(height * 0.075, 12, 10), skinMat);
    headMesh.position.y = height * 0.075;
    headMesh.scale.set(0.92, 1.06, 0.92);
    headMesh.castShadow = true;
    this.neck.add(headMesh);
    // hair cap
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(height * 0.079, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    hairMesh.position.y = height * 0.083;
    this.neck.add(hairMesh);
    this.head = headMesh;
    if (hat === 'cap') {
      const capColor = hatColor ?? 0x1b2a38;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.083, height * 0.083, height * 0.035, 10), new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.7 }));
      cap.position.y = height * 0.128;
      this.neck.add(cap);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(height * 0.11, 0.02, height * 0.06), new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.7 }));
      brim.position.set(0, height * 0.118, height * 0.085);
      this.neck.add(brim);
    }
    if (hat === 'wide') {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.14, height * 0.15, height * 0.018, 12), new THREE.MeshStandardMaterial({ color: 0xd9c49a, roughness: 0.9 }));
      brim.position.y = height * 0.128;
      this.neck.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(height * 0.075, height * 0.085, height * 0.06, 10), new THREE.MeshStandardMaterial({ color: 0xe3cfa4, roughness: 0.9 }));
      crown.position.y = height * 0.158;
      this.neck.add(crown);
    }

    // Arms: shoulder group -> upper arm mesh -> elbow group -> forearm mesh.
    this.arms = {};
    for (const side of ['left', 'right']) {
      const dir = side === 'left' ? -1 : 1;
      const shoulder = new THREE.Group();
      shoulder.position.set(dir * 0.255 * scaleW, height * 0.135, 0);
      this.torso.add(shoulder);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062 * scaleW, height * 0.14, 4, 8), shirtMat);
      upper.position.y = -height * 0.09;
      upper.castShadow = true;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -height * 0.175;
      shoulder.add(elbow);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.052 * scaleW, height * 0.15, 4, 8), skinMat);
      fore.position.y = -height * 0.085;
      fore.castShadow = true;
      elbow.add(fore);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.05), skinMat);
      hand.position.y = -height * 0.175;
      elbow.add(hand);
      this.arms[side] = { shoulder, elbow, hand };
    }

    // Legs: hip group -> thigh -> knee group -> shin + shoe.
    this.legs = {};
    for (const side of ['left', 'right']) {
      const dir = side === 'left' ? -1 : 1;
      const hip = new THREE.Group();
      hip.position.set(dir * 0.105 * scaleW, -height * 0.2, 0);
      this.torso.add(hip);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.078 * scaleW, height * 0.19, 4, 8), pantsMat);
      thigh.position.y = -height * 0.115;
      thigh.castShadow = true;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -height * 0.235;
      hip.add(knee);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.064 * scaleW, height * 0.19, 4, 8), pantsMat);
      shin.position.y = -height * 0.105;
      shin.castShadow = true;
      knee.add(shin);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.22), shoeMat);
      shoe.position.set(0, -height * 0.205, 0.045);
      shoe.castShadow = true;
      knee.add(shoe);
      this.legs[side] = { hip, knee, shoe };
    }

    this.speed = 0;
    this.aimPose = 0;
    this.aimPitch = 0;
    this.dead = false;
    this.fallen = 0;

    // The rig's origin sits at hip height, so a rig placed with its origin on the pavement would
    // sink to the ankles. footOffset is the distance from the origin down to the sole of the shoe:
    // every system that plants a character on the ground adds it.
    this.footOffset = height * 0.205 + 0.03;
  }

  // Put the rig's soles on a ground height. Use this instead of setting root.position.y directly.
  placeRoot(x, groundY, z) {
    this.root.position.set(x, groundY + this.footOffset, z);
  }

  // Pose the rig for a movement state. `speed` is horizontal m/s, `state` one of idle, walk, run,
  // sprint, aim, sit. All angles are procedural so the same rig serves every character.
  animate(dt, speed, state = 'walk', opts = {}) {
    this.speed = damp(this.speed, speed, 12, dt);
    const s = this.speed;
    const moving = s > 0.15;
    const cycleRate = state === 'sprint' ? 9.4 : state === 'run' ? 7.2 : 5.4;
    this.phase += dt * (moving ? cycleRate * Math.min(1, s / 4 + 0.35) : 0);
    const t = this.phase;
    const amp = Math.min(1, s / 5.2);
    const aim = state === 'aim' ? 1 : 0;
    this.aimPose = damp(this.aimPose, aim, 9, dt);
    this.aimPitch = damp(this.aimPitch, opts.pitch ?? 0, 10, dt);

    if (this.dead) {
      this.fallen = Math.min(1, this.fallen + dt * 2.4);
      this.root.rotation.x = -this.fallen * Math.PI * 0.46;
      // Fall to the ground relative to the rig's own standing height, not to y=0.
      this.root.position.y = this.footOffset - this.fallen * (this.footOffset + 0.06);
      this.torso.rotation.z = this.fallen * 0.3;
      return;
    }

    if (moving) {
      const swing = Math.sin(t) * (0.42 + amp * 0.85);
      const swingB = Math.sin(t + Math.PI) * (0.42 + amp * 0.85);
      this.legs.left.hip.rotation.x = swing;
      this.legs.right.hip.rotation.x = swingB;
      // knee bends on the backswing, never hyperextends
      this.legs.left.knee.rotation.x = Math.max(0, -Math.sin(t + 0.6)) * (0.4 + amp * 1.15);
      this.legs.right.knee.rotation.x = Math.max(0, -Math.sin(t + Math.PI + 0.6)) * (0.4 + amp * 1.15);
      this.legs.left.hip.rotation.z = 0.02;
      this.legs.right.hip.rotation.z = -0.02;
      // Piston: hips rise twice per cycle.
      this.torso.position.y = this.height * 0.53 + Math.abs(Math.sin(t)) * 0.035 * amp - 0.02 * amp;
      this.torso.rotation.z = Math.sin(t) * 0.03 * amp;
      this.torso.rotation.x = (state === 'sprint' ? 0.16 : 0.06) * amp;
    } else {
      this.legs.left.hip.rotation.x = damp(this.legs.left.hip.rotation.x, 0, 10, dt);
      this.legs.right.hip.rotation.x = damp(this.legs.right.hip.rotation.x, 0, 10, dt);
      this.legs.left.knee.rotation.x = damp(this.legs.left.knee.rotation.x, 0.03, 10, dt);
      this.legs.right.knee.rotation.x = damp(this.legs.right.knee.rotation.x, 0.03, 10, dt);
      this.torso.position.y = damp(this.torso.position.y, this.height * 0.53 + Math.sin(performance.now() * 0.0018) * 0.006, 8, dt);
      this.torso.rotation.z = damp(this.torso.rotation.z, 0, 6, dt);
      this.torso.rotation.x = damp(this.torso.rotation.x, 0, 6, dt);
    }

    // Arms oppose the legs; while aiming the right arm comes up and the left supports it.
    const armSwing = moving ? Math.sin(t + Math.PI) * (0.32 + amp * 0.7) : 0;
    const armSwingB = moving ? Math.sin(t) * (0.32 + amp * 0.7) : 0;
    const idleArm = Math.sin(performance.now() * 0.0016) * 0.02;
    this.arms.left.shoulder.rotation.x = damp(this.arms.left.shoulder.rotation.x, armSwing + idleArm - this.aimPose * 0.55, 14, dt);
    this.arms.right.shoulder.rotation.x = damp(this.arms.right.shoulder.rotation.x, armSwingB + idleArm - this.aimPose * 1.25, 14, dt);
    this.arms.left.elbow.rotation.x = damp(this.arms.left.elbow.rotation.x, -(0.15 + amp * 0.5) - this.aimPose * 0.5, 12, dt);
    this.arms.right.elbow.rotation.x = damp(this.arms.right.elbow.rotation.x, -(0.15 + amp * 0.5) - this.aimPose * 0.15, 12, dt);
    this.arms.left.shoulder.rotation.z = damp(this.arms.left.shoulder.rotation.z, 0.12 + this.aimPose * 0.42, 10, dt);
    this.arms.right.shoulder.rotation.z = damp(this.arms.right.shoulder.rotation.z, -0.12 - this.aimPose * 0.06, 10, dt);
    this.arms.right.shoulder.rotation.x -= this.aimPitch * 0.85;
    this.neck.rotation.x = damp(this.neck.rotation.x, -this.aimPitch * 0.5 + (opts.lookUp ?? 0), 8, dt);
  }

  die() {
    this.dead = true;
  }

  revive() {
    this.dead = false;
    this.fallen = 0;
    this.root.rotation.x = 0;
    this.root.position.y = this.footOffset;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}

export function randomAppearance(rng = Math.random, role = 'ped') {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return {
    skin: pick(SKIN_TONES),
    shirt: pick(SHIRT_COLORS),
    pants: pick(PANTS_COLORS),
    hair: pick(HAIR_COLORS),
    height: 1.62 + rng() * 0.28,
    build: 0.88 + rng() * 0.26,
    hat: rng() < 0.14 ? (role === 'cop' ? 'cap' : 'wide') : null,
    role,
  };
}
