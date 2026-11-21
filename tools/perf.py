"""Measure the preview's frame rate and draw stats in headless Chromium."""
import os
import subprocess
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8127

server = subprocess.Popen(["node", os.path.join(ROOT, "serve.ts"), "--port", str(PORT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                          "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 960, "height": 540})
        page.on("console", lambda m: print("console", m.type, m.text))
        page.on("pageerror", lambda e: print("pageerror", e))
        t0 = time.time()
        page.goto(f"http://localhost:{PORT}/preview.html?view=high", wait_until="load")
        page.wait_for_function("() => window.__ready === true", timeout=180000)
        print("ready after", round(time.time() - t0, 1), "s")
        stats = page.evaluate("""() => new Promise(res => {
          let n = 0; const t0 = performance.now();
          function tick(){ n++; if (performance.now() - t0 > 4000) res({fps: n / ((performance.now()-t0)/1000)}); else requestAnimationFrame(tick); }
          requestAnimationFrame(tick);
        })""")
        print("stats", stats)
        print("renderer", page.evaluate("() => { const c = document.getElementById('scene'); return c.width + 'x' + c.height; }"))
        browser.close()
finally:
    server.terminate()
