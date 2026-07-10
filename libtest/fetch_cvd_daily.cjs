// Baja el histórico DIARIO de BTCUSDT (Binance data-api) con volumen taker-buy para
// reconstruir el CVD SPOT diario desde 2017 → alimenta el backtest del "bot Velo".
// Guarda btc_cvd_daily.json: [{t,o,h,l,c,v,q,tb,tq}] (v=base vol, q=quote vol,
// tb=taker buy base, tq=taker buy quote). Delta $ del día = 2*tq - q.
const fs = require('fs');
(async () => {
  let end = Date.now(), rows = [];
  for (let pg = 0; pg < 6; pg++) {
    const u = 'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&endTime=' + end;
    const j = await fetch(u).then(r => r.json());
    if (!Array.isArray(j) || !j.length) break;
    rows = j.concat(rows);
    end = j[0][0] - 86400000;
    if (j.length < 1000) break;
  }
  const out = rows.map(x => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[5], q: +x[7], tb: +x[9], tq: +x[10] }));
  fs.writeFileSync(__dirname + '/btc_cvd_daily.json', JSON.stringify(out));
  console.log('velas:', out.length, '· desde', new Date(out[0].t).toISOString().slice(0, 10), '· hasta', new Date(out[out.length - 1].t).toISOString().slice(0, 10));
})();
