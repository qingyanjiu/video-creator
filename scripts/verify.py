# -*- coding: utf-8 -*-
import json, os, re, subprocess
import numpy as np
import imageio_ffmpeg

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = imageio_ffmpeg.get_ffmpeg_exe()
MP4 = os.path.abspath(os.path.join(WORK, "..", "outputs", "给孩子买保险-科普短片.mp4"))
meta = json.load(open(os.path.join(WORK, "timeline.json"), encoding="utf-8"))

# --- audio sync check ---------------------------------------------------------
raw = subprocess.run([FF, "-v", "error", "-i", MP4, "-f", "f32le", "-ac", "1", "-ar", "8000", "-"],
                     capture_output=True).stdout
a = np.frombuffer(raw, dtype="<f4").astype(np.float64)
sr = 8000
win = int(0.05 * sr)
n = len(a) // win
env = np.sqrt(np.mean(a[:n * win].reshape(n, win) ** 2, axis=1))
thr = max(0.01, env.max() * 0.12)
onsets = []
active = False
for i, v in enumerate(env):
    if v > thr and not active:
        onsets.append(i * 0.05); active = True
    elif v < thr * 0.5 and active:
        active = False
print("audio length: %.2fs" % (len(a) / sr))
print("speech onsets (s):", [round(x, 2) for x in onsets[:14]])
print("expected speech starts:", [round(s["speechStart"], 2) for s in meta["scenes"]])
gaps = [round(x - y, 2) for x, y in zip(onsets[:9], [s["speechStart"] for s in meta["scenes"]])]
print("onset - expected offset:", gaps)

# --- frame spot check from the finished file ---------------------------------
dst = os.path.join(WORK, "verify_frames")
os.makedirs(dst, exist_ok=True)
for i, t in enumerate([2.0, 9.0, 15.5, 22.0, 33.0, 41.0, 47.0, 54.0, 62.0]):
    subprocess.run([FF, "-y", "-v", "error", "-ss", str(t), "-i", MP4, "-frames:v", "1",
                    os.path.join(dst, "v%d_%.1fs.png" % (i, t))], check=True)
print("extracted", len(os.listdir(dst)), "frames from the encoded mp4")
