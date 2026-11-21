// Frame probe: dump where the world objects actually land in screen space for a given shot, so a
// staging bug (cars parked off-camera, crowns detached from trunks) is measured instead of guessed.
//
//   node tools/probe-frame.mjs "?shot=heat&seed=1"

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire('/usr/local/lib/node_modules/@playwright/cli/');
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const query = process.argv[2] ?? '?shot=heat&seed=1';
const port = 8450 + (process.pid % 40);

const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(port)], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${port}/index.html${query}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await page.waitForTimeout(1400);

const report = await page.evaluate(() => {
  const g = window.__game;
  const THREE_CAM = g.camera;
  const project = (v) => {
    const p = v.clone().project(THREE_CAM);
    return { x: Math.round((p.x * 0.5 + 0.5) * 1280), y: Math.round((-p.y * 0.5 + 0.5) * 720), z: +p.z.toFixed(3) };
  };
  const pv = new (g.camera.constructor.prototype.constructor === Object ? Object : Object)();
  const mk = (x, y, z) => {
    const v = g.camera.position.clone().set(x, y, z);
    return project(v);
  };
  const cars = g.traffic.cars
    .filter((c) => !c.disposed)
    .map((c) => ({
      type: c.type,
      pos: [+c.pos.x.toFixed(1), +c.pos.z.toFixed(1)],
      dist: +Math.hypot(c.pos.x - g.player.pos.x, c.pos.z - g.player.pos.z).toFixed(1),
      screen: mk(c.pos.x, 0.8, c.pos.z),
      speed: +c.speed.toFixed(1),
      onScreen: mk(c.pos.x, 0.8, c.pos.z).z < 1 && mk(c.pos.x, 0.8, c.pos.z).x > 0 && mk(c.pos.x, 0.8, c.pos.z).x < 1280,
    }));
  const cops = g.police.units
    .filter((u) => u.car && !u.car.disposed)
    .map((u) => ({ pos: [+u.car.pos.x.toFixed(1), +u.car.pos.z.toFixed(1)], screen: mk(u.car.pos.x, 1.0, u.car.pos.z) }));
  const peds = g.pedestrians.peds
    .filter((p) => !p.dead)
    .map((p) => ({
      pos: [+p.pos.x.toFixed(1), +p.pos.z.toFixed(1)],
      dist: +Math.hypot(p.pos.x - g.player.pos.x, p.pos.z - g.player.pos.z).toFixed(1),
      screen: mk(p.pos.x, 1.0, p.pos.z),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 14);
  return {
    player: { pos: [+g.player.pos.x.toFixed(1), +g.player.pos.z.toFixed(1)], yaw: +g.player.yaw.toFixed(2) },
    camera: { pos: g.camera.position.toArray().map((n) => +n.toFixed(1)), yaw: +g.cameraRig.yaw.toFixed(2) },
    carsOnScreen: cars.filter((c) => c.onScreen).length,
    carsTotal: cars.length,
    cars: cars.filter((c) => c.onScreen).slice(0, 12),
    cops,
    pedsOnScreen: peds.filter((p) => p.screen.z < 1 && p.screen.x > 0 && p.screen.x < 1280).length,
    peds,
    palms: (() => {
      const grp = g.city.props.group;
      const out = [];
      grp.traverse((o) => {
        if (o.isInstancedMesh) out.push(o.count);
      });
      return out;
    })(),
    shadows: {
      enabled: g.renderer.shadowMap.enabled,
      mapSize: g.sky.sun.shadow.mapSize.toArray(),
      cam: [g.sky.sun.shadow.camera.left, g.sky.sun.shadow.camera.right, g.sky.sun.shadow.camera.near, g.sky.sun.shadow.camera.far],
      sunPos: g.sky.sun.position.toArray().map((n) => +n.toFixed(0)),
      target: g.sky.sun.target.position.toArray().map((n) => +n.toFixed(0)),
    },
  };
});

console.log(JSON.stringify(report, null, 2));
if (errors.length) console.log('ERRORS', errors);
await browser.close();
server.kill();
