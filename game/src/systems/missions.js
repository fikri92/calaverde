// The mission runner: walks a mission's steps in order, tracks counters, spawns the objectives it
// needs (target cars, gang members, pickup packages, the convoy), and reports dialogue, objective
// text and completion so the HUD and the phone can show them.

import * as THREE from 'three';
import { makeRng, clamp } from '../core/random.js';
import { MISSIONS, ACTIVITIES, CAST } from '../data/missions.js';
import { spawnVehicle } from './vehicles.js';
import { HumanRig, randomAppearance } from './character.js';
import { WALK_Y } from '../city/roads.js';

export class Missions {
  constructor({ scene, colliders, layout, player, police, combat, traffic, camera, audio }) {
    this.scene = scene;
    this.colliders = colliders;
    this.layout = layout;
    this.player = player;
    this.police = police;
    this.combat = combat;
    this.traffic = traffic;
    this.camera = camera;
    this.audio = audio;
    this.rng = makeRng(1357);

    this.missionIndex = -1;
    this.active = null; // the mission object
    this.stepIndex = 0;
    this.stepState = null; // counters, spawned actors, timers for the current step
    this.started = [];
    this.completed = [];
    this.dialogueQueue = [];
    this.dialogueTimer = 0;
    this.currentLine = null;
    this.lastLine = null;
    this.objective = '';
    this.marker = null;
    this.markerMesh = null;
    this.gang = [];
    this.pickups = [];
    this.notifications = [];
    this.finished = false;
    this.storyComplete = false;
    this.phoneOpen = false;
    this.missionTimer = 0;
  }

  get currentMission() {
    return this.active;
  }

  get district() {
    return this.active?.district ?? 'Puerto Azul';
  }

  // Start the next story mission, or a chosen one.
  start(id = null) {
    let mission = null;
    if (id) mission = MISSIONS.find((m) => m.id === id);
    else mission = MISSIONS[this.missionIndex + 1];
    if (!mission) return false;
    this.missionIndex = MISSIONS.indexOf(mission);
    this.active = mission;
    this.stepIndex = 0;
    this.stepState = {};
    this.missionTimer = 0;
    this.finished = false;
    this.cleanup();
    this.queueDialogue(mission.dialogue ?? []);
    this.enterStep();
    if (!this.started.includes(mission.id)) this.started.push(mission.id);
    this.notify(`MISIÓN: ${mission.title}`, mission.blurb);
    return true;
  }

  queueDialogue(lines) {
    for (const line of lines) this.dialogueQueue.push(line);
  }

  notify(title, body = '', tone = 'info') {
    this.notifications.push({ title, body, tone, life: 5.5, max: 5.5 });
    if (this.notifications.length > 5) this.notifications.shift();
  }

  cleanup() {
    for (const g of this.gang) {
      this.scene.remove(g.rig.root);
      g.rig.dispose();
    }
    this.gang = [];
    for (const p of this.pickups) this.scene.remove(p.mesh);
    this.pickups = [];
    if (this.markerMesh) {
      this.scene.remove(this.markerMesh);
      this.markerMesh = null;
    }
    this.marker = null;
  }

  get step() {
    return this.active?.steps[this.stepIndex] ?? null;
  }

  enterStep() {
    const step = this.step;
    this.stepState = { count: 0, timer: 0, done: false, spawned: false, packages: [] };
    if (!step) {
      this.completeMission();
      return;
    }
    this.objective = step.label;

    // Classic yellow marker at a step location.
    let markerPos = null;
    if (step.marker && step.to) markerPos = { x: step.to[0], z: step.to[1] };
    if (step.marker && step.type === 'goto' && step.marker !== true) {
      // Named marker from the mission's own special spots.
      markerPos = this.namedMarker(step.marker);
    }
    if (step.type === 'goto' && step.marker && typeof step.marker === 'string') {
      markerPos = this.namedMarker(step.marker);
    }
    if (step.to) markerPos = { x: step.to[0], z: step.to[1] };
    if (markerPos) this.setMarker(markerPos.x, markerPos.z);

    // Spawn what the step needs.
    if (step.type === 'steal') this.spawnTargetCar(step.car);
    if (step.type === 'kill') this.spawnGang(step.count, step.to);
    if (step.type === 'collect') this.spawnPickups(step.count, step.to);
    if (step.type === 'survive') this.stepState.seconds = step.seconds;
    if (step.type === 'goto' && step.marker === 'convoy') this.spawnConvoy();

    if (step.type === 'escape') {
      // Make sure there is heat to escape from.
      if (this.police.stars < step.stars) {
        this.police.heat = step.stars * 22 + 4;
        this.police.stars = step.stars;
      }
    }
  }

  namedMarker(name) {
    const l = this.layout;
    const spots = {
      crane: { x: l.marina.x0 + 5, z: l.marina.cz - 46 },
      convoy: { x: -248, z: 236 },
      marina: { x: l.marina.x0 + 14, z: l.marina.cz },
      lighthouse: { x: l.marina.x1, z: l.marina.cz - 60 },
    };
    return spots[name] ?? { x: l.marina.x0, z: l.marina.cz };
  }

  setMarker(x, z) {
    if (!this.markerMesh) {
      const geo = new THREE.CylinderGeometry(2.3, 2.3, 0.46, 20, 1, true);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd257, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
      this.markerMesh = new THREE.Mesh(geo, mat);
      this.markerMesh.name = 'objective-marker';
      this.scene.add(this.markerMesh);
    }
    this.markerMesh.position.set(x, 1.1, z);
    this.markerMesh.visible = true;
    this.marker = { x, z, radius: this.step?.radius ?? 8 };
  }

  spawnTargetCar(type) {
    // Parked on the nearest kerb to the step's location.
    const step = this.step;
    const at = step.to ? { x: step.to[0], z: step.to[1] } : { x: this.player.pos.x + 12, z: this.player.pos.z };
    const car = spawnVehicle(this.scene, this.colliders, {
      type: type ?? 'muscle',
      x: at.x + 5,
      z: at.z + 3,
      heading: 0.4,
      paint: [0.72, 0.16, 0.14],
    });
    car.setBounds(this.layout.minX, this.layout.seaEdge);
    car.missionTarget = true;
    car.ai = null;
    this.stepState.car = car;
    this.traffic.cars.push(car);
  }

  spawnGang(count, at) {
    const centre = at ? { x: at[0], z: at[1] } : { x: this.player.pos.x + 20, z: this.player.pos.z + 20 };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng.range(0, 1);
      const rad = this.rng.range(3, 11);
      const x = centre.x + Math.cos(a) * rad;
      const z = centre.z + Math.sin(a) * rad;
      const appearance = randomAppearance(this.rng, 'gang');
      appearance.shirt = this.rng.pick([0x2a2a2e, 0x5a2020, 0x20303a]);
      appearance.pants = 0x1e2228;
      const rig = new HumanRig(appearance);
      rig.placeRoot(x, WALK_Y, z);
      this.scene.add(rig.root);
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.08, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5, metalness: 0.4 }),
      );
      gun.position.set(0, -0.15, 0.04);
      rig.arms.right.hand.add(gun);
      rig.arms.right.hand.rotateX(-1.3);
      this.gang.push({
        rig,
        pos: new THREE.Vector3(x, WALK_Y, z),
        yaw: this.rng.range(0, 6.28),
        hp: 55,
        dead: false,
        fireTimer: this.rng.range(1, 3),
        radius: 0.36,
        gun,
        home: { x, z },
      });
    }
  }

  spawnPickups(count, at) {
    const centre = at ? { x: at[0], z: at[1] } : { x: this.player.pos.x + 14, z: this.player.pos.z };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const rad = 9 + this.rng.range(0, 14);
      const x = centre.x + Math.cos(a) * rad;
      const z = centre.z + Math.sin(a) * rad;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.42, 0.34),
        new THREE.MeshStandardMaterial({ color: 0xe8d9b0, emissive: 0x2a2415, roughness: 0.6 }),
      );
      mesh.position.set(x, 0.6, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 1.0, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd257, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.09, z);
      this.scene.add(ring);
      this.pickups.push({ mesh, ring, x, z, taken: false, phase: this.rng.range(0, 6.28) });
    }
  }

  spawnConvoy() {
    const at = { x: -248, z: 236 };
    const van = spawnVehicle(this.scene, this.colliders, { type: 'van', x: at.x, z: at.z, heading: 0.8, paint: [0.35, 0.37, 0.4] });
    van.setBounds(this.layout.minX, this.layout.seaEdge);
    van.missionTarget = true;
    van.ai = null;
    this.stepState.convoy = van;
    this.traffic.cars.push(van);
    this.spawnGang(4, [at.x + 3, at.z + 2]);
  }

  // The player entered a car.
  onEnterVehicle(car) {
    const step = this.step;
    if (step?.type === 'steal' && car === this.stepState.car) {
      this.advanceStep();
      this.notify('Coche robado', 'Llévalo al taller de Rafa.');
    }
  }

  advanceStep() {
    this.stepIndex++;
    this.enterStep();
  }

  completeMission() {
    if (!this.active) return;
    const m = this.active;
    this.completed.push(m.id);
    this.player.money += m.reward;
    this.notify(`MISIÓN COMPLETADA`, `+$${m.reward} — ${m.title}`, 'good');
    this.queueDialogue(m.outro ?? []);
    this.finished = true;
    this.objective = '';
    if (this.police.stars > 0) this.police.addHeat(-40);
    setTimeout(() => {
      this.active = null;
      this.stepIndex = 0;
      this.cleanup();
      if (this.missionIndex >= MISSIONS.length - 1) {
        this.storyComplete = true;
        this.notify('CALA VERDE', 'Has acabado la historia. La ciudad es tuya.', 'good');
      } else {
        this.notify('NUEVA MISIÓN DISPONIBLE', 'Rafa ha llamado. Responde en el teléfono (T).');
      }
    }, 6000);
  }

  failMission(reason) {
    if (!this.active) return;
    this.notify('MISIÓN FALLIDA', reason, 'bad');
    const id = this.active.id;
    this.active = null;
    this.stepIndex = 0;
    this.cleanup();
    setTimeout(() => {
      this.missionIndex = MISSIONS.findIndex((m) => m.id === id) - 1;
      this.notify('REINTENTAR', 'Acércate al marcador de la misión (M en el teléfono).');
    }, 2500);
  }

  update(dt) {
    // Dialogue: reveal one line at a time with a reading pause.
    if (!this.currentLine && this.dialogueQueue.length) {
      this.currentLine = this.dialogueQueue.shift();
      this.currentLine.life = 4.6;
      this.currentLine.max = 4.6;
      this.audio?.speak(this.currentLine.who);
      this.lastLine = this.currentLine;
    }
    if (this.currentLine) {
      this.currentLine.life -= dt;
      if (this.currentLine.life <= 0) this.currentLine = null;
    }
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      const n = this.notifications[i];
      n.life -= dt;
      if (n.life <= 0) this.notifications.splice(i, 1);
    }

    // Marker pulse.
    if (this.markerMesh) {
      const s = 1 + Math.sin(performance.now() * 0.0035) * 0.06;
      this.markerMesh.scale.set(s, 1, s);
      this.markerMesh.material.opacity = 0.35 + Math.sin(performance.now() * 0.004) * 0.16;
    }

    // Pickups bob.
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.mesh.position.y = 0.6 + Math.sin(performance.now() * 0.002 + p.phase) * 0.14;
      p.mesh.rotation.y += dt * 1.6;
      p.ring.material.opacity = 0.35 + Math.sin(performance.now() * 0.004 + p.phase) * 0.2;
      const dx = this.player.pos.x - p.x;
      const dz = this.player.pos.z - p.z;
      if (Math.hypot(dx, dz) < 2.1 && !this.player.vehicle) {
        p.taken = true;
        p.mesh.visible = false;
        p.ring.visible = false;
        this.stepState.count = (this.stepState.count ?? 0) + 1;
        this.audio?.pickup();
        this.notify('RECOGIDO', `${this.stepState.count} / ${this.step.count}`, 'good');
        if (this.stepState.count >= this.step.count) this.advanceStep();
      }
    }

    this.updateGang(dt);

    // Objective checks.
    const step = this.step;
    if (!step) return;
    const p = this.player;

    if (step.type === 'walk' || step.type === 'drive' || step.type === 'goto') {
      const target = step.type === 'goto' ? this.marker : { x: step.to?.[0], z: step.to?.[1] };
      if (target) {
        const d = Math.hypot(p.pos.x - target.x, p.pos.z - target.z);
        const inCar = !!p.vehicle;
        const ok = step.type === 'drive' ? inCar : step.type === 'walk' ? !inCar : true;
        if (d < (step.radius ?? 8) && ok) {
          this.advanceStep();
          return;
        }
      }
    }

    if (step.type === 'steal' && this.stepState.car) {
      // The player must physically take that car; onEnterVehicle advances the step.
      const car = this.stepState.car;
      if (car.missionTarget) {
        const d = Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z);
        if (d < 4.5 && !p.vehicle) this.objective = step.label;
      }
    }

    if (step.type === 'kill') {
      const alive = this.gang.filter((g) => !g.dead).length;
      this.objective = `${step.label} — ${this.stepState.kills ?? 0}/${step.count}`;
      if (this.stepState.kills >= step.count) this.advanceStep();
    }

    if (step.type === 'escape') {
      const target = step.stars ?? 1;
      this.objective = this.police.stars >= target ? `Pierde a la policía (${this.police.stars}★)` : step.label;
      if (this.police.stars < target) this.advanceStep();
    }

    if (step.type === 'survive') {
      this.stepState.timer += dt;
      const left = Math.max(0, this.stepState.seconds - this.stepState.timer);
      this.objective = `${step.label} — ${Math.ceil(left)}s`;
      if (left <= 0) this.advanceStep();
    }
  }

  updateGang(dt) {
    const p = this.player;
    for (const g of this.gang) {
      if (g.dead) {
        g.rig.animate(dt, 0, 'idle');
        continue;
      }
      const dx = p.pos.x - g.pos.x;
      const dz = p.pos.z - g.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 60) continue;
      const sees = this.colliders.clearLine(g.pos.x, 1.5, g.pos.z, p.pos.x, 1.4, p.pos.z);
      const wantYaw = Math.atan2(dx, dz);
      let diff = wantYaw - g.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.yaw += clamp(diff, -1, 1) * dt * 5;

      let speed = 0;
      if (dist > 8 && sees) speed = 3.1;
      else if (dist > 8) speed = 2.2;
      g.pos.x += Math.sin(g.yaw) * speed * dt;
      g.pos.z += Math.cos(g.yaw) * speed * dt;
      const solved = this.colliders.resolveCircle(g.pos.x, g.pos.z, g.radius, 0.17, 1.8);
      g.pos.x = solved.x;
      g.pos.z = solved.z;
      g.pos.x = clamp(g.pos.x, this.layout.minX + 3, this.layout.seaEdge - 3);
      g.pos.z = clamp(g.pos.z, this.layout.minZ + 3, this.layout.maxZ - 3);
      g.rig.placeRoot(g.pos.x, WALK_Y, g.pos.z);
      g.rig.root.rotation.y = g.yaw;
      g.rig.animate(dt, speed, speed > 0.2 ? 'run' : 'aim', { pitch: 0 });

      g.fireTimer -= dt;
      if (sees && dist < 26 && g.fireTimer <= 0) {
        g.fireTimer = this.rng.range(1.1, 2.6);
        const origin = new THREE.Vector3(g.pos.x, 1.4, g.pos.z);
        const dir = new THREE.Vector3(dx, (p.pos.y + 1.1) - 1.4, dz).normalize();
        dir.x += this.rng.range(-0.07, 0.07);
        dir.z += this.rng.range(-0.07, 0.07);
        dir.normalize();
        this.combat.fire(origin, dir, { spread: 0.02, damage: 5 }, { player: p });
        if (this.rng.chance(0.3)) p.takeDamage(this.rng.range(3, 7));
      }
    }
  }

  // Called by the hit resolution so kills count.
  onKill(target) {
    const g = this.gang.find((x) => x === target);
    if (g && !g.dead) {
      g.dead = true;
      g.rig.die();
      this.stepState.kills = (this.stepState.kills ?? 0) + 1;
      this.police.onCrime('civilian');
    }
  }

  get markerDistance() {
    if (!this.marker) return null;
    return Math.hypot(this.player.pos.x - this.marker.x, this.player.pos.z - this.marker.z);
  }

  get nextMissionTitle() {
    const next = MISSIONS[this.missionIndex + 1];
    return next ? next.title : null;
  }

  // Phone data: story progress plus activities.
  phoneData() {
    return {
      missions: MISSIONS.map((m) => ({
        id: m.id,
        title: m.title,
        giver: CAST[m.giver]?.short ?? '',
        district: m.district,
        done: this.completed.includes(m.id),
        active: this.active?.id === m.id,
        available: !this.completed.includes(m.id) && !this.active,
        blurb: m.blurb,
        reward: m.reward,
      })),
      activities: ACTIVITIES,
    };
  }
}
