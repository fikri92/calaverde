// Cala Verde: the game. Boots the renderer and the city, wires the systems together and runs one
// frame loop: read input, move the player or the car, step traffic, people and police, resolve
// combat, drive the mission runner, then draw the world and the HUD.
//
// URL states used by the screenshot runner, so each shot is a real moment of play:
//   ?shot=start   - on foot on a Vista Mar sidewalk, the avenue and traffic in frame
//   ?shot=drive   - driving a red muscle car north up the avenue
//   ?shot=chase   - a three-star police pursuit with cruisers across the road
//   ?shot=mission - mid-mission on foot, the objective and a line of dialogue on screen

import * as THREE from 'three';
import { createSky } from './render/sky.js';
import { buildCity } from './city/city.js';
import { Input } from './core/input.js';
import { Player } from './systems/player.js';
import { ThirdPersonCamera } from './systems/camera.js';
import { Traffic } from './systems/traffic.js';
import { Pedestrians } from './systems/pedestrians.js';
import { Police } from './systems/police.js';
import { Combat } from './systems/combat.js';
import { Missions } from './systems/missions.js';
import { Hud } from './render/hud.js';
import { AudioEngine } from './audio/audio.js';
import { spawnVehicle } from './systems/vehicles.js';
import { Screens } from './render/screens.js';
import { readSave, writeSave, applySave, clearSave } from './systems/save.js';
import { stageCover, stageDrive, stageHeat, stageMission, stageTitle } from './shots.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seedParam = Number(params.get('seed'));
const SEED = Number.isFinite(seedParam) && seedParam > 0 ? 20260214 + seedParam : 20260214;

// ---------------------------------------------------------------- renderer, scene, camera
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.15, 1700);
camera.position.set(0, 6, 20);

const sky = createSky(scene, 'afternoon');

// ---------------------------------------------------------------- loading text, then build

setTimeout(() => {
  const city = buildCity(scene, SEED);
  const layout = city.layout;

  // Pick a start point: a sidewalk on the main avenue, facing the sea.
  const startX = layout.originX + 96;
  const startZ = layout.originZ + 118;

  const input = new Input(canvas);
  const cameraRig = new ThirdPersonCamera(camera, city.colliders);
  const player = new Player({ scene, colliders: city.colliders, layout, cameraRig });
  player.setPosition(startX, startZ, -Math.PI / 2);
  cameraRig.yaw = Math.PI / 2;
  cameraRig.pitch = 0.16;

  const combat = new Combat({ scene, colliders: city.colliders });
  const audio = new AudioEngine();
  const traffic = new Traffic({ scene, colliders: city.colliders, layout, count: 18, camera });
  const pedestrians = new Pedestrians({ scene, layout, count: 30, camera });
  const police = new Police({ scene, colliders: city.colliders, layout, traffic, combat, player, camera });
  const missions = new Missions({ scene, colliders: city.colliders, layout, player, police, combat, traffic, camera, audio });
  const hud = new Hud(layout);
  const screens = new Screens({ layout, onAction: (id, from) => handleScreenAction(game, id, from) });

  // A few parked cars near the start, plus one hero car the first mission needs.
  const parked = [];
  for (let i = 0; i < 5; i++) {
    const v = spawnVehicle(scene, city.colliders, {
      type: ['sedan', 'sports', 'van', 'muscle', 'sedan'][i],
      x: startX + 6 + i * 7,
      z: startZ + 5,
      heading: Math.PI / 2,
    });
    v.setBounds(layout.minX, layout.seaEdge);
    v.ai = null;
    parked.push(v);
    traffic.cars.push(v);
  }

  // A few weapons lying around near the spawn so the player can upgrade without a kill: one at
  // the mouth of the alley behind the parked cars, one across the street, one down the block.
  combat.dropWeaponPickup(startX - 8, startZ - 6, 'smg');
  combat.dropWeaponPickup(startX + 26, startZ + 12, 'shotgun');
  combat.dropWeaponPickup(startX + 4, startZ - 22, 'pistol');

  const game = {
    scene, camera, renderer, city, layout, player, cameraRig, input, combat, audio,
    traffic, pedestrians, police, missions, hud, screens, parked, sky,
    paused: false, running: false, time: 0, lastShot: 0, mode: 'title',
    deathTimer: 0, shotFreeze: false,
  };
  game.step = step;
  window.__game = game;

  // A save slot lights Continue on the title screen and is what Continue restores.
  screens.setSaveInfo(readSave());
  wireInteraction(game);
  wireTitle(game);
  wireShotState(game, shot);

  // The screenshot runner never presses a key, so a shot state starts itself. The title shot is
  // the exception: it is the title screen, so the world runs behind it with the menu up.
  if (shot && shot !== 'title') {
    game.running = true;
    game.mode = 'play';
    screens.hideTitle();
  }

  // The selftest drives real systems, so the world has to be live before it starts; otherwise the
  // title screen holds the loop idle and requestAnimationFrame is throttled to a crawl.
  if (params.get('selftest')) {
    game.running = true;
    game.mode = 'play';
    screens.hideTitle();
    runSelfTest(game).catch((err) => writeSelfTest(`SELFTEST ok=0 fail=1 error=${err?.message ?? err}`));
  }

  // ------------------------------------------------------------ frame loop
  let last = performance.now();
  let frames = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (game.running && !game.paused) step(game, dt);
    // A posed title camera is not allowed to be moved by the rig afterwards.
    if (game.titleCameraPosed) {
      game.sky.update(dt, { x: camera.position.x, z: camera.position.z });
    }
    renderer.render(scene, camera);
    frames++;
    if (frames === 8) window.__ready = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}, 40);

// ---------------------------------------------------------------- one simulation step
function step(g, dt) {
  g.time += dt;
  const { player, cameraRig, input, city, layout } = g;

  if (input.hit('Escape')) {
    g.paused = !g.paused;
    document.getElementById('pause-menu').hidden = !g.paused;
  }
  if (g.paused) {
    input.endFrame();
    return;
  }

  // Weapon switching.
  for (let i = 0; i < player.weapons.length; i++) {
    if (input.hit(`Digit${i + 1}`)) {
      player.weaponIndex = i;
      player.gun.visible = true;
      g.hud.showHint(player.weapon.name.toUpperCase(), 1.4);
    }
  }
  if (input.mouse.wheel !== 0) {
    player.weaponIndex = (player.weaponIndex + (input.mouse.wheel > 0 ? 1 : -1) + player.weapons.length) % player.weapons.length;
    player.gun.visible = true;
  }
  if (input.hit('KeyR')) reload(player, g.hud);

  // Phone.
  if (input.hit('KeyT')) {
    const open = g.hud.togglePhone();
    if (open) g.hud.renderPhone(g.missions.phoneData(), 0);
    g.phoneIndex = 0;
  }
  if (g.hud.phoneOpen) {
    const data = g.missions.phoneData();
    if (input.hit('ArrowDown')) {
      g.phoneIndex = Math.min(data.missions.length - 1, (g.phoneIndex ?? 0) + 1);
      g.hud.renderPhone(data, g.phoneIndex);
    }
    if (input.hit('ArrowUp')) {
      g.phoneIndex = Math.max(0, (g.phoneIndex ?? 0) - 1);
      g.hud.renderPhone(data, g.phoneIndex);
    }
    if (input.hit('KeyM')) {
      const m = data.missions[g.phoneIndex ?? 0];
      if (m && !m.done) {
        g.missions.start(m.id);
        g.hud.togglePhone();
      }
    }
  }

  // Vehicle enter/exit.
  if (input.hit('KeyF')) {
    if (player.vehicle) {
      exitVehicle(g);
    } else {
      const near = g.traffic.nearest(player.pos.x, player.pos.z, 5.0);
      if (near) enterVehicle(g, near);
    }
  }

  // Movement.
  if (player.vehicle) {
    const car = player.vehicle;
    const throttle = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const brake = input.down('Space') ? 1 : 0;
    const steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
    car.drive(dt, { throttle, brake, steer, handbrake: input.down('ShiftLeft') });
    player.pos.set(car.pos.x, 0, car.pos.z);
    player.yaw = car.heading;
    // Crash sounds on hard impacts, and damage from speed.
    if (car.speed > 12 && Math.random() < 0.02) car.damage(0.4);
  } else {
    player.update(dt, input, camera);
    if (player.wantFootstep) {
      player.wantFootstep = false;
      g.audio.footstep();
    }
  }

  // Shooting.
  const canFire = !player.dead && !player.vehicle;
  if (canFire && (player.weapon.auto ? input.mouse.left : input.mousePressed)) {
    fireWeapon(g);
  }
  // Melee: a swing on V. No ammo cost, no muzzle flash — a short punch that knocks the target
  // back and raises heat if anyone sees it.
  if (canFire && input.hit('KeyV') && (player.meleeCooldown ?? 0) <= 0) {
    player.meleeCooldown = 0.45;
    player.swing = 1;
    const dir = new THREE.Vector3(Math.sin(cameraRig.yaw + Math.PI), 0, Math.cos(cameraRig.yaw + Math.PI));
    const origin = new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z);
    const hit = g.combat.melee(origin, dir, {
      peds: g.pedestrians.peds,
      cops: g.police.officers,
      gang: g.missions.gang,
    });
    g.audio.impact();
    if (hit) {
      const { kind, target, damage } = hit;
      target.hp = (target.hp ?? 40) - damage;
      if (kind === 'ped') {
        const killed = g.pedestrians.hurtPed(target, damage);
        if (killed) g.hud.pushFeed('CIVIL ABATIDO', 'La policía lo va a saber.', 'bad');
        g.police.onCrime(killed ? 'civilian' : 'gunshot');
      } else if (kind === 'cop') {
        if (target.hp <= 0) g.police.despawnOfficer?.(target, true);
      } else if (kind === 'gang') {
        // Missions track kills through onKill so the objective counter advances.
        if (target.hp <= 0) g.missions.onKill(target);
      }
      cameraRig.addShake(0.12);
    }
  }
  if ((player.meleeCooldown ?? 0) > 0) player.meleeCooldown = Math.max(0, player.meleeCooldown - dt);
  if ((player.swing ?? 0) > 0) player.swing = Math.max(0, player.swing - dt * 3.4);

  // Camera.
  const focus = new THREE.Vector3(
    player.vehicle ? player.vehicle.pos.x : player.pos.x,
    player.vehicle ? 1.1 : player.pos.y,
    player.vehicle ? player.vehicle.pos.z : player.pos.z,
  );
  cameraRig.update(dt, focus, {
    driving: !!player.vehicle,
    speed: player.vehicle ? player.vehicle.speed * 30 : player.speed,
    lookAhead: player.vehicle ? 3.2 : 0,
  });

  // Systems. A shot freezes the city: traffic and pedestrians hold the pose the shot staged,
  // so the settle delay can't drive them out of frame before the capture.
  if (!g.shotFreeze) {
    g.traffic.update(dt, player.pos);
    g.pedestrians.update(dt, player.pos);
    g.police.update(dt, { playerVisible: true });
  } else {
    // Parked cruisers still need their light bars cycling for the shot to read as a pursuit. In a
    // still frame an alternating bar would catch one lamp dark, so both stay lit and the two small
    // point lights wash red and blue onto the road and the officers.
    for (const unit of g.police.units) {
      const car = unit.car;
      if (!car || car.disposed) continue;
      car.sirenPhase += dt * 9;
      const pulse = 0.82 + Math.sin(car.sirenPhase * 0.55) * 0.18;
      if (car.lightbar) {
        car.lightbar.red.emissiveIntensity = 3.0 * pulse;
        car.lightbar.blue.emissiveIntensity = 2.8 * pulse;
      }
      if (!car.sirenLights) {
        const red = new THREE.PointLight(0xff2f38, 0, 16, 2);
        const blue = new THREE.PointLight(0x2f7bff, 0, 16, 2);
        const roofY = car.lightbar?.red?.position?.y ? car.lightbar.red.position.y + 0.1 : 1.72;
        red.position.set(-0.6, roofY + 0.1, 0);
        blue.position.set(0.6, roofY + 0.1, 0);
        car.group.add(red, blue);
        car.sirenLights = { red, blue };
      }
      car.sirenLights.red.intensity = 5.5 * pulse;
      car.sirenLights.blue.intensity = 5.0 * pulse;
    }
  }
  if (!g.shotFreeze) g.missions.update(dt);
  // Combat effects are frozen with the rest of a posed shot, so muzzle flashes, tracers and brass
  // are still in the air when the frame is captured rather than decayed away by the settle delay.
  if (!g.shotFreeze) g.combat.update(dt);
  g.city.update(dt);
  sky.update(dt, camera.position);

  // Damage smoke and lightbars need a per-frame tick, independent of who is driving.
  const now = performance.now() / 1000;
  for (const car of g.traffic.cars) {
    if (car.disposed) continue;
    car.updateDamageFx?.(dt, now);
  }
  if (player.vehicle) player.vehicle.updateDamageFx?.(dt, now);
  for (const unit of g.police.units) unit.car?.updateDamageFx?.(dt, now);

  // Wanted decay when nothing is happening.
  if (g.police.stars === 0) g.police.heat = 0;

  // Death and respawn.
  if (player.dead) {
    g.deathTimer = (g.deathTimer ?? 0) + dt;
    if (g.deathTimer > 3.4) {
      g.deathTimer = 0;
      player.money = Math.max(0, player.money - 100);
      player.respawn(layout.originX + 96, layout.originZ + 118);
      g.police.clearWanted();
      g.hud.pushFeed('HOSPITAL', 'Te han cobrado $100 por curarte.', 'bad');
    }
  }

  // Audio follow.
  let nearestSiren = null;
  for (const u of g.police.units) {
    if (!u.car || u.car.disposed) continue;
    const d = Math.hypot(u.car.pos.x - player.pos.x, u.car.pos.z - player.pos.z);
    if (nearestSiren === null || d < nearestSiren) nearestSiren = d;
  }
  g.audio.update(dt, {
    nearestSirenDist: nearestSiren,
    driving: !!player.vehicle,
    speed: player.vehicle ? player.vehicle.speed : 0,
    wanted: g.police.stars,
  });

  // HUD.
  g.hud.update(dt, {
    player,
    police: g.police,
    missions: g.missions,
    city: g.city,
    vehicles: g.traffic.cars,
  });

  input.endFrame();
}

function enterVehicle(g, car) {
  const { player, cameraRig } = g;
  car.occupied = true;
  car.ai = null;
  player.enterVehicle(car);
  cameraRig.yaw = car.heading;
  g.hud.showHint(`Te has subido: ${car.spec.label}`, 2.2);
  g.missions.onEnterVehicle(car);
  g.audio.start();
}

function exitVehicle(g) {
  const { player } = g;
  const car = player.vehicle;
  if (!car) return;
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  const x = car.pos.x + side.x * (car.spec.width / 2 + 0.9);
  const z = car.pos.z + side.z * (car.spec.width / 2 + 0.9);
  const solved = g.city.colliders.resolveCircle(x, z, 0.4, 0.17, 1.8);
  car.occupied = false;
  // Hand the car back to traffic on a real lane edge; a null edge would make the AI read off the
  // end of the graph on the next frame.
  const lane = g.traffic.adopt(car);
  if (!lane) car.ai = null;
  player.exitVehicle(solved.x, solved.z, car.heading);
  g.hud.showHint('Has salido del coche', 1.6);
}

function reload(player, hud) {
  const w = player.weapon;
  if (w.ammo >= w.mag || w.reserve <= 0) return;
  const need = w.mag - w.ammo;
  const take = Math.min(need, w.reserve);
  w.ammo += take;
  w.reserve -= take;
  hud.showHint('RECARGANDO', 1.1);
}

function fireWeapon(g) {
  const { player, combat, hud } = g;
  const w = player.weapon;
  if (player.fireCooldown > 0) return;
  if (w.ammo <= 0) {
    player.fireCooldown = 0.25;
    hud.showHint('SIN MUNICIÓN — R para recargar', 1.6);
    return;
  }
  player.fireCooldown = 60 / w.rpm;
  w.ammo--;
  player.cameraRig.addShake(w.id === 'shotgun' ? 0.5 : 0.22);
  const { origin, dir } = player.aimRay(g.camera);
  const results = combat.fire(origin, dir, w, {
    peds: g.pedestrians,
    cops: g.police.shootable,
    vehicles: g.traffic.cars,
    player,
  });
  g.audio.gunshot(w.id);
  // React to what was hit.
  let hurtAnyone = false;
  for (const r of results) {
    if (r.kind === 'ped' && r.ped) {
      const killed = g.pedestrians.hurtPed(r.ped, w.damage * (w.pellets ? 0.6 : 1));
      hurtAnyone = true;
      if (killed) hud.pushFeed('CIVIL ABATIDO', 'La policía lo va a saber.', 'bad');
      g.police.onCrime(killed ? 'civilian' : 'gunshot');
    } else if (r.kind === 'cop' && r.cop) {
      r.cop.hp -= w.damage;
      hurtAnyone = true;
      if (r.cop.hp <= 0) {
        r.cop.dead = true;
        r.cop.rig.die();
        g.police.onCrime('cop');
        g.missions.onKill(r.cop);
        // A fallen officer leaves their sidearm on the pavement.
        g.combat.dropWeaponPickup(r.cop.pos.x, r.cop.pos.z, 'pistol');
      }
    } else if (r.kind === 'vehicle') {
      g.audio.impact();
    } else if (r.kind === 'wall') {
      g.audio.impact();
    }
  }
  // Gang members from the mission are shootable too.
  for (const gm of g.missions.gang) {
    if (gm.dead) continue;
    const toHit = new THREE.Vector3(gm.pos.x - origin.x, (gm.pos.y + 1.1) - origin.y, gm.pos.z - origin.z);
    const dist = toHit.length();
    const angle = toHit.normalize().dot(dir);
    if (dist < 60 && angle > 0.985) {
      gm.hp -= w.damage;
      hurtAnyone = true;
      if (gm.hp <= 0) g.missions.onKill(gm);
    }
  }
  if (!hurtAnyone) g.police.onCrime('gunshot');
  else if (g.police.stars === 0) g.police.onCrime('gunshot');
}

// ---------------------------------------------------------------- interaction rays (camera collision, decals)
function wireInteraction(g) {
  g.canvasPickRay = () => {
    const dir = new THREE.Vector3();
    g.camera.getWorldDirection(dir);
    return dir;
  };
  // Clicking empty space while a car is near and the player is on foot does not enter it; F does.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH') {
      g.hud.showHint('WASD mover · ratón mirar · clic disparar · F vehículo · T teléfono · M misión', 6);
    }
  });
}

// ---------------------------------------------------------------- screens and flow
// The title menu, pause menu, map, settings and the end cards all route through one switch, so the
// keyboard, the mouse and the screenshot staging all reach the same behaviour.

function startRun(g, { fresh = false } = {}) {
  if (fresh) {
    clearSave();
    g.screens.setSaveInfo(null);
  }
  g.running = true;
  g.mode = 'play';
  g.paused = false;
  g.screens.hideTitle();
  g.screens.hidePause();
  g.audio.start();
  g.audio.missionSting(true);
  g.input.lock();
  g.hud.showHint('WASD mover · ratón mirar · clic disparar · F vehículo · T teléfono', 7);
  g.hud.pushFeed('PUERTO AZUL', 'Rafa te espera. Abre el teléfono con T.', 'info');
}

function handleScreenAction(g, id, from) {
  if (id === 'continue') {
    const record = readSave();
    if (record && applySave(g, record)) {
      g.hud.pushFeed('PARTIDA CARGADA', `Ranura 1 · $${(record.money ?? 0).toLocaleString('es-ES')}`, 'info');
    }
    startRun(g);
    return;
  }
  if (id === 'new') {
    startRun(g, { fresh: true });
    g.hud.showHint('PARTIDA NUEVA — encuentra a Rafa', 6);
    return;
  }
  if (id === 'resume') {
    g.paused = false;
    g.screens.hidePause();
    g.input.lock();
    return;
  }
  if (id === 'map') {
    g.screens.showMap(g.hud.minimap);
    g.hud.minimap.drawFull(g.screens.mapCanvas, {
      player: { x: g.player.pos.x, z: g.player.pos.z, heading: g.player.yaw },
      objective: g.missions.marker,
      cops: g.police.units.filter((u) => u.car && !u.car.disposed).map((u) => ({ x: u.car.pos.x, z: u.car.pos.z })),
    });
    g.screens.drawDistricts();
    return;
  }
  if (id === 'settings') {
    g.screens.showSettings();
    return;
  }
  if (id === 'save') {
    const record = writeSave(g);
    g.hud.pushFeed('PARTIDA GUARDADA', record.failed ? 'Sin almacenamiento en este navegador.' : `Ranura 1 · $${record.money.toLocaleString('es-ES')}`, record.failed ? 'bad' : 'good');
    g.screens.setSaveInfo(readSave());
    g.screens.showPause();
    return;
  }
  if (id === 'quit') {
    g.running = false;
    g.mode = 'title';
    g.paused = false;
    g.screens.hidePause();
    g.screens.showTitle();
    g.screens.setSaveInfo(readSave());
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

// The title and pause overlays own the keyboard while they are up: arrows move the lit row, Enter
// activates it, Escape backs out. Pointer lock keys never reach the world in those states.
function wireTitle(g) {
  const canvas = g.renderer.domElement;
  canvas.addEventListener('click', () => {
    if (g.running && !g.paused) g.input.lock();
  });

  window.addEventListener('keydown', (e) => {
    const mapOpen = !document.getElementById('map-screen').classList.contains('hidden');
    const settingsOpen = !document.getElementById('settings-screen').classList.contains('hidden');

    if (mapOpen) {
      if (e.code === 'Escape' || e.code === 'KeyM') {
        g.screens.hideMap();
        g.input.clear();
      }
      return;
    }
    if (settingsOpen) {
      if (e.code === 'Escape') {
        g.screens.hideSettings();
        g.input.clear();
      } else if (e.code === 'ArrowDown') {
        g.screens.moveSettings(1);
      } else if (e.code === 'ArrowUp') {
        g.screens.moveSettings(-1);
      } else if (e.code === 'ArrowLeft') {
        g.screens.changeSetting(-1);
      } else if (e.code === 'ArrowRight' || e.code === 'Enter') {
        const res = g.screens.changeSetting(1);
        if (res?.action === 'changed') g.audio.uiClick?.();
      }
      return;
    }

    if (g.mode === 'title') {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') g.screens.moveTitle(1);
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') g.screens.moveTitle(-1);
      else if (e.code === 'Enter' || e.code === 'Space') g.screens.chooseTitle(g.screens.titleIndex);
      return;
    }

    if (g.paused) {
      if (e.code === 'Escape') {
        g.paused = false;
        g.screens.hidePause();
        g.input.lock();
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        g.screens.movePause(1);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        g.screens.movePause(-1);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        g.screens.choosePause(g.screens.pauseIndex);
      }
      return;
    }

    // In play: M opens the map, Escape opens the pause menu.
    if (e.code === 'KeyM' && !g.hud.phoneOpen) {
      handleScreenAction(g, 'map', 'key');
    }
  });

  // The controls card is the first-run hand-holding; it dismisses on click or any key.
  const card = document.getElementById('controls-card');
  const dismiss = document.getElementById('controls-dismiss');
  const hideCard = () => {
    card.hidden = true;
    try {
      localStorage.setItem('cala-verde.seen-controls', '1');
    } catch {
      // Storage may be off; the card simply shows again next visit.
    }
  };
  dismiss?.addEventListener('click', hideCard);
  card?.addEventListener('click', (e) => {
    if (e.target === card) hideCard();
  });
  try {
    if (localStorage.getItem('cala-verde.seen-controls') === '1') card.hidden = true;
  } catch {
    card.hidden = true;
  }
}

// ---------------------------------------------------------------- screenshot states
// Every shot is a real moment of play staged by shots.js. This switch only picks the scene and
// arranges the overlay that goes with it: the title is the only one that shows a menu.
function wireShotState(g, shot) {
  if (!shot) return;
  if (shot === 'title') {
    stageTitle(g);
    g.screens.showTitle();
    g.screens.setSaveInfo({
      at: Date.now() - 1000 * 60 * 96,
      money: 18400,
      version: 1,
      x: g.player.pos.x,
      z: g.player.pos.z,
    });
    g.screens.titleIndex = 1;
    g.screens.titleReady = true;
    g.screens.drawTitleMenu();
    g.mode = 'title';
    return;
  }

  g.shotFreeze = true;
  if (shot === 'cover' || shot === 'start') stageCover(g);
  else if (shot === 'drive') stageDrive(g);
  else if (shot === 'heat' || shot === 'chase') stageHeat(g);
  else if (shot === 'mission') stageMission(g);
}

// ---------------------------------------------------------------- self test
// ?selftest=1 drives the real systems: walk, drive a stolen car, fire, raise the wanted level,
// start a mission, save and load. It writes one line into #selftest that the smoke test reads,
// and it reports failures rather than throwing, so a broken system shows up as fail>0.
function writeSelfTest(line) {
  const el = document.getElementById('selftest');
  if (!el) return;
  el.hidden = false;
  el.textContent = line;
  window.__selftest = line;
}

async function runSelfTest(g) {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    if (!ok) console.warn(`selftest ${name} failed: ${detail}`);
  };
  // The checks drive the simulation directly, so each one yields a microtask instead of waiting on
  // a painted frame. Under software WebGL a rendered frame costs hundreds of milliseconds, and
  // seventy of them would stall the run long past the smoke test's patience.
  const frame = () => Promise.resolve();

  // The world boots with a player, a city and a crowded street.
  check('boot', !!g.player && !!g.city && !!g.missions, 'player/city/missions present');
  check('traffic', g.traffic.cars.length >= 10, `${g.traffic.cars.length} cars`);
  check('pedestrians', g.pedestrians.peds.length >= 20, `${g.pedestrians.peds.length} walkers`);

  // Walking: hold W for a second of simulated frames and require the player to move.
  const startX = g.player.pos.x;
  const startZ = g.player.pos.z;
  g.input.keys.add('KeyW');
  for (let i = 0; i < 30; i++) {
    g.step(g, 1 / 60);
    await frame();
  }
  g.input.keys.delete('KeyW');
  const walked = Math.hypot(g.player.pos.x - startX, g.player.pos.z - startZ);
  check('walk', walked > 0.4, `moved ${walked.toFixed(2)} m`);

  // Vehicles: steal the nearest car and drive it a few metres.
  const car = g.traffic.nearest(g.player.pos.x, g.player.pos.z, 60) ?? g.traffic.cars[0];
  check('vehicle-present', !!car);
  if (car) {
    enterVehicle(g, car);
    check('vehicle-enter', g.player.vehicle === car);
    g.input.keys.add('KeyW');
    for (let i = 0; i < 45; i++) {
      g.step(g, 1 / 60);
      await frame();
    }
    g.input.keys.delete('KeyW');
    check('vehicle-drive', car.speed > 1.5, `speed ${car.speed.toFixed(1)} m/s`);
    exitVehicle(g);
    check('vehicle-exit', g.player.vehicle === null);
  }

  // Combat: fire a shot and require a result list and a raised wanted level.
  const before = g.combat.shotsFired ?? 0;
  fireWeapon(g);
  check('weapon-fire', (g.combat.shotsFired ?? 0) > before || g.player.weapon.ammo < g.player.weapon.mag);
  check('wanted-rise', g.police.stars >= 1, `stars ${g.police.stars}`);

  // Police respond with at least one unit.
  for (let i = 0; i < 40; i++) g.police.update(1 / 60, { playerVisible: true });
  check('police-respond', g.police.units.length >= 1, `${g.police.units.length} units`);

  // Missions: start the first and require an objective.
  const started = g.missions.start('first_ride');
  check('mission-start', !!started && !!g.missions.active);
  check('mission-objective', typeof g.missions.objective === 'string' && g.missions.objective.length > 3, g.missions.objective);

  // Save and load round trip.
  const record = writeSave(g);
  check('save-write', Number.isFinite(record.money), `$${record.money}`);
  const loaded = applySave(g, record);
  check('save-load', !!loaded && Math.abs(g.player.money - record.money) < 1);

  // The HUD is live.
  check('hud', !!g.hud.el.wanted && !!g.hud.el.cash, 'HUD nodes present');

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const names = results.filter((r) => !r.ok).map((r) => r.name).join(',');
  writeSelfTest(`SELFTEST ok=${ok} fail=${fail}${names ? ` failed=${names}` : ''}`);
}

export { runSelfTest, writeSelfTest };
