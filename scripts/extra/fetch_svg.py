# -*- coding: utf-8 -*-
import os, re, ssl, time, urllib.request
WORK = r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work"
OUT = os.path.join(WORK, "src", "assets")
os.makedirs(OUT, exist_ok=True)
ctx = ssl.create_default_context()
MIRRORS = [
    "https://raw.githubusercontent.com/mkhairi/undraw/master/vendor/assets/images/undraw/%s.svg",
    "https://cdn.jsdelivr.net/gh/mkhairi/undraw@master/vendor/assets/images/undraw/%s.svg",
]
NAMES = ["motherhood", "fatherhood", "medicine", "skateboarding", "doctor", "savings", "together"]

def fetch(name):
    last = None
    for attempt in range(3):
        for m in MIRRORS:
            url = m % name
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                return urllib.request.urlopen(req, timeout=45, context=ctx).read().decode("utf-8", "replace"), url
            except Exception as e:
                last = e
                time.sleep(1.5)
    raise RuntimeError(str(last)[:90])

ok = []
for name in NAMES:
    try:
        svg, url = fetch(name)
        open(os.path.join(OUT, name + ".svg"), "w", encoding="utf-8").write(svg)
        vb = re.search(r'viewBox="([\d.\-\s]+)"', svg)
        dims = [float(x) for x in vb.group(1).split()][2:] if vb else ["?", "?"]
        ok.append((name, dims[0], dims[1], len(re.findall(r"<path", svg)), len(svg) // 1024))
        print("OK  %-14s viewBox=%sx%s paths=%d %dKB (via %s)" % (name, dims[0], dims[1], len(re.findall(r"<path", svg)), len(svg)//1024, url.split('/')[2]))
    except Exception as e:
        print("ERR %-14s %s" % (name, e))
print("downloaded:", len(ok), "of", len(NAMES))
