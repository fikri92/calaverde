// One-off diagnostic: boot a shot URL, then report where the police cruisers, the player and the
// camera actually are, plus whether each cruiser's mesh sits at its logical position.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const require = createRequire('/usr/local/lib/node_modules/@playwright/cli/');
const { chromium } = require('playwright');
const root = '/root/workspace/calaverde';
const port = 8500 + (process.pid % 80);
const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(port)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?shot=chase&seed=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(() => console.log('not ready'));
await page.waitForTimeout(2200);

const info = await page.evaluate(() => {
  const g = window.__game;
  const cam = g.cameraRig.camera;
  return {
    camera: { x: +cam.position.x.toFixed(1), y: +cam.position.y.toFixed(1), z: +cam.position.z.toFixed(1) },
    player: { x: +g.player.pos.x.toFixed(1), z: +g.player.pos.z.toFixed(1) },
    units: g.police.units.map((u) => ({
      pos: { x: +u.car.pos.x.toFixed(1), z: +u.car.pos.z.toFixed(1) },
      mesh: { x: +u.car.group.position.x.toFixed(1), z: +u.car.group.position.z.toFixed(1) },
      inScene: !!u.car.group.parent,
      visible: u.car.group.visible,
      police: u.car.police,
      hasBar: !!u.car.lightbar,
    })),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
server.kill();
