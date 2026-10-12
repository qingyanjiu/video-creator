const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const WORK = path.resolve(__dirname, '..');
const OUT = path.resolve(WORK, '..', 'outputs');
const src = path.join(WORK, process.argv[2]);
const prefix = process.argv[3];
(async () => {
  const files = fs.readdirSync(src).filter(x => /[.]jpg$/.test(x)).sort();
  for (const f of files) {
    const base = f.replace(/^p\d+_/, '').replace(/s[.]jpg$/, '').replace('.', '_');
    const dst = path.join(OUT, prefix + '_' + base + 's.png');
    await sharp(path.join(src, f)).png().toFile(dst);
    const s = await sharp(path.join(src, f)).stats();
    const rt = await sharp(path.join(src, f)).resize(108, 192, { fit: 'fill' }).raw().toBuffer();
    let lo = 0, hi = 0;
    for (let i = 0; i < rt.length; i += 3) { const y = 0.2126 * rt[i] + 0.7152 * rt[i + 1] + 0.0722 * rt[i + 2]; if (y < 64) lo++; else if (y > 200) hi++; }
    const n = rt.length / 3;
    console.log(path.basename(dst) + '  mean=' + s.channels.map(c => Math.round(c.mean)).join('/') + '  暗像素=' + (100 * lo / n).toFixed(0) + '%  亮像素=' + (100 * hi / n).toFixed(0) + '%');
  }
})();
