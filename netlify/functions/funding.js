// netlify/functions/funding.js
// Proxy serverless: hace las llamadas a los exchanges DESDE EL SERVIDOR (sin CORS).
// Devuelve funding (%) + OI (en miles de millones de $, "B") para el TOP 10 de
// monedas en los 8 exchanges, usando endpoints "bulk" (1 llamada = todas las
// monedas) para no disparar invocaciones ni latencia.
//
// Estructura: { updated, coins:[...], data: { BTC:{Binance:{funding,oi,ok},...}, ... } }
//
// NOTA: Binance y Bybit bloquean IPs de datacenter (donde corre Netlify); el
// frontend los pide directamente al navegador (soportan CORS) como respaldo.

const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC'];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function once(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: BROWSER_HEADERS });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
// 1 reintento ante bloqueos/cortes transitorios. Timeout corto para no superar
// el límite de 10s de las funciones de Netlify (todas las llamadas van en paralelo).
async function jfetch(url, ms = 3800) {
  try { return await once(url, ms); }
  catch { await new Promise(s => setTimeout(s, 400)); return await once(url, ms); }
}

const pct = (x) => { const n = parseFloat(x); return Number.isFinite(n) ? n * 100 : null; };
const bil = (x) => { const n = parseFloat(x); return Number.isFinite(n) && n > 0 ? n / 1e9 : null; };

// Símbolos por exchange
const sym = {
  Binance: c => c + 'USDT',
  OKX: c => c + '-USDT-SWAP',
  Bybit: c => c + 'USDT',
  MEXC: c => c + '_USDT',
  'Gate.io': c => c + '_USDT',
  Bitget: c => c + 'USDT',
  KuCoin: c => (c === 'BTC' ? 'XBT' : c) + 'USDTM',
  BingX: c => c + '-USDT',
};

// ── Fetchers "bulk": cada uno devuelve { COIN: {funding, oi} } ──────────

async function okxBulk() {
  const out = {};
  const oiMap = {};
  const oiResp = await jfetch('https://www.okx.com/api/v5/public/open-interest?instType=SWAP').catch(() => null);
  if (oiResp?.data) for (const d of oiResp.data) oiMap[d.instId] = d.oiUsd;
  await Promise.all(COINS.map(async c => {
    const inst = sym.OKX(c);
    try {
      const fr = await jfetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${inst}`);
      out[c] = { funding: pct(fr.data[0].fundingRate), oi: bil(oiMap[inst]) };
    } catch { out[c] = { funding: null, oi: null }; }
  }));
  return out;
}

async function mexcBulk() {
  const out = {};
  const [tk, dt] = await Promise.all([
    jfetch('https://contract.mexc.com/api/v1/contract/ticker'),
    jfetch('https://contract.mexc.com/api/v1/contract/detail'),
  ]);
  const tkMap = {}; for (const t of tk.data) tkMap[t.symbol] = t;
  const csMap = {}; for (const d of dt.data) csMap[d.symbol] = d.contractSize;
  for (const c of COINS) {
    const s = sym.MEXC(c), t = tkMap[s], cs = csMap[s];
    if (!t) { out[c] = { funding: null, oi: null }; continue; }
    const oi = (Number.isFinite(+t.holdVol) && Number.isFinite(+cs) && Number.isFinite(+t.lastPrice))
      ? bil(+t.holdVol * +cs * +t.lastPrice) : null;
    out[c] = { funding: pct(t.fundingRate), oi };
  }
  return out;
}

async function gateBulk() {
  const out = {};
  let arr;
  try { arr = await jfetch('https://fx-api.gateio.ws/api/v4/futures/usdt/contracts'); }
  catch { arr = await jfetch('https://api.gateio.ws/api/v4/futures/usdt/contracts'); }
  const m = {}; for (const x of arr) m[x.name] = x;
  for (const c of COINS) {
    const x = m[sym['Gate.io'](c)];
    if (!x) { out[c] = { funding: null, oi: null }; continue; }
    const oi = bil(parseFloat(x.position_size) * (parseFloat(x.quanto_multiplier) || 0) * parseFloat(x.index_price));
    out[c] = { funding: pct(x.funding_rate), oi };
  }
  return out;
}

async function bitgetBulk() {
  const out = {};
  const r = await jfetch('https://api.bitget.com/api/v2/mix/market/tickers?productType=usdt-futures');
  const m = {}; for (const t of r.data) m[t.symbol] = t;
  for (const c of COINS) {
    const t = m[sym.Bitget(c)];
    if (!t) { out[c] = { funding: null, oi: null }; continue; }
    out[c] = { funding: pct(t.fundingRate), oi: bil(parseFloat(t.holdingAmount) * parseFloat(t.markPrice)) };
  }
  return out;
}

async function kucoinBulk() {
  const out = {};
  const r = await jfetch('https://api-futures.kucoin.com/api/v1/contracts/active');
  const m = {}; for (const t of r.data) m[t.symbol] = t;
  for (const c of COINS) {
    const t = m[sym.KuCoin(c)];
    if (!t) { out[c] = { funding: null, oi: null }; continue; }
    const oi = bil(parseFloat(t.openInterest) * parseFloat(t.multiplier) * parseFloat(t.markPrice));
    out[c] = { funding: pct(t.fundingFeeRate), oi };
  }
  return out;
}

async function bingxBulk() {
  const out = {};
  const fr = await jfetch('https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex');
  const m = {}; for (const t of fr.data) m[t.symbol] = t;
  // OI por moneda (BingX no tiene OI bulk); en paralelo
  const oiMap = {};
  await Promise.all(COINS.map(async c => {
    try {
      const o = await jfetch(`https://open-api.bingx.com/openApi/swap/v2/quote/openInterest?symbol=${sym.BingX(c)}`);
      oiMap[c] = o.data.openInterest;
    } catch { oiMap[c] = null; }
  }));
  for (const c of COINS) {
    const t = m[sym.BingX(c)];
    out[c] = { funding: t ? pct(t.lastFundingRate) : null, oi: bil(oiMap[c]) };
  }
  return out;
}

// Binance/Bybit: se intentan (1 llamada bulk) pero suelen geo-bloquearse → null → fallback en cliente
async function binanceBulk() {
  const out = {};
  try {
    const arr = await jfetch('https://fapi.binance.com/fapi/v1/premiumIndex');
    const m = {}; for (const t of arr) m[t.symbol] = t;
    for (const c of COINS) { const t = m[sym.Binance(c)]; if (t) out[c] = { funding: pct(t.lastFundingRate), oi: null }; }
  } catch { /* geo-bloqueado */ }
  return out;
}
async function bybitBulk() {
  const out = {};
  try {
    const r = await jfetch('https://api.bybit.com/v5/market/tickers?category=linear');
    const m = {}; for (const t of r.result.list) m[t.symbol] = t;
    for (const c of COINS) { const t = m[sym.Bybit(c)]; if (t) out[c] = { funding: pct(t.fundingRate), oi: bil(t.openInterestValue) }; }
  } catch { /* geo-bloqueado */ }
  return out;
}

const EX = {
  Binance: binanceBulk, OKX: okxBulk, Bybit: bybitBulk, MEXC: mexcBulk,
  'Gate.io': gateBulk, Bitget: bitgetBulk, KuCoin: kucoinBulk, BingX: bingxBulk,
};

export default async () => {
  const settled = await Promise.all(
    Object.entries(EX).map(async ([name, fn]) => [name, await fn().catch(() => ({}))])
  );

  const data = {};
  for (const c of COINS) {
    data[c] = {};
    for (const [name, map] of settled) {
      const e = map[c];
      const f = e ? Number(e.funding) : NaN;
      const o = e ? Number(e.oi) : NaN;
      data[c][name] = {
        funding: Number.isFinite(f) ? f : null,
        oi: Number.isFinite(o) && o > 0 ? o : null,
        ok: Number.isFinite(f),
      };
    }
  }

  return new Response(JSON.stringify({ updated: Date.now(), coins: COINS, data }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=30',
      'Netlify-CDN-Cache-Control': 'public, max-age=30, durable',
    },
  });
};
