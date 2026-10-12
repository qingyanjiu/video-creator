# -*- coding: utf-8 -*-
import json, os, subprocess
import numpy as np
import imageio_ffmpeg
WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = imageio_ffmpeg.get_ffmpeg_exe()
MP4 = os.path.abspath(os.path.join(WORK, "..", "outputs", "给孩子买保险-科普短片.mp4"))
meta = json.load(open(os.path.join(WORK, "timeline.json"), encoding="utf-8"))
raw = subprocess.run([FF,"-v","error","-i",MP4,"-f","f32le","-ac","1","-ar","8000","-"],capture_output=True).stdout
a = np.frombuffer(raw, dtype="<f4").astype(np.float64); sr=8000; win=int(0.05*sr); n=len(a)//win
env = np.sqrt(np.mean(a[:n*win].reshape(n,win)**2, axis=1))
thr = env.max()*0.30
segs=[]; active=False
for i,v in enumerate(env):
    if v>thr and not active: segs.append([i*0.05, i*0.05]); active=True
    elif v>thr and active: segs[-1][1]=i*0.05
    elif v<thr*0.6 and active: active=False
merged=[]
for s in segs:
    if merged and s[0]-merged[-1][1] < 0.55: merged[-1][1]=s[1]
    else: merged.append(s)
merged=[m for m in merged if m[1]-m[0] > 0.25]
print("detected speech blocks:", [(round(a,2), round(b,2)) for a,b in merged])
print("expected speech blocks :", [(round(s['speechStart'],2), round(s['speechStart']+s['speechDur'],2)) for s in meta['scenes']])
print("delta start:", [round(m[0]-s['speechStart'],2) for m,s in zip(merged, meta['scenes'])])
