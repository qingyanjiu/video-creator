const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const WORK = path.resolve(__dirname, '..');
const A = path.join(WORK, process.argv[2]);
const B = path.join(WORK, process.argv[3]);
const stride = +(process.argv[4] || 40);
(async () => {
  const files = fs.readdirSync(A).filter(x => /[.]png$/.test(x)).sort();
  let worst = 0, worstF = '', checked = 0, diffFrames = [];
  for (let i = 0; i < files.length; i += stride) {
    const f = files[i];
    const pa = path.join(A, f), pb = path.join(B, f);
    if (!fs.existsSync(pb)) { console.log('missing in B: ' + f); continue; }
    const ra = await sharp(pa).raw().toBuffer();
    const rb = await sharp(pb).raw().toBuffer();
    if (ra.length !== rb.length) { console.log('size mismatch ' + f); continue; }
    let sum = 0, mx = 0;
    for (let k = 0; k < ra.length; k++) {
      const d = Math.abs(ra[k] - rb[k]);
      sum += d; if (d > mx) mx = d;
    }
    const mean = sum / ra.length;
    checked++;
    if (mx > worst) { worst = mx; worstF = f; }
    if (mean > 0.5) diffFrames.push(f + ' mean=' + mean.toFixed(2) + ' max=' + mx);
  }
  console.log('compared ' + checked + ' frames (stride ' + stride + ')');
  console.log('worst single-channel delta: ' + worst + '  at ' + worstF);
  if (diffFrames.length) { console.log('frames with mean delta > 0.5:'); diffFrames.slice(0, 20).forEach(x => console.log('   ' + x)); }
  else console.log('all sampled frames pixel-identical within 0.5 mean');
})();
