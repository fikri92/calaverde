// Weapons, hitscan and the effects that sell them: muzzle flash, tracers, impact sparks, dust
// puffs and blood. Hitscan walks a ray against the collider grid, the pedestrian capsules and the
// police officers, picks the closest, and reports what was hit so the caller can apply damage.

import * as THREE from 'three';
import { clamp } from '../core/random.js';

// Ground pickups: what each droppable weapon looks like and the tint of its marker ring.
const WEAPON_PICKUPS = {
  pistol: { scale: [0.07, 0.13, 0.24], barrel: 0, tint: 0xffd27a },
  smg: { scale: [0.09, 0.16, 0.46], barrel: 0.14, tint: 0x8ad6ff },
  shotgun: { scale: [0.09, 0.14, 0.68], barrel: 0.2, tint: 0xff9c6a },
};

export class Combat {
  constructor({ scene, colliders }) {
    this.scene = scene;
    this.colliders = colliders;
    this.tracers = [];
    this.sparks = [];
    this.flashes = [];
    this.decals = [];
    this.shotsFired = 0;
    this.muzzleLight = new THREE.PointLight(0xffcf8a, 0, 9, 2);
    this.scene.add(this.muzzleLight);

    // Shared geometries/materials, reused by every effect.
    this.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd79a, transparent: true, opacity: 0.9, depthWrite: false });
    this.sparkGeo = new THREE.SphereGeometry(0.035, 5, 4);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc061, transparent: true, depthWrite: false });
    // A muzzle flash: a small hot core plus two crossed spikes, so it reads as a burst of light
    // rather than a white ball. It is deliberately tiny — a real flash is a 30 cm event at the end
    // of a barrel, not a torso-sized blob.
    this.flashGeo = new THREE.SphereGeometry(0.13, 8, 6);
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flashSpikeGeo = new THREE.PlaneGeometry(0.62, 0.09);
    this.flashSpikeMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.decalGeo = new THREE.CircleGeometry(0.075, 8);
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x1a1614, transparent: true, opacity: 0.85, depthWrite: false });
    this.decalPool = [];
    this.pickups = [];
  }

  // Fire one shot. `targets` is an object with {peds, cops, vehicles} so the ray can find people
  // and cars. Returns a report used by the caller for damage, wanted level and audio.
  fire(origin, dir, weapon, { peds, cops, vehicles, player, enemiesCanHitPlayer = false }) {
    this.shotsFired++;
    const spread = weapon.spread ?? 0.02;
    const pellets = weapon.pellets ?? 1;
    const results = [];
    const fwd = dir.clone().normalize();

    for (let p = 0; p < pellets; p++) {
      const d = fwd.clone();
      // Box-Muller-ish scatter inside a cone.
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      d.x += Math.cos(a) * r;
      d.y += Math.sin(a) * r * 0.75;
      d.z += Math.cos(a + 1.6) * r * 0.4;
      d.normalize();

      const maxDist = 130;
      const wall = this.colliders.raycast(origin.x, origin.y, origin.z, d.x, d.y, d.z, maxDist);
      let hitDist = wall ? wall.dist : maxDist;
      let hitKind = wall ? 'wall' : null;
      let hitPed = null;
      let hitCop = null;

      if (peds) {
        const hit = peds.raycast(origin.x, origin.y, origin.z, d.x, d.y, d.z, hitDist);
        if (hit && hit.dist < hitDist) {
          hitDist = hit.dist;
          hitKind = 'ped';
          hitPed = hit.ped;
        }
      }
      if (cops) {
        for (const cop of cops) {
          if (cop.dead) continue;
          const t = raySphere(origin, d, cop.pos, 0.62, hitDist);
          if (t !== null && t < hitDist) {
            hitDist = t;
            hitKind = 'cop';
            hitCop = cop;
            hitPed = null;
          }
        }
      }
      if (vehicles) {
        for (const v of vehicles) {
          if (v.disposed) continue;
          const t = rayOBB(origin, d, v, hitDist);
          if (t !== null && t < hitDist) {
            hitDist = t;
            hitKind = 'vehicle';
            hitPed = null;
            hitCop = null;
          }
        }
      }

      const end = origin.clone().addScaledVector(d, hitDist);
      this.spawnTracer(origin, end);
      this.spawnFlash(origin);
      results.push({ kind: hitKind, ped: hitPed, cop: hitCop, point: end, dist: hitDist, dir: d });

      if (hitKind === 'wall') this.spawnSparks(end, d, 5);
      else if (hitKind === 'vehicle') this.spawnSparks(end, d, 4);
      else if (hitKind === 'ped' || hitKind === 'cop') this.spawnBlood(end, d);
    }
    this.muzzleLight.position.copy(origin);
    this.muzzleLight.intensity = 3.4;
    return results;
  }

  spawnTracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 0.4) return;
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    mesh.position.copy(from).lerp(to, 0.5);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.07, max: 0.07 });
  }

  // A muzzle flash: a hot core with two crossed spikes, oriented along the barrel. `scale` lets a
  // posed screenshot stage a flash that survives into a still, since the live effect lasts 55 ms.
  spawnFlash(origin, scale = 1, dir = null) {
    const group = new THREE.Group();
    group.position.copy(origin);
    const core = new THREE.Mesh(this.flashGeo, this.flashMat.clone());
    group.add(core);
    for (let i = 0; i < 2; i++) {
      const spike = new THREE.Mesh(this.flashSpikeGeo, this.flashSpikeMat.clone());
      spike.rotation.z = (i * Math.PI) / 2;
      spike.position.x = 0.02;
      group.add(spike);
    }
    if (dir) {
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    }
    group.scale.setScalar(scale);
    this.scene.add(group);
    this.flashes.push({ mesh: group, life: 0.055, max: 0.055 });
  }

  spawnSparks(point, dir, count) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, this.sparkMat.clone());
      mesh.position.copy(point);
      this.scene.add(mesh);
      const v = new THREE.Vector3(
        dir.x * -0.35 + (Math.random() - 0.5) * 3.4,
        Math.random() * 3.2,
        dir.z * -0.35 + (Math.random() - 0.5) * 3.4,
      );
      this.sparks.push({ mesh, v, life: 0.3 + Math.random() * 0.3, max: 0.6 });
    }
  }

  spawnBlood(point, dir) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.sparkGeo, new THREE.MeshBasicMaterial({ color: 0x8d1f18, transparent: true, depthWrite: false }));
      mesh.position.copy(point);
      mesh.scale.setScalar(0.7 + Math.random());
      this.scene.add(mesh);
      const v = new THREE.Vector3(
        dir.x * 0.6 + (Math.random() - 0.5) * 2.2,
        Math.random() * 2.4,
        dir.z * 0.6 + (Math.random() - 0.5) * 2.2,
      );
      this.sparks.push({ mesh, v, life: 0.28 + Math.random() * 0.22, max: 0.5 });
    }
  }

  // Bullet holes on walls, fading out after a while.
  addDecal(point, normal) {
    const mesh = new THREE.Mesh(this.decalGeo, this.decalMat);
    mesh.position.copy(point).addScaledVector(normal, 0.02);
    mesh.lookAt(point.clone().add(normal));
    this.scene.add(mesh);
    this.decals.push({ mesh, life: 14 });
    if (this.decals.length > 40) {
      const old = this.decals.shift();
      this.scene.remove(old.mesh);
    }
  }

  // Melee: a short arc in front of the attacker. Anyone inside `reach` and `arc` takes damage and
  // is shoved along the hit direction. Returns who was hit so the caller can raise the wanted
  // level and play the impact sound.
  melee(origin, dir, { reach = 2.1, arc = 0.55, damage = 26, peds = [], cops = [], gang = [] } = {}) {
    const fwd = dir.clone().setY(0).normalize();
    const hits = [];
    const consider = (target, kind) => {
      const dx = target.pos.x - origin.x;
      const dz = target.pos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach) return;
      if (dist > 0.001) {
        const dot = (dx / dist) * fwd.x + (dz / dist) * fwd.z;
        if (dot < Math.cos(arc)) return;
      }
      hits.push({ kind, target, dist, knockX: (dx / (dist || 1)) * 2.6, knockZ: (dz / (dist || 1)) * 2.6 });
    };
    for (const p of peds) if (!p.dead) consider(p, 'ped');
    for (const c of cops) if (!c.dead) consider(c, 'cop');
    for (const g of gang) if (!g.dead) consider(g, 'gang');
    // Only the nearest target takes the hit; a swing is one punch, not a cleave.
    hits.sort((a, b) => a.dist - b.dist);
    const hit = hits[0] ?? null;
    if (hit) {
      hit.damage = damage;
      this.spawnSparks(
        new THREE.Vector3(hit.target.pos.x, (hit.target.pos.y ?? 0) + 1.1, hit.target.pos.z),
        fwd,
        5,
      );
    }
    return hit;
  }

  // Drop a weapon on the ground where a body fell. It bobs, spins, and is collected by walking
  // over it: the player gets a full magazine plus reserve ammo for that weapon.
  dropWeaponPickup(x, z, weaponId) {
    const spec = WEAPON_PICKUPS[weaponId];
    if (!spec) return null;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(spec.scale[0], spec.scale[1], spec.scale[2]),
      new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.45, metalness: 0.55 }),
    );
    body.castShadow = true;
    group.add(body);
    if (spec.barrel) {
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, spec.barrel),
        new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.4, metalness: 0.6 }),
      );
      barrel.position.z = spec.barrel / 2 + spec.scale[2] / 2;
      group.add(barrel);
    }
    // A slow-turning ring on the ground marks it as loot.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.52, 18),
      new THREE.MeshBasicMaterial({ color: spec.tint, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    this.scene.add(ring);
    group.position.set(x, 0.75, z);
    this.scene.add(group);
    const pickup = { group, ring, x, z, weaponId, phase: Math.random() * 6.28, taken: false };
    this.pickups.push(pickup);
    return pickup;
  }

  // Walk-over collection. Returns the weapon the player just gained, or null.
  collectPickups(player) {
    for (const p of this.pickups) {
      if (p.taken) continue;
      if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) > 1.7) continue;
      p.taken = true;
      this.scene.remove(p.group);
      this.scene.remove(p.ring);
      p.group.traverse((o) => o.geometry?.dispose?.());
      p.ring.geometry.dispose();
      const slot = player.weapons.find((w) => w.id === p.weaponId);
      if (slot) {
        slot.ammo = slot.mag;
        slot.reserve = Math.min(slot.reserveMax ?? 240, slot.reserve + slot.mag * 2);
        return slot;
      }
      return { id: p.weaponId };
    }
    return null;
  }

  update(dt) {
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 42);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / t.max) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      // The flash is a small group (hot core plus spikes), so fade every child material.
      f.mesh.traverse((o) => {
        if (o.material) o.material.opacity = k;
      });
      f.mesh.scale.multiplyScalar(1 + dt * 8);
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.traverse((o) => o.material?.dispose?.());
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.v.y -= 14 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.material.opacity = Math.max(0, s.life / s.max);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.decals.splice(i, 1);
      }
    }

    // Weapon pickups bob and their marker rings pulse, so loot reads on a dark street.
    const t = performance.now() * 0.001;
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.group.position.y = 0.75 + Math.sin(t * 1.9 + p.phase) * 0.09;
      p.group.rotation.y += dt * 1.5;
      p.ring.material.opacity = 0.32 + Math.sin(t * 2.6 + p.phase) * 0.16;
      p.ring.scale.setScalar(1 + Math.sin(t * 2.1 + p.phase) * 0.06);
    }
  }
}

function raySphere(origin, dir, center, radius, maxDist) {
  const ox = origin.x - center.x;
  const oy = origin.y - (center.y + 1.1);
  const oz = origin.z - center.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0 || t > maxDist) return null;
  return t;
}

// Ray against a car's oriented box, approximated by testing in the car's local frame.
function rayOBB(origin, dir, vehicle, maxDist) {
  const dx = origin.x - vehicle.pos.x;
  const dz = origin.z - vehicle.pos.z;
  const c = Math.cos(-vehicle.heading);
  const s = Math.sin(-vehicle.heading);
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const ldx = dir.x * c + dir.z * s;
  const ldz = -dir.x * s + dir.z * c;
  const hw = vehicle.spec.width / 2;
  const hl = vehicle.spec.length / 2;
  const hh = vehicle.spec.height;
  let tmin = 0;
  let tmax = maxDist;
  const axes = [
    [lx, ldx, -hw, hw],
    [origin.y, dir.y, 0.1, hh],
    [lz, ldz, -hl, hl],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-7) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0 ? tmin : null;
}

// Pick a target nearest to a point, alive, within a radius.
export function nearestOf(list, point, radius, predicate = () => true) {
  let best = null;
  let bestD = radius * radius;
  for (const item of list) {
    if (!item || item.dead || !predicate(item)) continue;
    const dx = item.pos.x - point.x;
    const dz = item.pos.z - point.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = item;
    }
  }
  return best;
}

export function clampSpread(v) {
  return clamp(v, 0, 0.4);
}
