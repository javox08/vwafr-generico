// BACKTEST DE LOS VEREDICTOS DEL ANÁLISIS VELO: replica EXACTAMENTE la clasificación
// de la web (pendiente de regresión del precio ±0,5% y del CVD/volumen ±0,4%, ventana
// W2 por temporalidad) y mide qué hizo el precio 10 velas DESPUÉS de cada veredicto.
// Salida: tabla win% (subió a 10 velas) · retorno medio · n, por TF y por clase (pd,cd).
const fs = require('fs');
const W2 = { '15m': 96, '1h': 120, '4h': 120, '1d': 90 }; // mismas ventanas que la web
const H = 10; // horizonte: 10 velas de esa temporalidad (como los patrones)

function slope(a) {
  const m = a.length, mx = (m - 1) / 2; let my = 0; for (const v of a) my += v; my /= m;
  let nu = 0, de = 0; for (let i = 0; i < m; i++) { nu += (i - mx) * (a[i] - my); de += (i - mx) * (i - mx); }
  return de ? nu / de : 0;
}
function classify(D, i, W) { // D: [{c,q,tq}] · clasifica con la ventana que TERMINA en i
  const w = D.slice(i - W + 1, i + 1);
  const cls = w.map(k => k.c);
  let cum = 0; const cvd = w.map(k => { cum += 2 * k.tq - k.q; return cum; });
  const pSl = slope(cls) / (cls[0] || 1) * w.length;
  const vTot = w.reduce((s, k) => s + k.q, 0) || 1;
  const cSl = slope(cvd) / vTot * w.length;
  const pd = pSl > 0.005 ? 1 : pSl < -0.005 ? -1 : 0, cd = cSl > 0.004 ? 1 : cSl < -0.004 ? -1 : 0;
  return pd + ',' + cd;
}
const NAMES = {
  '1,1': 'SUBIDA CON RESPALDO', '1,-1': 'SUBE SIN DINERO', '-1,-1': 'BAJADA REAL', '-1,1': 'CAE PERO ABSORBEN',
  '1,0': 'SUBE dinero neutro', '-1,0': 'BAJA dinero neutro', '0,-1': 'VENDEN pero AGUANTA', '0,1': 'COMPRAN no sube', '0,0': 'LATERAL'
};
const OUT = {};
for (const iv of ['15m', '1h', '4h', '1d']) {
  const f = __dirname + '/btc_cvd_' + iv + '.json';
  if (!fs.existsSync(f)) continue;
  const D = JSON.parse(fs.readFileSync(f, 'utf8'));
  const W = W2[iv];
  const acc = {};
  // paso 2 velas para no contar la misma situación 10 veces (solapamiento)
  for (let i = W; i < D.length - H; i += 2) {
    const k = classify(D, i, W);
    const fwd = D[i + H].c / D[i].c - 1;
    (acc[k] = acc[k] || []).push(fwd);
  }
  OUT[iv] = {};
  console.log('— ' + iv + ' (' + D.length + ' velas · horizonte ' + H + ' velas) —');
  for (const k of Object.keys(NAMES)) {
    const a = acc[k] || []; if (a.length < 20) { console.log(NAMES[k].padEnd(22) + ' n<20'); continue; }
    const win = a.filter(x => x > 0).length / a.length * 100;
    const avg = a.reduce((x, y) => x + y, 0) / a.length * 100;
    OUT[iv][k] = { w: +win.toFixed(0), a: +avg.toFixed(2), n: a.length };
    console.log(NAMES[k].padEnd(22) + ' win ' + win.toFixed(0) + '% · avg ' + (avg >= 0 ? '+' : '') + avg.toFixed(2) + '% · n=' + a.length);
  }
}
console.log('\nVELO_STATS=' + JSON.stringify(OUT));
