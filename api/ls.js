// Agregador LONG/SHORT para la web. OKX no envía cabeceras CORS, así que el
// navegador no puede llamarle directamente: esta función (Vercel, mismo relé
// que api/bx.js) pide los ratios y los devuelve con CORS abierto y caché de
// 5 minutos. No usa claves: todo son endpoints públicos.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC'];
// fetch con timeout (para OI coin-M, skew de opciones… fuentes que pueden tardar)
const jf = (u, ms = 4500) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => null).finally(() => clearTimeout(t)); };

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
  // CVD PERP AGREGADO (informe: "CVD agregado Binance/OKX para divergencias"): flujo taker
  // de los últimos 7d en USD, de BINANCE (buy−sell BTC × precio) + OKX (taker-volume, ya en
  // USD). Un mismo signo en las dos bolsas = presión de derivados coherente; signos opuestos
  // = ruido/arbitraje entre venues. OKX taker-volume: [ts, sellVol, buyVol] (USD).
  try {
    const [tk, ok, px] = await Promise.all([
      fetch('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=168').then(r => r.json()).catch(() => null),
      fetch('https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=CONTRACTS&period=1H').then(r => r.json()).catch(() => null),
      fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT').then(r => r.json()).catch(() => null)
    ]);
    const p = parseFloat(px && px.markPrice) || 0;
    let binUsd = null, okxUsd = null;
    if (Array.isArray(tk) && tk.length && p > 0) {
      let d = 0; for (const r of tk) { const bv = parseFloat(r.buyVol), sv = parseFloat(r.sellVol); if (Number.isFinite(bv) && Number.isFinite(sv)) d += bv - sv; }
      binUsd = d * p;
    }
    const od = ok && ok.data;
    if (Array.isArray(od) && od.length) {
      let d = 0; for (const r of od) { const sell = parseFloat(r[1]), buy = parseFloat(r[2]); if (Number.isFinite(buy) && Number.isFinite(sell)) d += buy - sell; }
      okxUsd = d;
    }
    if (binUsd != null || okxUsd != null) out.btc.cvdAgg = { binUsd: binUsd != null ? +binUsd.toFixed(0) : null, okxUsd: okxUsd != null ? +okxUsd.toFixed(0) : null };
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
  // OI COIN-MARGINED vs STABLECOIN-MARGINED (Binance, oficial): la cuota coin-margined
  // subiendo = euforia/apalancamiento compuesto (colateral en BTC); bajando = mercado
  // más "lineal" y menos violento en caídas. dapi = COIN-M (contratos de $100).
  try {
    const [ci, li, px] = await Promise.all([
      jf('https://dapi.binance.com/dapi/v1/openInterest?symbol=BTCUSD_PERP'),
      jf('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT'),
      jf('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT')
    ]);
    const coinM = parseFloat(ci && ci.openInterest) * 100; // contratos de $100 → USD
    const p = parseFloat(px && px.markPrice), lin = parseFloat(li && li.openInterest) * (Number.isFinite(p) ? p : 0);
    if (coinM > 0 && lin > 0) out.btc.oiSplit = { coinM: +(coinM / 1e9).toFixed(3), stableM: +(lin / 1e9).toFixed(3) };
  } catch (e) {}
  // SKEW DE OPCIONES (Deribit, oficial): risk reversal 25Δ aprox = IV(call OTM) −
  // IV(put OTM) de la expiración ~30d. Positivo = demanda de calls (alcista);
  // negativo = demanda de puts (cobertura/miedo). Proxy de "smart money"/hedgers.
  try {
    const r = await jf('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option', 6000);
    const arr = (r && r.result) || [];
    if (arr.length > 20) {
      const now = Date.now(), MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
      const toMs = s => { const m = s.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/); if (!m) return NaN;
        return Date.UTC(2000 + (+m[3]), MON[m[2]], +m[1], 8, 0, 0); };
      const exps = {}; let sp = 0;
      for (const it of arr) {
        const m = ('' + it.instrument_name).match(/^BTC-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-([CP])$/);
        if (!m || !(it.mark_iv > 0)) continue;
        if (it.underlying_price > 0) sp = it.underlying_price;
        (exps[m[1]] = exps[m[1]] || []).push({ k: +m[2], t: m[3], iv: it.mark_iv });
      }
      const keys = Object.keys(exps).filter(k => toMs(k) > now + 5 * 864e5);
      keys.sort((a, b) => Math.abs(toMs(a) - now - 30 * 864e5) - Math.abs(toMs(b) - now - 30 * 864e5));
      const exp = keys[0], items = exp && exps[exp];
      if (items && sp > 0) {
        const near = (typ, tgt) => { let b = null; for (const o of items) if (o.t === typ) { if (!b || Math.abs(o.k - tgt) < Math.abs(b.k - tgt)) b = o; } return b; };
        const c = near('C', sp * 1.1), pu = near('P', sp * 0.9), atm = near('C', sp);
        if (c && pu) out.btc.skew = { rr: +(c.iv - pu.iv).toFixed(2), atmIv: atm ? +atm.iv.toFixed(1) : null,
          days: +((toMs(exp) - now) / 864e5).toFixed(0) };
      }
      // MAX PAIN y ratio PUT/CALL (por interés abierto) del vencimiento con más OI: el "imán"
      // de precio hacia la expiración (donde más opciones caducan sin valor) y el sesgo puts/calls.
      const byExp = {}; let sp2 = 0;
      for (const it of arr) {
        const m = ('' + it.instrument_name).match(/^BTC-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-([CP])$/);
        const oi = +it.open_interest || 0; if (!m || oi <= 0) continue;
        if (it.underlying_price > 0) sp2 = it.underlying_price;
        (byExp[m[1]] = byExp[m[1]] || []).push({ k: +m[2], cp: m[3], oi });
      }
      // vencimiento: el de más OI de los PRÓXIMOS ≤45 días (el "imán" solo actúa cerca de
      // la expiración; los LEAPS lejanos acumulan mucho OI pero no tiran del precio). Si no, global.
      const pick = maxD => { let t2 = null, best = -1; for (const e in byExp) {
        const dd = (toMs(e) - now) / 864e5; if (dd < 2 || (maxD && dd > maxD)) continue;
        const tot = byExp[e].reduce((a, x) => a + x.oi, 0); if (tot > best) { best = tot; t2 = e; } }
        return t2; };
      const tgt = pick(45) || pick(null);
      if (tgt && sp2 > 0) {
        const its = byExp[tgt]; let call = 0, put = 0;
        for (const x of its) { if (x.cp === 'C') call += x.oi; else put += x.oi; }
        const strikes = [...new Set(its.map(x => x.k))].sort((a, b) => a - b);
        let mp = null, best = Infinity;
        for (const S of strikes) { let pay = 0;
          for (const x of its) pay += x.cp === 'C' ? Math.max(0, S - x.k) * x.oi : Math.max(0, x.k - S) * x.oi;
          if (pay < best) { best = pay; mp = S; } }
        out.btc.opts = { exp: tgt, days: +((toMs(tgt) - now) / 864e5).toFixed(0), maxPain: mp,
          pc: call > 0 ? +(put / call).toFixed(2) : null, callOI: +call.toFixed(0), putOI: +put.toFixed(0), spot: +sp2.toFixed(0) };
      }
    }
  } catch (e) {}
  // MAX PAIN y PUT/CALL de ETH (mismo cálculo que BTC, book de opciones ETH de Deribit)
  try {
    const r = await jf('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=ETH&kind=option', 5000);
    const arr = (r && r.result) || [];
    if (arr.length > 20) {
      const now = Date.now(), MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
      const toMs = s => { const m = s.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/); if (!m) return NaN;
        return Date.UTC(2000 + (+m[3]), MON[m[2]], +m[1], 8, 0, 0); };
      const byExp = {}; let sp2 = 0;
      for (const it of arr) {
        const m = ('' + it.instrument_name).match(/^ETH-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-([CP])$/);
        const oi = +it.open_interest || 0; if (!m || oi <= 0) continue;
        if (it.underlying_price > 0) sp2 = it.underlying_price;
        (byExp[m[1]] = byExp[m[1]] || []).push({ k: +m[2], cp: m[3], oi });
      }
      const pick = maxD => { let t2 = null, best = -1; for (const e in byExp) {
        const dd = (toMs(e) - now) / 864e5; if (dd < 2 || (maxD && dd > maxD)) continue;
        const tot = byExp[e].reduce((a, x) => a + x.oi, 0); if (tot > best) { best = tot; t2 = e; } }
        return t2; };
      const tgt = pick(45) || pick(null);
      if (tgt && sp2 > 0) {
        const its = byExp[tgt]; let call = 0, put = 0;
        for (const x of its) { if (x.cp === 'C') call += x.oi; else put += x.oi; }
        const strikes = [...new Set(its.map(x => x.k))].sort((a, b) => a - b);
        let mp = null, best = Infinity;
        for (const S of strikes) { let pay = 0;
          for (const x of its) pay += x.cp === 'C' ? Math.max(0, S - x.k) * x.oi : Math.max(0, x.k - S) * x.oi;
          if (pay < best) { best = pay; mp = S; } }
        out.eth = out.eth || {};
        out.eth.opts = { exp: tgt, days: +((toMs(tgt) - now) / 864e5).toFixed(0), maxPain: mp,
          pc: call > 0 ? +(put / call).toFixed(2) : null, callOI: +call.toFixed(0), putOI: +put.toFixed(0), spot: +(+sp2).toFixed(0) };
      }
    }
  } catch (e) {}
  // CPI REAL de EE.UU. (Fed/FRED, oficial, sin clave): último IPC + variación interanual
  // y mensual, para el calendario económico. FRED no da CORS al navegador → va por el relé.
  // 1º BLS (Oficina de Estadísticas Laborales, responde bien desde datacenter); series
  // CUUR0000SA0 = IPC-U todos los ítems. Devuelve lo más reciente primero.
  try {
    const j = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0?startyear=' + (new Date().getUTCFullYear() - 1) + '&endyear=' + new Date().getUTCFullYear()).then(r => r.json());
    const s = j && j.Results && j.Results.series && j.Results.series[0] && j.Results.series[0].data;
    if (Array.isArray(s) && s.length >= 13) {
      const v = i => parseFloat(s[i].value);
      const last = v(0), prev = v(1), yr = v(12);
      const mn = { M01: '01', M02: '02', M03: '03', M04: '04', M05: '05', M06: '06', M07: '07', M08: '08', M09: '09', M10: '10', M11: '11', M12: '12' }[s[0].period] || '01';
      if (last > 0 && yr > 0) {
        out.cpi = { yoy: +((last / yr - 1) * 100).toFixed(1), mom: +((last / prev - 1) * 100).toFixed(2), month: s[0].year + '-' + mn + '-01' };
        // dato PREVIO (el anterior publicado, la referencia con la que el mercado compara)
        if (s.length >= 14) { const prev2 = v(2), yr2 = v(13);
          if (prev > 0 && prev2 > 0 && yr2 > 0) { out.cpi.prevYoy = +((prev / yr2 - 1) * 100).toFixed(1); out.cpi.prevMom = +((prev / prev2 - 1) * 100).toFixed(2); } }
        // ESTIMACIÓN para el PRÓXIMO dato: media de las últimas ~6 variaciones mensuales (run-rate).
        // NO es el consenso de mercado (sin API pública gratis), es una proyección por tendencia.
        const ms = []; for (let i = 0; i < 6 && i + 1 < s.length; i++) { const a = v(i), b = v(i + 1); if (a > 0 && b > 0) ms.push(a / b - 1); }
        if (ms.length >= 3) { const em = ms.reduce((p, x) => p + x, 0) / ms.length;
          out.cpi.estMom = +(em * 100).toFixed(2);
          if (v(11) > 0) out.cpi.estYoy = +(((last * (1 + em)) / v(11) - 1) * 100).toFixed(1); }
        // PREVISIÓN para el ÚLTIMO dato ya publicado, calculada SOLO con datos anteriores a él
        // (excluye el propio mes) → permite comparar Actual vs Previsión al estilo Investing sin
        // circularidad, y decir si "salió por encima/por debajo de lo previsto".
        const ms2 = []; for (let i = 1; i < 7 && i + 1 < s.length; i++) { const a = v(i), b = v(i + 1); if (a > 0 && b > 0) ms2.push(a / b - 1); }
        if (ms2.length >= 3 && v(12) > 0) { const em2 = ms2.reduce((p, x) => p + x, 0) / ms2.length;
          out.cpi.estLastMom = +(em2 * 100).toFixed(2);
          out.cpi.estLastYoy = +(((prev * (1 + em2)) / v(12) - 1) * 100).toFixed(1); }
        // serie HISTÓRICA de interanuales (últimos ~6 meses, viejo→nuevo) para el sparkline
        const hy = []; for (let i = 0; i < 6 && i + 12 < s.length; i++) { const a2 = v(i), b2 = v(i + 12); if (a2 > 0 && b2 > 0) hy.push(+((a2 / b2 - 1) * 100).toFixed(1)); }
        if (hy.length >= 4) out.cpi.hist = hy.reverse();
      }
    }
  } catch (e) {}
  // respaldo: FRED (CSV, sin clave) si BLS no respondió
  if (!out.cpi) try {
    const txt = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL&cosd=2023-01-01', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VWAFR/1.0)', 'Accept': 'text/csv,*/*' }
    }).then(r => r.text());
    const rows = txt.trim().split('\n').slice(1).map(l => l.split(',')).filter(x => x[1] && x[1] !== '.' && Number.isFinite(+x[1]));
    if (rows.length >= 13) {
      const n = rows.length, last = rows[n - 1], prev = rows[n - 2], y = rows[n - 13];
      out.cpi = { yoy: +((+last[1] / +y[1] - 1) * 100).toFixed(1), mom: +((+last[1] / +prev[1] - 1) * 100).toFixed(2), month: last[0] };
      if (n >= 14) { const prev2 = rows[n - 3], y2 = rows[n - 14];
        out.cpi.prevYoy = +((+prev[1] / +y2[1] - 1) * 100).toFixed(1); out.cpi.prevMom = +((+prev[1] / +prev2[1] - 1) * 100).toFixed(2); }
      const ms = []; for (let i = 0; i < 6 && n - 2 - i >= 0; i++) { const a = +rows[n - 1 - i][1], b = +rows[n - 2 - i][1]; if (a > 0 && b > 0) ms.push(a / b - 1); }
      if (ms.length >= 3 && n - 12 >= 0) { const em = ms.reduce((p, x) => p + x, 0) / ms.length;
        out.cpi.estMom = +(em * 100).toFixed(2); out.cpi.estYoy = +(((+last[1] * (1 + em)) / +rows[n - 12][1] - 1) * 100).toFixed(1); }
      const ms2 = []; for (let i = 1; i < 7 && n - 2 - i >= 0; i++) { const a = +rows[n - 1 - i][1], b = +rows[n - 2 - i][1]; if (a > 0 && b > 0) ms2.push(a / b - 1); }
      if (ms2.length >= 3 && n - 13 >= 0) { const em2 = ms2.reduce((p, x) => p + x, 0) / ms2.length;
        out.cpi.estLastMom = +(em2 * 100).toFixed(2); out.cpi.estLastYoy = +(((+prev[1] * (1 + em2)) / +rows[n - 13][1] - 1) * 100).toFixed(1); }
    }
  } catch (e) {}
  // IPP EE.UU. (BLS, oficial): inflación MAYORISTA (PPI demanda final, WPSFD4). Suele
  // anticipar al IPC (los costes de producción acaban llegando al consumidor). Misma
  // estructura que el IPC: dato, previo, previsión por tendencia y previsión del último.
  try {
    const yy = new Date().getUTCFullYear();
    const j = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/WPSFD4?startyear=' + (yy - 1) + '&endyear=' + yy).then(r => r.json());
    const s = j && j.Results && j.Results.series && j.Results.series[0] && j.Results.series[0].data;
    if (Array.isArray(s) && s.length >= 13) {
      const v = i => parseFloat(s[i].value);
      const last = v(0), prev = v(1), yr = v(12);
      const mn = { M01: '01', M02: '02', M03: '03', M04: '04', M05: '05', M06: '06', M07: '07', M08: '08', M09: '09', M10: '10', M11: '11', M12: '12' }[s[0].period] || '01';
      if (last > 0 && yr > 0) {
        out.ppi = { yoy: +((last / yr - 1) * 100).toFixed(1), mom: +((last / prev - 1) * 100).toFixed(2), month: s[0].year + '-' + mn + '-01' };
        if (s.length >= 14) { const prev2 = v(2), yr2 = v(13);
          if (prev > 0 && prev2 > 0 && yr2 > 0) { out.ppi.prevYoy = +((prev / yr2 - 1) * 100).toFixed(1); out.ppi.prevMom = +((prev / prev2 - 1) * 100).toFixed(2); } }
        const ms = []; for (let i = 0; i < 6 && i + 1 < s.length; i++) { const a = v(i), b = v(i + 1); if (a > 0 && b > 0) ms.push(a / b - 1); }
        if (ms.length >= 3) { const em = ms.reduce((p, x) => p + x, 0) / ms.length;
          out.ppi.estMom = +(em * 100).toFixed(2);
          if (v(11) > 0) out.ppi.estYoy = +(((last * (1 + em)) / v(11) - 1) * 100).toFixed(1); }
        const ms2 = []; for (let i = 1; i < 7 && i + 1 < s.length; i++) { const a = v(i), b = v(i + 1); if (a > 0 && b > 0) ms2.push(a / b - 1); }
        if (ms2.length >= 3 && v(12) > 0) { const em2 = ms2.reduce((p, x) => p + x, 0) / ms2.length;
          out.ppi.estLastMom = +(em2 * 100).toFixed(2);
          out.ppi.estLastYoy = +(((prev * (1 + em2)) / v(12) - 1) * 100).toFixed(1); }
        const hy = []; for (let i = 0; i < 6 && i + 12 < s.length; i++) { const a2 = v(i), b2 = v(i + 12); if (a2 > 0 && b2 > 0) hy.push(+((a2 / b2 - 1) * 100).toFixed(1)); }
        if (hy.length >= 4) out.ppi.hist = hy.reverse();
      }
    }
  } catch (e) {}
  // EMPLEO EE.UU. (BLS, oficial): nóminas no agrícolas (NFP, cambio mensual en miles) y
  // tasa de paro, para el calendario económico con el mismo formato Anterior/Previsión/Actual.
  try {
    const yy = new Date().getUTCFullYear();
    const g = id => fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/' + id + '?startyear=' + (yy - 1) + '&endyear=' + yy).then(r => r.json());
    const [jn, ju] = await Promise.all([g('CES0000000001'), g('LNS14000000')]); // NFP nivel · paro %
    const sn = jn && jn.Results && jn.Results.series && jn.Results.series[0] && jn.Results.series[0].data;
    const su = ju && ju.Results && ju.Results.series && ju.Results.series[0] && ju.Results.series[0].data;
    if (Array.isArray(sn) && sn.length >= 9) {
      const vn = i => parseFloat(sn[i].value), chg = i => Math.round(vn(i) - vn(i + 1));
      const mn = { M01: '01', M02: '02', M03: '03', M04: '04', M05: '05', M06: '06', M07: '07', M08: '08', M09: '09', M10: '10', M11: '11', M12: '12' }[sn[0].period] || '01';
      const cs = [], cs2 = []; for (let i = 0; i < 6 && i + 2 < sn.length; i++) cs.push(chg(i)); for (let i = 1; i < 7 && i + 2 < sn.length; i++) cs2.push(chg(i));
      const avg = a => a.length >= 3 ? Math.round(a.reduce((p, x) => p + x, 0) / a.length) : null;
      out.jobs = { month: sn[0].year + '-' + mn + '-01', nfp: { act: chg(0), prev: chg(1), est: avg(cs), estLast: avg(cs2) } };
      const hn = []; for (let i = 0; i < 6 && i + 2 < sn.length; i++) hn.push(chg(i));
      if (hn.length >= 4) out.jobs.nfp.hist = hn.reverse();
      if (Array.isArray(su) && su.length >= 2) { const vu = i => parseFloat(su[i].value); out.jobs.unemp = { act: vu(0), prev: vu(1) }; }
    }
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
