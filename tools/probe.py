"""A debug probe: opens the game, prints every console message and page error, and dumps whether
WebGL initialised. Not part of the entry; a development aid kept beside the shooter."""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8124
QUERY = sys.argv[1] if len(sys.argv) > 1 else ""

server = subprocess.Popen(["node", os.path.join(ROOT, "serve.ts"), "--port", str(PORT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                          "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: print("console", m.type, m.text))
        page.on("pageerror", lambda e: print("pageerror", e))
        page.goto(f"http://localhost:{PORT}/index.html{QUERY}", wait_until="load")
        page.wait_for_timeout(6000)
        info = page.evaluate("""() => {
          const c = document.createElement('canvas');
          const gl = c.getContext('webgl2');
          return { booted: window.__booted === true, ready: window.__ready === true,
                   err: window.__bootError || null,
                   webgl2: !!gl,
                   renderer: gl ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) : null };
        }""")
        print("info", info)
        page.screenshot(path="/tmp/probe.png")
        browser.close()
finally:
    server.terminate()
