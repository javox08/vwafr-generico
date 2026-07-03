// Agregador LONG/SHORT para la web. OKX no envía cabeceras CORS, así que el
// navegador no puede llamarle directamente: esta función (Vercel, mismo relé
// que api/bx.js) pide los ratios y los devuelve con CORS abierto y caché de
// 5 minutos. No usa claves: todo son endpoints públicos.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const out = { t: Date.now(), coins: [], btc: {} };
  // SECUENCIAL por moneda (OKX limita las peticiones simultáneas), pero los 3
  // exchanges de cada moneda en paralelo. Bybit/Binance pueden estar geo-
  // bloqueados según la región del servidor: si fallan, queda la media del resto.
  for (const c of COINS) {
    const [okx, bybit, binance] = await Promise.all([
      fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=' + c + '&period=1H').then(r => r.json()).catch(() => null),
      fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=' + c + 'USDT&period=1h&limit=1').then(r => r.json()).catch(() => null),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=' + c + 'USDT&period=1h&limit=1').then(r => r.json()).catch(() => null)
    ]);
    const rs = [];
    const arr = (okx && okx.data) || [];
    const vO = parseFloat(arr[0] && arr[0][1]);
    if (Number.isFinite(vO) && vO > 0) rs.push(vO);
    if (c === 'BTC') out.btc.hist = arr.slice(0, 72).map(x => parseFloat(x[1])).filter(Number.isFinite);
    const bl = bybit && bybit.result && bybit.result.list && bybit.result.list[0];
    if (bl) { const b = parseFloat(bl.buyRatio), s = parseFloat(bl.sellRatio); if (b > 0 && s > 0) rs.push(b / s); }
    const bn = Array.isArray(binance) && binance[0];
    if (bn) { const v = parseFloat(bn.longShortRatio); if (v > 0) rs.push(v); }
    if (rs.length) out.coins.push({ c, r: rs.reduce((a, x) => a + x, 0) / rs.length, srcs: rs.length });
    await new Promise(r2 => setTimeout(r2, 120));
  }
  try { // ratio por POSICIONES de top traders (el "dinero")
    const j = await fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-position-ratio-contract-top-trader?instId=BTC-USDT-SWAP&period=1H').then(r => r.json());
    const v = parseFloat(j && j.data && j.data[0] && j.data[0][1]);
    if (Number.isFinite(v) && v > 0) out.btc.pos = v;
  } catch (e) {}
  res.status(200).json(out);
};
