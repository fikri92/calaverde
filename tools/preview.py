"""Preview the city from a fixed camera: `python3 tools/preview.py street|high|beach|downtown|marina`."""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8126
VIEW = sys.argv[1] if len(sys.argv) > 1 else "street"

server = subprocess.Popen(["node", os.path.join(ROOT, "serve.ts"), "--port", str(PORT)],
                          stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
time.sleep(0.8)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader",
                                          "--enable-unsafe-swiftshader", "--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.on("console", lambda m: print("console", m.type, m.text))
        page.on("pageerror", lambda e: print("pageerror", e, getattr(e, "stack", "")))
        page.goto(f"http://localhost:{PORT}/preview.html?view={VIEW}", wait_until="load")
        page.wait_for_function("() => window.__ready === true", timeout=120000)
        page.wait_for_timeout(700)
        out = f"/tmp/preview-{VIEW}.png"
        page.screenshot(path=out, timeout=180000)
        print("wrote", out)
        browser.close()
finally:
    server.terminate()
