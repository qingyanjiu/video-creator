/* 画面动能量检查 —— 现有校验脚本里没有能发现"画面冻住了"的那一个。
 *
 *   用法：node scripts/motion_check.js <frames_dir> [--json]
 *
 * 对每一镜取两段窗口（时间由 timeline.json 换算，不依赖任何渲染参数）：
 *   tail = [dur-1.60, dur-0.25]      入场动画早已播完，只看"落位后还有没有在动"
 *   early = [0.15*dur, 0.15*dur+0.90] 参考值：入场期，本来就该有大动作
 * 每段抽若干帧，缩到 108x112 灰度图，算相邻帧的平均绝对像素差（0-255 灰阶）。
 *
 * 必须裁掉 HUD(y<230) 和字幕带(y>1350)：字幕每换一行都是一次巨大的整块像素变化，
 * 不裁的话"元素冻住、只有字幕在走"会被算成高分，正好把这个脚本要抓的问题盖掉。
 *
 * 判读：要看的是 tail 相对基线的变化。（实测：接入节拍系统前的基线，各镜 tail
 *      只有 0.01–0.07——整帧唯一还在变的是 HUD 进度条；接入后是 0.20–0.48。）
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const WORK = path.resolve(__dirname, '..');
const dir = path.resolve(WORK, process.argv[2] || 'out/frames');
const AS_JSON = process.argv.includes('--json');
const N = 8;                       // 每段抽 8 帧
const MIN_TAIL = 0.15;             // 尾部动能量低于此值判为"基本静止"

const tl = JSON.parse(fs.readFileSync(path.join(WORK, 'timeline.json'), 'utf8'));
const fps = tl.fps || 30;
const TOTAL = tl.frames || Math.round(tl.total * fps);

function frameAt(f) {
  const pad = String(f).padStart(5, '0');
  for (const ext of ['.png', '.jpg']) {
    const p = path.join(dir, 'f' + pad + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const STAGE = { left: 0, top: 230, width: 1080, height: 1020 };   // 去掉 HUD 与字幕带

async function thumb(p) {
  return sharp(p).extract(STAGE).resize(108, 112, { fit: 'fill' })
    .greyscale().raw().toBuffer();
}

function meanAbsDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/* 在绝对时间 [t0, t1] 里等距取 N 帧，返回相邻帧差分的平均值 */
async function energy(t0, t1) {
  const f0 = Math.max(0, Math.round(t0 * fps));
  const f1 = Math.min(TOTAL - 1, Math.round(t1 * fps));
  if (f1 <= f0) return null;
  const step = (f1 - f0) / (N - 1);
  const bufs = [];
  for (let k = 0; k < N; k++) {
    const p = frameAt(Math.round(f0 + step * k));
    if (!p) return null;
    bufs.push(await thumb(p));
  }
  let sum = 0;
  for (let k = 1; k < N; k++) sum += meanAbsDiff(bufs[k - 1], bufs[k]);
  return sum / (N - 1);
}

(async () => {
  const rows = [];
  for (let i = 0; i < tl.scenes.length; i++) {
    const sc = tl.scenes[i];
    const tail = await energy(sc.start + sc.dur - 1.60, sc.start + sc.dur - 0.25);
    const early = await energy(sc.start + sc.dur * 0.15, sc.start + sc.dur * 0.15 + 0.90);
    rows.push({ i: i, id: sc.id, dur: sc.dur, early: early, tail: tail });
  }
  if (AS_JSON) { console.log(JSON.stringify(rows, null, 2)); return; }

  console.log('dir: ' + path.relative(WORK, dir) + '   (' + fps + 'fps, ' + (TOTAL / fps).toFixed(2) + 's)');
  console.log('镜  id  dur     前段动能量   尾部动能量   尾/前');
  let dead = 0;
  for (const r of rows) {
    const m = r.early === null ? NaN : r.early, t = r.tail === null ? NaN : r.tail;
    const ratio = (m > 0 && isFinite(t)) ? (t / m) : NaN;
    const flag = !isFinite(t) ? '?' : (t < MIN_TAIL ? '   ← 尾部基本静止' : '');
    if (isFinite(t) && t < MIN_TAIL) dead++;
    console.log(
      String(r.i + 1).padStart(2) + '  ' + r.id.padEnd(3) + ' ' +
      r.dur.toFixed(2).padStart(5) + '   ' +
      (isFinite(m) ? m.toFixed(3).padStart(11) : '          -') + '   ' +
      (isFinite(t) ? t.toFixed(3).padStart(10) : '         -') + '   ' +
      (isFinite(ratio) ? (ratio * 100).toFixed(0).padStart(4) + '%' : '   -') + flag);
  }
  console.log(dead ? ('\n' + dead + ' 镜尾部动能量 < ' + MIN_TAIL + '，画面接近静止')
                   : '\n所有镜头尾部都有可见的持续运动');
})();
