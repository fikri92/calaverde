// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// CALA VERDE: an open-world crime game in an invented Mediterranean-American coastal city, built on
// the vendored three.js under game/vendor/three/. The city is a 1.2 km grid of blocks on a bay -- a
// downtown of glass towers, a low-rise Latin quarter, a marina, a beach, a container port and a
// hillside of villas -- with traffic, pedestrians, drivable cars, a five-star wanted level, six story
// missions and three repeatable side jobs. Everything it draws is generated at load from a seed and
// every sound is synthesised with WebAudio, so the whole game is a few hundred kilobytes of source
// and plays with the network switched off.
//
// Screenshots are staged deterministically: game/src/shots.js poses a real moment of play for each
// ?shot=<name>&seed=<n> query, and tools/shoot.mjs captures them with headless Chrome.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The two source trees the judge receives. Missing screenshots are not fatal: the dossier still
// gets written so a failed capture shows up as a missing-image note rather than a crashed build.
function copyTree(from: string, to: string): boolean {
  if (!existsSync(from)) {
    console.warn(`main: ${from} is missing, skipping`);
    return false;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  return true;
}

mkdirSync(out, { recursive: true });
copyTree(join(here, 'game'), join(out, 'game'));
copyTree(join(here, 'screenshots'), join(out, 'screenshots'));

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
