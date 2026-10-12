const path = require('path');
const fs = require('fs');
const { createWorker } = require('tesseract.js');
const WORK = path.resolve(__dirname, '..');
(async () => {
  const worker = await createWorker('chi_sim', 1, { logger: () => {} });
  const dir = path.join(WORK, process.argv[2] || 'preview');
  for (const f of fs.readdirSync(dir).filter(x => /[.](jpg|png)$/.test(x)).sort()) {
    const { data } = await worker.recognize(path.join(dir, f));
    console.log('===== ' + f + ' =====');
    console.log('  ' + (data.text || '').replace(/\s+/g, ' ').trim());
  }
  await worker.terminate();
})();
