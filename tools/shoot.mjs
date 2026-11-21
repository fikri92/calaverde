// Screenshot runner: serve game/, render each ?shot= URL at 1280x720 in headless Chromium with
// software WebGL, shrink each frame to a 256-colour PNG under the 256 KiB cap, then audit the
// bytes that will actually ship: dimensions, size, colour variety, brightness, and that the
// gameplay area is visible rather than covered by the title or pause screen.
//
//   node tools/shoot.mjs            render every entry in shots.json
//   node tools/shoot.mjs start      render only the shots matching "start"
//
// Fails on any console error, any failed request, or a frame that does not read as a scene.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { decodePng, shrinkPngToBudget } from './png-shrink.mjs';

const require = createRequire('/usr/local/lib/node_modules/@playwright/cli/');
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const only = process.argv[2] ?? null;
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8')).filter(
  (s) => !only || s.query.includes(only) || s.name.includes(only),
);
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });

const CHROME = '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const port = 8300 + (process.pid % 90);
const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(port)], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 700));

// Read the shipped PNG back and measure it. Regional stats catch a HUD that failed to draw, and
// the overall luma/colour count catch a black or flat frame.
function auditPng(file) {
  const { width, height, channels, data } = decodePng(readFileSync(file));
  const at = (x, y) => {
    const o = (y * width + x) * channels;
    return [data[o], data[o + 1], data[o + 2]];
  };
  const region = (x0, y0, x1, y1) => {
    const colours = new Set();
    let lum = 0;
    let n = 0;
    let bright = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const [r, g, b] = at(x, y);
        colours.add(`${r >> 3},${g >> 3},${b >> 3}`);
        const l = (r + g + b) / 3;
        lum += l;
        if (l > 30) bright++;
        n++;
      }
    }
    return { colours: colours.size, lum: lum / n, bright: bright / n };
  };
  return {
    width,
    height,
    bytes: statSync(file).size,
    all: region(0, 0, width, height),
    // The centre band is where the world is; a title screen or a black frame flattens it.
    centre: region(Math.round(width * 0.22), Math.round(height * 0.22), Math.round(width * 0.78), Math.round(height * 0.82)),
    // Top-left HUD stack, top-right minimap, bottom-right weapon.
    hudLeft: region(6, 6, 220, 130),
    minimap: region(width - 230, 6, width - 6, 230),
    bottomRight: region(width - 200, height - 110, width - 6, height - 6),
  };
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--disable-lcd-text',
    '--force-device-scale-factor=1',
  ],
});

let failures = 0;
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

  await page.goto(`http://127.0.0.1:${port}/index.html${shot.query}`, { waitUntil: 'load', timeout: 60000 });
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  } catch {
    errors.push('__ready never became true');
  }
  await page.waitForTimeout(shot.settle ?? 2000);

  // Overlays must be off-screen in gameplay shots, and the live game state must match the shot.
  const audit = await page.evaluate(() => {
    const title = document.getElementById('title-screen');
    const cs = getComputedStyle(title);
    const g = window.__game;
    return {
      titleHidden: title.classList.contains('hidden') && cs.opacity !== '1' && title.getBoundingClientRect().height > 0,
      pauseHidden: document.getElementById('pause-menu').hidden,
      hudChildren: document.getElementById('hud')?.children.length ?? 0,
      objectiveVisible: (() => {
        const el = document.getElementById('hud-objective');
        return !!el && getComputedStyle(el).opacity !== '0';
      })(),
      dialogueVisible: !document.getElementById('hud-dialogue')?.hidden,
      speedoVisible: !document.getElementById('hud-speedo')?.hidden,
      state: g
        ? {
            vehicle: g.player.vehicle?.type ?? null,
            kmh: g.player.vehicle ? Math.round(g.player.vehicle.speed * 3.6) : 0,
            stars: g.police.stars,
            cops: g.police.units.length + g.police.officers.length,
            traffic: g.traffic.cars.filter((c) => !c.disposed).length,
            moving: g.traffic.cars.filter((c) => !c.disposed && c.speed > 1.5).length,
            peds: g.pedestrians.livingCount,
            objective: g.missions.objective,
            speaker: g.missions.currentLine?.who ?? null,
            line: g.missions.currentLine?.line ?? null,
            markerDistance: g.missions.markerDistance,
          }
        : null,
    };
  });

  const rawFile = join(outDir, `.${shot.name}.raw.png`);
  await page.screenshot({ path: rawFile, type: 'png' });
  const shrunk = shrinkPngToBudget(readFileSync(rawFile), 250 * 1024);
  writeFileSync(join(outDir, shot.name), shrunk.buffer);
  rmSync(rawFile, { force: true });

  const png = auditPng(join(outDir, shot.name));
  const checks = {
    exitCode: errors.length === 0,
    size: png.width === 1280 && png.height === 720,
    under256k: png.bytes < 262144,
    titleOff: audit.titleHidden && audit.pauseHidden,
    // A 256-colour frame can't hold thousands of distinct colours; what matters is that the
    // centre band has real tonal range rather than being one flat fill.
    sceneRich: png.centre.colours > 90 && png.centre.lum > 22 && png.centre.bright > 0.12,
    hudDrawn: png.hudLeft.colours > 25 && png.hudLeft.bright > 0.01,
    minimapDrawn: png.minimap.colours > 12,
    weaponDrawn: png.bottomRight.colours > 6,
  };
  const ok = Object.values(checks).every(Boolean) && audit.hudChildren > 6;
  if (!ok) failures++;

  console.log(`\n${ok ? 'PASS' : 'FAIL'} ${shot.name}  ${png.width}x${png.height}  ${(png.bytes / 1024).toFixed(1)} KiB`);
  console.log(`  checks: ${Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(',') || 'all good'}`);
  console.log(`  centre: ${png.centre.colours} colours, luma ${png.centre.lum.toFixed(0)}`);
  console.log(`  minimap: ${png.minimap.colours} colours   hud: ${png.hudLeft.colours} colours`);
  console.log(`  state: ${JSON.stringify(audit.state)}`);
  console.log(`  overlays: objective=${audit.objectiveVisible} dialogue=${audit.dialogueVisible} speedo=${audit.speedoVisible}`);
  for (const e of errors) console.log('  ' + e);
  await page.close();
}

await browser.close();
server.kill();
console.log(`\n${failures === 0 ? 'ALL SHOTS OK' : `${failures} SHOT(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
