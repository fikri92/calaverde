// Probe a game URL in headless Chromium: report console errors, uncaught exceptions, load
// failures, and whether the world actually booted. Used while building to catch real breakage
// before the screenshots are taken.
//
//   node tools/probe.mjs "?shot=start&seed=1" [waitMs]
//
// Exits 1 if the page reported any error.

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire('/usr/local/lib/node_modules/@playwright/cli/');
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const query = process.argv[2] ?? '?shot=start&seed=1';
const waitMs = Number(process.argv[3] ?? 9000);
const port = 8099 + Math.floor(process.pid % 50);

const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(port)], {
  cwd: root,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

await page.goto(`http://127.0.0.1:${port}/index.html${query}`, { waitUntil: 'load', timeout: 60000 });
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: waitMs });
} catch {
  errors.push(`__ready never became true within ${waitMs}ms`);
}
const info = await page.evaluate(() => {
  const g = window.__game;
  return {
    ready: window.__ready === true,
    hasGame: !!g,
    running: g?.running ?? null,
    paused: g?.paused ?? null,
    playerPos: g ? [g.player.pos.x.toFixed(1), g.player.pos.y.toFixed(2), g.player.pos.z.toFixed(1)] : null,
    vehicle: g?.player.vehicle?.type ?? null,
    stars: g?.police.stars ?? null,
    traffic: g?.traffic.cars.filter((c) => !c.disposed).length ?? null,
    peds: g?.pedestrians.livingCount ?? null,
    objective: g?.missions.objective ?? null,
    dialogue: g?.missions.currentLine?.who ?? null,
    titleHidden: document.getElementById('title-screen')?.classList.contains('hidden') ?? null,
    canvasSize: [document.getElementById('scene')?.width, document.getElementById('scene')?.height],
  };
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
server.kill();
if (errors.length) {
  console.log('\nERRORS:');
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
}
console.log('\nno console errors');
