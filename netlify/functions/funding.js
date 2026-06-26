// netlify/functions/funding.js
// Proxy serverless: hace las llamadas a los exchanges DESDE EL SERVIDOR.
// El navegador nunca habla con los exchanges, así que no hay problema de CORS.
// Devuelve un único JSON con funding + OI de todos los exchanges.

const EX = {
  Binance: async () => {
    const [pf, oi, px] = await Promise.all([
      fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT').then(r => r.json()),
      fetch('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT').then(r => r.json()),
      fetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT').then(r => r.json()),
    ]);
    return {
      funding: parseFloat(pf.lastFundingRate) * 100,
      oi: parseFloat(oi.openInterest) * parseFloat(px.price) / 1e9,
    };
  },

  OKX: async () => {
    const [fr, tk, oi] = await Promise.all([
      fetch('https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP').then(r => r.json()),
      fetch('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP').then(r => r.json()),
      fetch('https://www.okx.com/api/v5/market/open-interest?instId=BTC-USDT-SWAP').then(r => r.json()),
    ]);
    return {
      funding: parseFloat(fr.data[0].fundingRate) * 100,
      oi: parseFloat(oi.data[0].oiCcy) * parseFloat(tk.data[0].last) / 1e9,
    };
  },

  Bybit: async () => {
    const r = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT').then(r => r.json());
    const t = r.result.list[0];
    return {
      funding: parseFloat(t.fundingRate) * 100,
      oi: parseFloat(t.openInterestValue) / 1e9,
    };
  },

  MEXC: async () => {
    const [fr, oi] = await Promise.all([
      fetch('https://contract.mexc.com/api/v1/contract/funding_rate/BTC_USDT').then(r => r.json()),
      fetch('https://contract.mexc.com/api/v1/contract/ticker?symbol=BTC_USDT').then(r => r.json()).catch(() => null),
    ]);
    let oiVal = null;
    if (oi && oi.data) {
      // holdVol = open interest en contratos; lastPrice para valorar
      const hold = parseFloat(oi.data.holdVol);
      const price = parseFloat(oi.data.lastPrice);
      if (isFinite(hold) && isFinite(price)) oiVal = hold * price / 1e9 * 0.0001; // contract size approx
    }
    return { funding: parseFloat(fr.data.fundingRate) * 100, oi: oiVal };
  },

  'Gate.io': async () => {
    const r = await fetch('https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT').then(r => r.json());
    return { funding: parseFloat(r.funding_rate) * 100, oi: null };
  },

  Bitget: async () => {
    const r = await fetch('https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures').then(r => r.json());
    return { funding: parseFloat(r.data[0].fundingRate) * 100, oi: null };
  },

  KuCoin: async () => {
    const r = await fetch('https://api-futures.kucoin.com/api/v1/funding-rate/XBTUSDTM/current').then(r => r.json());
    return { funding: parseFloat(r.data.value) * 100, oi: null };
  },

  BingX: async () => {
    const r = await fetch('https://open-api.bingx.com/openApi/swap/v2/quote/premiumIndex?symbol=BTC-USDT').then(r => r.json());
    return { funding: parseFloat(r.data.lastFundingRate) * 100, oi: null };
  },
};

export default async (req) => {
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
      'Cache-Control': 'public, max-age=30', // cachea 30s para no gastar invocaciones
    },
  });
};
