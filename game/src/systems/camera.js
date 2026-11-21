// The third-person camera. It orbits a focus point with the mouse, trails behind on foot, pulls
// back and lowers for driving, and shortens its boom when a building would come between it and
// the player. Shake is a small decaying offset used for gunfire and impacts.

import * as THREE from 'three';
import { clamp, damp } from '../core/random.js';

export class ThirdPersonCamera {
  constructor(camera, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.yaw = 0;
    this.pitch = 0.2;
    this.distance = 5.4;
    this.currentDist = 5.4;
    this.focus = new THREE.Vector3();
    this.smoothFocus = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.shake = 0;
    this.shakePhase = 0;
    this.vehicleMode = 0;
    this.ready = false;
  }

  rotate(dx, dy, sensitivity = 1) {
    this.yaw -= dx * 0.0026 * sensitivity;
    this.pitch = clamp(this.pitch + dy * 0.0022 * sensitivity, -0.42, 1.0);
  }

  addShake(amount) {
    this.shake = Math.min(1.4, this.shake + amount);
  }

  // Focus is the character or car origin; the camera looks at a point slightly above it.
  update(dt, focus, { driving = false, speed = 0, lookAhead = 0 } = {}) {
    this.vehicleMode = damp(this.vehicleMode, driving ? 1 : 0, 6, dt);
    const vm = this.vehicleMode;
    const wishDist = 5.4 + vm * 3.6 + clamp(speed * 0.055, 0, 2.2);
    const height = 1.55 + vm * 0.55;
    const lookHeight = height + 0.25 - vm * 0.25;

    this.focus.set(focus.x, focus.y + height, focus.z);
    if (!this.ready) {
      this.smoothFocus.copy(this.focus);
      this.ready = true;
    } else {
      this.smoothFocus.x = damp(this.smoothFocus.x, this.focus.x, 14, dt);
      this.smoothFocus.y = damp(this.smoothFocus.y, this.focus.y, 7, dt);
      this.smoothFocus.z = damp(this.smoothFocus.z, this.focus.z, 14, dt);
    }

    const pitch = this.pitch - vm * 0.06;
    const cy = Math.cos(pitch);
    const dirX = Math.sin(this.yaw) * cy;
    const dirY = -Math.sin(pitch);
    const dirZ = Math.cos(this.yaw) * cy;

    // Pull in the boom if the ideal position is inside a building.
    let dist = wishDist;
    const ox = this.smoothFocus.x;
    const oy = this.smoothFocus.y;
    const oz = this.smoothFocus.z;
    const hit = this.colliders?.raycast(ox, oy, oz, -dirX, -dirY, -dirZ, wishDist + 0.8);
    if (hit) dist = Math.max(1.5, hit.dist - 0.55);
    this.currentDist = this.currentDist === wishDist ? dist : damp(this.currentDist, dist, 12, dt);

    this.tmp.set(ox - dirX * this.currentDist, oy - dirY * this.currentDist, oz - dirZ * this.currentDist);
    // Keep the camera off the pavement.
    if (this.tmp.y < 0.6) this.tmp.y = 0.6;

    if (this.shake > 0.001) {
      this.shakePhase += dt * 42;
      const s = this.shake * this.shake * 0.28;
      this.tmp.x += Math.sin(this.shakePhase * 1.7) * s;
      this.tmp.y += Math.cos(this.shakePhase * 2.3) * s;
      this.shake = Math.max(0, this.shake - dt * 3.4);
    }

    this.camera.position.copy(this.tmp);
    // Aim at the focus, biased forward while driving so the road fills the frame.
    const fx = this.smoothFocus.x + Math.sin(this.yaw) * lookAhead;
    const fz = this.smoothFocus.z + Math.cos(this.yaw) * lookAhead;
    this.camera.lookAt(fx, this.smoothFocus.y - 0.1 + lookHeight * 0.06, fz);
  }
}
