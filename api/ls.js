// Agregador LONG/SHORT para la web. OKX no envía cabeceras CORS, así que el
// navegador no puede llamarle directamente: esta función (Vercel, mismo relé
// que api/bx.js) pide los ratios y los devuelve con CORS abierto y caché de
// 5 minutos. No usa claves: todo son endpoints públicos.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const out = { t: Date.now(), coins: [], btc: {} };
  await Promise.all(COINS.map(async c => {
    try {
      const j = await fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=' + c + '&period=1H').then(r => r.json());
      const v = parseFloat(j && j.data && j.data[0] && j.data[0][1]);
      if (Number.isFinite(v) && v > 0) out.coins.push({ c, r: v });
    } catch (e) {}
  }));
  try { // histórico del ratio de BTC (para el z-score de fuerza en la web)
    const j = await fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=BTC&period=1H').then(r => r.json());
    const arr = (j && j.data) || [];
    out.btc.hist = arr.slice(0, 72).map(x => parseFloat(x[1])).filter(Number.isFinite);
  } catch (e) {}
  try { // ratio por POSICIONES de top traders (el "dinero")
    const j = await fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-position-ratio-contract-top-trader?instId=BTC-USDT-SWAP&period=1H').then(r => r.json());
    const v = parseFloat(j && j.data && j.data[0] && j.data[0][1]);
    if (Number.isFinite(v) && v > 0) out.btc.pos = v;
  } catch (e) {}
  res.status(200).json(out);
};
