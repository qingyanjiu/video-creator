const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const WORK = path.resolve(__dirname, '..');
const dir = path.join(WORK, process.argv[2] || 'preview3');
const boxes = JSON.parse(fs.readFileSync(path.join(WORK, 'probe_boxes.json'), 'utf8'));
(async () => {
  for (const f of fs.readdirSync(dir).filter(x => /[.](jpg|png)$/.test(x)).sort()) {
    const t = parseFloat(f.split('_').pop().replace(/s[.](jpg|png)$/, ''));
    const b = boxes.find(o => Math.abs(o.t - t) < 0.01);
    const img = sharp(path.join(dir, f));
    const { width, height } = await img.metadata();
    const raw = await img.raw().toBuffer();
    const bg = [253, 248, 241];
    let fill = 0, tot = 0;
    const region = b && b.box ? b.box : { x: 0, y: 0, w: width, h: height };
    for (let y = region.y; y < Math.min(height, region.y + region.h); y++) {
      for (let x = region.x; x < Math.min(width, region.x + region.w); x++) {
        const i = (y * width + x) * 3;
        const d = Math.abs(raw[i] - bg[0]) + Math.abs(raw[i + 1] - bg[1]) + Math.abs(raw[i + 2] - bg[2]);
        tot++; if (d > 60) fill++;
      }
    }
    const s = await sharp(path.join(dir, f)).stats();
    console.log(f + '  region=' + JSON.stringify(region) + '  fill=' + (100 * fill / tot).toFixed(1) + '%  meanRGB=' + s.channels.map(c => Math.round(c.mean)).join('/'));
  }
})();
