const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = path.join(__dirname, '..', 'src', 'assets');

(async () => {
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.svg')).sort()) {
    const svg = fs.readFileSync(path.join(DIR, f), 'utf8');
    const cols = {};
    for (const m of svg.matchAll(/#[0-9a-fA-F]{6}/g)) cols[m[0].toLowerCase()] = (cols[m[0].toLowerCase()] || 0) + 1;
    const top = Object.entries(cols).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0] + 'x' + e[1]).join(' ');

    const { data, info } = await sharp(path.join(DIR, f), { density: 150 })
      .resize({ width: 600, fit: 'inside' })
      .flatten({ background: '#ffffff' })
      .raw().toBuffer({ resolveWithObject: true });

    const { width: W, height: H, channels: C } = info;
    let ink = 0, x0 = W, x1 = -1, y0 = H, y1 = -1, rs = 0, gs = 0, bs = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * C;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < 245 || g < 245 || b < 245) {
          ink++; rs += r; gs += g; bs += b;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    const cov = (ink / (W * H) * 100).toFixed(1);
    console.log(`${f.padEnd(17)} ${W}x${H}  ink=${cov}%  bbox=x${x0}-${x1} y${y0}-${y1}  avgRGB=(${(rs/ink)|0},${(gs/ink)|0},${(bs/ink)|0})`);
    console.log(`  colours: ${top}`);
  }
})();
