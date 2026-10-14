# -*- coding: utf-8 -*-
"""content.json  ->  content.js + timeline.json + src/timeline.js

唯一的内容入口是 content/<x>.json；能配什么写在 content/schema.json。
配音按需生成：narration 文本哈希未变则复用已有 mp3，不再联网。
"""
import asyncio, hashlib, json, os, re, subprocess, sys

WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE = os.path.join(WORK, "engine")
STYLES = os.path.join(WORK, "styles")
_rel = sys.argv[1] if len(sys.argv) > 1 else os.path.join("content", "child-insurance.json")
CONTENT_PATH = _rel if os.path.isabs(_rel) else os.path.join(WORK, _rel)
if not os.path.exists(CONTENT_PATH):
    raise SystemExit("content file not found: " + CONTENT_PATH)
CONTENT = json.load(open(CONTENT_PATH, encoding="utf-8"))
SCHEMA = json.load(open(os.path.join(WORK, "content", "schema.json"), encoding="utf-8"))
# 配音缓存按 slug 分目录。以前所有片子共用一个 tts/，mp3 名就是镜号（s1.mp3…），
# 而不同片子的镜号必然重名——于是「构建 B」会把「A 的 s1–s5」整批覆盖成 B 的配音，
# 下次构建 A 时哈希对不上、全部重做。更坏的是 edge-tts 的时长不可复现（同一句
# 连做两次能得到 2.140s 和 2.160s），所以重做不只是费时间：**A 的时间轴会凭空变**。
# 实测：先建 child-insurance 再建 binary-basics，后者的总时长从 15.433s 漂到 16.767s。
TTS_DIR = os.path.join(WORK, "tts", CONTENT.get("meta", {}).get("slug", "_unslugged"))
os.makedirs(TTS_DIR, exist_ok=True)


# ============================ 校验 =========================================
# 配置面全在 content/schema.json。以前写错字段是静默降级（tpl 拼错悄悄变
# 成钩子镜、asset 名打错那镜没插画、色键写错被引擎忽略），肉眼看不出来——
# 所以在这里全部挡住。
BADGE_FIELDS = {
    "n":     {"type": "string", "required": True, "label": "序号"},
    "label": {"type": "string", "required": True, "label": "名称"},
    "color": {"type": "color",  "required": True, "label": "颜色"},
}
_HEX = re.compile(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
_RGBA = re.compile(r"^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$")
_TY = {str: "字符串", int: "整数", float: "小数", bool: "布尔",
       list: "数组", dict: "对象", type(None): "null"}


def _ty(v):
    return _TY.get(type(v), type(v).__name__)


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _is_empty(v):
    return v is None or (isinstance(v, str) and not v.strip()) \
        or (isinstance(v, (list, dict)) and not v)


def _engine_theme_keys():
    """从 engine.js 的 `const C = {...}` 抠出可覆写的色键——引擎才是真相。

    C 里一行挤了好几个键，所以不能按行锚定；先把注释去掉再全局找 `名字:`。
    """
    src = open(os.path.join(ENGINE, "engine.js"), encoding="utf-8").read()
    m = re.search(r"const C = \{(.*?)\n\};", src, re.S)
    if not m:
        raise SystemExit("读不到 engine/engine.js 里的 `const C = {...}`，无法核对色板键")
    body = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
    return sorted(set(re.findall(r"([A-Za-z_]\w*)\s*:", body)))


class Ctx:
    def __init__(self):
        self.errs = []
        self.accents = set(SCHEMA["colors"]["accent"])
        self.theme_keys = set(_engine_theme_keys())
        self.assets = set()

    def fail(self, path, msg):
        self.errs.append("%s %s" % (path, msg))

    def check_schema_sync(self):
        """schema 的 themeKeys 必须与引擎的 C 一致，否则校验会放进写错的键。"""
        real, decl = sorted(self.theme_keys), sorted(SCHEMA["colors"]["themeKeys"])
        miss, extra = sorted(set(real) - set(decl)), sorted(set(decl) - set(real))
        if miss or extra:
            raise SystemExit(
                "content/schema.json 的 colors.themeKeys 与 engine.js 的 C 不一致：\n"
                + ("  schema 缺：%s\n" % ", ".join(miss) if miss else "")
                + ("  schema 多：%s\n" % ", ".join(extra) if extra else "")
                + "  同步 content/schema.json 后再重跑。")


def _range(ctx, spec, val, path, extra=""):
    if "min" in spec and val < spec["min"]:
        return ctx.fail(path, "不能小于 %s（当前 %s）%s" % (spec["min"], val, extra))
    if "max" in spec and val > spec["max"]:
        return ctx.fail(path, "不能大于 %s（当前 %s）%s" % (spec["max"], val, extra))


def _check(ctx, spec, val, path):
    """按 schema 的字段规格校验一个值。"""
    t = spec["type"]
    hint = ("（%s）" % spec["label"]) if spec.get("label") else ""

    if t == "string":
        if not isinstance(val, str):
            return ctx.fail(path, "应为字符串%s，当前是 %s" % (hint, _ty(val)))
        if spec.get("pattern") and not re.match(spec["pattern"], val):
            return ctx.fail(path, "格式不对%s：%r（应匹配 %s）" % (hint, val, spec["pattern"]))
        if "minLen" in spec and len(val) < spec["minLen"]:
            return ctx.fail(path, "太短%s：%d 字，至少 %d 字" % (hint, len(val), spec["minLen"]))
        if "maxLen" in spec and len(val) > spec["maxLen"]:
            return ctx.fail(path, "太长%s：%d 字，最多 %d 字" % (hint, len(val), spec["maxLen"]))
        return

    if t == "int":
        if not isinstance(val, int) or isinstance(val, bool):
            return ctx.fail(path, "应为整数%s，当前是 %s" % (hint, _ty(val)))
        return _range(ctx, spec, val, path)

    if t in ("number", "fraction"):
        if not _is_num(val):
            return ctx.fail(path, "应为数字%s，当前是 %s" % (hint, _ty(val)))
        if t == "fraction":
            return _range(ctx, dict(spec, min=0, max=1), val, path,
                          extra="（%s是 0–1 的解说进度，不是秒）" % spec.get("label", "这里"))
        return _range(ctx, spec, val, path)

    if t == "enum":
        if val not in spec["values"]:
            return ctx.fail(path, "只能是 %s 之一%s，当前是 %r"
                            % (" / ".join(map(str, spec["values"])), hint, val))
        return

    if t == "color":
        if isinstance(val, str) and (val in ctx.accents or _HEX.match(val) or _RGBA.match(val)):
            return
        return ctx.fail(path, "不是合法颜色%s：%r（可用色名 %s，或 #RRGGBB / rgba(...)）"
                        % (hint, val, " / ".join(sorted(ctx.accents))))

    if t == "asset":
        if not isinstance(val, str):
            return ctx.fail(path, "应为素材名%s，当前是 %s" % (hint, _ty(val)))
        if val not in ctx.assets:
            return ctx.fail(path, "没有这个插画：%r（assets 里只有 %s）"
                            % (val, " / ".join(sorted(ctx.assets)) or "（空）"))
        return

    if t == "tuple":
        n = len(spec["of"])
        if not isinstance(val, list) or len(val) != n:
            return ctx.fail(path, "应为 %d 项数组%s，当前是 %r" % (n, hint, val))
        labels = spec.get("labels") or []
        for k, sub in enumerate(spec["of"]):
            sub_spec = {"type": sub}
            if k < len(labels):
                sub_spec["label"] = labels[k]
            _check(ctx, sub_spec, val[k], "%s[%d]" % (path, k))
        return

    if t == "list":
        if not isinstance(val, list):
            return ctx.fail(path, "应为数组%s，当前是 %s" % (hint, _ty(val)))
        if "min" in spec and len(val) < spec["min"]:
            return ctx.fail(path, "只有 %d 项%s，至少 %d 项" % (len(val), hint, spec["min"]))
        if "max" in spec and len(val) > spec["max"]:
            return ctx.fail(path, "有 %d 项%s，最多 %d 项" % (len(val), hint, spec["max"]))
        for k, it in enumerate(val):
            _check(ctx, spec["item"], it, "%s[%d]" % (path, k))
        return

    if t in ("object", "badge"):
        return _check_fields(ctx, BADGE_FIELDS if t == "badge" else spec["fields"], val, path)

    ctx.fail(path, "schema 里有个不认识的类型 %r（schema 自身的问题）" % t)


def _check_fields(ctx, fields, obj, path):
    """按 fields 规格校验对象：未知字段、缺必填、逐项类型。"""
    if not isinstance(obj, dict):
        return ctx.fail(path, "应为对象，当前是 %s" % _ty(obj))
    for k in obj:
        if k not in fields:
            ctx.fail("%s.%s" % (path, k), "不认识的字段（可用：%s）" % " / ".join(sorted(fields)))
    for k, sub in fields.items():
        if k not in obj:
            if sub.get("required"):
                ctx.fail("%s.%s" % (path, k), "缺必填字段（%s）" % sub.get("label", k))
            continue
        if sub.get("required") and _is_empty(obj[k]):
            ctx.fail("%s.%s" % (path, k), "不能为空（%s）" % sub.get("label", k))
            continue
        _check(ctx, sub, obj[k], "%s.%s" % (path, k))


def validate():
    """校验整份 content。有任何问题就一次性列全再退出。"""
    ctx = Ctx()
    ctx.check_schema_sync()
    ctx.assets = {a.get("name") for a in (CONTENT.get("assets") or []) if isinstance(a, dict)}

    meta = CONTENT.get("meta")
    if not isinstance(meta, dict):
        raise SystemExit("content 缺少 meta 对象")
    for k in meta:
        if k not in SCHEMA["meta"]:
            hint = "（画布固定 1080×1920，不是配置项）" if k == "size" \
                else "（可用：%s）" % " / ".join(sorted(SCHEMA["meta"]))
            ctx.fail("meta.%s" % k, "不认识的字段%s" % hint)
    _check_fields(ctx, SCHEMA["meta"], meta, "meta")

    style = meta.get("style")
    if style and not os.path.exists(os.path.join(STYLES, style + ".json")):
        have = sorted(f[:-5] for f in os.listdir(STYLES) if f.endswith(".json"))
        ctx.fail("meta.style", "没有这个皮肤：%r（styles/ 下只有 %s）" % (style, " / ".join(have)))

    for k in (CONTENT.get("theme") or {}):
        if k not in ctx.theme_keys:
            ctx.fail("theme.%s" % k, "不是可覆写的色键（可用：%s）"
                     % " / ".join(sorted(ctx.theme_keys)))

    # 皮肤文件里的色键：写错会被引擎的 `if (k in C)` 静默丢掉
    for fn in sorted(os.listdir(STYLES)):
        if not fn.endswith(".json"):
            continue
        st = json.load(open(os.path.join(STYLES, fn), encoding="utf-8"))
        for k in list(st.get("theme") or {}) + list(st.get("tokens") or {}):
            if k not in ctx.theme_keys:
                ctx.fail("styles/%s" % fn, "不认识的色键 %r（会被引擎静默忽略）" % k)

    # 整份省略 assets 键 = 全片不放插画，合法。不能无脑 _check：那会拿到 None
    # 直接报「应为数组」，把无插画路线当场堵死。
    if "assets" in CONTENT:
        _check(ctx, SCHEMA["assets"], CONTENT["assets"], "assets")

    scenes = CONTENT.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise SystemExit("content 的 scenes 要是非空数组")
    common = SCHEMA["scenes"]["common"]
    all_tpl_fields = {}
    for sp in SCHEMA["scenes"]["tpl"].values():
        all_tpl_fields.update(sp["fields"])

    seen = set()
    for idx, sc in enumerate(scenes):
        p = "scenes[%d]" % idx
        if not isinstance(sc, dict):
            ctx.fail(p, "应为对象，当前是 %s" % _ty(sc))
            continue
        sid = sc.get("id")
        if isinstance(sid, str):
            if sid in seen:
                ctx.fail("%s.id" % p, "镜号重复：%r" % sid)
            seen.add(sid)
        spec = SCHEMA["scenes"]["tpl"].get(sc.get("tpl"))
        # tpl 不认识时不该连带报一堆"不认识的字段"，只报 tpl 那一条
        fields = dict(common)
        fields.update(spec["fields"] if spec else all_tpl_fields)
        _check_fields(ctx, fields, sc, p)

    base = meta.get("assetBase") or SCHEMA["meta"]["assetBase"]["default"]
    adir = os.path.normpath(os.path.join(ENGINE, base))
    for a in CONTENT.get("assets") or []:
        if isinstance(a, dict) and a.get("file") \
                and not os.path.exists(os.path.join(adir, a["file"])):
            ctx.fail("assets[%s]" % a.get("name"), "文件不存在：%s" % os.path.join(adir, a["file"]))

    if ctx.errs:
        raise SystemExit("content 校验失败（%s）：\n  %s\n\n配置面见 content/schema.json"
                         % (os.path.relpath(CONTENT_PATH, WORK), "\n  ".join(ctx.errs)))
    print("校验通过：%d 镜，%d 个插画" % (len(scenes), len(ctx.assets)))


def _meta_spec(key):
    return SCHEMA["meta"][key]["default"]


def _fps():
    spec = SCHEMA["meta"]["fps"]
    v = CONTENT["meta"].get("fps", spec["default"])
    # 类型/范围上面校验过了，这里只为把"为什么是 24 下限"讲清楚
    if not isinstance(v, int) or isinstance(v, bool) or not (spec["min"] <= v <= spec["max"]):
        raise SystemExit("meta.fps 应为 %d–%d 的整数，当前是 %r。" % (spec["min"], spec["max"], v))
    return v


def _pace():
    p = {k: v["default"] for k, v in SCHEMA["meta"]["pace"]["fields"].items()}
    p.update(CONTENT["meta"].get("pace") or {})
    return p


# ============================ 音频 =========================================
def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def duration(path):
    out = subprocess.run([ffmpeg(), "-hide_banner", "-i", path],
                         capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def synth(text, path):
    import edge_tts
    # 微软 2026 年把合成端点迁到新域名，旧版本 edge-tts 会 403。
    # 这里做兼容处理：能改则改，改不了就沿用默认端点（并在失败时报明确原因）。
    try:
        import edge_tts.communicate as _C, edge_tts.constants as _K
        _wss = ("wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1"
                f"?Ocp-Apim-Subscription-Key={_K.TRUSTED_CLIENT_TOKEN}")
        _K.WSS_URL = _wss
        _C.WSS_URL = _wss
    except Exception as _e:
        print("  [warn] edge-tts 端点补丁未生效（%s）；若报 403 请安装 edge-tts==7.2.8" % _e)

    async def run():
        last = None
        for a in range(6):
            try:
                c = edge_tts.Communicate(text, CONTENT["meta"]["voice"],
                                         rate=CONTENT["meta"].get("rate", "+0%"))
                await c.save(path)
                if os.path.getsize(path) > 1000:
                    return
            except Exception as e:
                last = e
            await asyncio.sleep(4 + a * 4)
        raise RuntimeError(f"TTS failed: {last}")
    asyncio.run(run())


# ============================ 主流程 =======================================
def main():
    validate()                      # 先挡内容错误，再花时间跑 TTS
    FPS = _fps()
    pace = _pace()
    lead, tail, last_tail = pace["lead"], pace["tail"], pace["lastTail"]

    cache_path = os.path.join(TTS_DIR, "_hash.json")
    cache = json.load(open(cache_path, encoding="utf-8")) if os.path.exists(cache_path) else {}
    segs, reused, made = [], 0, 0
    # key 必须带上音色和语速：以前只哈希 text，于是改 meta.voice / meta.rate 会**全部命中旧
    # 配音**——schema 里写着「改了会重做全部配音」，实际一声不响地复用，时间轴纹丝不动。
    voice, rate = CONTENT["meta"]["voice"], CONTENT["meta"].get("rate", "+0%")
    for sc in CONTENT["scenes"]:
        sid, text = sc["id"], sc["narration"]
        h = hashlib.md5(("\x00".join((voice, rate, text))).encode("utf-8")).hexdigest()
        mp3 = os.path.join(TTS_DIR, sid + ".mp3")
        hit = (cache.get(sid) == h and os.path.exists(mp3))
        if hit:
            reused += 1
        else:
            print("  TTS  ", sid, text[:18] + "...")
            synth(text, mp3); made += 1
        cache[sid] = h
        segs.append({"id": sid, "text": text, "file": mp3, "dur": round(duration(mp3), 3)})
        print("  %-3s %6.3fs  %s" % (sid, segs[-1]["dur"], "cached" if hit else "NEW"))
    json.dump(cache, open(cache_path, "w", encoding="utf-8"), indent=2)
    json.dump(segs, open(os.path.join(TTS_DIR, "durations.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    print("TTS: %d reused, %d synthesized" % (reused, made))

    items, t = [], 0.0
    for i, s in enumerate(segs):
        tail_i = last_tail if i == len(segs) - 1 else tail
        dur = lead + s["dur"] + tail_i
        # file 一并写出去：mix_audio.py 要用它，别再让它用镜号去拼路径
        # （配音目录按 slug 分层后，拼出来的路径是错的）。
        items.append({"id": s["id"], "text": s["text"], "file": s["file"],
                      "start": round(t, 3),
                      "dur": round(dur, 3), "speechStart": round(t + lead, 3),
                      "speechDur": round(s["dur"], 3)})
        t += dur
    frames = round(t * FPS); total = frames / FPS

    # 节奏用 window.PACE 挂出去（不是 const，免得和 engine.js 的声明撞车）
    js = ["// generated by scripts/build_content.py  (edit engine/content.json instead)",
          "const FPS = %d;" % FPS, "const TOTAL = %r;" % total,
          "window.PACE = %s;" % json.dumps(pace, separators=(", ", ": ")),
          "const TIMELINE = [",
          ",\n".join("  " + json.dumps(x, ensure_ascii=False) for x in items), "];", ""]
    open(os.path.join(WORK, "src", "timeline.js"), "w", encoding="utf-8").write("\n".join(js))
    json.dump({"fps": FPS, "frames": frames, "total": round(total, 4), "scenes": items},
              open(os.path.join(WORK, "timeline.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    merged = dict(CONTENT)
    sname = CONTENT.get("style") or CONTENT.get("meta", {}).get("style", "warm")
    spath = os.path.join(STYLES, sname + ".json")
    if not os.path.exists(spath):
        raise SystemExit("style not found: " + spath)
    st = json.load(open(spath, encoding="utf-8"))
    merged["style"] = dict(st.get("theme", {}), **st.get("tokens", {}))
    merged["styleName"] = sname
    print("style: %s (%s) -> %d tokens" % (sname, st.get("label", ""), len(merged["style"])))
    merged["scenes"] = [dict(cfg, **tm) for cfg, tm in zip(CONTENT["scenes"], items)]
    merged["total"] = round(total, 4)
    merged["frames"] = frames
    open(os.path.join(ENGINE, "content.js"), "w", encoding="utf-8").write(
        "// generated by scripts/build_content.py  (edit content.json instead)\n"
        "window.CONTENT = " + json.dumps(merged, ensure_ascii=False, indent=2) + ";\n")
    print("total %.3fs -> %d frames @ %dfps  (lead %.2f / tail %.2f / 末镜 %.2f / 转场 %.2f / 闪光 %.2f)"
          % (total, frames, FPS, lead, tail, last_tail, pace["transition"], pace["flash"]))
    print("wrote engine/content.js + timeline.json + src/timeline.js")


if __name__ == "__main__":
    main()
