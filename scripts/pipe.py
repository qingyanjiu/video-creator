#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""跨平台出片管线。

run.ps1 / bootstrap.ps1 是 Windows 专用；这个是等价物，macOS / Linux / Windows 都能跑。
它只做三件事：配好依赖路径、按顺序调子脚本、任一步失败就停。

    python scripts/pipe.py check                                依赖自检
    python scripts/pipe.py build   [content.json]               校验 + 时间轴 + 配音
    python scripts/pipe.py preview [content.json] --times 1.5,10.3,20 --dir preview
    python scripts/pipe.py render  [--frames-dir out/frames]    逐帧渲染
    python scripts/pipe.py audio                                背景音乐 + 混音
    python scripts/pipe.py encode  [--name 成片名] [--out out]  编码
    python scripts/pipe.py all     [content.json] [--name 成片名]

依赖优先用项目内的 deps/（deps/venv/bin/python、deps/node_modules），没有才回落到
系统 PATH 上的 python / node。
"""
import argparse, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CONTENT = "content/child-insurance.json"


def _venv_python():
    """项目内 venv 的解释器；没有就用当前解释器。"""
    for rel in ("deps/venv/bin/python", "deps/venv/Scripts/python.exe"):
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            return p
    return sys.executable


PY = _venv_python()
NODE = os.environ.get("NODE") or "node"


def env():
    """子进程环境：NODE_PATH / RENDER_HTML / OUT_* 一次配齐，和 run.ps1 等价。"""
    e = dict(os.environ)
    e["PYTHONIOENCODING"] = "utf-8"
    e["RENDER_HTML"] = "engine/render.html"

    nm = os.path.join(ROOT, "deps", "node_modules")
    if os.path.isdir(nm):
        e["NODE_PATH"] = nm + (os.pathsep + e["NODE_PATH"] if e.get("NODE_PATH") else "")
    return e


def run(cmd, **kw):
    print("  $ " + " ".join(str(c) for c in cmd), flush=True)
    r = subprocess.run([str(c) for c in cmd], cwd=ROOT, env=env(), **kw)
    if r.returncode != 0:
        sys.exit("失败（退出码 %d）：%s" % (r.returncode, " ".join(str(c) for c in cmd)))


def step(n, total, msg):
    print("\n==> %d/%d %s" % (n, total, msg), flush=True)


# ----------------------------------------------------------------- 各步 ----
def build(content):
    run([PY, "scripts/build_content.py", content])


def auto_times(n=6):
    """从 timeline.json 里挑时间点：尽量铺满全片，取每镜解说进行到 65% 处（元素都落位了）。"""
    with open(os.path.join(ROOT, "timeline.json"), encoding="utf-8") as f:
        sc = json.load(f)["scenes"]
    if len(sc) <= n:
        picks = sc
    else:                                   # 均匀跳着挑，首尾两镜一定要有
        idx = sorted(set([0, len(sc) - 1] +
                         [round(i * (len(sc) - 1) / (n - 1)) for i in range(n)]))
        picks = [sc[i] for i in idx]
        while len(picks) > n:
            picks.pop(1)
    return [round(s["start"] + s["dur"] * 0.65, 2) for s in picks]


def preview(content, times, outdir):
    build(content)
    if times.strip() == "auto":
        ts = auto_times()
        print("  自动取帧：" + ", ".join("%.2fs" % t for t in ts))
    else:
        ts = [float(x) for x in times.split(",") if x.strip()]
    run([NODE, "scripts/render_frames.js", "preview", json.dumps(ts), outdir])
    print("\n预览帧在 %s/" % outdir)


def render(frames_dir):
    e = env()
    e["FRAMES_DIR"] = frames_dir
    print("  $ node scripts/render_frames.js png   (FRAMES_DIR=%s)" % frames_dir, flush=True)
    r = subprocess.run([NODE, "scripts/render_frames.js", "png"], cwd=ROOT, env=e)
    if r.returncode != 0:
        sys.exit("渲染失败")


def audio():
    if not os.path.exists(os.path.join(ROOT, "bgm.wav")):
        run([PY, "scripts/make_bgm.py"])
    else:
        print("  复用 bgm.wav")
    run([PY, "scripts/mix_audio.py"])


def encode(name, outdir):
    e = env()
    e["OUT_DIR"] = outdir
    e["OUT_NAME"] = name
    print("  $ python scripts/encode.py   (OUT_DIR=%s OUT_NAME=%s)" % (outdir, name), flush=True)
    r = subprocess.run([PY, "scripts/encode.py"], cwd=ROOT, env=e)
    if r.returncode != 0:
        sys.exit("编码失败")
    print("\n成片 -> %s/%s.mp4" % (outdir, name))


def check():
    ok = True
    probe = "import edge_tts, numpy, imageio_ffmpeg; " \
            "assert callable(imageio_ffmpeg.get_ffmpeg_exe) and hasattr(edge_tts, 'Communicate')"
    r = subprocess.run([PY, "-c", probe], cwd=ROOT, env=env(), capture_output=True, text=True)
    print("  python  %-46s %s" % (PY, "OK" if r.returncode == 0 else "缺失: " + r.stderr.strip().splitlines()[-1][:60]))

    r = subprocess.run([NODE, "-e", "require('playwright').chromium; require('sharp')"],
                       cwd=ROOT, env=env(), capture_output=True, text=True)
    print("  node    %-46s %s" % (NODE, "OK" if r.returncode == 0 else "缺失: " + r.stderr.strip().splitlines()[-1][:60]))

    for f in ("engine/render.html", "engine/engine.js", "content/schema.json"):
        p = os.path.exists(os.path.join(ROOT, f))
        ok = ok and p
        print("  %-50s %s" % (f, "OK" if p else "缺失"))
    return ok


def main():
    ap = argparse.ArgumentParser(description="跨平台出片管线", add_help=True)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("check", help="依赖自检")
    p = sub.add_parser("build", help="校验 + 时间轴 + 配音")
    p.add_argument("content", nargs="?", default=DEFAULT_CONTENT)
    p = sub.add_parser("preview", help="抽几帧看效果")
    p.add_argument("content", nargs="?", default=DEFAULT_CONTENT)
    p.add_argument("--times", default="auto", help="逗号分隔的秒数，或 auto（按 timeline 每镜取一点）")
    p.add_argument("--dir", default="preview")
    p = sub.add_parser("render", help="逐帧渲染")
    p.add_argument("--frames-dir", default="out/frames")
    p = sub.add_parser("audio", help="背景音乐 + 混音")
    p = sub.add_parser("encode", help="编码成片")
    p.add_argument("--name", default="video")
    p.add_argument("--out", default="out")
    p = sub.add_parser("all", help="全流程：build -> audio -> render -> encode")
    p.add_argument("content", nargs="?", default=DEFAULT_CONTENT)
    p.add_argument("--name", default="video")
    p.add_argument("--out", default="out")
    p.add_argument("--frames-dir", default="out/frames")

    a = ap.parse_args()

    if a.cmd == "check":
        sys.exit(0 if check() else 1)
    if a.cmd == "build":
        build(a.content)
    elif a.cmd == "preview":
        preview(a.content, a.times, a.dir)
    elif a.cmd == "render":
        render(a.frames_dir)
    elif a.cmd == "audio":
        audio()
    elif a.cmd == "encode":
        encode(a.name, a.out)
    elif a.cmd == "all":
        step(1, 4, "内容 -> 时间轴 + 配音（文案没变的镜次走缓存）")
        build(a.content)
        step(2, 4, "音频：背景音乐 + 混音")
        audio()
        step(3, 4, "逐帧渲染（约 3.5 分钟）")
        render(a.frames_dir)
        step(4, 4, "编码")
        encode(a.name, a.out)
        # 下面的脚本也要项目内的依赖，所以把解释器和 NODE_PATH 一起打出来，
        # 不然在 macOS 上直接用系统 python3 跑会报 "No module named imageio_ffmpeg"。
        rel = lambda p: os.path.relpath(p, ROOT) if p.startswith(ROOT) else p
        print("\n接着可以校验：")
        print("  %s scripts/sync_check.py %s/%s.mp4" % (rel(PY), a.out, a.name))
        print("  NODE_PATH=deps/node_modules node scripts/motion_check.js %s" % a.frames_dir)


if __name__ == "__main__":
    main()
