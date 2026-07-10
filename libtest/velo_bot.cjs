// BOT "ANÁLISIS VELO": ¿la lectura precio+CVD spot (respaldo real vs subida hueca /
// absorción) da ventaja operable en diario? Backtest honesto 2017-2026 con costes,
// split IS (→2022) / OOS (2023→) y comparación contra HOLD y contra la Élite (MA200+
// momentum+Donchian). Datos: btc_cvd_daily.json (klines Binance con taker buy).
// Delta $ del día = 2*takerBuyQuote − quoteVol (compras agresivas − ventas agresivas).
const fs = require('fs');
const D = JSON.parse(fs.readFileSync(__dirname + '/btc_cvd_daily.json', 'utf8'));
const px = D.map(d => d.c);
const delta = D.map(d => 2 * d.tb * ((d.q / d.v) || d.c) === 0 ? 0 : 2 * d.tq - d.q); // $ neto agresivo/día
const cvd = []; { let s = 0; for (const d of delta) { s += d; cvd.push(s); } }
const N = px.length;
const FEE = 0.0004, SLIP = 0.0005, COST = FEE + SLIP; // por lado, como bot_strategy.cjs

const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
// pendiente normalizada de regresión sobre las últimas n muestras (como veloTF de la web)
function slope(arr, i, n) {
  if (i < n) return 0;
  const seg = arr.slice(i - n + 1, i + 1), m = seg.length;
  const xm = (m - 1) / 2; let num = 0, den = 0;
  const ym = mean(seg);
  for (let k = 0; k < m; k++) { num += (k - xm) * (seg[k] - ym); den += (k - xm) * (k - xm); }
  const b = den > 0 ? num / den : 0;
  const scale = Math.abs(ym) > 1e-9 ? Math.abs(ym) : (std(seg) || 1);
  return b * m / scale; // % del nivel medio que se movió en la ventana
}

function run(sigFn, from = 0, to = N) {
  let eq = 1, peak = 1, hdd = 0, pos = 0, trades = 0, wins = 0, entryEq = 1;
  const dr = [];
  for (let i = Math.max(from, 210); i < to - 1; i++) {
    const sig = sigFn(i);
    if (sig !== pos) {
      if (pos !== 0) { trades++; if (eq >= entryEq) wins++; }
      eq *= (1 - COST * Math.abs(sig - pos)); // coste por el cambio de exposición
      if (sig !== 0) entryEq = eq;
      pos = sig;
    }
    const r = px[i + 1] / px[i] - 1;
    eq *= (1 + pos * r);
    dr.push(pos * r);
    if (eq > peak) peak = eq;
    const dd = 1 - eq / peak; if (dd > hdd) hdd = dd;
  }
  const yrs = (to - Math.max(from, 210)) / 365;
  return {
    cagr: (Math.pow(eq, 1 / Math.max(0.5, yrs)) - 1) * 100,
    sharpe: std(dr) > 0 ? mean(dr) / std(dr) * Math.sqrt(365) : 0,
    maxDD: hdd * 100, trades, win: trades ? wins / trades * 100 : 0, eq
  };
}

const OOS_START = px.findIndex((_, i) => D[i].t >= Date.UTC(2023, 0, 1));
const fx = v => (v >= 0 ? '+' : '') + v.toFixed(1);
function report(name, sigFn) {
  const f = run(sigFn), oo = run(sigFn, OOS_START);
  console.log(name.padEnd(34) + '| FULL ' + fx(f.cagr) + '%/a sh ' + f.sharpe.toFixed(2) + ' DD ' + f.maxDD.toFixed(0) + '% ops ' + f.trades + ' win ' + f.win.toFixed(0) + '% | OOS23+ ' + fx(oo.cagr) + '%/a sh ' + oo.sharpe.toFixed(2) + ' DD ' + oo.maxDD.toFixed(0) + '%');
  return { f, oo };
}

// referencias
report('HOLD (comprar y aguantar)', () => 1);
const ma = (arr, i, n) => { let s = 0; for (let k = i - n + 1; k <= i; k++) s += arr[k]; return s / n; };
report('ÉLITE (MA200+mom+Donchian) base', i => {
  if (i < 210) return 0;
  const m200 = ma(px, i, 200);
  const mom = px[i] / px[i - 90] - 1;
  let hi = -Infinity, lo = Infinity; for (let k = i - 99; k <= i; k++) { if (px[k] > hi) hi = px[k]; if (px[k] < lo) lo = px[k]; }
  return (px[i] > m200 && mom > 0 && px[i] > (hi + lo) / 2) ? 1 : 0;
});

console.log('— variantes VELO (precio+CVD spot, pendientes de regresión) —');
for (const n of [10, 20, 30, 45]) {
  report('V1 respaldo n=' + n + ' (p↑ y CVD↑)', i => (slope(px, i, n) > 0 && slope(cvd, i, n) > 0) ? 1 : 0);
}
for (const n of [20, 30]) {
  report('V2 n=' + n + ' respaldo o absorción', i => {
    const sp = slope(px, i, n), sc = slope(cvd, i, n);
    if (sp > 0 && sc > 0) return 1;           // subida con respaldo
    if (sp <= 0 && sc > 0.02) return 1;       // absorción: venden precio, entra CVD
    return 0;
  });
  report('V3 n=' + n + ' respaldo sin hueca', i => {
    const sp = slope(px, i, n), sc = slope(cvd, i, n);
    if (sp > 0 && sc > 0) return 1;
    if (sp > 0 && sc <= 0) return 0;          // subida hueca: fuera
    return 0;
  });
}
// V4: tendencia (MA200) + veto de divergencia CVD (el "no te lo creas" del Velo)
report('V4 MA200 + veto divergencia CVD', i => {
  if (i < 210) return 0;
  if (px[i] <= ma(px, i, 200)) return 0;
  const sp = slope(px, i, 20), sc = slope(cvd, i, 20);
  if (sp > 0.03 && sc < -0.01) return 0;      // sube fuerte sin CVD → hueca, fuera
  return 1;
});
// V5: Élite + veto de divergencia CVD (¿mejora el bot estrella?)
report('V5 ÉLITE + veto divergencia CVD', i => {
  if (i < 210) return 0;
  const m200 = ma(px, i, 200);
  const mom = px[i] / px[i - 90] - 1;
  let hi = -Infinity, lo = Infinity; for (let k = i - 99; k <= i; k++) { if (px[k] > hi) hi = px[k]; if (px[k] < lo) lo = px[k]; }
  const elite = (px[i] > m200 && mom > 0 && px[i] > (hi + lo) / 2) ? 1 : 0;
  if (!elite) return 0;
  const sp = slope(px, i, 20), sc = slope(cvd, i, 20);
  if (sp > 0.03 && sc < -0.01) return 0;
  return 1;
});
