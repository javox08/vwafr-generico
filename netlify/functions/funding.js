// netlify/functions/funding.js
// Proxy serverless: hace las llamadas a los exchanges DESDE EL SERVIDOR.
// El navegador nunca habla con estos exchanges, así que no hay problema de CORS.
// Devuelve un único JSON con funding (%) + OI (en miles de millones de $, "B")
// de todos los exchanges. Cada uno es independiente: si uno falla devuelve null
// y NO rompe a los demás.
//
// NOTA: Binance y Bybit bloquean IPs de centros de datos US (donde corren las
// funciones de Netlify), así que normalmente devolverán null desde aquí. El
// frontend los pide directamente al navegador (soportan CORS) como respaldo.

// fetch con timeout para que un exchange lento no cuelgue toda la respuesta
// Cabeceras de navegador: algunos exchanges (p.ej. MEXC) rechazan con 403 las
// peticiones que no parecen venir de un navegador. Enviar User-Agent + Accept +
// Accept-Language es suficiente y es seguro para todos.
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

// 1 reintento ante bloqueos/cortes transitorios (algunos exchanges rate-limitean a ráfagas)
async function jfetch(url, ms = 8000) {
  try {
    return await once(url, ms);
  } catch (e) {
    await new Promise(s => setTimeout(s, 400));
    return await once(url, ms);
  }
}

// devuelve OI con tolerancia a fallo: si el cálculo de OI peta, deja funding y oi=null
async function safeOi(promise) {
  try { const v = await promise; return Number.isFinite(v) && v > 0 ? v : null; }
  catch { return null; }
}

const EX = {
  // ── Binance (suele estar geo-bloqueado en Lambda US → fallback en cliente) ──
  Binance: async () => {
    const [pf, oi, px] = await Promise.all([
      jfetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'),
      jfetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT').catch(() => null),
      jfetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT').catch(() => null),
    ]);
    const oiB = (oi && px) ? parseFloat(oi.openInterest) * parseFloat(px.price) / 1e9 : null;
    return { funding: parseFloat(pf.lastFundingRate) * 100, oi: oiB };
  },

  // ── OKX (CORS + accesible desde server; OI en USD directo: oiUsd) ──
  OKX: async () => {
    const [fr, oi] = await Promise.all([
      jfetch('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP'),
      jfetch('https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP').catch(() => null),
    ]);
    const oiB = oi?.data?.[0]?.oiUsd ? parseFloat(oi.data[0].oiUsd) / 1e9 : null;
    return { funding: parseFloat(fr.data[0].fundingRate) * 100, oi: oiB };
  },

  // ── Bybit (suele estar geo-bloqueado en Lambda US → fallback en cliente) ──
  Bybit: async () => {
    const r = await jfetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT');
    const t = r.result.list[0];
    return { funding: parseFloat(t.fundingRate) * 100, oi: parseFloat(t.openInterestValue) / 1e9 };
  },

  // ── MEXC (OI = holdVol[contratos] × contractSize[0.0001 BTC] × lastPrice) ──
  MEXC: async () => {
    const fr = await jfetch('https://contract.mexc.com/api/v1/contract/funding_rate/BTC_USDT');
    const oi = await safeOi(jfetch('https://contract.mexc.com/api/v1/contract/ticker?symbol=BTC_USDT')
      .then(t => parseFloat(t.data.holdVol) * 0.0001 * parseFloat(t.data.lastPrice) / 1e9));
    return { funding: parseFloat(fr.data.fundingRate) * 100, oi };
  },

  // ── Gate.io (OI = position_size[contratos] × quanto_multiplier × index_price) ──
  'Gate.io': async () => {
    const r = await jfetch('https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT');
    const mult = parseFloat(r.quanto_multiplier) || 0.0001;
    const oi = parseFloat(r.position_size) * mult * parseFloat(r.index_price) / 1e9;
    return { funding: parseFloat(r.funding_rate) * 100, oi: Number.isFinite(oi) && oi > 0 ? oi : null };
  },

  // ── Bitget (OI = holdingAmount[BTC] × markPrice) ──
  Bitget: async () => {
    const fr = await jfetch('https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures');
    const oi = await safeOi(jfetch('https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=usdt-futures')
      .then(t => parseFloat(t.data[0].holdingAmount) * parseFloat(t.data[0].markPrice) / 1e9));
    return { funding: parseFloat(fr.data[0].fundingRate) * 100, oi };
  },

  // ── KuCoin (OI = openInterest[contratos] × multiplier[0.001 BTC] × markPrice) ──
  KuCoin: async () => {
    const fr = await jfetch('https://api-futures.kucoin.com/api/v1/funding-rate/XBTUSDTM/current');
    const oi = await safeOi(jfetch('https://api-futures.kucoin.com/api/v1/contracts/XBTUSDTM')
      .then(c => parseFloat(c.data.openInterest) * parseFloat(c.data.multiplier) * parseFloat(c.data.markPrice) / 1e9));
    return { funding: parseFloat(fr.data.value) * 100, oi };
  },

  // ── BingX (OI ya viene en USD en el endpoint openInterest) ──
  BingX: async () => {
    const fr = await jfetch('https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex?symbol=BTC-USDT');
    const oi = await safeOi(jfetch('https://open-api.bingx.com/openApi/swap/v2/quote/openInterest?symbol=BTC-USDT')
      .then(o => parseFloat(o.data.openInterest) / 1e9));
    return { funding: parseFloat(fr.data.lastFundingRate) * 100, oi };
  },
};

export default async () => {
  const results = {};
  await Promise.all(
    Object.entries(EX).map(async ([name, fn]) => {
      try {
        const d = await fn();
        const f = Number(d.funding);
        const o = Number(d.oi);
        results[name] = {
          funding: Number.isFinite(f) ? f : null,
          oi: Number.isFinite(o) && o > 0 ? o : null,
          ok: Number.isFinite(f),
        };
      } catch (e) {
        results[name] = { funding: null, oi: null, ok: false, error: String(e.message || e) };
      }
    })
  );

  return new Response(JSON.stringify({ updated: Date.now(), data: results }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      // cachea 30s en el CDN de Netlify para no gastar invocaciones (plan free: 125k/mes)
      'Cache-Control': 'public, max-age=30',
      'Netlify-CDN-Cache-Control': 'public, max-age=30, durable',
    },
  });
};
