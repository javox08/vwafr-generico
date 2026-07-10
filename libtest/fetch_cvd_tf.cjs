// Baja klines de BTCUSDT con taker buy para CUALQUIER temporalidad (para el backtest
// de los veredictos del Análisis Velo). Uso: node fetch_cvd_tf.cjs 4h 3300
// → btc_cvd_4h.json [{t,c,q,tq}] (q=quote vol, tq=taker buy quote).
const fs = require('fs');
(async () => {
  const iv = process.argv[2] || '4h', days = +(process.argv[3] || 3300);
  const ms = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 }[iv];
  const total = Math.ceil(days * 864e5 / ms);
  let end = Date.now(), rows = [];
  for (let pg = 0; pg < Math.ceil(total / 1000) + 1 && rows.length < total; pg++) {
    const j = await fetch('https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=' + iv + '&limit=1000&endTime=' + end).then(r => r.json());
    if (!Array.isArray(j) || !j.length) break;
    rows = j.concat(rows);
    end = j[0][0] - ms;
    if (j.length < 1000) break;
  }
  const out = rows.map(x => ({ t: +x[0], c: +x[4], q: +x[7], tq: +x[10] }));
  fs.writeFileSync(__dirname + '/btc_cvd_' + iv + '.json', JSON.stringify(out));
  console.log(iv, 'velas:', out.length, '· desde', new Date(out[0].t).toISOString().slice(0, 10));
})();
