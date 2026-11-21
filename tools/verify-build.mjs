// Verify the SHIPPED artifact in out/: serve out/ with a tiny static server and boot every shot
// URL, checking for console errors, uncaught exceptions and failed requests. This is the copy
// that ships, so a missing vendor file or a bad relative path shows up here and nowhere else.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, statSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const require = createRequire('/usr/local/lib/node_modules/@playwright/cli/');
const { chromium } = require('playwright');
const root = '/root/workspace/calaverde';
const served = resolve(join(root, 'out'), 'game');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const port = 8600 + (process.pid % 80);
const server = createServer((req, res) => {
  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = resolve(join(served, normalize(pathname)));
  if (file !== served && !file.startsWith(served + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
let bad = 0;
for (const shot of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  await page.goto(`http://127.0.0.1:${port}/index.html${shot.query}`, { waitUntil: 'load', timeout: 60000 });
  const ready = await page
    .waitForFunction(() => window.__ready === true, null, { timeout: 90000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(500);
  const live = await page.evaluate(() => {
    const g = window.__game;
    return g
      ? {
          traffic: g.traffic.cars.filter((c) => !c.disposed).length,
          peds: g.pedestrians.livingCount,
          stars: g.police.stars,
          vehicle: g.player.vehicle?.type ?? null,
          objective: g.missions.objective || null,
        }
      : null;
  });
  const ok = ready && errors.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${shot.name}  ready=${ready}  ${JSON.stringify(live)}`);
  for (const e of errors) console.log('     ' + e);
  await page.close();
}

await browser.close();
server.close();
console.log(bad === 0 ? '\nSHIPPED BUILD CLEAN' : `\n${bad} SHOT(S) BROKEN IN SHIPPED BUILD`);
process.exit(bad === 0 ? 0 : 1);
