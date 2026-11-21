// Saves and loads the player's run in one localStorage slot: cash, health and armour, the mission
// the player is on and its step, the exact position and heading, the wanted level, and the weapon
// and its ammo. The slot carries the timestamp the title screen prints, so "Continue" can say when
// the run was last left off. Nothing here touches the network: localStorage is per-origin and the
// game never leaves it.

import { groundHeightAt } from '../city/roads.js';

const SLOT_KEY = 'cala-verde.save.v1';
const HEAT_PER_STAR = 22;

// The save record is plain data, so it can be written, compared and rendered without the game
// objects. Every field is optional on read; a missing field falls back to a sane start value.
export function captureSave(game) {
  const { player, missions, police, layout, city } = game;
  const active = missions.active;
  return {
    version: 1,
    at: Date.now(),
    money: Math.round(player.money),
    health: Math.round(player.health),
    armour: Math.round(player.armour),
    weaponIndex: player.weaponIndex,
    ammo: player.weapons.map((w) => ({ ammo: w.ammo, reserve: w.reserve })),
    x: +player.pos.x.toFixed(2),
    y: +player.pos.y.toFixed(2),
    z: +player.pos.z.toFixed(2),
    yaw: +player.yaw.toFixed(3),
    stars: police.stars,
    missionId: active ? active.id : null,
    missionStep: active ? missions.stepIndex : 0,
    missionDone: [...missions.completed],
    playedSeconds: Math.round(game.time),
    // Kept so a future save format can refuse a file written for a different city seed.
    citySeed: layout.seed ?? null,
  };
}

// Write the record and return it, so the caller can show the exact time it was stamped.
export function writeSave(game) {
  const record = captureSave(game);
  try {
    localStorage.setItem(SLOT_KEY, JSON.stringify(record));
  } catch {
    // A browser with storage blocked still plays; the save simply does not persist this session.
    return { ...record, failed: true };
  }
  return record;
}

export function readSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(SLOT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    if (!record || record.version !== 1) return null;
    if (!Number.isFinite(record.x) || !Number.isFinite(record.z)) return null;
    return record;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SLOT_KEY);
  } catch {
    // Nothing to undo when storage is unavailable.
  }
}

// "hoy 21:04" reads better than a raw timestamp on a title screen.
export function describeSaveTime(at) {
  if (!Number.isFinite(at)) return 'sin datos';
  const d = new Date(at);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return `hoy ${hh}:${mm}`;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month} ${hh}:${mm}`;
}

// Put the world back the way the record describes. Salvage rather than trust: a bad position is
// clamped into the city, a dead mission id is dropped, and the heat is rebuilt from the star count.
export function applySave(game, record) {
  if (!record) return false;
  const { player, missions, police, layout } = game;
  player.money = Math.max(0, record.money ?? 500);
  player.health = Math.max(1, Math.min(100, record.health ?? 100));
  player.armour = Math.max(0, Math.min(100, record.armour ?? 0));
  player.dead = false;

  if (Array.isArray(record.ammo)) {
    record.ammo.forEach((a, i) => {
      const w = player.weapons[i];
      if (!w || !a) return;
      w.ammo = Math.max(0, Math.min(w.mag, a.ammo ?? w.mag));
      w.reserve = Math.max(0, a.reserve ?? 0);
    });
  }
  player.weaponIndex = Math.max(0, Math.min(player.weapons.length - 1, record.weaponIndex ?? 0));

  const x = Math.max(layout.minX + 6, Math.min(layout.maxX - 6, record.x));
  const z = Math.max(layout.minZ + 6, Math.min(layout.maxZ - 6, record.z));
  player.setPosition(x, z, record.yaw ?? 0);
  player.pos.y = groundHeightAt(layout, x, z);

  police.clearWanted();
  const stars = Math.max(0, Math.min(5, record.stars ?? 0));
  if (stars > 0) {
    police.heat = stars * HEAT_PER_STAR;
    police.stars = stars;
  }

  if (Array.isArray(record.missionDone)) {
    missions.completed.length = 0;
    for (const id of record.missionDone) missions.completed.push(id);
  }
  missions.active = null;
  missions.objective = '';
  missions.stepIndex = 0;
  if (record.missionId && missions.start(record.missionId)) {
    const step = Math.max(0, Math.min(record.missionStep ?? 0, missions.active.steps.length - 1));
    missions.stepIndex = step;
    missions.enterStep();
  }
  return true;
}
