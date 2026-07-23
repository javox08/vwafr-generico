// FUNDING de exchanges EXTRA para la web (Vercel, fra1, sin geo-bloqueo). Agrega con
// caché de 5 min y devuelve funding en % (periodo de 8h) y OI en $B, el mismo formato
// que usan los fallbacks del navegador. Sin claves: endpoints públicos.
//
// Incluye:
//  - Gate y MEXC: sus APIs no dan CORS al navegador → solo se pueden pedir desde servidor.
//  - Binance, Bybit y Bitget: geo-bloqueados en Cloudflare Pages (donde corre /api/funding)
//    y a menudo también en el navegador del usuario (p.ej. EE.UU.). Vercel (Frankfurt) SÍ
//    los alcanza, así que el relé garantiza los 3 exchanges MÁS GRANDES por OI de forma
//    fiable en el servidor, sin depender del frágil respaldo del navegador.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC'];
const jf = (u, ms = 4000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  return fetch(u, { signal: c.signal }).then(r => r.json()).catch(() => null).finally(() => clearTimeout(t)); };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const out = { t: Date.now(), v: 'fr-20260721a', ex: { Gate: {}, MEXC: {}, Binance: {}, Bybit: {}, OKX: {}, BingX: {}, Bitget: {},
    Kraken: {}, HTX: {}, CoinEx: {}, Bitfinex: {}, dYdX: {}, WhiteBIT: {}, Phemex: {}, Deribit: {}, Hyperliquid: {}, KuCoin: {} } };
  // ── KuCoin Futures (bulk): la función de Cloudflare NO llega (bloquean sus IPs y salía
  //    "error" en la tabla) → se sirve desde aquí. funding ya es por 8h; OI = lotes × mult × precio. ──
  try {
    const r = await jf('https://api-futures.kucoin.com/api/v1/contracts/active');
    const m = {}; for (const t of ((r && r.data) || [])) m[t.symbol] = t;
    for (const c of COINS) { const t = m[(c === 'BTC' ? 'XBT' : c) + 'USDTM']; if (!t) continue;
      const f = parseFloat(t.fundingFeeRate);
      const oi = parseFloat(t.openInterest) * parseFloat(t.multiplier) * parseFloat(t.markPrice);
      if (Number.isFinite(f)) out.ex.KuCoin[c] = { f: +(f * 100).toFixed(4), oi: Number.isFinite(oi) && oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  for (const c of COINS) {
    try {
      const j = await fetch('https://api.gateio.ws/api/v4/futures/usdt/contracts/' + c + '_USDT').then(r => r.json());
      const f = parseFloat(j.funding_rate);
      const oi = parseFloat(j.position_size) * parseFloat(j.quanto_multiplier) * parseFloat(j.mark_price);
      if (Number.isFinite(f) && Number.isFinite(oi) && oi > 0) out.ex.Gate[c] = { f: +(f * 100).toFixed(4), oi: +(oi / 1e9).toFixed(3) };
    } catch (e) {}
    await new Promise(r2 => setTimeout(r2, 100));
  }
  try {
    const det = await fetch('https://contract.mexc.com/api/v1/contract/detail').then(r => r.json());
    const size = {}; for (const d of ((det && det.data) || [])) size[d.symbol] = parseFloat(d.contractSize);
    const tk = await fetch('https://contract.mexc.com/api/v1/contract/ticker').then(r => r.json());
    for (const d of ((tk && tk.data) || [])) {
      const m = ('' + d.symbol).match(/^([A-Z]+)_USDT$/); if (!m || COINS.indexOf(m[1]) < 0) continue;
      const f = parseFloat(d.fundingRate);
      const oi = parseFloat(d.holdVol) * (size[d.symbol] || 0) * parseFloat(d.fairPrice || d.lastPrice);
      if (Number.isFinite(f) && Number.isFinite(oi) && oi > 0) out.ex.MEXC[m[1]] = { f: +(f * 100).toFixed(4), oi: +(oi / 1e9).toFixed(3) };
    }
  } catch (e) {}
  // ── Binance: funding (premiumIndex bulk) + OI en $ de TODOS los contratos: perp USDT,
  //    perp USDC y coin-margined/inverse (dapi) para BTC/ETH → todo sumado y en dólares. ──
  try {
    const [pi, dpi] = await Promise.all([
      jf('https://fapi.binance.com/fapi/v1/premiumIndex'),
      jf('https://dapi.binance.com/dapi/v1/premiumIndex').catch(() => null)
    ]);
    const pm = {}; if (Array.isArray(pi)) for (const t of pi) pm[t.symbol] = t;
    const dm = {}; if (Array.isArray(dpi)) for (const t of dpi) dm[t.symbol] = t;
    const cval = { BTC: 100, ETH: 10 }; // valor de contrato coin-M (USD)
    await Promise.all(COINS.map(async c => {
      const s = c + 'USDT', p = pm[s]; if (!p) return;
      const f = parseFloat(p.lastFundingRate); if (!Number.isFinite(f)) return;
      let v = 0;
      const o = await jf('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + s);
      const vu = parseFloat(o && o.openInterest) * parseFloat(p.markPrice);
      if (Number.isFinite(vu) && vu > 0) v += vu;
      if (c === 'BTC' || c === 'ETH') { // USDC + coin-margined (los que mueven OI de verdad)
        try { const pc = pm[c + 'USDC']; if (pc) { const oc = await jf('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + c + 'USDC'); const vc = parseFloat(oc && oc.openInterest) * parseFloat(pc.markPrice); if (Number.isFinite(vc) && vc > 0) v += vc; } } catch (e) {}
        try { const od = await jf('https://dapi.binance.com/dapi/v1/openInterest?symbol=' + c + 'USD_PERP'); const cn = parseFloat(od && od.openInterest); if (Number.isFinite(cn) && cn > 0) v += cn * (cval[c] || 0); } catch (e) {}
      }
      out.ex.Binance[c] = { f: +(f * 100).toFixed(4), oi: v > 0 ? +(v / 1e9).toFixed(3) : 0 };
    }));
  } catch (e) {}
  // ── Bybit (v5): perp USDT + perp USDC (BTCPERP…) + inverse (BTCUSD) → todo en $. ──
  try {
    const [rl, ri] = await Promise.all([
      jf('https://api.bybit.com/v5/market/tickers?category=linear'),
      jf('https://api.bybit.com/v5/market/tickers?category=inverse').catch(() => null)
    ]);
    const m = {}; for (const t of ((rl && rl.result && rl.result.list) || [])) m[t.symbol] = t;
    const mi = {}; for (const t of ((ri && ri.result && ri.result.list) || [])) mi[t.symbol] = t;
    for (const c of COINS) { const t = m[c + 'USDT']; if (!t) continue;
      const f = parseFloat(t.fundingRate);
      let oi = parseFloat(t.openInterestValue) || 0;
      const tu = m[c + 'PERP']; if (tu) { const vu = parseFloat(tu.openInterestValue); if (Number.isFinite(vu) && vu > 0) oi += vu; } // USDC perp
      const ti = mi[c + 'USD']; if (ti) { const vi = parseFloat(ti.openInterestValue); if (Number.isFinite(vi) && vi > 0) oi += vi; } // inverse
      if (Number.isFinite(f)) out.ex.Bybit[c] = { f: +(f * 100).toFixed(4), oi: oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── OKX: OI en $ sumando TODOS los contratos (perp USDT + perp USDC + inverse coin-M).
  //    OKX ya publica oiUsd (OI en dólares) por instrumento → conversión automática, sin
  //    multiplicar por precio. Funding del swap USDT (OKX no tiene funding en bulk). ──
  try {
    const [oiR, frs] = await Promise.all([
      jf('https://www.okx.com/api/v5/public/open-interest?instType=SWAP', 5000),
      Promise.all(COINS.map(c => jf('https://www.okx.com/api/v5/public/funding-rate?instId=' + c + '-USDT-SWAP', 4000)))
    ]);
    const oim = {}; for (const d of ((oiR && oiR.data) || [])) oim[d.instId] = parseFloat(d.oiUsd);
    const fm = {}; COINS.forEach((c, i) => { const d = frs[i] && frs[i].data && frs[i].data[0]; if (d) fm[c] = parseFloat(d.fundingRate); });
    for (const c of COINS) {
      let v = 0; // USDT-margined + USDC-margined + inverse (coin-margined), todo en $ nativo
      for (const id of [c + '-USDT-SWAP', c + '-USDC-SWAP', c + '-USD-SWAP']) { const u = oim[id]; if (Number.isFinite(u) && u > 0) v += u; }
      const f = fm[c];
      if (v > 0 || Number.isFinite(f)) out.ex.OKX[c] = { f: Number.isFinite(f) ? +(f * 100).toFixed(4) : 0, oi: v > 0 ? +(v / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── BingX: swap USDT. funding (premiumIndex, por 8h) + OI (openInterest, ya en USDT ≈ $). ──
  try {
    await Promise.all(COINS.map(async c => {
      const [pi, oi] = await Promise.all([
        jf('https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex?symbol=' + c + '-USDT', 4000),
        jf('https://open-api.bingx.com/openApi/swap/v2/quote/openInterest?symbol=' + c + '-USDT', 4000)
      ]);
      const f = parseFloat(pi && pi.data && pi.data.lastFundingRate);
      const ov = parseFloat(oi && oi.data && oi.data.openInterest); // OI en USDT (notional) ≈ dólares
      if (!Number.isFinite(f) && !(ov > 0)) return;
      out.ex.BingX[c] = { f: Number.isFinite(f) ? +(f * 100).toFixed(4) : 0, oi: ov > 0 ? +(ov / 1e9).toFixed(3) : 0 };
    }));
  } catch (e) {}
  // ── Bitget (v2 mix): funding + OI de los 3 productos (USDT + USDC + coin-margined),
  //    todo a $ vía holdingAmount(base) × markPrice → suma de todos los contratos. ──
  try {
    const [ru, rc, ri] = await Promise.all([
      jf('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures'),
      jf('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdc-futures').catch(() => null),
      jf('https://api.bitget.com/api/v2/mix/market/tickers?productType=coin-futures').catch(() => null)
    ]);
    const mkMap = r => { const m = {}; for (const t of ((r && r.data) || [])) m[t.symbol] = t; return m; };
    const mu = mkMap(ru), mc = mkMap(rc), mi = mkMap(ri);
    const oiOf = t => (t ? parseFloat(t.holdingAmount) * parseFloat(t.markPrice) : 0);
    for (const c of COINS) { const t = mu[c + 'USDT']; if (!t) continue;
      const f = parseFloat(t.fundingRate);
      let oi = oiOf(t);                                             // USDT-margined
      const uc = oiOf(mc[c + 'PERP']); if (uc > 0) oi += uc;        // USDC-margined
      const ic = oiOf(mi[c + 'USD']);  if (ic > 0) oi += ic;        // inverse (coin-margined)
      if (Number.isFinite(f)) out.ex.Bitget[c] = { f: +(f * 100).toFixed(4), oi: oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // Todo lo de abajo normaliza el funding a % POR PERIODO DE 8H (el formato de la web).
  // ── Kraken Futures: bulk tickers. fundingRate es ABSOLUTO por hora → /precio ×8. ──
  try {
    const r = await jf('https://futures.kraken.com/derivatives/api/v3/tickers');
    const m = {}; for (const t of ((r && r.tickers) || [])) m[t.symbol] = t;
    for (const c of COINS) { const t = m['PF_' + (c === 'BTC' ? 'XBT' : c) + 'USD']; if (!t) continue;
      const fr = parseFloat(t.fundingRate), px = parseFloat(t.markPrice), oiB = parseFloat(t.openInterest);
      if (!(Number.isFinite(fr) && px > 0)) continue;
      const oi = Number.isFinite(oiB) ? oiB * px : 0;
      out.ex.Kraken[c] = { f: +(fr / px * 8 * 100).toFixed(4), oi: oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── HTX (Huobi): funding batch + OI batch (linear USDT). funding ya es por 8h. ──
  try {
    const [fj, oj] = await Promise.all([
      jf('https://api.hbdm.com/linear-swap-api/v1/swap_batch_funding_rate'),
      jf('https://api.hbdm.com/linear-swap-api/v1/swap_open_interest')
    ]);
    const fm = {}; for (const d of ((fj && fj.data) || [])) fm[d.contract_code] = parseFloat(d.funding_rate);
    const om = {}; for (const d of ((oj && oj.data) || [])) om[d.contract_code] = parseFloat(d.value != null ? d.value : NaN);
    for (const c of COINS) { const f = fm[c + '-USDT']; if (!Number.isFinite(f)) continue;
      const oi = om[c + '-USDT'];
      out.ex.HTX[c] = { f: +(f * 100).toFixed(4), oi: Number.isFinite(oi) && oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── CoinEx: funding bulk (sin market = todos) + OI del ticker. funding por 8h. ──
  try {
    const [fj, tj] = await Promise.all([
      jf('https://api.coinex.com/v2/futures/funding-rate?market=' + COINS.map(c => c + 'USDT').join(',')),
      jf('https://api.coinex.com/v2/futures/ticker?market=' + COINS.map(c => c + 'USDT').join(','))
    ]);
    const fm = {}; for (const d of ((fj && fj.data) || [])) fm[d.market] = parseFloat(d.latest_funding_rate);
    const om = {}; for (const d of ((tj && tj.data) || [])) om[d.market] = parseFloat(d.open_interest_volume) * parseFloat(d.mark_price);
    for (const c of COINS) { const f = fm[c + 'USDT']; if (!Number.isFinite(f)) continue;
      const oi = om[c + 'USDT'];
      out.ex.CoinEx[c] = { f: +(f * 100).toFixed(4), oi: Number.isFinite(oi) && oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── Bitfinex: status deriv bulk. CURRENT_FUNDING (idx 12) por 8h · OI (idx 18) en base. ──
  try {
    const keys = COINS.map(c => 't' + c + 'F0:USTF0').join(',');
    const r = await jf('https://api-pub.bitfinex.com/v2/status/deriv?keys=' + encodeURIComponent(keys));
    for (const row of (Array.isArray(r) ? r : [])) {
      const mm = ('' + row[0]).match(/^t([A-Z]+)F0:USTF0$/); if (!mm || COINS.indexOf(mm[1]) < 0) continue;
      const f = parseFloat(row[12]), px = parseFloat(row[15]), oiB = parseFloat(row[18]);
      if (!Number.isFinite(f)) continue;
      const oi = (Number.isFinite(oiB) && Number.isFinite(px)) ? oiB * px : 0;
      out.ex.Bitfinex[mm[1]] = { f: +(f * 100).toFixed(4), oi: oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── dYdX v4 (indexer): bulk. nextFundingRate es POR HORA → ×8. OI en base × oráculo. ──
  try {
    const r = await jf('https://indexer.dydx.trade/v4/perpetualMarkets?limit=100');
    const mk = (r && r.markets) || {};
    for (const c of COINS) { const t = mk[c + '-USD']; if (!t) continue;
      const f = parseFloat(t.nextFundingRate), px = parseFloat(t.oraclePrice), oiB = parseFloat(t.openInterest);
      if (!Number.isFinite(f)) continue;
      const oi = (Number.isFinite(oiB) && Number.isFinite(px)) ? oiB * px : 0;
      out.ex.dYdX[c] = { f: +(f * 8 * 100).toFixed(4), oi: oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── WhiteBIT: bulk público. funding por 8h · OI en base × índice. ──
  try {
    const r = await jf('https://whitebit.com/api/v4/public/futures');
    const list = (r && r.result) || (Array.isArray(r) ? r : []);
    const m = {}; for (const t of list) m[t.ticker_id] = t;
    for (const c of COINS) { const t = m[c + '_PERP']; if (!t) continue;
      const f = parseFloat(t.funding_rate), px = parseFloat(t.index_price), oiB = parseFloat(t.open_interest);
      if (!Number.isFinite(f)) continue;
      const oi = (Number.isFinite(oiB) && Number.isFinite(px)) ? oiB * px : 0;
      out.ex.WhiteBIT[c] = { f: +(f * 100).toFixed(4), oi: oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── Phemex: 1 llamada por moneda (paralelo). fundingRateRr por 8h · OI base × mark. ──
  try {
    await Promise.all(COINS.map(async c => {
      const r = await jf('https://api.phemex.com/md/v3/ticker/24hr?symbol=' + c + 'USDT');
      const t = r && r.result; if (!t) return;
      const f = parseFloat(t.fundingRateRr), px = parseFloat(t.markRp), oiB = parseFloat(t.openInterestRv);
      if (!Number.isFinite(f)) return;
      const oi = (Number.isFinite(oiB) && Number.isFinite(px)) ? oiB * px : 0;
      out.ex.Phemex[c] = { f: +(f * 100).toFixed(4), oi: oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }));
  } catch (e) {}
  // ── Deribit: perpetuo inverso BTC/ETH (su mercado grande). funding_8h · OI ya en USD. ──
  try {
    await Promise.all(['BTC', 'ETH'].map(async c => {
      const r = await jf('https://www.deribit.com/api/v2/public/ticker?instrument_name=' + c + '-PERPETUAL');
      const t = r && r.result; if (!t) return;
      const f = parseFloat(t.funding_8h), oi = parseFloat(t.open_interest);
      if (!Number.isFinite(f)) return;
      out.ex.Deribit[c] = { f: +(f * 100).toFixed(4), oi: Number.isFinite(oi) && oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }));
  } catch (e) {}
  // ── Hyperliquid (DEX perp, sin CORS): metaAndAssetCtxs da funding (POR HORA → ×8),
  //    OI (en base) y markPx en una sola llamada para las 200+ monedas. ──
  try {
    const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"type":"metaAndAssetCtxs"}' }).then(x => x.json());
    const uni = r && r[0] && r[0].universe, ctx = r && r[1];
    if (Array.isArray(uni) && Array.isArray(ctx)) {
      const idx = {}; uni.forEach((m, i) => { idx[m.name] = i; });
      for (const c of COINS) { const i = idx[c]; if (i == null || !ctx[i]) continue;
        const f = parseFloat(ctx[i].funding), oiB = parseFloat(ctx[i].openInterest), px = parseFloat(ctx[i].markPx);
        if (!Number.isFinite(f)) continue;
        const oi = (Number.isFinite(oiB) && Number.isFinite(px)) ? oiB * px : 0;
        out.ex.Hyperliquid[c] = { f: +(f * 8 * 100).toFixed(4), oi: oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
      }
    }
  } catch (e) {}
  res.status(200).json(out);
};
