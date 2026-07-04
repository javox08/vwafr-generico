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
  const out = { t: Date.now(), ex: { Gate: {}, MEXC: {}, Binance: {}, Bybit: {}, Bitget: {} } };
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
  // ── Binance (fapi): funding (premiumIndex bulk) + OI (por moneda, en paralelo). ──
  try {
    const pi = await jf('https://fapi.binance.com/fapi/v1/premiumIndex');
    const pm = {}; if (Array.isArray(pi)) for (const t of pi) pm[t.symbol] = t;
    await Promise.all(COINS.map(async c => {
      const s = c + 'USDT', p = pm[s]; if (!p) return;
      const f = parseFloat(p.lastFundingRate); if (!Number.isFinite(f)) return;
      let oi = 0; const o = await jf('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + s);
      const v = parseFloat(o && o.openInterest) * parseFloat(p.markPrice);
      if (Number.isFinite(v) && v > 0) oi = +(v / 1e9).toFixed(3);
      out.ex.Binance[c] = { f: +(f * 100).toFixed(4), oi };
    }));
  } catch (e) {}
  // ── Bybit (v5): funding + OI en 1 llamada bulk. ──
  try {
    const r = await jf('https://api.bybit.com/v5/market/tickers?category=linear');
    const m = {}; for (const t of ((r && r.result && r.result.list) || [])) m[t.symbol] = t;
    for (const c of COINS) { const t = m[c + 'USDT']; if (!t) continue;
      const f = parseFloat(t.fundingRate), oi = parseFloat(t.openInterestValue);
      if (Number.isFinite(f)) out.ex.Bybit[c] = { f: +(f * 100).toFixed(4), oi: Number.isFinite(oi) && oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  // ── Bitget (v2 mix): funding + OI en 1 llamada bulk. ──
  try {
    const r = await jf('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures');
    const m = {}; for (const t of ((r && r.data) || [])) m[t.symbol] = t;
    for (const c of COINS) { const t = m[c + 'USDT']; if (!t) continue;
      const f = parseFloat(t.fundingRate), oi = parseFloat(t.holdingAmount) * parseFloat(t.markPrice);
      if (Number.isFinite(f)) out.ex.Bitget[c] = { f: +(f * 100).toFixed(4), oi: Number.isFinite(oi) && oi > 0 ? +(oi / 1e9).toFixed(3) : 0 };
    }
  } catch (e) {}
  res.status(200).json(out);
};
