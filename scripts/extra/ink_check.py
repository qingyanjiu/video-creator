import os, numpy as np
from PIL import Image
src = r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work\preview"
regions = {"hud":(80,230),"title":(320,570),"content":(570,1340),"subtitle":(1390,1570),"bottom":(1570,1900)}
print("%-22s %-6s %-8s %-8s %-8s %-8s %-8s %-8s" % ("frame","mean","hud","title","content","subtitle","bottom","dark%"))
for f in sorted(os.listdir(src)):
    im = Image.open(os.path.join(src,f)).convert("L")
    a = np.asarray(im, dtype=np.float32)
    row = [a.mean()]
    for k,(y0,y1) in regions.items():
        band = a[y0:y1]
        row.append(float((band < 200).mean()))
    row.append(float((a < 200).mean()))
    print("%-22s %-6.1f %-8.3f %-8.3f %-8.3f %-8.3f %-8.3f %-8.3f" % tuple([f]+row))
