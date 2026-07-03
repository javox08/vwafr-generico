// FUNDING de exchanges EXTRA (Gate y MEXC) para la web: sus APIs no permiten
// CORS desde el navegador, así que esta función (Vercel) los agrega con caché
// de 5 min. Devuelve funding en % (por periodo de 8h) y OI en $B, el mismo
// formato que usan los fallbacks del navegador. Sin claves: endpoints públicos.
const COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'AVAX', 'LINK', 'LTC'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  const out = { t: Date.now(), ex: { Gate: {}, MEXC: {} } };
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
  res.status(200).json(out);
};
