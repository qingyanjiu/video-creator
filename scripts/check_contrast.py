# -*- coding: utf-8 -*-
"""按 styles/<name>.json 计算关键前景/背景的 WCAG 对比度，抓深色/浅色皮肤的读不清问题。"""
import io, json, os, sys
WORK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def parse(c):
    c = c.strip()
    if c.startswith("#"):
        c = c[1:]
        if len(c) == 3: c = "".join(ch * 2 for ch in c)
        return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 1.0)
    if c.startswith("rgb"):
        v = c[c.index("(") + 1:c.rindex(")")].split(",")
        r, g, b = [int(float(x)) for x in v[:3]]
        a = float(v[3]) if len(v) > 3 else 1.0
        return (r, g, b, a)
    raise ValueError(c)


def over(fg, bg):
    fr, fg_, fb, fa = fg
    br, bg_, bb, _ = bg
    return (fr * fa + br * (1 - fa), fg_ * fa + bg_ * (1 - fa), fb * fa + bb * (1 - fa), 1.0)


def lum(c):
    def f(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "warm"
    st = json.load(io.open(os.path.join(WORK, "styles", name + ".json"), encoding="utf-8"))
    T = dict(st["theme"]); T.update(st["tokens"])
    G = lambda k: parse(T[k])
    bg, bg2 = G("bg"), G("bg2")
    card = over(G("card"), bg)
    hud = over(G("hudChip"), bg)
    sub = over(G("subBg"), bg)
    checks = [
        ("正文 ink / 背景", G("ink"), bg, 4.5),
        ("正文 ink / 背景2", G("ink"), bg2, 4.5),
        ("次要 ink2 / 卡片", G("ink2"), card, 4.5),
        ("正文 ink / 卡片", G("ink"), card, 4.5),
        ("HUD ink2 / HUD底", G("ink2"), hud, 4.5),
        ("字幕 subInk / 字幕底", G("subInk"), sub, 4.5),
        ("金币 coinInk / coin", G("coinInk"), G("coin"), 4.5),
    ]
    for a in ("orange", "coral", "mint", "blue", "red", "purple", "yellow"):
        checks.append(("强调字 %s / 卡片" % a, G(a), card, 3.0))
        checks.append(("徽标 onAccent / %s" % a, G("onAccent"), G(a), 4.5))
    bad = 0
    print("%-26s %7s  %s" % ("组合", "对比度", "判定"))
    for label, fg, bgc, need in checks:
        r = ratio(fg, bgc)
        ok = r >= need
        if not ok: bad += 1
        print("%-26s %7.2f  %s (需 >= %.1f)" % (label, r, "OK " if ok else "LOW", need))
    print("\nstyle=%s  不达标: %d" % (name, bad))


if __name__ == "__main__":
    main()
