const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const WORK = path.resolve(__dirname, '..');
const REL = process.env.RENDER_HTML || 'engine/render.html';
const URL = 'file:///' + path.join(WORK, REL).replace(/\\/g, '/');

(async () => {
  const mode = process.argv[2] || 'preview';
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-lcd-text']
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()); });
  page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.renderFrame && window.META');
  await page.waitForFunction('window.__assetsReady === true', null, { timeout: 60000 });
  const meta = await page.evaluate(() => window.META);
  console.log('META ' + JSON.stringify(meta));

  if (mode === 'preview') {
    const dir = path.join(WORK, process.argv[4] || 'preview');
    fs.mkdirSync(dir, { recursive: true });
    const times = JSON.parse(process.argv[3] || '[]');
    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      await page.evaluate(tt => window.renderFrame(tt), t);
      await page.screenshot({ path: path.join(dir, 'p' + String(i).padStart(2, '0') + '_' + t.toFixed(2) + 's.jpg'), type: 'jpeg', quality: 90 });
    }
    console.log('preview frames: ' + times.length);
  } else {
    const png = mode === 'png';
    const dir = path.join(WORK, process.env.FRAMES_DIR || 'out/frames');
    fs.mkdirSync(dir, { recursive: true });
    // 先清掉上一次的帧：片子变短时旧帧会留在目录里，encode.py 会连它们一起编进去。
    for (const f of fs.readdirSync(dir)) {
      if (/^f\d+\.(png|jpg)$/.test(f)) fs.unlinkSync(path.join(dir, f));
    }
    const n = meta.frames;
    const t0 = Date.now();
    for (let f = 0; f < n; f++) {
      await page.evaluate(tt => window.renderFrame(tt), f / meta.FPS);
      await page.screenshot({ path: path.join(dir, 'f' + String(f).padStart(5, '0') + (png ? '.png' : '.jpg')), type: png ? 'png' : 'jpeg', quality: png ? undefined : 92 });
      if (f % 100 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log('frame ' + f + '/' + n + '  ' + el.toFixed(1) + 's  eta ' + ((el / (f + 1)) * (n - f - 1)).toFixed(0) + 's');
      }
    }
    console.log('done ' + n + ' frames in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  await browser.close();
})();
