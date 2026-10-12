# -*- coding: utf-8 -*-
"""Fetch unDraw (MIT) illustrations, recolour the accent, and report coverage."""
import os, re, ssl, urllib.request
import numpy as np
from PIL import Image

WORK = r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work"
OUT = os.path.join(WORK, "src", "assets")
os.makedirs(OUT, exist_ok=True)
ctx = ssl.create_default_context()
BRANCH = "master"
BASE = "https://cdn.jsdelivr.net/gh/mkhairi/undraw@%s/vendor/assets/images/undraw/" % BRANCH

ASSETS = {
    "motherhood": ("#FF8A3D", None),
    "fatherhood": ("#FF6F61", None),
    "medicine":   ("#4FC3A1", None),
    "skateboarding": ("#5BA8F5", None),
    "doctor":     ("#5BA8F5", None),
    "savings":    ("#FFC24B", None),
    "together":   ("#FF8A3D", None),
}

def fetch(name):
    req = urllib.request.Request(BASE + name + ".svg", headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=45, context=ctx).read().decode("utf-8", "replace")

def recolour(svg, accent):
    svg = re.sub(r"#6c63ff", accent, svg, flags=re.I)
    svg = re.sub(r"#6C63FF", accent, svg)
    return svg

report = []
for name, (accent, _) in ASSETS.items():
    try:
        svg = fetch(name)
    except Exception as e:
        print("[ERR] %-14s %s" % (name, str(e)[:80])); continue
    vb = re.search(r'viewBox="([\d.\-\s]+)"', svg)
    w = h = None
    if vb:
        p = [float(x) for x in vb.group(1).split()]
        w, h = p[2], p[3]
    svg2 = recolour(svg, accent)
    open(os.path.join(OUT, name + ".svg"), "w", encoding="utf-8").write(svg2)

    # rasterise for a quick sanity check on density / content box
    png = os.path.join(OUT, "_probe_" + name + ".png")
    try:
        from PIL import features
        raise RuntimeError("skip")
    except Exception:
        pass

    # measure ink directly from the rendered PNG pulled through the browser is overkill;
    # approximate from path count + viewBox instead
    paths = len(re.findall(r"<path", svg))
    report.append((name, round(w, 1) if w else None, round(h, 1) if h else None,
                   paths, len(svg) // 1024, accent))

print("%-14s %8s %8s %6s %6s %s" % ("asset", "w", "h", "paths", "KB", "accent"))
for r in report:
    print("%-14s %8s %8s %6d %6d %s" % r)
print("\nfiles:", sorted(os.listdir(OUT)))
