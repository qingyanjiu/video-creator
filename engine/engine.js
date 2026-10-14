/* =========================================================================
   儿童保险科普视频 - canvas 分镜动画  (1080x1920 @30fps)
   人物插画来自 unDraw (MIT)，已按各分镜主色重新上色
   由 window.renderFrame(t) 逐帧驱动
   ========================================================================= */
const W = 1080, H = 1920;
const FLASH_DEF = 0.11;   // 进镜撞击闪光时长（秒）的默认值；实际值取 meta.pace.flash，见 drawFlash
const GS = 4;         // 颗粒瓦片放大倍数（1 = 逐像素细噪点）。见 drawGrain
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
  /* 氛围层：vignette 是"中心透明、边缘渐到此色"的径向渐变；grain 0 = 关闭。
     内圈半径 640 是量出来的：字幕带（y≈1345–1545）离中心最近只有约 385，落在全透明区，
     不会被压暗；HUD（y≈92–218）离中心约 805，只吃到三成浓度。 */
  vignette: 'rgba(120,88,58,0.20)', grain: 0.05,
  glow: 1,
  /* 背景图层：gridInk 开点阵网格 + 同心圆脉冲，scanInk 开扫描线 + 数据流。
     两者默认全透明 —— alphaOf() 返回 0 就直接 return，warm/dark 上是零成本的 no-op。 */
  gridInk: 'rgba(0,0,0,0)', scanInk: 'rgba(0,0,0,0)',
  fontNum: FONT
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

/* ---------- 缓动库 ----------
   原来只有上面三条，且全是「快进慢出」——那是「落位」的曲线，不是「撞击」的曲线。
   小元素要的是急停（expo/quint），带弹性的元素要的是真回弹，蓄力才用 easeIn*。
   全部是无状态纯函数：转场一帧内场景函数被调用两次，纯函数不会因此错位。 */
const easeOutQuart = p => 1 - Math.pow(1 - p, 4);
const easeOutQuint = p => 1 - Math.pow(1 - p, 5);
const easeOutExpo  = p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
const easeInCubic  = p => p * p * p;
const easeInQuart  = p => p * p * p * p;
const easeInOutQuint = p => p < .5 ? 16 * p * p * p * p * p : 1 - Math.pow(-2 * p + 2, 5) / 2;
const easeInBack   = p => { const c1 = 1.70158; return (c1 + 1) * p * p * p - c1 * p * p; };
const easeOutElastic = p => p === 0 ? 0 : p === 1 ? 1
  : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
const easeOutBounce = p => {
  const n1 = 7.5625, d1 = 2.75;
  if (p < 1 / d1) return n1 * p * p;
  if (p < 2 / d1) { p -= 1.5 / d1; return n1 * p * p + 0.75; }
  if (p < 2.5 / d1) { p -= 2.25 / d1; return n1 * p * p + 0.9375; }
  p -= 2.625 / d1; return n1 * p * p + 0.984375;
};

/* ---------- 字幕几何 ----------
   字幕气泡的尺寸与位置只在这里定义；scene1 的弹窗避让带由 SUB_AVOID 自动
   推出来，不要再写死数字——以前两处各写一份，改一处必然让另一半失配。 */
const SUB = { size: 52, maxW: 880, maxChars: 17, maxLines: 2,
              lineH: 76, padX: 52, padY: 34, radius: 44, bottom: 1545, fade: 0.16 };
/* 两行字幕时气泡的最高顶边（subtract 的是 drawSubtitle 里同一个 bh 公式） */
const SUB_TOP = SUB.bottom - (SUB.maxLines * SUB.lineH + SUB.padY * 2 - 14);
/* 弹窗雨要避开的纵向带：上沿再留 9px、下沿再留 35px，feather 是淡出宽度 */
const SUB_AVOID = { top: SUB_TOP - 9, bot: SUB.bottom + 35, feather: 110 };

/* ---------- 节奏 ----------
   每镜留白与转场时长由 content.json 的 meta.pace 决定，build_content.py 写进
   src/timeline.js 的 window.PACE。用 window 属性而不是 const，免得和那边重复声明。
   这里保留默认值，是为了 timeline.js 没重新生成时不至于整个渲染挂掉。 */
const PACE = window.PACE || { lead: 0.30, tail: 0.36, lastTail: 1.20, transition: 0.45 };

/* ---------- 节拍：动画挂在配音上，而不是挂在写死的秒数上 ----------
   场景时长 dur = LEAD + 本镜配音实测时长 + TAIL，是内容驱动的变量；
   所以关键帧一律用"解说进行到几成"来表达，由 beats()/bs() 换算成秒。 */
function beats(i) {
  const sc = TIMELINE[i] || {};
  const lead = Math.max(0, (sc.speechStart || 0) - (sc.start || 0));   // 解说前的留白，通常 0.30
  const sd = sc.speechDur || Math.max(1, (sc.dur || 3) - 0.66);        // 本镜配音实测时长
  const dur = sc.dur || (lead + sd + 0.36);
  const tail = Math.max(0, dur - lead - sd);   // 配音后的余量（末镜是 lastTail）
  return { lead: lead, sd: sd, dur: dur, tail: tail };
}
/* 解说进行到 f(0..1) 处的场景内秒数。
   传 len（入场动画时长）时会封顶到"场景结束前 len+0.06 秒"，
   保证动画播得完——TAIL 只有 0.36s，钉在 f=1 的动画否则会被切在半途。 */
function bs(i, f, len) {
  const b = beats(i);
  const a = b.lead + b.sd * clamp01(f);
  return len ? Math.min(a, b.dur - len - 0.06) : a;
}
/* 出场进度：第 i 镜解说进行到 f 处开始、历时 len 秒 */
function bseg(t, i, f, len) { const a = bs(i, f, len); return seg(t, a, a + len); }
/* lead-in 进度：在解说开始之前就落位（徽标、大标题） */
function lseg(t, i, len) { const b = beats(i); return seg(t, Math.max(0, b.lead - len), b.lead + 0.06); }

/* ---------- 元素重量 → 入场时长 ----------
   以前 9 个场景的入场时长全挤在 0.55–0.90s：8px 的小胶囊和 880px 的主插画
   用时几乎一样，看不出主次，这是「不够酷炫」的最大来源。按视觉重量分四档。

   与 bs() 封顶的关系（重要）：封顶条件是 len > lead + sd·f 之后的剩余量，
   代入 tail=0.36 等价于 len > 0.30 + sd·(1−f)。封顶会把起点前移到
   dur−len−0.06，元素于是比解说拍点更早出现 =「抢拍」。
   所以 heavy(0.90) 只能用在 lseg lead-in 或 f ≤ 0.4 的早段元素；
   f ≥ 0.6 的尾部元素最多用 mid，否则短镜（sd≈2.3）里必然抢拍。 */
const WEIGHT = {
  micro: { len: 0.26, ease: easeOutBack },    // 小胶囊、标签、小色块
  small: { len: 0.42, ease: easeOutQuart },   // 条幅、note、连接线、金币
  mid:   { len: 0.60, ease: easeOutQuint },   // 卡片、面板、费用条
  heavy: { len: 0.90, ease: easeOutExpo }     // 大标题、主插画、funnel 柱
};
/* 统一入场进度：语义与原来的 easeOutCubic(bseg(t,i,f,0.60)) 相同
   ——「解说进行到 f 处开始」，只是时长与曲线按重量集中在这里。 */
function enter(t, i, f, w) {
  const P = WEIGHT[w] || WEIGHT.mid;
  const raw = bseg(t, i, f, P.len);
  return energyOf(i) === 'low' ? easeOutCubic(raw) : P.ease(raw);
}
/* 镜头的节奏强度。不填 = high，老内容一行都不用改。
   low 是给「过渡镜」用的：不撞击、不横抖、入场曲线也换成最平的 easeOutCubic。
   动效的价值全在对比——全片都 high，等于全片都没有重音。 */
function energyOf(i) { return SCN(i).energy === 'low' ? 'low' : 'high'; }

/* ---------- 收场钟 ----------
   锚在「本镜结束」而不是解说拍点：它不经过 bs()，所以永不参与封顶，
   加它不会挪动任何入场拍点。收在 dur−0.06，给转场留出交叠 */
function egress(t, i, len) { const b = beats(i); return seg(t, b.dur - len - 0.06, b.dur - 0.06); }
/* 离场窗口的长度（秒）。原来只有 `clamp(dur*0.18, 0.35, 0.80)` 这一半，
   于是窗口常有 0.55–0.80s，比默认 tail（0.36s）还长——离场必然啃进解说里：
   实测四镜分别在解说念完**前** 0.20 / 0.25 / 0.33 / 0.27 秒就开始撤场。
   更要命的是几个"点睛"元素的拍点排在解说 76%–85% 处、落位动画自己还要 0.55–0.60s，
   正好撞上撤场：大数字镜的红杠划到一半、funnel 的连接线刚连上，画面已经在滑走了。
   所以再钉一条上限——窗口不许超过 tail 的 45%，至少留一半 tail 把话说完、把元素看稳。 */
function exitLen(i) {
  const b = beats(i);
  return Math.min(clamp(b.dur * 0.18, 0.35, 0.80), Math.max(0.30, b.tail * 0.45));
}

/* 把一镜的内容整体包进离场：横向推出 + 淡出。
   横向位移不碰安全区（离场时底下始终垫着上一镜的 oa，不会露出 #111）。
   注意调用点必须排除 bgBase——背景一旦淡出，转场前半帧会露出画布底色。 */
function withExit(ctx, t, i, len, body) {
  const x = egress(t, i, len);
  ctx.save();
  if (x > 0) { ctx.globalAlpha = 1 - x; ctx.translate(-x * 120, 0); }
  body();
  ctx.restore();
}

/* ---------- 存活期微动 ----------
   T / SI 是"当前正在绘制的场景局部时间 / 镜号"，由 drawSceneInto / renderFrame
   在调用场景函数前写入，供 drawAsset() 这类道具层读取。
   相位一律由镜号派生，不用全局自增计数器——转场一帧内场景函数会被调用两次，
   计数器会错位。 */
let T = 0, SI = 0;

/* 场景级摄影机漂移。幅度被安全区余量锁死：
   最贴边的 stepBadge 顶边 y=250，全幅漂移下到 241，距安全区上界 230 还有 11px。
   调大这里之前先重算那个余量。 */
function sceneCam(ctx, i, t) {
  const ph = i * 1.9;
  ctx.translate(Math.sin(t * 0.21 + ph) * 5, Math.cos(t * 0.17 + ph) * 6);
  const s = 1 + Math.sin(t * 0.13 + ph) * 0.004;
  ctx.translate(540, 960); ctx.scale(s, s); ctx.translate(-540, -960);
  /* 入场撞击：进入本镜的头 0.14s 横抖一次。横向位移不碰上下安全区，
     幅度 10px 也远小于 bgBase 的 24px overscan，不会露出画布底色。
     过渡镜跳过这一下——漂移留着（它是全片统一的呼吸），撞击不参与。 */
  const j = energyOf(i) === 'low' ? 0 : clamp01(1 - t / 0.14);
  if (j > 0) ctx.translate(Math.sin(t * 55) * 10 * j, 0);
}

/* 落位呼吸：入场动画播完之后叠加一个极缓缩放（幅度 a，默认 1.2%），
   让"已落位"的元素继续呼吸，而不是冻住。 */
function settle(t, i, f, len, a) {
  const w = t - (bs(i, f, len) + len);
  return w <= 0 ? 1 : 1 + Math.sin(w * 1.15 + i * 2.1) * (a === undefined ? 0.012 : a);
}

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
/* 发光：先带 shadowBlur 画一遍当光晕，再平涂一遍把主体压实——只画一遍的话
   主体会被光晕糊掉。shadowBlur 是全案唯一被点名很贵的调用，实测在它服务的那几处
   （大数字 / CTA 胶囊 / 序号圆）是 0.14–0.45ms，可以承受；但别往全屏元素上套。
   C.glow ≤ 1.05 时直接平涂，warm 皮肤零成本。 */
function glowWrap(ctx, color, fn) {
  if (!(C.glow > 1.05)) { fn(); return; }
  ctx.save();
  ctx.shadowColor = color || C.outroGlow;
  ctx.shadowBlur = 20 * C.glow;
  ctx.shadowOffsetY = 0;
  fn();
  ctx.restore();
  ctx.save(); noShadow(ctx); fn(); ctx.restore();
}
function txt(ctx, s, x, y, size, color, weight, align) {
  ctx.save();
  ctx.font = (weight || 700) + ' ' + size + 'px ' + FONT;
  ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y); ctx.restore();
}
/* 数字专用字体。warm/dark 的 fontNum 就是 FONT，所以这两个皮肤逐像素不变；
   tech 把它换成等宽栈，数字对齐更硬、更像仪表盘。 */
function numTxt(ctx, s, x, y, size, color, weight, align) {
  ctx.save();
  ctx.font = (weight || 700) + ' ' + size + 'px ' + C.fontNum;
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
/* 打叉。p 是 0..1 的画出进度，两道笔画依次来（先 \ 再 /），用来做"划掉"的动效；
   不传 p 就是一次画完（scene6 的坑卡片用这个）。p<0.45 时只有第一道，之后第二道追上来。 */
function crossMark(ctx, x, y, r, color, lw, p) {
  const pp = p === undefined ? 1 : clamp01(p);
  const a1 = clamp01(pp / 0.55), a2 = clamp01((pp - 0.45) / 0.55);
  if (a1 <= 0 && a2 <= 0) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  if (a1 > 0) {
    ctx.beginPath(); ctx.moveTo(x - r, y - r);
    ctx.lineTo(x - r + 2 * r * a1, y - r + 2 * r * a1); ctx.stroke();
  }
  if (a2 > 0) {
    ctx.beginPath(); ctx.moveTo(x + r, y - r);
    ctx.lineTo(x + r - 2 * r * a2, y - r + 2 * r * a2); ctx.stroke();
  }
  ctx.restore();
}

/* ---------- 插画素材 ---------- */
const ASSET_SRC = {};
D.assets.forEach(a => { ASSET_SRC[a.name] = (D.meta.assetBase || 'assets/') + a.file; });
const ASSETS = {};
let pendingAssets = Object.keys(ASSET_SRC).length;
/* 素材数为 0 时下面的 forEach 一次都不执行，没人来置 true——页面永远不就绪，
   render_frames.js 的 waitForFunction 会干等 60 秒然后抛错。所以初始值必须直接
   反映"有没有活要等"：零素材 = 立刻就绪。这是无插画路线的头号阻断项。 */
window.__assetsReady = (pendingAssets === 0);
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
  ctx.globalAlpha *= (o.alpha === undefined ? 1 : clamp01(o.alpha));   // 乘：与外层 withExit 叠加
  if (o.pop && o.pop !== 1) {
    ctx.translate(cx, cy); ctx.scale(o.pop, o.pop); ctx.translate(-cx, -cy);
  }
  const fl = Math.sin(T * 1.745 + SI * 1.3) * 4;   // ±4px 的缓慢浮动，远小于安全区余量
  ctx.drawImage(im, cx - w / 2, cy - h / 2 + (o.rise || 0) + fl, w, h);
  ctx.restore();
  return h;
}

/* ---------- 无插画几何母题 ----------
   版式可以完全不放插画：用引擎已有的 rr/box/line/softCircle 现画几何母题，
   不新增素材文件。统一签名 (ctx, cx, cy, w, p, accent)——cx/cy/w 与插画分支
   共用同一包络（高按 0.72w，和 assetH 的兜底一致），p 也共用同一个入场进度，
   所以选不选插画不会挪动任何拍点、也不改变安全区分析。
   配色只用 CL(accent) + C.ink2 + C.card：这三者在 warm / dark / tech 上都够对比度。

   两条绘制纪律，破了会出很难查的错：
   1) alpha 一律用「基准值 × 系数」赋值，别裸写 ctx.globalAlpha = v。母题都画在
      withExit 里面，裸写会把离场淡出整个踩掉（离场那半秒画面还是实的）。
   2) 别把 alpha 传给 box()。box 内部是 ctx.globalAlpha = alpha（绝对值），同样会踩掉外层。

   一律平涂，禁用 shadowBlur：母题动辄 600px 宽，套光晕会成为全片最贵的一笔
   （shadowBlur 是全案唯一被点名很贵的调用，实测只在 0.14–0.45ms 的小目标上可承受）。

   gbox() 把这层包络报给 scripts/layout_probe.js。**没有它，无插画版式的越界
   永远是假绿**——probe 只认 drawImage，几何母题一次 drawImage 都不发。 */
function gbox(x, y, w, h, tag, a) {
  if (window.__geomBox) window.__geomBox(x, y, w, h, tag, a === undefined ? 1 : a);
}

/* 同心圈由内向外扩散。hook / outro */
function ringStack(ctx, cx, cy, w, p, accent) {
  const A0 = ctx.globalAlpha, R = w * 0.36, N = 4;
  const inA = clamp01(p * 3);
  gbox(cx - R, cy - R, R * 2, R * 2, 'ringStack', A0 * inA);
  ctx.save();
  for (let k = 0; k < N; k++) {
    const ph = (p * 1.5 + k / N) % 1;
    ctx.globalAlpha = A0 * inA * (1 - ph) * 0.9;
    ctx.strokeStyle = k === 0 ? accent : C.ink2;
    ctx.lineWidth = 3 + k * 0.6;
    ctx.beginPath(); ctx.arc(cx, cy, R * (0.16 + ph * 0.84), 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = A0 * inA;
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.18 * clamp01(p * 2.2), 0, 7); ctx.fill();
  ctx.restore();
}

/* 竖直堆叠的圆角方块，从上往下逐个点亮。step */
function blockStack(ctx, cx, cy, w, p, accent) {
  const A0 = ctx.globalAlpha, N = 4;
  const BH = w * 0.12, GAP = w * 0.06, BW = w * 0.62;
  const totalH = N * BH + (N - 1) * GAP;            // 0.66w，留在 0.72w 包络内
  gbox(cx - BW / 2, cy - totalH / 2, BW, totalH, 'blockStack', A0);
  ctx.save();
  for (let k = 0; k < N; k++) {
    const y = cy - totalH / 2 + k * (BH + GAP);
    const lit = clamp01((p - k * 0.13) / 0.34);
    ctx.globalAlpha = A0;
    box(ctx, cx - BW / 2, y, BW, BH, BH * 0.32, C.card);
    ctx.globalAlpha = A0 * 0.5 * (1 - lit);
    rr(ctx, cx - BW / 2, y, BW, BH, BH * 0.32);
    ctx.strokeStyle = C.ink2; ctx.lineWidth = 2; ctx.stroke();
    if (lit > 0) {                                   // 亮条横向生长，而不是整块跳出来
      ctx.globalAlpha = A0 * lit;
      box(ctx, cx - BW / 2 + BW * 0.03, y + BH * 0.12, (BW - BW * 0.06) * lit, BH * 0.76,
          BH * 0.22, accent);
    }
  }
  ctx.restore();
}

/* 并列两枚开关，右边那枚滑块推过去。chips */
function togglePair(ctx, cx, cy, w, p, accent) {
  const A0 = ctx.globalAlpha;
  const TW = w * 0.33, TH = w * 0.145, GAP = w * 0.05;
  const totalW = TW * 2 + GAP, kr = TH * 0.38, pad = TH * 0.10;
  gbox(cx - totalW / 2, cy - TH / 2, totalW, TH, 'togglePair', A0);
  ctx.save();
  for (let k = 0; k < 2; k++) {
    const x = cx - totalW / 2 + k * (TW + GAP);
    const on = k === 1;
    const e = clamp01((p - (on ? 0.32 : 0)) / 0.40);
    /* 关闭态的轨道不能用 C.card：dark 的 card 是 rgba(26,37,58,.92)，和底色
       #0B1220 几乎同值，整枚开关会退化成"一个悬空的灰点"。改用 ink2 打底
       （在深浅两种底上都是中灰），滑块用 ink 压满，两态就都立得住了。 */
    ctx.globalAlpha = A0 * (on ? 1 : 0.30);
    box(ctx, x, cy - TH / 2, TW, TH, TH / 2, on ? accent : C.ink2);
    ctx.globalAlpha = A0 * 0.55 * (1 - e * 0.6);
    rr(ctx, x, cy - TH / 2, TW, TH, TH / 2);
    ctx.strokeStyle = C.ink2; ctx.lineWidth = 2.5; ctx.stroke();
    const kx = x + pad + kr + (on ? e * (TW - 2 * (pad + kr)) : 0);
    ctx.globalAlpha = A0 * (0.35 + 0.65 * e);
    ctx.fillStyle = on ? C.onAccent : C.ink;
    ctx.beginPath(); ctx.arc(kx, cy, kr, 0, 7); ctx.fill();
  }
  ctx.restore();
}

/* 圆盘按比例劈成两色扇形。split */
function halfDisc(ctx, cx, cy, w, p, accent) {
  const A0 = ctx.globalAlpha, R = w * 0.36;
  const a = A0 * clamp01(p * 2.5);
  gbox(cx - R, cy - R, R * 2, R * 2, 'halfDisc', a);
  const frac = clamp01(0.25 + p * 0.35);             // 左段占比：1/4 → 3/5
  const s = -Math.PI / 2;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, 0, 7); ctx.closePath();
  ctx.fillStyle = C.card; ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, s, s + Math.PI * 2 * frac); ctx.closePath();
  ctx.fillStyle = accent; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.strokeStyle = C.ink2; ctx.lineWidth = 3; ctx.stroke();
  ctx.globalAlpha = a * 0.9;                         // 中心留个孔，读起来像筹码而不是饼图
  ctx.fillStyle = C.card;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.17, 0, 7); ctx.fill();
  ctx.restore();
}

/* 递增圆角柱 + 末柱顶上一点。bigNumber / coins */
function barRise(ctx, cx, cy, w, p, accent) {
  const A0 = ctx.globalAlpha, N = 5;
  const BW = w * 0.10, GAP = w * 0.04;
  const totalW = N * BW + (N - 1) * GAP, HMAX = w * 0.66;
  gbox(cx - totalW / 2, cy - HMAX / 2, totalW, HMAX, 'barRise', A0);
  const base = cy + HMAX / 2;
  ctx.save();
  for (let k = 0; k < N; k++) {
    const hFull = HMAX * (0.28 + 0.72 * k / (N - 1));
    const h = hFull * clamp01((p - k * 0.08) / 0.42);
    ctx.globalAlpha = A0 * 0.9;
    box(ctx, cx - totalW / 2 + k * (BW + GAP), base - h, BW, h, BW * 0.4,
        k === N - 1 ? accent : C.ink2);
  }
  const e = clamp01((p - 0.42) / 0.40);
  ctx.globalAlpha = A0 * e;
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(cx + totalW / 2 - BW / 2, base - HMAX + (1 - e) * 22, BW * 0.62, 0, 7);
  ctx.fill();
  ctx.restore();
}

/* ---------- 字幕 ---------- */
function splitLines(text) {
  const parts = text.split(/(?<=[，。；：！？、])/).filter(s => s.length);
  const out = []; let cur = '';
  for (const p of parts) {
    if ((cur + p).length <= SUB.maxChars) cur += p;
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
      const fi = clamp01((t - a.t0) / SUB.fade);
      const fo = k === arr.length - 1 ? 1 : clamp01((a.t1 - t) / SUB.fade);
      return { text: a.text, a: Math.min(fi, fo) };
    }
  }
  return null;
}

/* ---------- 背景图层 ----------
   由 gridInk / scanInk 两个 token 的 alpha 开关。全透明的 token 会让 alphaOf
   返回 0、函数直接 return——所以 warm/dark 上这几层是零成本的 no-op，
   既不画也不占时间。所有图层都由 t 推导，没有 Math.random。 */
function alphaOf(c) {
  if (typeof c !== 'string') return 0;
  const m = c.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
  return m ? parseFloat(m[1]) : 1;
}
function rgbOf(c) {
  const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
}
/* 点阵网格：整幅一次成路径、一次 fill，不做逐点 save/restore */
function bgDots(ctx, t) {
  if (!alphaOf(C.gridInk)) return;
  const S = 76, ox = Math.sin(t * 0.18) * 12, oy = Math.cos(t * 0.15) * 10;
  ctx.save(); ctx.fillStyle = C.gridInk; ctx.beginPath();
  for (let y = -24; y <= H + 24; y += S)
    for (let x = -24; x <= W + 24; x += S) ctx.rect(x + ox - 2, y + oy - 2, 4, 4);
  ctx.fill(); ctx.restore();
}
/* 扫描线 + 一条缓慢下移的亮带 */
function bgScan(ctx, t) {
  const a = alphaOf(C.scanInk); if (!a) return;
  const [r, g, b] = rgbOf(C.scanInk);
  ctx.save();
  ctx.fillStyle = C.scanInk; ctx.beginPath();
  for (let y = -24; y <= H + 24; y += 6) ctx.rect(-24, y, W + 48, 1);
  ctx.fill();
  const bh = 360, by = ((t * 130) % (H + bh * 2)) - bh;
  const grd = ctx.createLinearGradient(0, by, 0, by + bh);
  grd.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  grd.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ',' + (a * 2.4).toFixed(3) + ')');
  grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  ctx.fillStyle = grd; ctx.fillRect(-24, by, W + 48, bh);
  ctx.restore();
}
/* 同心圆脉冲：从中心一圈圈往外推、边推边淡 */
function bgRings(ctx, t) {
  const a = alphaOf(C.gridInk); if (!a) return;
  const N = 5, PERIOD = 4.6, R0 = 200, R1 = 1150;
  ctx.save(); ctx.strokeStyle = C.gridInk; ctx.lineWidth = 1.6;
  for (let k = 0; k < N; k++) {
    const ph = ((t / PERIOD) + k / N) % 1;
    ctx.globalAlpha = 1 - ph;                 // 与 token 自带的 alpha 相乘
    ctx.beginPath(); ctx.arc(540, 900, R0 + ph * (R1 - R0), 0, 7); ctx.stroke();
  }
  ctx.restore();
}
/* 数据流：一列列细竖条匀速下落，位置/速度/长度都由序号推导 */
function bgFlow(ctx, t) {
  const a = alphaOf(C.scanInk); if (!a) return;
  const [r, g, b] = rgbOf(C.scanInk);
  ctx.save(); ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',1)';
  for (let k = 0; k < 16; k++) {
    const sd = ((k * 2654435761) % 1000033) / 1000033;
    const x = 50 + sd * (W - 100);
    const speed = 110 + ((k * 7919) % 100) * 1.5;
    const len = 110 + ((k * 104729) % 170);
    const y = ((t * speed + k * 347) % (H + len * 2)) - len;
    ctx.globalAlpha = a * 0.55;               // 与 token 自带的 alpha 相乘
    ctx.fillRect(x, y, 3, len);
  }
  ctx.restore();
}

/* ---------- 背景 ---------- */
function bgBase(ctx, t, tint) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.bg); g.addColorStop(1, C.bg2);
  /* overscan 24px：摄影机漂移会把全屏底色推出画面，不留够就会露出 render.html 的 #111 */
  ctx.fillStyle = g; ctx.fillRect(-24, -24, W + 48, H + 48);
  const dx = Math.sin(t * 0.35) * 30, dy = Math.cos(t * 0.28) * 34;
  softCircle(ctx, 180 + dx, 380 + dy, 430, tint || C.orange, 0.13 * C.glow);
  softCircle(ctx, 930 - dx, 1180 - dy, 470, C.mint, 0.10 * C.glow);
  softCircle(ctx, 300 + dx * 0.6, 1560 + dy * 0.5, 420, C.blue, 0.09 * C.glow);
  bgDots(ctx, t); bgRings(ctx, t); bgScan(ctx, t); bgFlow(ctx, t);
}
function stepBadge(ctx, n, label, color, p) {
  const e = easeOutCubic(p);
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha *= e;                 // 用乘不用等，才能与外层 withExit 的离场淡出叠加
  const y = lerp(250, 296, e);
  const wBadge = 96 + width(ctx, label, 40, 700) + 34;
  shadow(ctx, 26, 10); box(ctx, 90, y, wBadge, 104, 34, C.card);
  noShadow(ctx);
  glowWrap(ctx, color, () => { ctx.beginPath(); ctx.arc(90 + 62, y + 52, 34, 0, 7); ctx.fillStyle = color; ctx.fill(); });
  txt(ctx, n, 90 + 62, y + 54, 40, C.onAccent, 800);
  txt(ctx, label, 90 + 96 + 17, y + 54, 40, C.ink, 700, 'left');
  ctx.restore();
}

/* =========================== 场景 1 · 钩子 =========================== */
function scene1(ctx, t, dur, i) {
  const c = SCN(i);
  bgBase(ctx, t, CL(c.accent));
  const XL = exitLen(i);
  withExit(ctx, t, i, XL, () => {
  const p = easeOutCubic(lseg(t, i, 0.50));
  txt(ctx, c.title, W / 2, lerp(430, 388, p), 78, C.ink, 800);
  ctx.save(); ctx.globalAlpha *= enter(t, i, 0.08, 'small');
  txt(ctx, c.sub, W / 2, 500, 60, CL(c.accent), 800); ctx.restore();

  const ap = enter(t, i, 0.05, 'heavy');
  if (ap > 0) {
    if (c.asset) drawAsset(ctx, c.asset, 540, 968, 880, { alpha: ap, rise: (1 - ap) * 46 });
    else ringStack(ctx, 540, 968, 880, ap, CL(c.accent));
  }

  ctx.save();
  c.popups.forEach((pu, k) => {
    const label = pu[0], col = CL(pu[1]), x0 = pu[2], spd = pu[3];
    const y = ((t * 300 * spd + k * 220) % (H + 520)) - 260;
    const x = clamp(x0 + Math.sin(t * 1.6 + k) * 22, 100, W - 100);
    const wChip = width(ctx, label, 36, 700) + 62;
    /* 进入字幕带淡出、离开再淡入：视觉上读作"从字幕后面穿过"，
       而不是被气泡切掉一半。带的上下沿用 SUB_AVOID，跟着字幕几何走。 */
    const inBand = clamp01((y - SUB_AVOID.top) / SUB_AVOID.feather)
                 * (1 - clamp01((y - SUB_AVOID.bot) / SUB_AVOID.feather));
    ctx.save(); ctx.globalAlpha *= 0.92 * clamp01(t / 0.4) * (1 - inBand);
    ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.1 + k * 2) * 0.09);
    shadow(ctx, 22, 9); box(ctx, -wChip / 2, -38, wChip, 76, 38, C.card); noShadow(ctx);
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    rr(ctx, -wChip / 2, -38, wChip, 76, 38); ctx.stroke();
    txt(ctx, label, 0, 2, 36, col, 700);
    ctx.restore();
  });
  ctx.restore();
  });
}

/* =========================== 场景 2 · 少儿医保 =========================== */
function scene2(ctx, t, dur, i) {
  const c = SCN(i);
  bgBase(ctx, t, CL(c.accent));
  const XL = exitLen(i);
  withExit(ctx, t, i, XL, () => {
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), lseg(t, i, 0.45));

  const hp = enter(t, i, 0.00, 'mid');
  if (hp > 0) {
    if (c.asset) drawAsset(ctx, c.asset, 540, 560, 390, { alpha: hp, rise: (1 - hp) * 30 });
    else blockStack(ctx, 540, 560, 390, hp, CL(c.accent));
  }

  const cp = enter(t, i, 0.16, 'mid');
  if (cp > 0) {
    const cy = lerp(1290, 940, cp), cw = 760, ch = 430;
    const br = settle(t, i, 0.16, WEIGHT.mid.len);   // 卡片落位后的呼吸
    ctx.save(); ctx.globalAlpha *= cp;
    ctx.translate(540, cy); ctx.scale(br, br); ctx.translate(-540, -cy);
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

    const numP = easeOutBack(bseg(t, i, 0.36, 0.60));
    ctx.save(); ctx.globalAlpha *= clamp01(numP);
    const sc = 0.7 + 0.3 * numP;
    ctx.translate(540 - cw / 2 + 52, cy + 34); ctx.scale(sc, sc);
    txt(ctx, c.card.value, 0, 0, 96, CL(c.accent), 800, 'left');
    txt(ctx, c.card.unit, width(ctx, c.card.value, 96, 800) + 16, 18, 40, C.ink, 700, 'left');
    ctx.restore();
    txt(ctx, c.card.note, 540 - cw / 2 + 52, cy + 128, 34, C.ink2, 600, 'left');

    const ck = bseg(t, i, 0.58, 0.55);
    if (ck > 0) {
      ctx.save(); ctx.globalAlpha *= clamp01(ck * 1.4);
      ctx.beginPath(); ctx.arc(540 + cw / 2 - 120, cy + 44, 66, 0, Math.PI * 2 * clamp01(ck * 1.6));
      ctx.strokeStyle = C.mint; ctx.lineWidth = 8; ctx.stroke();
      if (ck > 0.4) checkMark(ctx, 540 + cw / 2 - 120, cy + 48, 30 * easeOutBack(clamp01((ck - 0.4) / 0.5)), C.mint, 12);
      ctx.restore();
    }
    ctx.restore();
  }

  const bp = enter(t, i, 0.76, 'small');
  if (bp > 0) {
    const label = c.ribbon;
    const bwid = width(ctx, label, 38, 700) + 80;
    ctx.save(); ctx.globalAlpha *= bp;
    shadow(ctx, 24, 10); box(ctx, 540 - bwid / 2, 1200, bwid, 92, 46, C.card); noShadow(ctx);
    txt(ctx, label, 540, 1247, 38, CL(c.accent), 700);
    ctx.restore();
  }
  });
}

/* =========================== 场景 3 · 意外险 =========================== */
function scene3(ctx, t, dur, i) {
  const c = SCN(i);
  bgBase(ctx, t, CL(c.accent));
  const XL = exitLen(i);
  withExit(ctx, t, i, XL, () => {
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), lseg(t, i, 0.45));

  const ap = easeOutBack(bseg(t, i, 0.00, 0.70));
  if (ap > 0) {
    if (c.asset) drawAsset(ctx, c.asset, 540, 812, 580, { alpha: clamp01(ap), pop: clamp(ap, 0.35, 1.12) });
    else togglePair(ctx, 540, 812, 580, clamp01(ap), CL(c.accent));
  }

  const chips = c.chips;
  chips.forEach(ch => {
    // ch[1] 是"解说进行到几成"（0..1），不再是秒
    const label = ch[0], at = ch[1], x = ch[2], y = ch[3];
    const q = easeOutBack(bseg(t, i, at, 0.55)); if (q <= 0) return;
    const wid = width(ctx, label, 40, 700) + 76;
    ctx.save(); ctx.globalAlpha *= clamp01(q);
    ctx.translate(x, y); ctx.scale(clamp(q, 0.4, 1.2), clamp(q, 0.4, 1.2)); ctx.translate(-x, -y);
    shadow(ctx, 26, 10); box(ctx, x - wid / 2, y - 52, wid, 104, 52, C.card); noShadow(ctx);
    txt(ctx, label, x, y + 2, 40, CL(ch[4] || 'blue'), 700);
    ctx.restore();
  });
  });
}

/* =========================== 场景 4 · 医疗险 =========================== */
function scene4(ctx, t, dur, i) {
  const c = SCN(i);
  bgBase(ctx, t, CL(c.accent));
  const XL = exitLen(i);
  withExit(ctx, t, i, XL, () => {
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), lseg(t, i, 0.45));

  const hp = enter(t, i, 0.00, 'mid');
  if (hp > 0) {
    if (c.asset) drawAsset(ctx, c.asset, 540, 618, 470, { alpha: hp, rise: (1 - hp) * 28 });
    else halfDisc(ctx, 540, 618, 470, hp, CL(c.accent));
  }

  const bp = enter(t, i, 0.10, 'mid');
  const bx0 = 140, by0 = lerp(1150, 820, bp), bwAll = 800, bhAll = 150;
  if (bp > 0) {
    ctx.save(); ctx.globalAlpha *= bp;
    shadow(ctx, 30, 12); box(ctx, bx0, by0, bwAll, bhAll, 40, C.card); noShadow(ctx);
    ctx.save(); rr(ctx, bx0, by0, bwAll, bhAll, 40); ctx.clip();
    const cut = easeInOutCubic(bseg(t, i, 0.30, 0.80));
    const split = 0.45;
    ctx.fillStyle = C.splitLeft; ctx.fillRect(bx0, by0, bwAll * split * cut, bhAll);
    ctx.fillStyle = C.splitRight; ctx.fillRect(bx0 + bwAll * split, by0, bwAll * (1 - split) * cut, bhAll);
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= bseg(t, i, 0.34, 0.70);
    txt(ctx, c.bar[0], bx0 + bwAll * split / 2, by0 + bhAll / 2 + 2, 40, C.onAccent, 800);
    txt(ctx, c.bar[1], bx0 + bwAll * split + bwAll * (1 - split) / 2, by0 + bhAll / 2 + 2, 40, C.onAccent, 800);
    ctx.restore();
    ctx.restore();
  }

  const np = easeOutBack(bseg(t, i, 0.54, 0.70));
  if (np > 0) {
    const nx = 500, ny = 1010, nw = 440, nh = 240;
    ctx.save(); ctx.globalAlpha *= clamp01(np);
    shadow(ctx, 30, 14); box(ctx, nx, ny, nw, nh, 36, C.card); noShadow(ctx);
    ctx.save(); rr(ctx, nx, ny, nw, nh, 36); ctx.clip();
    for (let i = -nh; i < nw; i += 62) line(ctx, nx + i, ny, nx + i + nh, ny + nh, C.lineA, 4);
    for (let i = 0; i < nw + nh; i += 62) line(ctx, nx + i, ny, nx + i - nh, ny + nh, C.lineA, 4);
    ctx.restore();
    txt(ctx, c.panel.title, nx + nw / 2, ny + nh / 2 - 28, 38, CL(c.accent), 800);
    txt(ctx, c.panel.value, nx + nw / 2, ny + nh / 2 + 30, 40, CL(c.accent), 800);
    ctx.restore();
  }

  const q = bseg(t, i, 0.72, 1.10);
  if (q > 0) {
    for (let k = 0; k < 4; k++) {
      const pp = clamp01(q * 1.35 - k * 0.16); if (pp <= 0) continue;
      const e = easeInOutCubic(pp);
      const x = lerp(560, 400, e), y = lerp(1120, 1146, e) - Math.sin(pp * Math.PI) * 84;
      // 每枚金币各自 save/restore：用 *= 叠离场淡出，不能跨迭代累积
      ctx.save(); ctx.globalAlpha *= clamp01(pp * 3);
      ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fillStyle = C.coin; ctx.fill();
      ctx.strokeStyle = C.coinEdge; ctx.lineWidth = 4; ctx.stroke();
      txt(ctx, '¥', x, y + 2, 28, C.coinInk, 800);
      ctx.restore();
    }
    const wp = enter(t, i, 0.78, 'small');
    ctx.save(); ctx.globalAlpha *= wp;
    const wx = 250, wy = 1130;
    shadow(ctx, 26, 10); box(ctx, wx - 110, wy - 70, 220, 140, 30, C.orange); noShadow(ctx);
    box(ctx, wx - 110, wy - 70, 220, 46, 26, C.headFrom);
    ctx.beginPath(); ctx.arc(wx + 40, wy + 12, 20, 0, 7); ctx.fillStyle = C.walletDot; ctx.fill();
    ctx.restore();
  }
  });
}

/* =========================== 场景 5 · 重疾险 =========================== */
function scene5(ctx, t, dur, i) {
  const c = SCN(i);
  bgBase(ctx, t, CL(c.accent));
  const XL = exitLen(i);
  withExit(ctx, t, i, XL, () => {
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), lseg(t, i, 0.45));

  const vp = enter(t, i, 0.02, 'mid');
  if (vp > 0) {
    const e = vp;
    /* 滚动时长跟着本镜时长走。写死 2.4s 的话，60s 片的 11s 镜没问题，
       但 15s 片的 2.9s 镜会「数字刚停就切」——终值根本没时间被看见。
       0.42 是让终值至少留出半镜；长镜仍取 2.40，行为和以前一致。 */
    const roll = Math.min(2.40, beats(i).dur * 0.42);
    const val = Math.round(easeOutCubic(bseg(t, i, 0.04, roll)) * c.value.number);
    const br = settle(t, i, 0.02, WEIGHT.mid.len);   // 保额卡片落位后的呼吸
    ctx.save(); ctx.globalAlpha *= e;
    ctx.translate(540, 545); ctx.scale((0.9 + 0.1 * e) * br, (0.9 + 0.1 * e) * br);
    shadow(ctx, 40, 18); box(ctx, -280, -105, 560, 210, 44, C.card); noShadow(ctx);
    txt(ctx, c.value.label, 0, -50, 34, C.ink2, 700);
    glowWrap(ctx, CL(c.value.color), () =>
      numTxt(ctx, val + ' ' + c.value.unit, 0, 20, 90, CL(c.value.color), 800));
    txt(ctx, c.value.note, 0, 82, 30, CL(c.value.noteColor), 700);
    ctx.restore();                       // 原来这里多一个 restore，会把外层状态（现在含 withExit）弹掉
  }

  const ap = enter(t, i, 0.10, 'heavy');
  if (ap > 0) {
    if (c.asset) drawAsset(ctx, c.asset, 700, 950, 520, { alpha: ap, rise: (1 - ap) * 36 });
    else barRise(ctx, 700, 950, 520, ap, CL(c.accent));
  }

  const tags = c.tags;
  ctx.save();
  tags.forEach(tg => {
    // tg[1] 是"解说进行到几成"（0..1），不再是秒
    const label = tg[0], at = tg[1], y = tg[2];
    const p = enter(t, i, at, 'micro'); if (p <= 0) return;
    const e = p;
    const x = lerp(110, 250, e);
    const wid = width(ctx, label, 32, 700) + 62;
    ctx.save(); ctx.globalAlpha *= e;
    shadow(ctx, 20, 8); box(ctx, x - wid / 2, y - 42, wid, 84, 42, C.card); noShadow(ctx);
    txt(ctx, label, x, y + 2, 32, CL(c.accent), 700);
    ctx.restore();
  });
  ctx.restore();

  /* 警示徽标 = ✗ + 要否定的做法。c.warn 不填就整块不画——多数片子不需要它，
     不画比硬凑一个更像"这条片子本来就这样"，也不会在左下角留一块多余的红。
     徽标按内容撑开宽度，左边缘钉在 100（和序号徽标同一道左边距），文案再长也不会越出左边界。
     叉在文字**左边**而不是压在上面：横向压一道杠读起来像"这段字被删除"，
     叉在侧边才读作"这件事是错的"，而且文字全程可读。 */
  const xp = enter(t, i, 0.85, 'mid');
  if (c.warn && xp > 0) {
    const shake = Math.sin(t * 30) * (1 - clamp01(xp)) * 10;
    const tw = width(ctx, c.warn, 40, 800);
    const PAD = 34, IX = 40, GAP = 14;          // 左右内边距 / 叉的占位宽 / 叉与文字的间距
    const wid = PAD + IX + GAP + tw + PAD;
    ctx.save(); ctx.globalAlpha *= clamp01(xp);
    ctx.translate(100 + wid / 2 + shake, 1146); ctx.rotate(-0.06);
    shadow(ctx, 24, 10); box(ctx, -wid / 2, -52, wid, 104, 40, C.soft); noShadow(ctx);
    ctx.strokeStyle = C.red; ctx.lineWidth = 4; rr(ctx, -wid / 2, -52, wid, 104, 40); ctx.stroke();
    crossMark(ctx, -wid / 2 + PAD + IX / 2, 0, 18, C.red, 10,
              easeOutCubic(clamp01((xp - 0.35) / 0.5)));
    txt(ctx, c.warn, -wid / 2 + PAD + IX + GAP + tw / 2, 2, 40, C.red, 800);
    ctx.restore();
  }
  });
}

/* =========================== 场景 6 · 三个坑 =========================== */
function scene6(ctx, t, dur, i) {
  const c = SCN(i);
  bgBase(ctx, t, CL(c.accent));
  const XL = exitLen(i);
  withExit(ctx, t, i, XL, () => {
  txt(ctx, c.title, W / 2, 420, 72, C.ink, 800);
  const cards = c.items;
  cards.forEach((cd, k) => {
    // cd[1] 是"解说进行到几成"（0..1），不再是秒
    const label = cd[0], at = cd[1];
    const p = bseg(t, i, at, 0.60); if (p <= 0) return;
    const e = easeOutBack(p);
    const y = 640 + k * 280, w = 850, h = 236;
    const shake = Math.sin(t * 26) * (1 - clamp01(p)) * 14;
    ctx.save();
    ctx.globalAlpha *= clamp01(p * 1.6);
    ctx.translate(540 + shake, y); ctx.scale(clamp(e, 0.05, 1.2), 1);
    shadow(ctx, 34, 14); box(ctx, -w / 2, -h / 2, w, h, 42, C.card); noShadow(ctx);
    box(ctx, -w / 2, -h / 2, 18, h, 9, C.red);
    ctx.beginPath(); ctx.arc(-w / 2 + 118, 0, 58, 0, 7); ctx.fillStyle = C.soft; ctx.fill();
    crossMark(ctx, -w / 2 + 118, 0, 28, C.red, 12);
    txt(ctx, label, -w / 2 + 210, 4, 46, C.ink, 700, 'left');
    ctx.restore();
  });
  });
}

/* =========================== 场景 7 · 教育金 =========================== */
function scene7(ctx, t, dur, i) {
  const c = SCN(i);
  bgBase(ctx, t, CL(c.accent));
  const XL = exitLen(i);
  withExit(ctx, t, i, XL, () => {
  stepBadge(ctx, c.badge.n, c.badge.label, CL(c.badge.color), lseg(t, i, 0.45));

  const p = enter(t, i, 0.00, 'mid');
  if (p > 0) {
    if (c.asset) drawAsset(ctx, c.asset, 540, 950, 620, { alpha: p, rise: (1 - p) * 50 });
    else barRise(ctx, 540, 950, 620, p, CL(c.accent));
  }

  for (let k = 0; k < 3; k++) {
    const q = bseg(t, i, 0.20 + k * 0.12, 0.55); if (q <= 0) continue;
    const y = lerp(600, 792, easeInOutCubic(q));
    const cx2 = 540 + Math.sin(q * 6 + k) * 10;
    ctx.save(); ctx.globalAlpha *= clamp01(q * 4);
    ctx.beginPath(); ctx.arc(cx2, y, 30, 0, 7); ctx.fillStyle = C.coin; ctx.fill();
    ctx.strokeStyle = C.coinEdge; ctx.lineWidth = 5; ctx.stroke();
    txt(ctx, '¥', cx2, y + 2, 30, C.coinInk, 800);
    ctx.restore();
  }

  const tp = enter(t, i, 0.80, 'small');
  if (tp > 0) {
    const label = c.note;
    const wid = width(ctx, label, 34, 700) + 70;
    ctx.save(); ctx.globalAlpha *= tp;
    shadow(ctx, 22, 9); box(ctx, 770 - wid / 2, 300, wid, 92, 46, C.card); noShadow(ctx);
    txt(ctx, label, 770, 347, 34, CL(c.accent), 700);
    ctx.restore();
  }
  });
}

/* =========================== 场景 8 · 总结 =========================== */
function scene8(ctx, t, dur, i) {
  const c = SCN(i);
  bgBase(ctx, t, CL(c.accent));
  const XL = exitLen(i);
  withExit(ctx, t, i, XL, () => {
  txt(ctx, c.title, W / 2, 400, 72, C.ink, 800);
  txt(ctx, c.sub, W / 2, 492, 40, C.ink2, 600);

  const steps = c.steps.map(s => [s[0], CL(s[1]), s[2]]);
  const bw = 132, gap = 58, totalW = steps.length * bw + (steps.length - 1) * gap;
  const x0 = (W - totalW) / 2, baseY = 1140;
  steps.forEach((st, k) => {
    const label = st[0], col = st[1], hgt = st[2];
    const p = enter(t, i, 0.12 + k * 0.13, 'small');
    if (p <= 0) return;
    const h = hgt * p, x = x0 + k * (bw + gap);
    ctx.save(); ctx.globalAlpha *= clamp01(p * 1.5);
    shadow(ctx, 22, 10);
    const g = ctx.createLinearGradient(0, baseY - h, 0, baseY);
    g.addColorStop(0, col); g.addColorStop(1, C.seal);
    box(ctx, x, baseY - h, bw, h, 26, k === 4 ? C.dash : g);
    noShadow(ctx);
    if (k === 4) {
      ctx.save(); ctx.setLineDash([12, 10]);
      ctx.strokeStyle = C.purple; ctx.lineWidth = 5; rr(ctx, x, baseY - h, bw, h, 26); ctx.stroke(); ctx.restore();
    }
    checkMark(ctx, x + bw / 2, baseY - h + 48, 24, k === 4 ? C.purple : C.onAccent, 9);
    numTxt(ctx, label, x + bw / 2, baseY + 58, 34, k === 4 ? C.purple : C.ink, 700);
    ctx.restore();
  });

  const lpA = bs(i, 0.76, 0.60);
  const lp = easeOutCubic(seg(t, lpA, lpA + 0.60));
  if (lp > 0) {
    ctx.save(); ctx.globalAlpha *= lp;
    let last = 0;
    steps.forEach((st, k) => {
      const hgt = st[2];
      const x = x0 + k * (bw + gap) + bw / 2;
      if (last) {
        const p = clamp01((t - lpA - k * 0.16) / 0.35);
        if (p > 0) line(ctx, last, baseY - hgt - 40, lerp(last, x, easeOutCubic(p)), baseY - hgt - 40, 'rgba(255,138,61,0.85)', 8);
      }
      last = x;
    });
    txt(ctx, c.chain, W / 2, 1282, 36, CL(c.accent), 700);
    ctx.restore();
  }
  });
}

/* =========================== 场景 9 · 结尾 =========================== */
function scene9(ctx, t, dur, i) {
  const c = SCN(i);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.outroBg1); g.addColorStop(0.55, C.outroBg2); g.addColorStop(1, C.outroBg3);
  ctx.fillStyle = g; ctx.fillRect(-24, -24, W + 48, H + 48);   // 同 bgBase：为摄影机漂移留出 overscan
  /* 结尾没有收场钟，所以最后几秒必须自己活着：光晕呼吸 + CTA 落位后轻呼吸。
     都是 (镜号, t) 的确定性函数，不引入 Math.random。 */
  const pulse = Math.sin(t * 0.8 + i) * 0.5 + 0.5;
  softCircle(ctx, 540, 700, 330 * (1 + pulse * 0.05), C.outroGlow, (0.34 + pulse * 0.12) * C.glow);

  txt(ctx, c.title, W / 2, 380, 76, C.ink, 800);
  txt(ctx, c.sub, W / 2, 480, 56, CL(c.accent), 800);

  const ap = enter(t, i, 0.02, 'heavy');   // 结尾镜不挂 withExit：散场只在画面上堆着，不清场
  if (ap > 0) {
    if (c.asset) drawAsset(ctx, c.asset, 540, 900, 500, { alpha: ap, rise: (1 - ap) * 40 });
    else ringStack(ctx, 540, 900, 500, ap, CL(c.accent));
  }

  const cp = easeOutBack(bseg(t, i, 0.18, 0.60));
  if (cp > 0) {
    const label = c.cta;
    const wid = width(ctx, label, 42, 700) + 96;
    const br = settle(t, i, 0.18, 0.60, 0.02);   // 落位后继续呼吸，别让结尾冻住
    ctx.save(); ctx.globalAlpha = clamp01(cp);
    const cs = clamp(cp, 0.5, 1.15) * br;
    ctx.translate(540, 1214); ctx.scale(cs, cs); ctx.translate(-540, -1214);
    shadow(ctx, 30, 12); box(ctx, 540 - wid / 2, 1160, wid, 108, 54, C.orange); noShadow(ctx);
    glowWrap(ctx, C.orange, () => box(ctx, 540 - wid / 2, 1160, wid, 108, 54, C.orange));
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
  const size = SUB.size, maxW = SUB.maxW;
  let lines = [sub.text];
  let wMax = width(ctx, sub.text, size, 600);
  if (wMax > maxW) {
    const mid = Math.ceil(sub.text.length / 2);
    lines = [sub.text.slice(0, mid), sub.text.slice(mid)];
    wMax = Math.max(width(ctx, lines[0], size, 600), width(ctx, lines[1], size, 600));
  }
  const lh = SUB.lineH, padX = SUB.padX, padY = SUB.padY;
  const bwid = wMax + padX * 2, bh = lines.length * lh + padY * 2 - 14;
  const bx = W / 2 - bwid / 2, by = SUB.bottom - bh;
  shadow(ctx, 30, 12, C.subShadow);
  box(ctx, bx, by, bwid, bh, SUB.radius, C.subBg); noShadow(ctx);
  lines.forEach((l, i) => txt(ctx, l, W / 2, by + padY + lh / 2 + i * lh - 7, size, C.subInk, 600));
  ctx.restore();
}

/* ---------- 渲染入口 ---------- */
const TPL = { hook: scene1, step: scene2, chips: scene3, split: scene4,
              bigNumber: scene5, pitfalls: scene6, coins: scene7, funnel: scene8, outro: scene9 };
const sceneFn = i => TPL[SCN(i).tpl] || scene1;
const TRANS = PACE.transition;   // 来自 content.json 的 meta.pace，见文件顶部
/* 撞击闪光时长。meta.pace.flash = 0 就是关掉——闪光只在切镜那一刻垫一层全屏强调色，
   而切镜前后各有一段留白（上一镜 0.06s 尾 + 下一镜 lead 0.30s），闪光落在这段空台上
   读起来不像「撞击」而像「屏幕闪了一下」。硬切 + 无闪 = 干净换镜。 */
const FLASH = PACE.flash === undefined ? FLASH_DEF : PACE.flash;

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
  const lt = Math.max(0, t - sc.start);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  T = lt; SI = i;
  ctx.save(); sceneCam(ctx, i, lt);
  sceneFn(i)(ctx, lt, sc.dur, i);
  ctx.restore();
  ctx.restore();
}
/* ---------- 转场合成 ----------
   以前 9 次边界全是 cross-dissolve：两镜同时半透明，一帧糊。按「进入镜的 tpl」
   查表选转场——确定性、零新增配置、重渲染必然一致。
   关键不变量：oa 永远先全幅画作底，且任何一帧都必须被 oa 或 ob 完整覆盖，
   否则会露出画布底色（mctx 从不清屏）。推镜因此用的是"两幅各走满一屏"，
   不是各走半屏——各走半屏在 e<0.5 时中缝会漏空。 */
const XN = { hook: 'dissolve', step: 'slideR', chips: 'slideUp',
             bigNumber: 'dissolve', pitfalls: 'band', coins: 'slideUp',
             funnel: 'slideR', outro: 'dissolve' };
function compose(mctx, oa, ob, kind, p) {
  const e = easeInOutCubic(p);
  mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.globalAlpha = 1;
  if (kind === 'slideR') {                    // 新镜自右推入，旧镜同时被推出
    mctx.drawImage(oa, -e * W, 0); mctx.drawImage(ob, (1 - e) * W, 0);
  } else if (kind === 'slideL') {
    mctx.drawImage(oa, e * W, 0); mctx.drawImage(ob, -(1 - e) * W, 0);
  } else if (kind === 'slideUp') {
    mctx.drawImage(oa, 0, -e * H); mctx.drawImage(ob, 0, (1 - e) * H);
  } else if (kind === 'wipeL') {              // 左侧一次性擦除揭开
    mctx.drawImage(oa, 0, 0);
    mctx.save(); mctx.beginPath(); mctx.rect(0, 0, W * e, H); mctx.clip();
    mctx.drawImage(ob, 0, 0); mctx.restore();
  } else if (kind === 'band') {               // 三条横带依次擦除
    mctx.drawImage(oa, 0, 0);
    const n = 3, bh = H / n;
    for (let k = 0; k < n; k++) {
      const pk = clamp01(e * 1.35 - k * 0.14);
      mctx.save(); mctx.beginPath(); mctx.rect(0, k * bh, W * pk, bh); mctx.clip();
      mctx.drawImage(ob, 0, 0); mctx.restore();
    }
  } else {                                    // dissolve（默认）
    mctx.drawImage(oa, 0, 0);
    mctx.globalAlpha = e; mctx.drawImage(ob, 0, 0);
  }
  mctx.restore();
}

/* ---------- 氛围层 ----------
   画在"场景合成之后、HUD 与字幕之前"，所以压在字幕/HUD 下面的只有背景，
   字永远清晰。转场时也只画一次（在 compose 之后），不会 oa/ob 各压一层。 */
/* 暗角预渲染到离屏画布，每帧只 drawImage 一次。
   直接每帧求值全屏径向渐变实测 2.67ms/帧，预渲染后 0.22ms/帧——差 12 倍，
   而画面逐像素相同（同一份渐变，只是把光栅化挪到加载时做一次）。 */
let VIG = null;
function drawVignette(ctx) {
  if (!VIG) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(540, 960, 640, 540, 960, 1160);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, C.vignette);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    VIG = cv;
  }
  ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(VIG, 0, 0); ctx.restore();
}

/* 颗粒必须是确定性的：用固定种子的 LCG 造一张噪声瓦片，全片复用。
   绝不能用 Math.random——转场一帧内场景函数会被调用两次，随机值会让画面互相打架。
   （本来试过每帧轮换瓦片做"沸腾"感，实测只把 9.14MB 降到 9.87MB 的零头，
   真正吃码率的是空间频率，不是帧间相关性，见 drawGrain。） */
let GRAIN = null;
function grainTile(ctx) {
  if (GRAIN) return GRAIN;
  const T = 256;
  const cv = document.createElement('canvas'); cv.width = T; cv.height = T;
  const g = cv.getContext('2d'), im = g.createImageData(T, T);
  let s = 20261;                                        // 固定种子，逐帧可复现
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let o = 0; o < im.data.length; o += 4) {
    const v = rnd() * 255 | 0;
    im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  GRAIN = ctx.createPattern(cv, 'repeat');
  return GRAIN;
}
function drawGrain(ctx) {
  if (!(C.grain > 0)) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = C.grain;
  /* 两处都是量出来的，别凭直觉改：
     1) source-over 而不是 overlay。同一个 alpha 0.022，三帧平均：
          overlay      平均|差| 0.30、最大 3   —— 看不见，却要 34.3ms/帧
          source-over  平均|差| 2.4、 最大 6   —— 看得见，只要 11.1ms/帧
        深底上白噪声本来就是"加光"，overlay 的对称明暗在这里把能量自己对消了。
     2) 瓦片放大 GS 倍。细噪点是高频，x264 要在 DCT 里逐块花码率：
          GS=1   9.14MB（同尺寸比无颗粒的 3.68MB 多 5.46MB）
          GS=4   5.72MB                              （只多 2.04MB）
        GS=4 的颗粒在 1:1 下是柔和麻点，不显块状。 */
  ctx.globalCompositeOperation = 'source-over';
  ctx.scale(GS, GS);
  ctx.fillStyle = grainTile(ctx);
  ctx.fillRect(0, 0, Math.ceil(W / GS), Math.ceil(H / GS));
  ctx.restore();
}

/* 撞击 flash：叠一层强调色，全屏。用纯色填充，不用 shadowBlur。
   相位锚在 **lead 结尾**（= 主体开始落位那一刻），不是进镜瞬间：锚在 sc.start 时，
   闪光窗口 [start, start+0.11] 会整段落在上一镜已清空、下一镜还没起元素的空窗里。
   但要留意 lead 只是主体**开始**落位，主体自身还要走 0.6–0.7s 才到位——所以峰值
   那一帧台上仍然近乎空的（实测 s1→s2：背景区亮度 37.1 → 51.8，+40%，只有徽标）。
   想彻底不要这一下，把 meta.pace.flash 写成 0（详见 schema 里那一条）。 */
function drawFlash(ctx, t, i) {
  const sc = TIMELINE[i]; if (!sc) return;
  if (FLASH <= 0) return;                     // 配置关掉了撞击闪光
  if (energyOf(i) === 'low') return;          // 过渡镜不撞击
  const fd = t - (sc.start + beats(i).lead);
  if (fd < 0 || fd > FLASH) return;
  const a = (1 - fd / FLASH);
  ctx.save();
  // 峰值刻意压得很低（0.12）：这是"撞击一下"，不是给画面蒙一层雾。a² 让它在
  // 前 1/3 就把能量放掉，剩下的只是余辉。实测 0.20/0.14s 会把 incoming 镜的
  // 空背景整体提亮成灰雾，尤其在 dark 皮肤下。
  ctx.globalAlpha = a * a * 0.12;
  ctx.fillStyle = CL(SCN(i).accent);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function atmosphere(ctx, t, i) {
  drawVignette(ctx);
  drawFlash(ctx, t, i);
  drawGrain(ctx);
}

function renderFrame(t) {
  const i = sceneIndexAt(t);
  const half = TRANS / 2;
  let blended = false;
  /* 转场窗口骑在镜边界上：[start-half, start+half]，所以要直接扫边界，不能拿
     sceneIndexAt(t) 当判据——它在边界**之前**返回的是上一镜，`t >= start-half` 于是
     只在边界**之后**才成立，窗口被砍成半段。后果是 p 从 0.5 起步：转场第一帧，进镜
     已经走完一半（dissolve 是 alpha 直接蹦到 0.5，slide 是画面直接出现在半路上）。
     0.45s 的转场实际只有 0.225s，这才是"每屏结束闪一下"的主因——实测边界后一帧的
     帧间差是镜内中位数的 10.9 倍。 */
  let cut = -1;                                   // 本次转场落在哪条镜边界上（= 进入镜的序号）
  if (TRANS > 0) for (let k = 1; k < TIMELINE.length; k++) {
    const kst = TIMELINE[k].start;
    if (t >= kst - half && t < kst + half) { cut = k; break; }
  }
  // TRANS = 0（meta.pace.transition 写成 0）就是硬切：窗口空，永远不 blended。
  // 这样 p 也就不会去算 0/0。想要硬切不必改引擎，写配置就行。
  if (cut > 0) {
    const p = (t - (TIMELINE[cut].start - half)) / TRANS;
    drawSceneInto(actx, cut - 1, t);
    drawSceneInto(bctx, cut, t);
    compose(mctx, oa, ob, XN[SCN(cut).tpl] || 'dissolve', p);
    blended = true;
  }
  if (!blended) {
    const lt = Math.max(0, t - TIMELINE[i].start);
    mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0);
    T = lt; SI = i;                      // 不写这里的话，每镜开头 0.45s 的漂移会静止
    mctx.save(); sceneCam(mctx, i, lt);
    sceneFn(i)(mctx, lt, TIMELINE[i].dur, i);
    mctx.restore();
    mctx.restore();
  }
  mctx.save(); mctx.setTransform(1, 0, 0, 1, 0, 0);
  atmosphere(mctx, t, i);              // 压在字幕/HUD 下面，字永远清晰
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  drawHud(mctx, t);
  drawSubtitle(mctx, activeSub(i, Math.max(0, t - TIMELINE[i].start)));
  mctx.restore();
}
window.renderFrame = renderFrame;
window.META = { W: W, H: H, FPS: FPS, TOTAL: TOTAL, frames: Math.round(TOTAL * FPS) };
