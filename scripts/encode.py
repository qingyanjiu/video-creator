# -*- coding: utf-8 -*-
"""Encode PNG frames + mixed audio into the final H.264/AAC MP4."""
import json, os, subprocess, sys
import imageio_ffmpeg

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = imageio_ffmpeg.get_ffmpeg_exe()
meta = json.load(open(os.path.join(WORK, "timeline.json"), encoding="utf-8"))

AUDIO = os.path.join(WORK, "audio.m4a")
if not os.path.exists(AUDIO):
    sys.exit("audio.m4a 不存在。先运行：\n"
             "  python scripts/make_bgm.py     # 合成背景音乐 -> bgm.wav\n"
             "  python scripts/mix_audio.py    # 配音+BGM 混音 -> audio.m4a\n"
             "或直接运行 .\\run.ps1（会自动补做）")

outdir = os.environ.get("OUT_DIR") or os.path.join(WORK, "out")
if not os.path.isabs(outdir):
    outdir = os.path.join(WORK, outdir)
os.makedirs(outdir, exist_ok=True)
OUT_NAME = os.environ.get("OUT_NAME") or "video"
out = os.path.abspath(os.path.join(outdir, OUT_NAME + ".mp4"))

frames_dir = os.environ.get("FRAMES_DIR") or "out/frames"
fdir = frames_dir if os.path.isabs(frames_dir) else os.path.join(WORK, frames_dir)
ext = None
for cand in ("png", "jpg"):
    if os.path.exists(os.path.join(fdir, "f00000." + cand)):
        ext = cand
        break
if ext is None:
    sys.exit("找不到渲染帧：%s\n"
             "先渲染一遍：\n"
             "  node scripts\\render_frames.js png     # 默认输出 out/frames\n"
             "或直接跑 .\\run.ps1（会自动渲染 + 编码）" % fdir)
n_have = len([f for f in os.listdir(fdir) if f.startswith("f") and f.endswith("." + ext)])
print("frames: %d 张  (%s)" % (n_have, fdir))
if n_have != meta["frames"]:
    raise SystemExit(
        "帧数 %d != 时间轴预期 %d（%s）。\n"
        "  多了：目录里有上一次渲染的残留帧，重跑 node scripts/render_frames.js png（它会先清目录）。\n"
        "  少了：渲染中途断了，重跑渲染。" % (n_have, meta["frames"], fdir))

# 帧率一律从 timeline.json 取——它由 content.json 的 meta.fps 生成，
# 渲染脚本也是按同一个值算帧数的。这里若写死，帧数和播放速率就会对不上。
fps = int(meta.get("fps", 30))

cmd = [
    FF, "-y", "-v", "warning", "-stats",
    "-framerate", str(fps), "-start_number", "0",
    "-i", os.path.join(fdir, "f%05d." + ext),
    "-i", AUDIO,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2",
    # 关键帧间隔按 2s / 1s 折算，别写成固定帧数
    "-x264-params", "keyint=%d:min-keyint=%d" % (fps * 2, fps),
    "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", "48000",
    "-af", "aresample=async=1:first_pts=0",
    "-shortest", "-movflags", "+faststart",
    "-r", str(fps), out,
]
print("encoding ->", out)
r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
if r.returncode != 0:
    print(r.stderr[-3000:])
    sys.exit(1)

probe = subprocess.run([FF, "-hide_banner", "-i", out], capture_output=True, text=True, encoding="utf-8", errors="replace").stderr
for l in probe.splitlines():
    if "Duration" in l or "Stream #" in l or "encoder" in l:
        print(l.strip())
print("size: %.2f MB" % (os.path.getsize(out) / 1048576))
print("expected duration %.2fs @ %dfps" % (meta["total"], fps))
