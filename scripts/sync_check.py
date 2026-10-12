# -*- coding: utf-8 -*-
import json, os, subprocess, sys
import numpy as np, imageio_ffmpeg
WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = imageio_ffmpeg.get_ffmpeg_exe()
def find_mp4():
    if len(sys.argv) > 1:
        return os.path.abspath(sys.argv[1])
    cands = []
    if os.environ.get("OUT_MP4"):
        cands.append(os.environ["OUT_MP4"])
    if os.environ.get("OUT_NAME"):
        cands.append(os.path.join(WORK, os.environ.get("OUT_DIR") or "out", os.environ["OUT_NAME"] + ".mp4"))
    cands += [
        os.path.join(WORK, "out", "给孩子买保险-科普短片.mp4"),
        os.path.join(WORK, "..", "outputs", "给孩子买保险-科普短片.mp4"),
    ]
    for c in cands:
        if os.path.exists(c):
            return os.path.abspath(c)
    sys.exit("找不到成片。用法：python scripts\\sync_check.py [成片.mp4]")


MP4 = find_mp4()
print("mp4: " + MP4)
meta = json.load(open(os.path.join(WORK, "timeline.json"), encoding="utf-8"))
raw = subprocess.run([FF, "-v", "error", "-i", MP4, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
a = np.frombuffer(raw, dtype="<f4").astype(np.float64); sr = 16000
def rms(t0, t1):
    s = a[int(max(0, t0) * sr):int(min(len(a) / sr, t1) * sr)]
    return float(np.sqrt(np.mean(s ** 2))) if len(s) else 0.0
print("%-4s %-9s %-9s %-9s %-8s" % ("id", "start", "quiet-pre", "in-speech", "ratio"))
ok = True
for sc in meta["scenes"]:
    ss = sc["speechStart"]
    pre = rms(ss - 0.75, ss - 0.20)
    cur = rms(ss - 0.05, ss + min(0.55, sc["speechDur"]))
    r = cur / max(pre, 1e-5)
    flag = "" if r > 4 else "  <<< LOW"
    if r <= 4: ok = False
    print("%-4s %-9.2f %-9.4f %-9.4f %-8.1f%s" % (sc["id"], ss, pre, cur, r, flag))
print("audio duration: %.2fs | video/expected: %.2fs" % (len(a) / sr, meta["total"]))
abs_gap = abs(len(a) / sr - meta["total"])
print("A/V length delta: %.2fs -> %s" % (abs_gap, "OK" if abs_gap < 0.1 else "MISMATCH"))
print("RESULT:", "PASS" if (ok and abs_gap < 0.1) else "CHECK")
