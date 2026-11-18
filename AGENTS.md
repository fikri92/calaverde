# BUILD BRIEF — make.fun competition `gta6-01` (instruction file)

You are building a competition entry. Read this whole file before writing code. Everything here is
binding; the entry is rejected by a sealed gate if a rule below is broken.

## 0. The task in one sentence

Build the most complete, best-looking open-world crime game you can — an original sun-soaked
coastal city, played in a desktop browser with keyboard and mouse, handed in as static files — and
make it good enough to place in the top 5 of a field of thousands.

The judge is an AI that sees, per entry: one contact sheet of the screenshots (the cover large on
top, the rest small beneath) and then a very short outline of the source (file paths, sizes, first
declarations). It never sees the whole code. **The screenshots are most of your score.** Rank by,
in order: (1) a complete open world shown in screenshots of the game itself — city on foot and by
car, traffic and pedestrians, a wanted level with police who respond, missions; (2) depth and fun —
missions, story, vehicles to steal, activities, combat, progression; (3) feel and polish — controls,
camera, HUD with a minimap, effects, menus; (4) look and originality — a coherent sun-soaked modern
city of its own, its lighting and art direction, its own names and story; (5) structure — the
outline shows source split into files with one clear job each, named for what they do.

An entry that copies Grand Theft Auto's names, characters, map, art, music or logos loses to an
original one. Everything here must be your own invention.

## 1. Hard rules (the gate)

- The game is static files under `game/`, no build step. `game/index.html` opens in desktop Chrome
  and plays with **zero network requests**. Every script, module, image, sound and font is a file
  under `game/` or a `data:` URI.
- three.js is already vendored at `game/vendor/three/three.module.min.js` (it imports
  `./three.core.min.js` next to it). Load it with an import map in `index.html`:
  `{"imports": {"three": "./vendor/three/three.module.min.js"}}` and then `import * as THREE from 'three'`.
  Do not modify, delete or re-download the vendored files. Do not use any other library.
- **No `http:` or `https:` string anywhere in the game's source files.** No CDN, no fetch, no XHR,
  no WebSocket, no external font, no external image. Nothing may load over the network, ever.
- ES modules only, relative imports (`./x.js`), entry `<script type="module" src="./src/main.js">`.
- Limits: at most 993 files and directories under `game/`, 48 MiB total, every path at most 1000
  bytes, `game/index.html` at most 1 MiB. Keep the whole thing small: aim for under 2 MiB of game/
  excluding the vendored three.js.
- `vendor/makefun-game.ts` at the repository root must stay byte-for-byte as it is. `main.ts` and
  `serve.ts` are the kit plumbing: keep them working, and add your own authored lines to `main.ts`
  (for example a comment block and a small helper it really uses) so the entrypoint carries your
  writing. Never break the copy-to-`/output` + `buildDossier` behaviour.
- No `TODO`, no placeholder, no stub, no `console.log` spam. English identifiers, English comments.
  The judge reads file names and the first declarations; name things for what they do.
- The game must run at a steady frame rate in headless Chrome (SwiftShader software WebGL is what
  the grader and the reviewers use): keep draw calls low, instance repeated geometry, cap shadow
  casters, avoid per-frame allocations in hot paths, no post-processing stack that needs float
  render targets.

## 2. Screenshots — the main event

`screenshots/` holds exactly 4 files, PNG, each at most 256 KiB, long side at most 1280 px, short
side at least 480 px. Use 1280x720. The first by name is the cover.

The game must stage deterministic scenes for them, as the kit starter does with `?shot=`: when the
page loads with `?shot=<name>&seed=<n>`, build the world with that seed, run the simulation forward
deterministically, pose the camera and the actors for that scene, paint at least two frames, then
set `window.__shotReady = true`. No random variation between runs of the same seed.

Required scenes (file names matter: they sort):

1. `1-cover.png` — the money shot. Third-person view of the player on foot at a palm-lined
   boulevard crossing at golden hour: a police cruiser with flashing light bar closing in behind,
   three wanted stars lit in the HUD, the minimap with the police blips and a mission marker, a
   mission banner on screen naming the mission, traffic in both directions and pedestrians on the
   sidewalk. Everything readable at a glance when shrunk to a small cell.
2. `2-drive.png` — the player driving a stolen muscle car along the coastal highway, camera low and
   behind, ocean and beach on one side, palms and skyline on the other, speedometer and gear in the
   HUD, minimap showing the road, sun glare and long shadows.
3. `3-heat.png` — a firefight on foot: the player behind a car door, muzzle flash, two cops firing
   from behind their cruiser, health and armour bars, weapon and ammo in the HUD, a spent shell
   particle burst, the minimap with a red police cone.
4. `4-title.png` — the start screen: the city skyline at sunset behind a clean title panel with the
   game's name, a tagline, and menu entries (Continue, New Game, Map, Settings) with the selected
   row highlighted; a small "saved game" line showing the save slot.

Write a small Node script `tools/shoot.mjs` (standard library only, no npm) that: starts a static
server on the repository's `game/`, launches the already-installed Chrome headless with
`--headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader
--hide-scrollbars --window-size=1280,720 --screenshot=<path> --virtual-time-budget=<ms>`, waits for
the page, and writes the four PNGs into `screenshots/`. Keep every PNG under 256 KiB (reduce JPEG-
free PNG complexity or drop the size a little if needed, but never below 480 px on the short side).
Verify each file's real dimensions and bytes after writing, and print them.

## 3. The city — `Cala Verde`

An original fictional Mediterranean-American coastal city: a grid of blocks on a bay, a marina with
yachts, a long beach with palms, a downtown of glass towers, a low-rise Latin quarter with awnings
and murals, a container port, a hillside neighbourhood of villas, and a ring road plus a coastal
highway. Golden-hour art direction: warm sun low over the water, teal shadows, warm sand, saturated
coral and turquoise accents, mild haze. The look must be coherent and deliberate, not grey boxes:
procedural facade textures (canvas-generated windows, balconies, awnings), varied roof lines,
street furniture, neon signs at dusk, road markings, crosswalks, traffic lights, street lamps,
palms, beach umbrellas, billboards with invented brands, distant hills.

Target roughly 1.2 km x 1.2 km of playable city, flat ground (y = 0), everything reachable.

## 4. Systems — build all of these

**Player.** Third-person character built from simple geometry with animated limbs (idle, walk, run,
sprint, jump, fall, enter/exit car, aim, shoot, hit, die). Camera: orbit behind the shoulder with
mouse look, collision-aware boom, sprint FOV kick, subtle shoulder offset when aiming. WASD,
Shift sprint, Space jump, mouse look, LMB fire, RMB aim, E enter/exit vehicle, Q weapon wheel or
cycle, Tab or M map, Esc pause, F interact.

**Vehicles.** Arcade car physics that feels good: acceleration curve, braking, reverse, speed-
sensitive steering, handbrake drift with skid marks and tyre smoke, suspension bob, engine pitch
tied to speed, damage, horn, radio toggle. At least five types (sedan, muscle car, sports car,
van, police cruiser) plus a motorbike if time allows. Any parked or occupied car can be stolen; the
driver may be pulled out and flee. Bicycles optional — skip if it costs polish elsewhere.

**Traffic.** Cars follow the road graph in lanes, stop at red lights and for obstacles, turn at
junctions, honk, and panic when shots are fired or a car is stolen. Keep 25-40 active vehicles
around the player with recycling.

**Pedestrians.** 40-60 active walkers on sidewalks, crossing at crosswalks, with a few idles
(phone, bench, vendor). They flee from gunfire and speeding cars, and react to a punch.

**Police and the wanted level.** 0-5 stars. Star 1: a patrol car investigates. Star 2-3: cruisers
chase and cops shoot on foot. Star 4-5: more units, roadblocks, a helicopter if you can afford the
budget. Wanted level rises with crimes witnessed (shots fired, ped or cop hit, car stolen in view),
decays when the player breaks line of sight and stays out of the search radius; a "BUSTED" and a
"WASTED" screen with a hospital/police-station respawn and a small fee.

**Combat.** Hitscan pistol, SMG and shotgun with spread, recoil, muzzle flash, tracers, impact
sparks and decals, reload with ammo counts, melee punch, health and armour pickups, damage numbers
off, blood-free hit flashes.

**Missions and story.** Six story missions in a chain with a named cast (an original crew: the
player, a fixer, a mechanic, a rival) told through short in-game dialogue boxes with portraits drawn
in code, mission markers on the world and the minimap, objective text, timers where it makes sense,
a chase, a delivery, a protection job, a heist-style robbery, a betrayal and a finale. Cash rewards,
a safehouse that saves, and three side activities (a time-trial race, a courier run, a bounty
target) that pay and repeat.

**HUD.** Health and armour bars, cash with a rolling counter, wanted stars, weapon icon and ammo,
mission objective line, a live minimap (canvas-drawn top-down city with roads, buildings, the
player arrow, mission markers, police blips and a search cone), speedometer and gear while driving,
and a small notification feed. It must look designed: consistent type, thin outlines, subtle
gradients, no default browser styling.

**Menus and flow.** Title screen, pause menu (Resume, Map, Settings, Save, Quit to title), a
full-screen map with a legend, settings (quality, volume, invert look, sensitivity), a save/load
slot in localStorage with a timestamp, and a "Continue" that restores cash, mission index, position
and wanted level. First-run shows a short controls card.

**Audio.** All procedural WebAudio: engine hum and gear changes, tyre squeal, gunshots with tail,
sirens that pan with distance, footsteps, UI clicks, ocean ambience, seagulls, and a simple original
music loop (warm synth chords and a lazy beat) that ducks during dialogue. No audio files.

**Effects.** Sun and sky with a gradient and a sun disc, fog matching the haze, water with moving
specular and foam at the shoreline, long shadows from one directional light, dust and tyre smoke
particles, sparks, muzzle light flashes, screen shake on impacts, and a subtle vignette. Keep it
cheap enough for software WebGL.

## 5. File structure — one job per file

Create this structure (you may add a file when it has one clear job, but keep the names telling):

```
game/index.html          page shell, import map, HUD DOM roots, CSS
game/src/main.js         boot, screen state machine, fixed-step loop, wiring
game/src/config.js       every tuning number and palette colour
game/src/random.js       seeded RNG
game/src/state.js        the shared state object and event bus
game/src/city/layout.js  block grid, roads, junctions, lot placement
game/src/city/roads.js   road meshes, lane graph, markings, crosswalks, lights
game/src/city/buildings.js  procedural facades, towers, houses, roofs, signs
game/src/city/props.js   palms, lamps, benches, umbrellas, containers, billboards
game/src/city/water.js   ocean, beach, foam, marina
game/src/city/colliders.js  static collision grid and queries
game/src/render/renderer.js  renderer, lights, sky, fog, camera rig, resize
game/src/render/particles.js  pooled particles and decals
game/src/render/minimap.js  canvas minimap and blips
game/src/render/hud.js   HUD DOM updates
game/src/render/screens.js  title, pause, map, settings, busted/wasted overlays
game/src/systems/input.js   keyboard, mouse, pointer lock, action edges
game/src/systems/player.js  character rig, movement, animation, camera
game/src/systems/vehicles.js  car physics, damage, stealing, spawning
game/src/systems/traffic.js  lane-following AI and recycling
game/src/systems/pedestrians.js  walkers, fleeing, reactions
game/src/systems/police.js  wanted level, pursuit, search, roadblocks
game/src/systems/combat.js  weapons, hitscan, damage, pickups
game/src/systems/missions.js  mission chain, objectives, triggers, side jobs
game/src/systems/save.js    localStorage save/load
game/src/systems/audio.js   WebAudio synthesis
game/src/data/missions.js   mission definitions, dialogue, cast
game/src/data/vehicles.js   vehicle specs
game/src/data/names.js      invented brands, streets, districts
game/src/shots.js       deterministic screenshot scenes (?shot=)
```

Each file starts with a one-line comment saying its job. Export factory functions, not globals
(one shared state object passed in is fine).

## 6. Self-verification — do this, repeatedly, before you say you are done

1. `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` — must write `out/game/`, `out/screenshots/`
   and `out/dossier.json`, exit 0. Run it twice: both runs must write the same bytes.
2. Serve and smoke-test: `node serve.ts --port 8099` in the background, then load
   `http://127.0.0.1:8099/?selftest=1` in headless Chrome and read the DOM (`--dump-dom`). Implement
   `?selftest=1` so it runs a scripted check of the real systems — spawn, drive a car, fire a
   weapon, raise the wanted level, start a mission, save and load — and writes a line
   `SELFTEST ok=<n> fail=<n> [names]` into a `<pre id="selftest">` element plus any error message
   from `window.onerror`. Iterate until fail=0 and there is no console error.
3. Take the four screenshots with `tools/shoot.mjs`, then look at them with your image tool. Fix
   whatever looks wrong: black frames, missing HUD, camera inside geometry, flat lighting, empty
   streets, unreadable text. Re-shoot until each of the four would sell the game on its own.
4. Check the gate limits yourself: count files and bytes under `game/`, check every name is ASCII,
   check `grep -r "http" game/src game/index.html` returns nothing, check the four screenshots'
   dimensions and bytes.
5. Revise your own work: after the first working version, go back over at least six source files and
   improve them in place (that is also how the transcript gate sees a revised build).

## 7. Repository presentation

- `README.md`: the game's name, a one-paragraph pitch, the four screenshots embedded, how to play,
  the controls table, the systems list, and the three make.fun badges as images:
  `https://make.fun/badge/gta6-01.svg`,
  `https://make.fun/badge/gta6-01/fikri92/gta6/rank.svg`,
  `https://make.fun/badge/gta6-01/fikri92/gta6/reward.svg`
  plus a link to `https://make.fun`. No `{owner}` placeholder left anywhere in it.
- Keep `LICENSE` (MIT) as it is.
- Commit your work in the repository with git (author `fikri92 <penzoel92@gmail.com>`). Do not push;
  the operator pushes.

## 8. Order of work

1. Read the kit: `main.ts`, `serve.ts`, `vendor/makefun-game.ts` (only its exported `buildDossier`),
   `game/vendor/three/three.module.min.js` presence. Then write `config.js`, `random.js`,
   `state.js`, and the city layout so you can see a city in the browser within the first third of
   your work.
2. Renderer, sky, sun, water, camera; player rig and movement; then vehicles and traffic; then
   pedestrians; then police and combat; then missions and HUD; then menus, save, audio, effects.
3. Screenshot scenes last, once the systems they show are real.
4. Run the verification loop until it is clean, then commit.

Do not stop early with a stub, a plan, or a "next steps" note. The deliverable is a playable game,
four real screenshots and a passing dossier.
