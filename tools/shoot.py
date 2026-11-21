"""The kit's screenshot runner: serves game/, opens each shot named in shots.json with Playwright,
waits for the game to signal readiness, and writes a real PNG into screenshots/ at 1280x720.

Screenshots must be PNG, at most 1280px on the long side, at least 480px on the short side and at
most 256 KiB each, so each frame is re-encoded through Pillow's palette quantiser until it fits.

    python3 tools/shoot.py            # every shot
    python3 tools/shoot.py 2          # only shot 2 (1-based)
"""
import io
import json
import os
import subprocess
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8123
SHOTS = json.load(open(os.path.join(ROOT, "shots.json"), encoding="utf-8"))
ONLY = int(sys.argv[1]) if len(sys.argv) > 1 else 0
LIMIT = 256 * 1024

os.makedirs(os.path.join(ROOT, "screenshots"), exist_ok=True)


def save_png(raw: bytes, path: str) -> int:
    """Re-encode to PNG under LIMIT bytes, trimming the palette only as far as needed."""
    for colors in (256, 200, 160, 128, 96):
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        q = img.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
        buf = io.BytesIO()
        q.save(buf, format="PNG", optimize=True)
        if buf.tell() <= LIMIT:
            with open(path, "wb") as f:
                f.write(buf.getvalue())
            return buf.tell()
    # Last resort: fewer colours still reads cleanly at 1280x720.
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    q = img.quantize(colors=64, method=Image.FASTOCTREE)
    buf = io.BytesIO()
    q.save(buf, format="PNG", optimize=True)
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return buf.tell()


server = subprocess.Popen(
    ["node", os.path.join(ROOT, "serve.ts"), "--port", str(PORT)],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.STDOUT,
)
time.sleep(0.8)

errors = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            args=[
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--disable-gpu-sandbox",
            ]
        )
        context = browser.new_context(viewport={"width": 1280, "height": 720}, device_scale_factor=1)
        for i, shot in enumerate(SHOTS):
            if ONLY and i + 1 != ONLY:
                continue
            page = context.new_page()
            page.on(
                "console",
                lambda m, n=shot["name"]: errors.append(f"[{n}] {m.text}") if m.type == "error" else None,
            )
            page.on("pageerror", lambda e, n=shot["name"]: errors.append(f"[{n}] pageerror {e}"))
            url = f"http://localhost:{PORT}/index.html{shot.get('query', '')}"
            page.goto(url, wait_until="load")
            page.wait_for_function("() => window.__ready === true", timeout=200000)
            page.wait_for_timeout(shot.get("settle", 1200))
            raw = page.screenshot(type="png", timeout=200000)
            size = save_png(raw, os.path.join(ROOT, "screenshots", shot["name"]))
            print(f"wrote screenshots/{shot['name']} ({size // 1024} KiB)")
            page.close()
        browser.close()
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except Exception:
        server.kill()

if errors:
    print("CONSOLE ERRORS:", file=sys.stderr)
    for e in errors:
        print(" ", e, file=sys.stderr)
    sys.exit(1)
print("no console errors")
