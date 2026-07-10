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
    // desglose POR EXCHANGE de BTC: cada ratio tal cual lo publica su web oficial,
    // para que el usuario pueda verificarlo 1:1 (en Coinglass o en el exchange).
    if (c === 'BTC') { out.btc.lsEx = { acc: {}, pro: {} }; if (Number.isFinite(vO) && vO > 0) out.btc.lsEx.acc.OKX = +vO.toFixed(3); }
    const bl = bybit && bybit.result && bybit.result.list && bybit.result.list[0];
    if (bl) { const b = parseFloat(bl.buyRatio), s = parseFloat(bl.sellRatio); if (b > 0 && s > 0) { rs.push(b / s); if (c === 'BTC' && out.btc.lsEx) out.btc.lsEx.acc.Bybit = +(b / s).toFixed(3); } }
    const bn = Array.isArray(binance) && binance[0];
    if (bn) { const v = parseFloat(bn.longShortRatio); if (v > 0) { rs.push(v); if (c === 'BTC' && out.btc.lsEx) out.btc.lsEx.acc.Binance = +v.toFixed(3); } }
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
      let wsum = 0, rsum = 0; for (const it of items) { wsum += it.oi; rsum += it.r * it.oi; if (out.btc.lsEx) out.btc.lsEx.pro[it.ex] = +it.r.toFixed(4); }
      out.btc.pos = wsum > 0 ? rsum / wsum : items.reduce((a, x) => a + x.r, 0) / items.length;
      out.btc.posSrcs = items.length; out.btc.posEx = items.map(x => x.ex); out.btc.posW = items.length > 1;
      // COHERENCIA: la fila de BTC del top-10 usa el MISMO valor (pros multi-exchange)
      const bc = out.coins.find(x => x.c === 'BTC'); if (bc) bc.rp = out.btc.pos;
    }
  }
  // TAKER LONG/SHORT 24h de BTC (el número que enseña Coinglass en portada): cuánto
  // volumen AGRESIVO abrió largos vs cortos en 24h en Binance Futures. Distinto del
  // ratio de CUENTAS (posicionamiento): esto es FLUJO de órdenes, y suele rondar 50/50.
  try {
    const tk = await fetch('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=480').then(r => r.json()).catch(() => null);
    if (Array.isArray(tk) && tk.length) {
      let b24 = 0, s24 = 0, cum = 0; const cv = [];
      for (let i = 0; i < tk.length; i++) {
        const bv = parseFloat(tk[i].buyVol), sv = parseFloat(tk[i].sellVol);
        if (Number.isFinite(bv) && Number.isFinite(sv)) { cum += bv - sv; if (i >= tk.length - 24) { b24 += bv; s24 += sv; } }
        cv.push(+cum.toFixed(1));
      }
      if (b24 > 0 && s24 > 0) out.btc.taker = { b: +b24.toFixed(0), s: +s24.toFixed(0), pl: +(b24 / (b24 + s24)).toFixed(4) };
      out.btc.cvdFut = cv; // CVD de FUTUROS acumulado (BTC, taker buy−sell), 1h × ~480 ≈ 20 días
    }
  } catch (e) {}
  // PREMIUM AGREGADO (el "Aggregated Premium" de Velo): prima del perpetuo sobre su
  // índice spot, media de Binance y Bybit. >0 = futuros pagan sobre spot (apalancamiento
  // alcista); <0 = descuento (miedo). En %.
  try {
    const ps = [];
    const bn = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT').then(r => r.json()).catch(() => null);
    if (bn) { const m = parseFloat(bn.markPrice), ix = parseFloat(bn.indexPrice); if (m > 0 && ix > 0) ps.push((m - ix) / ix * 100); }
    const by = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT').then(r => r.json()).catch(() => null);
    const bl = by && by.result && by.result.list && by.result.list[0];
    if (bl) { const m = parseFloat(bl.markPrice), ix = parseFloat(bl.indexPrice); if (m > 0 && ix > 0) ps.push((m - ix) / ix * 100); }
    if (ps.length) out.btc.prem = +(ps.reduce((a, x) => a + x, 0) / ps.length).toFixed(4);
  } catch (e) {}
  // HISTÓRICOS para la "Vista Velo" de la web: premium futuros-spot (1h × 480, %) y
  // funding (últimos 60 pagos de 8h ≈ 20 días, %). Como los paneles apilados de velo.xyz.
  try {
    const pk = await fetch('https://fapi.binance.com/fapi/v1/premiumIndexKlines?symbol=BTCUSDT&interval=1h&limit=480').then(r => r.json()).catch(() => null);
    if (Array.isArray(pk) && pk.length > 10) out.btc.premHist = pk.map(x => +((+x[4]) * 100).toFixed(4));
  } catch (e) {}
  try {
    const fr2 = await fetch('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=270').then(r => r.json()).catch(() => null);
    if (Array.isArray(fr2) && fr2.length > 5) out.btc.fundHist = fr2.map(x => +((+x.fundingRate) * 100).toFixed(4));
  } catch (e) {}
  // VERSIONES DIARIAS para la temporalidad 1D de la Vista Velo (si no, 4h y 1D salían
  // iguales): premium 1d × 90 y OI diario (Binance solo publica ~30 días de OI).
  try {
    const pk2 = await fetch('https://fapi.binance.com/fapi/v1/premiumIndexKlines?symbol=BTCUSDT&interval=1d&limit=90').then(r => r.json()).catch(() => null);
    if (Array.isArray(pk2) && pk2.length > 10) out.btc.premHistD = pk2.map(x => +((+x[4]) * 100).toFixed(4));
  } catch (e) {}
  try {
    const oh3 = await fetch('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=30').then(r => r.json()).catch(() => null);
    if (Array.isArray(oh3) && oh3.length > 5) out.btc.oiHistD = oh3.map(x => +((+x.sumOpenInterestValue) / 1e9).toFixed(3));
  } catch (e) {}
  // HISTÓRICO de OI de BTC (Binance, 1h × 480 ≈ 20 días, en $B): alimenta las tendencias
  // de interés abierto del "Análisis Velo" de la web (OI↑ con precio↑ = dinero nuevo, etc.)
  try {
    const oh2 = await fetch('https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=480').then(r => r.json()).catch(() => null);
    if (Array.isArray(oh2) && oh2.length > 10)
      out.btc.oiHist = oh2.map(x => +((+x.sumOpenInterestValue) / 1e9).toFixed(3));
  } catch (e) {}
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
