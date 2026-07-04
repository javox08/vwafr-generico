// Agregador LONG/SHORT para la web. OKX no envía cabeceras CORS, así que el
// navegador no puede llamarle directamente: esta función (Vercel, mismo relé
// que api/bx.js) pide los ratios y los devuelve con CORS abierto y caché de
// 5 minutos. No usa claves: todo son endpoints públicos.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  const out = { t: Date.now(), coins: [], btc: {} };
  // SECUENCIAL por moneda (OKX limita las peticiones simultáneas), pero los 3
  // exchanges de cada moneda en paralelo. Bybit/Binance pueden estar geo-
  // bloqueados según la región del servidor: si fallan, queda la media del resto.
  for (const c of COINS) {
    const [okx, bybit, binance, okxPro] = await Promise.all([
      fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=' + c + '&period=1H').then(r => r.json()).catch(() => null),
      fetch('https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=' + c + 'USDT&period=1h&limit=1').then(r => r.json()).catch(() => null),
      fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=' + c + 'USDT&period=1h&limit=1').then(r => r.json()).catch(() => null),
      fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-position-ratio-contract-top-trader?instId=' + c + '-USDT-SWAP&period=1H').then(r => r.json()).catch(() => null)
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
    // ratio de TOP TRADERS (pros) por moneda, de OKX (posiciones)
    let rp = null;
    const dp = okxPro && okxPro.data && okxPro.data[0];
    const vp = parseFloat(dp && dp[1]);
    if (Number.isFinite(vp) && vp > 0) rp = vp;
    if (rs.length || rp != null) out.coins.push({ c, r: rs.length ? rs.reduce((a, x) => a + x, 0) / rs.length : null, srcs: rs.length, rp });
    await new Promise(r2 => setTimeout(r2, 120));
  }
  // ratio por POSICIONES de TOP TRADERS (el "dinero de los pros"): SOLO fuentes que
  // son de verdad de top traders por posición (OKX y Binance). Bybit no publica
  // top-traders (solo cuentas = la masa), así que NO entra aquí — iría al lado
  // largo de la multitud y falsearía el dato. Ponderado por OI (USD).
  {
    const items = []; // {ex, r, oi}
    try {
      const [rt, oi] = await Promise.all([
        fetch('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-position-ratio-contract-top-trader?instId=BTC-USDT-SWAP&period=1H').then(r => r.json()).catch(() => null),
        fetch('https://www.okx.com/api/v5/public/open-interest?instId=BTC-USDT-SWAP').then(r => r.json()).catch(() => null)
      ]);
      const v = parseFloat(rt && rt.data && rt.data[0] && rt.data[0][1]);
      const w = parseFloat(oi && oi.data && oi.data[0] && oi.data[0].oiUsd);
      if (Number.isFinite(v) && v > 0) items.push({ ex: 'OKX', r: v, oi: Number.isFinite(w) && w > 0 ? w / 1e9 : 1 });
    } catch (e) {}
    try {
      const [rt, px, oi] = await Promise.all([
        fetch('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=1h&limit=1').then(r => r.json()).catch(() => null),
        fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT').then(r => r.json()).catch(() => null),
        fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT').then(r => r.json()).catch(() => null)
      ]);
      const v = parseFloat(Array.isArray(rt) && rt[0] && rt[0].longShortRatio);
      const p = parseFloat(px && px.markPrice), oiB = parseFloat(oi && oi.openInterest);
      if (Number.isFinite(v) && v > 0) items.push({ ex: 'Binance', r: v, oi: (Number.isFinite(p) && Number.isFinite(oiB)) ? p * oiB / 1e9 : 1 });
    } catch (e) {}
    if (items.length) {
      let wsum = 0, rsum = 0; for (const it of items) { wsum += it.oi; rsum += it.r * it.oi; }
      out.btc.pos = wsum > 0 ? rsum / wsum : items.reduce((a, x) => a + x.r, 0) / items.length;
      out.btc.posSrcs = items.length; out.btc.posEx = items.map(x => x.ex); out.btc.posW = items.length > 1;
      // COHERENCIA: la fila de BTC del top-10 usa el MISMO valor (pros multi-exchange)
      const bc = out.coins.find(x => x.c === 'BTC'); if (bc) bc.rp = out.btc.pos;
    }
  }
  // VOLUMEN 24h FUTUROS vs SPOT (mismo exchange = comparable): Binance BTC+ETH.
  // Futuros = derivados apalancados; spot = compra/venta real. Ratio del mercado.
  {
    let fut = 0, spot = 0;
    for (const s of ['BTCUSDT', 'ETHUSDT']) {
      try {
        const [f, sp] = await Promise.all([
          fetch('https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=' + s).then(r => r.json()).catch(() => null),
          fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=' + s).then(r => r.json()).catch(() => null)
        ]);
        const fv = parseFloat(f && f.quoteVolume), sv = parseFloat(sp && sp.quoteVolume);
        if (Number.isFinite(fv)) fut += fv;
        if (Number.isFinite(sv)) spot += sv;
      } catch (e) {}
    }
    if (fut > 0 && spot > 0) out.mkt = { futVol: +(fut / 1e9).toFixed(2), spotVol: +(spot / 1e9).toFixed(2) };
  }
  res.status(200).json(out);
};
