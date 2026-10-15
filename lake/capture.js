/**
 * Captures the artificial-lake WebGL2 page to a PNG sequence.
 *
 *   node lake/capture.js                 # 150 frames at 30 fps -> lake/frames
 *   node lake/capture.js --still 2.5     # one still at t=2.5 s -> lake/stills
 *
 * The page is loaded with __LAKE_OFFLINE__ so its rAF loop stays off; every
 * frame is produced by calling window.LAKEAPI.render(t) for an exact time.
 * Because render(t) is a pure function of time, the sequence is reproducible.
 */
const path = require('path');
const fs = require('fs');

const WORK = path.resolve(__dirname, '..');

// Playwright lives in deps/node_modules here, which is only on the module path
// when NODE_PATH is exported; fall back to requiring it by absolute path.
function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    return require(path.join(WORK, 'deps', 'node_modules', 'playwright'));
  }
}
const { chromium } = loadPlaywright();

const URL = 'file:///' + path.join(WORK, 'lake', 'index.html');
const FRAME_DIR = path.join(WORK, 'lake', 'frames');
const STILL_DIR = path.join(WORK, 'lake', 'stills');

function parseArgs(argv) {
  const out = { mode: 'video', still: 2.5, width: 1280, height: 720, set: {}, tag: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--still') { out.mode = 'still'; out.still = parseFloat(argv[++i]); }
    else if (argv[i] === '--times') { out.mode = 'still'; out.times = argv[++i].split(',').map(Number); }
    // --set exposure=0.8,haze=[0.1,0.2,0.3] --tag dusk   (tuning only)
    else if (argv[i] === '--set') { out.set = parseOverrides(argv[++i]); }
    else if (argv[i] === '--tag') { out.tag = '_' + argv[++i]; }
  }
  return out;
}

/* "exposure=0.8,haze=[0.1,0.2,0.3]" -> { exposure: 0.8, haze: [0.1,0.2,0.3] } */
function parseOverrides(text) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else { cur += ch; }
  }
  if (cur.trim()) parts.push(cur);
  const out = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    out[part.slice(0, eq).trim()] = JSON.parse(part.slice(eq + 1).trim());
  }
  return out;
}

async function launchBrowser() {
  // The bundled Playwright download is absent, so lean on a system browser.
  const attempts = [
    { channel: 'chrome' },
    { channel: 'msedge' },
    {}
  ];
  let lastErr;
  for (const opt of attempts) {
    try {
      return await chromium.launch(Object.assign({
        args: ['--hide-scrollbars', '--force-device-scale-factor=1', '--disable-lcd-text']
      }, opt));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: args.width, height: args.height },
    deviceScaleFactor: 1
  });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.addInitScript(() => { window.__LAKE_OFFLINE__ = true; });
  await page.goto(URL, { waitUntil: 'load' });
  try {
    await page.waitForFunction('window.LAKEAPI && window.LAKE.ready === true', null, { timeout: 30000 });
  } catch (err) {
    const diag = await page.evaluate(() => ({
      error: (document.getElementById('error') || {}).textContent || '',
      hasLAKE: typeof window.LAKE,
      reason: document.body.dataset.error || ''
    }));
    console.log('PAGE DID NOT MOUNT: ' + JSON.stringify(diag, null, 2));
    if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
    await browser.close();
    process.exit(2);
  }

  const info = await page.evaluate(() => window.LAKE.info);
  console.log('renderer: ' + info.renderer);
  console.log('duration: ' + info.duration + 's @ ' + info.fps + 'fps');
  if (Object.keys(args.set).length) {
    await page.evaluate(o => Object.assign(window.LAKEAPI.config, o), args.set);
    console.log('overrides: ' + JSON.stringify(args.set));
  }

  const stats = async (label) => {
    const s = await page.evaluate(() => {
      const gl = window.LAKEAPI.gl;
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, max = 0, dark = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        sum += l; if (l > max) max = l; if (l < 2) dark++;
        n++;
      }
      return { mean: +(sum / n).toFixed(2), max, blackPct: +(100 * dark / n).toFixed(2) };
    });
    console.log('  ' + label + ' -> mean ' + s.mean + ' / max ' + s.max + ' / black ' + s.blackPct + '%');
    return s;
  };

  if (args.mode === 'still') {
    fs.mkdirSync(STILL_DIR, { recursive: true });
    const times = args.times || [args.still];
    for (const t of times) {
      await page.evaluate(tt => window.LAKEAPI.render(tt), t);
      await stats('t=' + t + 's');
      await page.screenshot({ path: path.join(STILL_DIR, 'still_' + t.toFixed(2) + 's' + args.tag + '.png') });
    }
    console.log('stills -> ' + STILL_DIR);
  } else {
    fs.mkdirSync(FRAME_DIR, { recursive: true });
    for (const f of fs.readdirSync(FRAME_DIR)) {
      if (/^f\d+\.png$/.test(f)) fs.unlinkSync(path.join(FRAME_DIR, f));
    }
    const n = Math.round(info.duration * info.fps);
    const t0 = Date.now();
    for (let f = 0; f < n; f++) {
      await page.evaluate(tt => window.LAKEAPI.render(tt), f / info.fps);
      await page.screenshot({ path: path.join(FRAME_DIR, 'f' + String(f).padStart(5, '0') + '.png') });
      if (f % 10 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log('frame ' + f + '/' + n + '  ' + el.toFixed(1) + 's  eta ' + ((el / (f + 1)) * (n - f - 1)).toFixed(0) + 's');
      }
    }
    console.log('done ' + n + ' frames in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    await stats('last frame');
  }

  if (errors.length) {
    console.log('PAGE ERRORS:\n' + errors.join('\n'));
  }
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
