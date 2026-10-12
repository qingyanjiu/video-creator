/* =========================================================================
   儿童保险科普视频 - canvas 分镜动画  (1080x1920 @30fps)
   人物插画来自 unDraw (MIT)，已按各分镜主色重新上色
   由 window.renderFrame(t) 逐帧驱动
   ========================================================================= */
const W = 1080, H = 1920;
/* =====================================================================
   引擎 (engine.js) —— 不含任何文案。全部内容来自 content.json。
   新增视频：改 content.json 即可，本文件无需改动。
   ===================================================================== */
const D = window.CONTENT || { meta: {}, theme: {}, scenes: [], assets: [] };
const SCN = i => D.scenes[i] || {};
const FONT = '"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';

const C = {
  bg: '#FDF8F1', bg2: '#FFF1E0', ink: '#3E3630', ink2: '#7A6A5D',
  orange: '#FF8A3D', coral: '#FF6F61', mint: '#4FC3A1', blue: '#5BA8F5',
  red: '#FF5A5F', white: '#FFFFFF', yellow: '#FFC24B', purple: '#9B8CF0',
  shadow: 'rgba(122,92,62,0.20)',
  /* ---- 皮肤 token：可由 styles/<style>.json 覆写 ---- */
  card: '#FFFFFF', onAccent: '#FFFFFF',
  soft: '#FFECEC', dash: '#E7E2F7', seal: 'rgba(255,255,255,0.75)',
  headFrom: '#FF9E52', sheen: 'rgba(255,255,255,0.22)',
  coin: '#FFC24B', coinEdge: '#E9A22B', coinInk: '#B87A16',
  hudTrack: 'rgba(62,54,48,0.10)', hudChip: 'rgba(255,255,255,0.92)',
  subBg: 'rgba(255,255,255,0.94)', subInk: '#3E3630', subShadow: 'rgba(60,45,30,0.16)',
  lineA: 'rgba(91,168,245,0.30)', splitLeft: 'rgba(79,195,161,0.85)', splitRight: 'rgba(255,138,61,0.85)',
  walletDot: '#FFE0C2',
  outroBg1: '#FFF6E8', outroBg2: '#FFE7CE', outroBg3: '#FFD9BC', outroGlow: '#FFC24B',
  glow: 1
};
/* 主题色可由 content.json 覆写；CL() 把 "coral" 这类色名解析成实际色值 */
if (D.style) for (const k in D.style) if (k in C) C[k] = D.style[k];
if (D.theme) for (const k in D.theme) if (k in C) C[k] = D.theme[k];
const CL = n => C[n] || n;

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const clamp01 = v => clamp(v, 0, 1);
const lerp = (a, b, p) => a + (b - a) * p;
const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
const easeInOutCubic = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const easeOutBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const seg = (t, a, b) => clamp01((t - a) / (b - a));

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function box(ctx, x, y, w, h, r, fill, alpha) {
  ctx.save(); if (alpha !== undefined) ctx.globalAlpha = alpha;
  rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}
function shadow(ctx, blur, dy, color) { ctx.shadowColor = color || C.shadow; ctx.shadowBlur = blur; ctx.shadowOffsetY = dy; }
function noShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
function txt(ctx, s, x, y, size, color, weight, align) {
  ctx.save();
  ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y); ctx.restore();
}
function width(ctx, s, size, weight) {
  ctx.save(); ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
  const w = ctx.measureText(s).width; ctx.restore(); return w;
}
function line(ctx, x1, y1, x2, y2, color, lw) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function softCircle(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore();
}
function checkMark(ctx, x, y, r, color, lw) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.15, y + r * 0.75); ctx.lineTo(x + r, y - r * 0.7);
  ctx.stroke(); ctx.restore();
}
function crossMark(ctx, x, y, r, color, lw) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); ctx.restore();
}

/* ---------- 插画素材 ---------- */
const ASSET_SRC = {};
D.assets.forEach(a => { ASSET_SRC[a.name] = (D.meta.assetBase || 'assets/') + a.file; });
const ASSETS = {};
let pendingAssets = Object.keys(ASSET_SRC).length;
window.__assetsReady = false;
Object.keys(ASSET_SRC).forEach(k => {
  const im = new Image();
  const done = () => { if (--pendingAssets === 0) window.__assetsReady = true; };
  im.onload = () => { ASSETS[k] = im; done(); };
  im.onerror = () => { console.warn('asset failed: ' + k); done(); };
  im.src = ASSET_SRC[k];
});
function assetH(name, w) {
  const im = ASSETS[name];
  if (!im || !im.naturalWidth) return w * 0.72;
  return w * im.naturalHeight / im.naturalWidth;
}
function drawAsset(ctx, name, cx, cy, w, o) {
  const im = ASSETS[name];
  o = o || {};
  if (!im || !im.naturalWidth) return 0;
  const h = w * im.naturalHeight / im.naturalWidth;
  ctx.save();
  ctx.globalAlpha = o.alpha === undefined ? 1 : clamp01(o.alpha);
  if (o.pop && o.pop !== 1) {
    ctx.translate(cx, cy); ctx.scale(o.pop, o.pop); ctx.translate(-cx, -cy);
  }
  ctx.drawImage(im, cx - w / 2, cy - h / 2 + (o.rise || 0), w, h);
  ctx.restore();
  return h;
}

/* ---------- 字幕 ---------- */
function splitLines(text) {
  const parts = text.split(/(?<=[，。；：！？、])/).filter(s => s.length);
  const out = []; let cur = '';
  for (const p of parts) {
    if ((cur + p).length <= 17) cur += p;
    else { if (cur) out.push(cur); cur = p; }
  }
  if (cur) out.push(cur);
  return out;
}
const SUBS = TIMELINE.map(sc => {
  const lines = splitLines(sc.text);
  const tot = lines.reduce((a, l) => a + l.length, 0);
  let t0 = sc.speechStart - sc.start;
  const arr = [];
  lines.forEach(l => {
    const d = sc.speechDur * l.length / tot;
    arr.push({ t0: t0, t1: t0 + d, text: l });
    t0 += d;
  });
  return arr;
});
function activeSub(i, t) {
  const arr = SUBS[i]; if (!arr || !arr.length) return null;
  for (let k = 0; k < arr.length; k++) {
    const a = arr[k];
    if (t >= a.t0 && (t < a.t1 || k === arr.length - 1)) {
      const fi = clamp01((t - a.t0) / 0.16);
      const fo = k === arr.length - 1 ? 1 : clamp01((a.t1 - t) / 0.16);
      return { text: a.text, a: Math.min(fi, fo) };
    }
  }
  return null;
}

/* ---------- 背景 ---------- */
function bgBase(ctx, t, tint) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.bg); g.addColorStop(1, C.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const dx = Math.sin(t * 0.35) * 30, dy = Math.cos(t * 0.28) * 34;
  softCircle(ctx, 180 + dx, 380 + dy, 430, tint || C.orange, 0.13 * C.glow);
  softCircle(ctx, 930 - dx, 1180 - dy, 470, C.mint, 0.10 * C.glow);
  softCircle(ctx, 300 + dx * 0.6, 1560 + dy * 0.5, 420, C.blue, 0.09 * C.glow);
}
function stepBadge(ctx, n, label, color, p) {
  const e = easeOutCubic(p);
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha = e;
  const y = lerp(250, 296, e);
  const wBadge = 96 + width(ctx, label, 40, 700) + 34;
  shadow(ctx, 26, 10); box(ctx, 90, y, wBadge, 104, 34, C.card);
  noShadow(ctx);
  ctx.beginPath(); ctx.arc(90 + 62, y + 52, 34, 0, 7); ctx.fillStyle = color; ctx.fill();
  txt(ctx, n, 90 + 62, y + 54, 40, C.onAccent, 800);
  txt(ctx, label, 90 + 96 + 17, y + 54, 40, C.ink, 700, 'left');
  ctx.restore();
}

/* =========================== 场景 1 · 钩子 =========================== */
function scene1(ctx, t, dur) {
  const c = SCN(0);
  bgBase(ctx, t, CL(c.accent));
  const p = easeOutCubic(seg(t, 0.05, 0.85));
  txt(ctx, c.title, W / 2, lerp(430, 388, p), 78, C.ink, 800);
  ctx.save(); ctx.globalAlpha = seg(t, 0.45, 1.1);
  txt(ctx, c.sub, W / 2, 500, 60, CL(c.accent), 800); ctx.restore();

  const ap = easeOutCubic(seg(t, 0.25, 1.15));
  if (ap > 0) drawAsset(ctx, c.asset, 540, 968, 880, { alpha: ap, rise: (1 - ap) * 46 });

  ctx.save();
  c.popups.forEach((c, i) => {
    const label = c[0], col = CL(c[1]), x0 = c[2], spd = c[3];
    const y = ((t * 300 * spd + i * 220) % (H + 520)) - 260;
    const x = clamp(x0 + Math.sin(t * 1.6 + i) * 22, 100, W - 100);
    const wChip = width(ctx, label, 36, 700) + 62;
    ctx.save(); ctx.globalAlpha = 0.92 * clamp01(t / 0.4);
    ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.1 + i * 2) * 0.09);
    shadow(ctx, 22, 9); box(ctx, -wChip / 2, -38, wChip, 76, 38, C.card); noShadow(ctx);
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    rr(ctx, -wChip / 2, -38, wChip, 76, 38); ctx.stroke();
    txt(ctx, label, 0, 2, 36, col, 700);
    ctx.restore();
  });
  ctx.restore();
}

/* =========================== 场景 2 · 少儿医保 =========================== */
function scene2(ctx, t, dur) {
  const c = SCN(1);
  bgBase(ctx, t, CL(c.accent));
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), seg(t, 0.05, 0.5));

  const hp = easeOutCubic(seg(t, 0.3, 1.0));
  if (hp > 0) drawAsset(ctx, c.asset, 540, 560, 390, { alpha: hp, rise: (1 - hp) * 30 });

  const cp = easeOutCubic(seg(t, 0.6, 1.35));
  if (cp > 0) {
    const cy = lerp(1290, 940, cp), cw = 760, ch = 430;
    ctx.save(); ctx.globalAlpha = cp;
    shadow(ctx, 56, 26); box(ctx, 540 - cw / 2, cy - ch / 2, cw, ch, 44, C.card); noShadow(ctx);
    ctx.save(); rr(ctx, 540 - cw / 2, cy - ch / 2, cw, ch, 44); ctx.clip();
    const hg = ctx.createLinearGradient(0, cy - ch / 2, 0, cy - ch / 2 + 132);
    hg.addColorStop(0, C.headFrom); hg.addColorStop(1, C.orange);
    ctx.fillStyle = hg; ctx.fillRect(540 - cw / 2, cy - ch / 2, cw, 132);
    ctx.fillStyle = C.sheen;
    ctx.beginPath(); ctx.arc(760, cy - ch / 2 + 30, 120, 0, 7); ctx.fill();
    ctx.restore();
    txt(ctx, c.card.title, 540 - cw / 2 + 52, cy - ch / 2 + 66, 44, C.onAccent, 800, 'left');
    txt(ctx, c.card.sub, 540 - cw / 2 + 52, cy - ch / 2 + 152, 28, C.ink2, 600, 'left');

    const numP = easeOutBack(clamp01((t - 1.35) / 0.6));
    ctx.save(); ctx.globalAlpha = clamp01(numP);
    const sc = 0.7 + 0.3 * numP;
    ctx.translate(540 - cw / 2 + 52, cy + 34); ctx.scale(sc, sc);
    txt(ctx, c.card.value, 0, 0, 96, CL(c.accent), 800, 'left');
    txt(ctx, c.card.unit, width(ctx, c.card.value, 96, 800) + 16, 18, 40, C.ink, 700, 'left');
    ctx.restore();
    txt(ctx, c.card.note, 540 - cw / 2 + 52, cy + 128, 34, C.ink2, 600, 'left');

    const ck = seg(t, 1.9, 2.5);
    if (ck > 0) {
      ctx.save(); ctx.globalAlpha = clamp01(ck * 1.4);
      ctx.beginPath(); ctx.arc(540 + cw / 2 - 120, cy + 44, 66, 0, Math.PI * 2 * clamp01(ck * 1.6));
      ctx.strokeStyle = C.mint; ctx.lineWidth = 8; ctx.stroke();
      if (ck > 0.4) checkMark(ctx, 540 + cw / 2 - 120, cy + 48, 30 * easeOutBack(clamp01((ck - 0.4) / 0.5)), C.mint, 12);
      ctx.restore();
    }
    ctx.restore();
  }

  const bp = easeOutCubic(seg(t, 2.4, 3.0));
  if (bp > 0) {
    const label = c.ribbon;
    const bwid = width(ctx, label, 38, 700) + 80;
    ctx.save(); ctx.globalAlpha = bp;
    shadow(ctx, 24, 10); box(ctx, 540 - bwid / 2, 1200, bwid, 92, 46, C.card); noShadow(ctx);
    txt(ctx, label, 540, 1247, 38, CL(c.accent), 700);
    ctx.restore();
  }
}

/* =========================== 场景 3 · 意外险 =========================== */
function scene3(ctx, t, dur) {
  const c = SCN(2);
  bgBase(ctx, t, CL(c.accent));
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), seg(t, 0.05, 0.5));

  const ap = easeOutBack(seg(t, 0.35, 1.15));
  if (ap > 0) drawAsset(ctx, c.asset, 540, 812, 580, { alpha: clamp01(ap), pop: clamp(ap, 0.35, 1.12) });

  const chips = c.chips;
  chips.forEach(ch => {
    const label = ch[0], t0 = ch[1], x = ch[2], y = ch[3];
    const q = easeOutBack(seg(t, t0, t0 + 0.55)); if (q <= 0) return;
    const wid = width(ctx, label, 40, 700) + 76;
    ctx.save(); ctx.globalAlpha = clamp01(q);
    ctx.translate(x, y); ctx.scale(clamp(q, 0.4, 1.2), clamp(q, 0.4, 1.2)); ctx.translate(-x, -y);
    shadow(ctx, 26, 10); box(ctx, x - wid / 2, y - 52, wid, 104, 52, C.card); noShadow(ctx);
    txt(ctx, label, x, y + 2, 40, CL(ch[4] || 'blue'), 700);
    ctx.restore();
  });
}

/* =========================== 场景 4 · 医疗险 =========================== */
function scene4(ctx, t, dur) {
  const c = SCN(3);
  bgBase(ctx, t, CL(c.accent));
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), seg(t, 0.05, 0.5));

  const hp = easeOutCubic(seg(t, 0.3, 1.0));
  if (hp > 0) drawAsset(ctx, c.asset, 540, 618, 470, { alpha: hp, rise: (1 - hp) * 28 });

  const bp = easeOutCubic(seg(t, 0.6, 1.2));
  const bx0 = 140, by0 = lerp(1150, 820, bp), bwAll = 800, bhAll = 150;
  if (bp > 0) {
    ctx.save(); ctx.globalAlpha = bp;
    shadow(ctx, 30, 12); box(ctx, bx0, by0, bwAll, bhAll, 40, C.card); noShadow(ctx);
    ctx.save(); rr(ctx, bx0, by0, bwAll, bhAll, 40); ctx.clip();
    const cut = easeInOutCubic(seg(t, 1.3, 2.1));
    const split = 0.45;
    ctx.fillStyle = C.splitLeft; ctx.fillRect(bx0, by0, bwAll * split * cut, bhAll);
    ctx.fillStyle = C.splitRight; ctx.fillRect(bx0 + bwAll * split, by0, bwAll * (1 - split) * cut, bhAll);
    ctx.restore();
    ctx.save(); ctx.globalAlpha = clamp01(seg(t, 1.5, 2.2));
    txt(ctx, c.bar[0], bx0 + bwAll * split / 2, by0 + bhAll / 2 + 2, 40, C.onAccent, 800);
    txt(ctx, c.bar[1], bx0 + bwAll * split + bwAll * (1 - split) / 2, by0 + bhAll / 2 + 2, 40, C.onAccent, 800);
    ctx.restore();
    ctx.restore();
  }

  const np = easeOutBack(seg(t, 2.2, 2.9));
  if (np > 0) {
    const nx = 500, ny = 1010, nw = 440, nh = 240;
    ctx.save(); ctx.globalAlpha = clamp01(np);
    shadow(ctx, 30, 14); box(ctx, nx, ny, nw, nh, 36, C.card); noShadow(ctx);
    ctx.save(); rr(ctx, nx, ny, nw, nh, 36); ctx.clip();
    for (let i = -nh; i < nw; i += 62) line(ctx, nx + i, ny, nx + i + nh, ny + nh, C.lineA, 4);
    for (let i = 0; i < nw + nh; i += 62) line(ctx, nx + i, ny, nx + i - nh, ny + nh, C.lineA, 4);
    ctx.restore();
    txt(ctx, c.panel.title, nx + nw / 2, ny + nh / 2 - 28, 38, CL(c.accent), 800);
    txt(ctx, c.panel.value, nx + nw / 2, ny + nh / 2 + 30, 40, CL(c.accent), 800);
    ctx.restore();
  }

  const q = seg(t, 3.0, 4.4);
  if (q > 0) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const pp = clamp01(q * 1.35 - i * 0.16); if (pp <= 0) continue;
      const e = easeInOutCubic(pp);
      const x = lerp(560, 400, e), y = lerp(1120, 1146, e) - Math.sin(pp * Math.PI) * 84;
      ctx.globalAlpha = clamp01(pp * 3);
      ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fillStyle = C.coin; ctx.fill();
      ctx.strokeStyle = C.coinEdge; ctx.lineWidth = 4; ctx.stroke();
      txt(ctx, '¥', x, y + 2, 28, C.coinInk, 800);
    }
    ctx.restore();
    const wp = easeOutCubic(seg(t, 3.2, 3.8));
    ctx.save(); ctx.globalAlpha = wp;
    const wx = 250, wy = 1130;
    shadow(ctx, 26, 10); box(ctx, wx - 110, wy - 70, 220, 140, 30, C.orange); noShadow(ctx);
    box(ctx, wx - 110, wy - 70, 220, 46, 26, C.headFrom);
    ctx.beginPath(); ctx.arc(wx + 40, wy + 12, 20, 0, 7); ctx.fillStyle = C.walletDot; ctx.fill();
    ctx.restore();
  }
}

/* =========================== 场景 5 · 重疾险 =========================== */
function scene5(ctx, t, dur) {
  const c = SCN(4);
  bgBase(ctx, t, CL(c.accent));
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), seg(t, 0.05, 0.5));

  const vp = seg(t, 0.6, 1.2);
  if (vp > 0) {
    const e = easeOutCubic(vp);
    const val = Math.round(easeOutCubic(clamp01((t - 0.6) / 1.8)) * c.value.number);
    ctx.save(); ctx.globalAlpha = e;
    ctx.translate(540, 545); ctx.scale(0.9 + 0.1 * e, 0.9 + 0.1 * e);
    shadow(ctx, 40, 18); box(ctx, -280, -105, 560, 210, 44, C.card); noShadow(ctx);
    txt(ctx, c.value.label, 0, -50, 34, C.ink2, 700);
    txt(ctx, val + ' ' + c.value.unit, 0, 20, 90, CL(c.value.color), 800);
    txt(ctx, c.value.note, 0, 82, 30, CL(c.value.noteColor), 700);
    ctx.restore(); ctx.restore();
  }

  const ap = easeOutCubic(seg(t, 1.1, 2.0));
  if (ap > 0) drawAsset(ctx, c.asset, 700, 950, 520, { alpha: ap, rise: (1 - ap) * 36 });

  const tags = c.tags;
  ctx.save();
  tags.forEach(tg => {
    const label = tg[0], t0 = tg[1], y = tg[2];
    const p = seg(t, t0, t0 + 1.0); if (p <= 0) return;
    const e = easeOutCubic(p);
    const x = lerp(110, 250, e);
    const wid = width(ctx, label, 32, 700) + 62;
    ctx.save(); ctx.globalAlpha = e;
    shadow(ctx, 20, 8); box(ctx, x - wid / 2, y - 42, wid, 84, 42, C.card); noShadow(ctx);
    txt(ctx, label, x, y + 2, 32, CL(c.accent), 700);
    ctx.restore();
  });
  ctx.restore();

  const xp = seg(t, 7.4, 8.0);
  if (xp > 0) {
    const shake = Math.sin(t * 30) * (1 - clamp01(xp)) * 10;
    ctx.save(); ctx.globalAlpha = clamp01(xp);
    ctx.translate(250 + shake, 1146); ctx.rotate(-0.06);
    shadow(ctx, 24, 10); box(ctx, -150, -52, 300, 104, 40, C.soft); noShadow(ctx);
    ctx.strokeStyle = C.red; ctx.lineWidth = 4; rr(ctx, -150, -52, 300, 104, 40); ctx.stroke();
    txt(ctx, c.warn, 0, 2, 40, C.red, 800);
    const cp2 = easeOutCubic(clamp01((xp - 0.35) / 0.5));
    if (cp2 > 0) line(ctx, -140 * cp2, 0, 140 * cp2, 0, C.red, 12);
    ctx.restore();
  }
}

/* =========================== 场景 6 · 三个坑 =========================== */
function scene6(ctx, t, dur) {
  const c = SCN(5);
  bgBase(ctx, t, CL(c.accent));
  txt(ctx, c.title, W / 2, 420, 72, C.ink, 800);
  const cards = c.items;
  cards.forEach((cd, i) => {
    const label = cd[0], t0 = cd[1];
    const p = seg(t, t0, t0 + 0.6); if (p <= 0) return;
    const e = easeOutBack(p);
    const y = 640 + i * 280, w = 850, h = 236;
    const shake = Math.sin(t * 26) * (1 - clamp01(p)) * 14;
    ctx.save();
    ctx.globalAlpha = clamp01(p * 1.6);
    ctx.translate(540 + shake, y); ctx.scale(clamp(e, 0.05, 1.2), 1);
    shadow(ctx, 34, 14); box(ctx, -w / 2, -h / 2, w, h, 42, C.card); noShadow(ctx);
    box(ctx, -w / 2, -h / 2, 18, h, 9, C.red);
    ctx.beginPath(); ctx.arc(-w / 2 + 118, 0, 58, 0, 7); ctx.fillStyle = C.soft; ctx.fill();
    crossMark(ctx, -w / 2 + 118, 0, 28, C.red, 12);
    txt(ctx, label, -w / 2 + 210, 4, 46, C.ink, 700, 'left');
    ctx.restore();
  });
}

/* =========================== 场景 7 · 教育金 =========================== */
function scene7(ctx, t, dur) {
  const c = SCN(6);
  bgBase(ctx, t, CL(c.accent));
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), seg(t, 0.05, 0.5));

  const p = easeOutCubic(seg(t, 0.3, 1.1));
  if (p > 0) drawAsset(ctx, c.asset, 540, 950, 620, { alpha: p, rise: (1 - p) * 50 });

  for (let i = 0; i < 3; i++) {
    const q = clamp01((t - 1.0 - i * 0.55) / 0.7); if (q <= 0) continue;
    const y = lerp(600, 792, easeInOutCubic(q));
    const cx2 = 540 + Math.sin(q * 6 + i) * 10;
    ctx.save(); ctx.globalAlpha = clamp01(q * 4);
    ctx.beginPath(); ctx.arc(cx2, y, 30, 0, 7); ctx.fillStyle = C.coin; ctx.fill();
    ctx.strokeStyle = C.coinEdge; ctx.lineWidth = 5; ctx.stroke();
    txt(ctx, '¥', cx2, y + 2, 30, C.coinInk, 800);
    ctx.restore();
  }

  const tp = easeOutCubic(seg(t, 3.4, 4.0));
  if (tp > 0) {
    const label = c.note;
    const wid = width(ctx, label, 34, 700) + 70;
    ctx.save(); ctx.globalAlpha = tp;
    shadow(ctx, 22, 9); box(ctx, 770 - wid / 2, 300, wid, 92, 46, C.card); noShadow(ctx);
    txt(ctx, label, 770, 347, 34, CL(c.accent), 700);
    ctx.restore();
  }
}

/* =========================== 场景 8 · 总结 =========================== */
function scene8(ctx, t, dur) {
  const c = SCN(7);
  bgBase(ctx, t, CL(c.accent));
  txt(ctx, c.title, W / 2, 400, 72, C.ink, 800);
  txt(ctx, c.sub, W / 2, 492, 40, C.ink2, 600);

  const steps = c.steps.map(s => [s[0], CL(s[1]), s[2]]);
  const bw = 132, gap = 58, totalW = steps.length * bw + (steps.length - 1) * gap;
  const x0 = (W - totalW) / 2, baseY = 1140;
  steps.forEach((st, i) => {
    const label = st[0], col = st[1], hgt = st[2];
    const t0 = 0.7 + i * 0.72;
    const p = easeOutCubic(seg(t, t0, t0 + 0.55));
    if (p <= 0) return;
    const h = hgt * p, x = x0 + i * (bw + gap);
    ctx.save(); ctx.globalAlpha = clamp01(p * 1.5);
    shadow(ctx, 22, 10);
    const g = ctx.createLinearGradient(0, baseY - h, 0, baseY);
    g.addColorStop(0, col); g.addColorStop(1, C.seal);
    box(ctx, x, baseY - h, bw, h, 26, i === 4 ? C.dash : g);
    noShadow(ctx);
    if (i === 4) {
      ctx.save(); ctx.setLineDash([12, 10]);
      ctx.strokeStyle = C.purple; ctx.lineWidth = 5; rr(ctx, x, baseY - h, bw, h, 26); ctx.stroke(); ctx.restore();
    }
    checkMark(ctx, x + bw / 2, baseY - h + 48, 24, i === 4 ? C.purple : C.onAccent, 9);
    txt(ctx, label, x + bw / 2, baseY + 58, 34, i === 4 ? C.purple : C.ink, 700);
    ctx.restore();
  });

  const lp = easeOutCubic(seg(t, 4.4, 5.0));
  if (lp > 0) {
    ctx.save(); ctx.globalAlpha = lp;
    let last = 0;
    steps.forEach((st, i) => {
      const hgt = st[2];
      const x = x0 + i * (bw + gap) + bw / 2;
      if (last) {
        const p = clamp01((t - 4.4 - i * 0.16) / 0.35);
        if (p > 0) line(ctx, last, baseY - hgt - 40, lerp(last, x, easeOutCubic(p)), baseY - hgt - 40, 'rgba(255,138,61,0.85)', 8);
      }
      last = x;
    });
    txt(ctx, c.chain, W / 2, 1282, 36, CL(c.accent), 700);
    ctx.restore();
  }
}

/* =========================== 场景 9 · 结尾 =========================== */
function scene9(ctx, t, dur) {
  const c = SCN(8);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.outroBg1); g.addColorStop(0.55, C.outroBg2); g.addColorStop(1, C.outroBg3);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  softCircle(ctx, 540, 700, 330, C.outroGlow, 0.40 * C.glow);

  txt(ctx, c.title, W / 2, 380, 76, C.ink, 800);
  txt(ctx, c.sub, W / 2, 480, 56, CL(c.accent), 800);

  const ap = easeOutCubic(seg(t, 0.4, 1.4));
  if (ap > 0) drawAsset(ctx, c.asset, 540, 900, 500, { alpha: ap, rise: (1 - ap) * 40 });

  const cp = easeOutBack(seg(t, 1.2, 1.9));
  if (cp > 0) {
    const label = c.cta;
    const wid = width(ctx, label, 42, 700) + 96;
    ctx.save(); ctx.globalAlpha = clamp01(cp);
    ctx.translate(540, 1214); ctx.scale(clamp(cp, 0.5, 1.15), clamp(cp, 0.5, 1.15)); ctx.translate(-540, -1214);
    shadow(ctx, 30, 12); box(ctx, 540 - wid / 2, 1160, wid, 108, 54, C.orange); noShadow(ctx);
    txt(ctx, label, 540, 1216, 42, C.onAccent, 800);
    ctx.restore();
  }

  const dp = seg(t, dur - 2.6, dur - 1.9);
  if (dp > 0) {
    ctx.save(); ctx.globalAlpha = dp * 0.85;
    txt(ctx, D.meta.disclaimer, W / 2, 1800, 28, C.ink2, 600);
    ctx.restore();
  }
}

/* ---------- HUD / 字幕 ---------- */
function drawHud(ctx, t) {
  const p = clamp01(t / TOTAL);
  box(ctx, 70, 92, 940, 12, 6, C.hudTrack);
  const g = ctx.createLinearGradient(70, 0, 1010, 0);
  g.addColorStop(0, C.orange); g.addColorStop(1, C.coral);
  box(ctx, 70, 92, Math.max(12, 940 * p), 12, 6, g);
  const label = D.meta.brand;
  const wid = width(ctx, label, 32, 600) + 78;
  ctx.save(); ctx.globalAlpha = 0.95;
  box(ctx, 70, 146, wid, 72, 36, C.hudChip);
  ctx.beginPath(); ctx.arc(70 + 38, 182, 12, 0, 7); ctx.fillStyle = C.orange; ctx.fill();
  txt(ctx, label, 70 + 64, 184, 32, C.ink2, 600, 'left');
  ctx.restore();
}
function drawSubtitle(ctx, sub) {
  if (!sub || sub.a <= 0.01) return;
  ctx.save(); ctx.globalAlpha = sub.a;
  const size = 52, maxW = 880;
  let lines = [sub.text];
  let wMax = width(ctx, sub.text, size, 600);
  if (wMax > maxW) {
    const mid = Math.ceil(sub.text.length / 2);
    lines = [sub.text.slice(0, mid), sub.text.slice(mid)];
    wMax = Math.max(width(ctx, lines[0], size, 600), width(ctx, lines[1], size, 600));
  }
  const lh = 76, padX = 52, padY = 34;
  const bwid = wMax + padX * 2, bh = lines.length * lh + padY * 2 - 14;
  const bx = W / 2 - bwid / 2, by = 1545 - bh;
  shadow(ctx, 30, 12, C.subShadow);
  box(ctx, bx, by, bwid, bh, 44, C.subBg); noShadow(ctx);
  lines.forEach((l, i) => txt(ctx, l, W / 2, by + padY + lh / 2 + i * lh - 7, size, C.subInk, 600));
  ctx.restore();
}

/* ---------- 渲染入口 ---------- */
const TPL = { hook: scene1, step: scene2, chips: scene3, split: scene4,
              bigNumber: scene5, pitfalls: scene6, coins: scene7, funnel: scene8, outro: scene9 };
const sceneFn = i => TPL[SCN(i).tpl] || scene1;
const TRANS = 0.45;

const main = document.getElementById('c');
const mctx = main.getContext('2d');
const oa = document.createElement('canvas'); oa.width = W; oa.height = H;
const ob = document.createElement('canvas'); ob.width = W; ob.height = H;
const actx = oa.getContext('2d'), bctx = ob.getContext('2d');

function sceneIndexAt(t) {
  let i = TIMELINE.length - 1;
  for (let k = 0; k < TIMELINE.length; k++) if (t >= TIMELINE[k].start) i = k;
  return i;
}
function drawSceneInto(ctx, i, t) {
  const sc = TIMELINE[i];
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  sceneFn(i)(ctx, Math.max(0, t - sc.start), sc.dur);
  ctx.restore();
}
function renderFrame(t) {
  const i = sceneIndexAt(t);
  const half = TRANS / 2;
  let blended = false;
  if (i > 0 && t >= TIMELINE[i].start - half && t < TIMELINE[i].start + half) {
    const p = (t - (TIMELINE[i].start - half)) / TRANS;
    drawSceneInto(actx, i - 1, t);
    drawSceneInto(bctx, i, t);
    mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.globalAlpha = 1; mctx.drawImage(oa, 0, 0);
    mctx.globalAlpha = easeInOutCubic(p); mctx.drawImage(ob, 0, 0);
    mctx.restore();
    blended = true;
  }
  if (!blended) {
    mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0);
    sceneFn(i)(mctx, Math.max(0, t - TIMELINE[i].start), TIMELINE[i].dur);
    mctx.restore();
  }
  mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0);
  drawHud(mctx, t);
  drawSubtitle(mctx, activeSub(i, Math.max(0, t - TIMELINE[i].start)));
  mctx.restore();
}
window.renderFrame = renderFrame;
window.META = { W: W, H: H, FPS: FPS, TOTAL: TOTAL, frames: Math.round(TOTAL * FPS) };
