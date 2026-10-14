const path = require('path');
const { chromium } = require('playwright');
const WORK = path.resolve(__dirname, '..');
const REL = process.env.RENDER_HTML || 'engine/render.html';
const URL = 'file:///' + path.join(WORK, REL).replace(/\\/g, '/');

const INIT = function () {
  window.__dbg = [];
  const P = CanvasRenderingContext2D.prototype;
  const origText = P.fillText;
  P.fillText = function (s, x, y) {
    try {
      const m = this.measureText(String(s));
      const a = this.textAlign;
      let x0 = x;
      if (a === 'center') x0 = x - m.width / 2;
      else if (a === 'right' || a === 'end') x0 = x - m.width;
      const asc = m.actualBoundingBoxAscent || 0, desc = m.actualBoundingBoxDescent || 0;
      window.__dbg.push({ k: 'text', s: String(s), x: x0, y: y - asc, w: m.width, h: asc + desc, a: this.globalAlpha });
    } catch (e) {}
    return origText.apply(this, arguments);
  };
  const origImg = P.drawImage;
  P.drawImage = function (im) {
    try {
      const n = arguments.length;
      if (n === 5 || n === 9) {
        const o = n === 5 ? 1 : 5;
        window.__dbg.push({ k: 'img', x: arguments[o], y: arguments[o + 1], w: arguments[o + 2], h: arguments[o + 3], a: this.globalAlpha, nat: im.naturalWidth ? (im.naturalWidth + 'x' + im.naturalHeight) : 'canvas' });
      }
    } catch (e) {}
    return origImg.apply(this, arguments);
  };
  /* 无插画版式画的是几何母题，一次 drawImage 都不发——probe 看不见它们，
     越界就永远是假绿。母题自己用 engine.js 的 gbox() 报到这儿来。
     nat 挂 'geom:<母题名>'，会被下面 `o.w < 1000 && o.nat !== 'canvas'` 的
     img 过滤器自动放行，所以 OUT-OF-BAND 与遮挡检查都不用改判读逻辑。 */
  window.__geomBox = (x, y, w, h, tag, a) =>
    window.__dbg.push({ k: 'img', x: x, y: y, w: w, h: h, a: a === undefined ? 1 : a, nat: 'geom:' + tag });
};

function inter(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

(async () => {
  const times = JSON.parse(process.argv[2] || '[]');
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.addInitScript(INIT);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.renderFrame && window.META && window.__assetsReady === true', null, { timeout: 60000 });
  for (const t of times) {
    const items = await page.evaluate(tt => { window.__dbg = []; window.renderFrame(tt); return window.__dbg; }, t);
    const live = items.filter(o => (o.a === undefined || o.a > 0.12));
    const imgs = live.filter(o => o.k === 'img' && o.w < 1000 && o.nat !== 'canvas').map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, a: +o.a.toFixed(2), nat: o.nat }));
    const texts = live.filter(o => o.k === 'text' && o.s.trim().length > 0).map(o => ({ s: o.s, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.w), h: Math.round(o.h), a: +o.a.toFixed(2) }));
    console.log('===== t=' + t.toFixed(2) + 's =====');
    for (const im of imgs) {
      const r = { x: Math.round(im.x), y: Math.round(im.y), w: Math.round(im.w), h: Math.round(im.h) };
      const hits = texts.filter(tx => inter(r, tx) > 900).map(tx => tx.s + ' [' + tx.x + ',' + tx.y + ' ' + tx.w + 'x' + tx.h + '] ov=' + Math.round(inter(r, tx)));
      console.log('  IMG nov=' + im.nat + ' a=' + im.a + ' box=(' + r.x + ',' + r.y + ')-(' + (r.x + r.w) + ',' + (r.y + r.h) + ')  yTop=' + r.y + ' yBot=' + (r.y + r.h) + (r.y < 230 || r.y + r.h > 1560 ? '  <<< OUT-OF-BAND' : ''));
      hits.forEach(h => console.log('      over text: ' + h));
    }
    texts.forEach(tx => console.log('  TXT "' + tx.s + '" @(' + tx.x + ',' + tx.y + ') ' + tx.w + 'x' + tx.h + ' a=' + tx.a));
  }
  await browser.close();
})();
