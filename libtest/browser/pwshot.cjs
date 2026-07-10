// Captura móvil REAL (Playwright, viewport exacto — chromium headless CLI clampa a 500px).
// Uso: NODE_PATH=/opt/node22/lib/node_modules node pwshot.cjs <test_html> <out_png> [width]
const { chromium } = require('playwright');
(async () => {
  const [, , file, out, w] = process.argv;
  const W = parseInt(w || '414', 10);
  const br = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const pg = await br.newPage({ viewport: { width: W, height: 900 } });
  await pg.goto('file://' + file, { waitUntil: 'load' });
  await pg.waitForTimeout(9000); // deja que el mock alimente los efectos
  const rep = await pg.evaluate(() => {
    const W2 = window.innerWidth, bad = [];
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.right > W2 + 2 && r.width < 3000) {
        let childBad = false;
        el.querySelectorAll('*').forEach(k => { if (k.getBoundingClientRect().right > W2 + 2) childBad = true; });
        // ignora hijos de contenedores con scroll horizontal propio (por diseño)
        let p = el.parentElement, scrollOk = false;
        while (p) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX)) { scrollOk = true; break; } p = p.parentElement; }
        if (!childBad && !scrollOk) bad.push(el.tagName + '|r=' + Math.round(r.right) + '|' + (el.textContent || '').slice(0, 50).replace(/\s+/g, ' '));
      }
    });
    return { innerW: W2, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 25) };
  });
  console.log('INNERW:' + rep.innerW, 'SCROLLW:' + rep.scrollW, 'OVF:' + rep.bad.length);
  rep.bad.forEach(b => console.log('  ' + b));
  await pg.screenshot({ path: out, fullPage: true });
  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
