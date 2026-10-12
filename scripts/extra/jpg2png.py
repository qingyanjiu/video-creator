import imageio_ffmpeg, subprocess, os
ff = imageio_ffmpeg.get_ffmpeg_exe()
src = r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work\preview"
dst = r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work\preview_png"
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if f.endswith(".jpg"):
        out = os.path.join(dst, f[:-4] + ".png")
        subprocess.run([ff,"-y","-v","error","-i",os.path.join(src,f),"-vf","scale=540:-1",out],check=True)
print(sorted(os.listdir(dst)))
