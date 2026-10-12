# -*- coding: utf-8 -*-
"""Recolour unDraw accent per scene and record provenance."""
import os, re, json
WORK = r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work"
OUT = os.path.join(WORK, "src", "assets")
ACCENT = {"motherhood": "#FF8A3D", "fatherhood": "#FF6F61", "medicine": "#4FC3A1",
          "skateboarding": "#5BA8F5", "doctor": "#5BA8F5", "savings": "#FF8A3D",
          "together": "#FF8A3D"}
prov = {}
for name, accent in ACCENT.items():
    p = os.path.join(OUT, name + ".svg")
    s = open(p, encoding="utf-8").read()
    before = s.count("#6c63ff") + s.count("#6C63FF")
    s = s.replace("#6c63ff", accent).replace("#6C63FF", accent)
    open(p, "w", encoding="utf-8").write(s)
    prov[name] = {"accent": accent, "recoloured": before,
                  "source": "unDraw (mkhairi/undraw mirror), MIT licence"}
    print("%-14s accent=%s  recoloured %d fills" % (name, accent, before))
json.dump(prov, open(os.path.join(OUT, "_provenance.json"), "w", encoding="utf-8"), indent=2)
