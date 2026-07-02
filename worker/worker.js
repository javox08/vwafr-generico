// ───────────────────────────────────────────────────────────────────────────
// VWAFR · Bot de Telegram 24/7 (Cloudflare Worker + Cron Trigger)
//
// Manda mensajes automáticos sobre BTC a TUS grupos/chats aunque la web esté
// cerrada. Calcula su propio análisis ligero (no depende del navegador):
// precio, probabilidad de subir a 30 días y de TOCAR un nivel (Monte Carlo
// ligero por bootstrap), y una señal de tendencia. Cadencia ~1/hora e
// irregular para que no parezca automático.
//
// Configura (ver README.md):
//   - SECRET  TELEGRAM_TOKEN   (token de @BotFather)
//   - VAR     CHAT_IDS         (ids separados por coma, grupos = -100…)
//   - CRON    "*/20 * * * *"   (cada 20 min; envía con ~34% de probabilidad)
// ───────────────────────────────────────────────────────────────────────────

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env, false)); },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/send') { const n = await run(env, true); return new Response('ok · publicado en ' + n + ' canal(es)'); }
    // ── PRUEBAS DEL TRADING ──
    // /balance    → lee el saldo de futuros (verifica claves+firma, SIN riesgo)
    // /test-trade → orden REAL con TP/SL y el tamaño configurado (BITUNIX_QTY;
    //               "auto" = toda la cuenta × BITUNIX_LEV), para verificar el circuito
    if (url.pathname === '/balance') {
      if (!env.BITUNIX_API_KEY || !env.BITUNIX_API_SECRET) return new Response('✗ faltan los secrets BITUNIX_API_KEY y/o BITUNIX_API_SECRET (con esos nombres exactos)');
      const b = await bxBalanceRaw(env);
      if (b.av != null) return new Response('✓ CONEXIÓN OK · saldo disponible futuros: ' + b.av + ' USDT (claves y firma correctas)');
      // diagnóstico extra: ¿responde el endpoint PÚBLICO (sin claves) por la misma vía?
      let pub = 'sin respuesta';
      try {
        const pr = await bxFetch(env, '/api/v1/futures/market/tickers?symbols=BTCUSDT', 'GET', { 'Accept': 'application/json' }, '');
        pub = pr.status + ' ' + (await pr.text()).slice(0, 120);
      } catch (e) { pub = 'error: ' + e.message; }
      const via = env.BITUNIX_PROXY ? 'vía relé (' + env.BITUNIX_PROXY + ')' : 'directa (sin relé; pon BITUNIX_PROXY si Bitunix da 403)';
      return new Response('✗ no se pudo leer el saldo. Conexión ' + via + '\nRespuesta de Bitunix (privada): ' + b.raw + '\nPrueba pública (sin claves): ' + pub + '\n\nMándale esta respuesta a Claude tal cual.');
    }
    if (url.pathname === '/test-trade') {
      if ((env.BITUNIX_TRADE || '').toLowerCase() !== 'live') return new Response('✗ BITUNIX_TRADE no está en "live"');
      const d = await analyze(env);
      if (!d) return new Response('✗ no se pudo obtener el análisis');
      const side = d.side || 'LONG'; // si la señal está fuera, prueba con LONG
      const px = d.price, slPct = 0.05, tpPct = 0.08;
      const td = { side, entry: px, tp: side === 'LONG' ? px * (1 + tpPct) : px * (1 - tpPct), sl: side === 'LONG' ? px * (1 - slPct) : px * (1 + slPct) };
      const out = await bitunixTrade(env, td); // tamaño según BITUNIX_QTY ("auto" = toda la cuenta)
      return new Response('orden de PRUEBA (' + side + ', tamaño ' + (env.BITUNIX_QTY || '0.001') + ') enviada.\nRespuesta de Bitunix: ' + out + '\n\n⚠️ Con BITUNIX_QTY=auto esta orden usa TODA la cuenta. Si dice éxito, verás la posición en Bitunix (ciérrala a mano si no la quieres). Si da error, mándale esta respuesta a Claude.');
    }
    return new Response('VWAFR worker OK · /send /balance /test-trade');
  }
};

// Núcleo: calcula el análisis, detecta si la RUTA del bot cambió (lado o TP/SL) y,
// en ese caso, publica SIEMPRE un aviso de "ruta actualizada" (con SL/TP y enlace);
// si no, manda un mensaje normal de vez en cuando (~1/hora irregular). Difunde a
// Telegram, X y LinkedIn. Requiere un namespace KV (VWAFR_KV) para detectar cambios.
async function run(env, force) {
  const d = await analyze(env);
  if (!d) return 0;
  const kv = env.VWAFR_KV;
  let last = null;
  if (kv) { try { last = JSON.parse(await kv.get('op') || 'null'); } catch (_) {} }
  const changed = d.side && (!last || last.side !== d.side ||
    (d.tp && last.tp && Math.abs(d.tp / last.tp - 1) > 0.005) ||
    (d.sl && last.sl && Math.abs(d.sl / last.sl - 1) > 0.005));
  let sent = 0;
  if (changed) {
    sent = await broadcast(env, updateText(env, d));   // aviso de ruta actualizada
    await bitunixTrade(env, d).catch(() => {});         // ejecuta en Bitunix (si está activo)
  } else if (force || Math.random() < 0.34) {
    sent = await broadcast(env, normalText(env, d));    // mensaje normal
  }
  if (kv && d.side) { try { await kv.put('op', JSON.stringify({ side: d.side, tp: d.tp, sl: d.sl, ts: Date.now() })); } catch (_) {} }
  return sent;
}

// Difunde el mismo texto a todos los canales configurados (Telegram, X, LinkedIn).
async function broadcast(env, text) {
  if (!text) return 0;
  let count = 0;
  const token = env.TELEGRAM_TOKEN, chats = (env.CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (token && chats.length) for (const chat of chats) {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) }).catch(() => {});
    count++;
  }
  if (env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET) { if (await postX(env, text.slice(0, 270)).catch(() => false)) count++; }
  if (env.LINKEDIN_TOKEN && env.LINKEDIN_AUTHOR) { if (await postLinkedIn(env, text).catch(() => false)) count++; }
  return count;
}

// Aviso cuando la RUTA del bot cambia: lado, entrada, TP, SL, APY y enlace al bot.
function updateText(env, d) {
  const url = env.BOT_URL || 'https://vwafr-generico.pages.dev/';
  return '🔄 Ruta actualizada · ' + (d.botName || 'Bot aprobado') + '\n' +
    (d.side === 'LONG' ? '▲ LONG' : '▼ SHORT') + ' BTC ' + money(d.entry) + '\n' +
    '🎯 TP ' + money(d.tp) + '  ·  🛑 SL ' + money(d.sl) +
    (d.apy != null ? '\n💱 APY histórico del bot: ' + (d.apy >= 0 ? '+' : '') + d.apy + '%/año (' + (d.years || 9) + 'a, backtest)' : '') + '\n' +
    '⚡ Tradealo en Bitunix · código ffcczq · https://www.bitunix.com/register?inviteCode=ffcczq\n' +
    '👉 Ver el bot: ' + url +
    '\n\n⚠️ No es consejo financiero.';
}

// Publica en LinkedIn (UGC Posts API) con un access token del usuario (w_member_social).
async function postLinkedIn(env, text) {
  const body = {
    author: env.LINKEDIN_AUTHOR, lifecycleState: 'PUBLISHED',
    specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'NONE' } },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  };
  const r = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.LINKEDIN_TOKEN, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify(body)
  });
  return r.ok;
}

// ── TRADING EN BITUNIX (opcional) ─────────────────────────────────────────────
// Ejecuta la señal del bot en Bitunix Futures cuando cambia la ruta. Por
// SEGURIDAD va en DRY-RUN salvo BITUNIX_TRADE = "live". Tamaño: BITUNIX_QTY fija
// o "auto" = TODO el saldo disponible × BITUNIX_LEV (1,1 por defecto).
// Firma según la doc de Bitunix: sign = sha256( sha256(nonce+timestamp+apiKey+
// queryParams+body) + secretKey ), en hex minúsculas.
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function bxHeaders(env, queryConcat, bodyStr) {
  const ts = Date.now() + '', nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const digest = await sha256Hex(nonce + ts + env.BITUNIX_API_KEY + (queryConcat || '') + (bodyStr || ''));
  const sign = await sha256Hex(digest + env.BITUNIX_API_SECRET);
  return { 'api-key': env.BITUNIX_API_KEY, 'nonce': nonce, 'timestamp': ts, 'sign': sign, 'language': 'en-US', 'Content-Type': 'application/json',
    // cabeceras de navegador: el WAF de Bitunix devuelve 403 a peticiones "sin identidad"
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json' };
}
// Envía la petición a Bitunix: directa, o a través del relé (BITUNIX_PROXY) si
// está configurado. El relé hace falta porque Bitunix devuelve 403 a las IPs de
// Cloudflare Workers; la firma viaja intacta y el relé la reenvía tal cual.
async function bxFetch(env, path, method, headers, bodyStr) {
  if (env.BITUNIX_PROXY) {
    return fetch(env.BITUNIX_PROXY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: path, m: method, h: headers, b: bodyStr || '' })
    });
  }
  return fetch('https://fapi.bitunix.com' + path, { method, headers, body: method === 'POST' ? (bodyStr || undefined) : undefined });
}
// Fija en Bitunix el modo CRUZADO y el apalancamiento del símbolo. Bitunix solo
// acepta apalancamientos ENTEROS, así que se manda el entero superior (1.1 → 2);
// el riesgo real (1.1x la cuenta) lo pone el tamaño "auto" de la orden, no este
// número. Si hay posiciones abiertas el cambio de modo falla y se ignora.
async function bxSetup(env) {
  const symbol = env.BITUNIX_SYMBOL || 'BTCUSDT';
  const lev = Math.max(1, Math.ceil(parseFloat(env.BITUNIX_LEV || '1.1')));
  const post = async (path, obj) => {
    const bodyStr = JSON.stringify(obj);
    const headers = await bxHeaders(env, '', bodyStr);
    const r = await bxFetch(env, path, 'POST', headers, bodyStr);
    return r.json().catch(() => null);
  };
  try { await post('/api/v1/futures/account/change_margin_mode', { symbol, marginCoin: 'USDT', marginMode: 'CROSS' }); } catch (_) {}
  try { await post('/api/v1/futures/account/change_leverage', { symbol, marginCoin: 'USDT', leverage: lev }); } catch (_) {}
}
// Saldo DISPONIBLE de la cuenta de futuros (USDT). Devuelve también la respuesta
// CRUDA de Bitunix para poder diagnosticar errores de claves/firma/permisos.
async function bxBalanceRaw(env) {
  try {
    // query en la URL como k=v; en la FIRMA concatenado clave+valor (orden alfabético)
    const headers = await bxHeaders(env, 'marginCoinUSDT', '');
    const r = await bxFetch(env, '/api/v1/futures/account?marginCoin=USDT', 'GET', headers, '');
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch (_) {}
    const dd = j && j.data ? (Array.isArray(j.data) ? j.data[0] : j.data) : null;
    const av = dd ? parseFloat(dd.available ?? dd.availableBalance ?? dd.crossAvailable) : NaN;
    return { av: Number.isFinite(av) ? av : null, raw: r.status + ' ' + txt.slice(0, 400) };
  } catch (e) { return { av: null, raw: 'error: ' + e.message }; }
}
async function bxBalance(env) { return (await bxBalanceRaw(env)).av; }
async function bitunixTrade(env, d, qtyOverride) {
  if (!env.BITUNIX_API_KEY || !env.BITUNIX_API_SECRET || !d.side) return 'sin claves o sin señal';
  if ((env.BITUNIX_TRADE || '').toLowerCase() !== 'live') return 'dry-run (no opera)';
  await bxSetup(env).catch(() => {}); // modo cruzado + apalancamiento entero en Bitunix
  // Tamaño: "auto" = 95% del saldo disponible × apalancamiento / precio (toda la cuenta)
  let qty = qtyOverride || env.BITUNIX_QTY || '0.001';
  if (('' + qty).toLowerCase() === 'auto') {
    const bal = await bxBalance(env);
    const lev = parseFloat(env.BITUNIX_LEV || '1.1');
    if (bal != null && d.entry > 0) {
      const q = Math.floor((bal * 0.95 * lev / d.entry) * 1000) / 1000; // redondeo ↓ a 0.001
      qty = '' + Math.max(0.001, q);
    } else qty = '0.001'; // si el saldo no se puede leer, tamaño mínimo (seguro)
  }
  const path = '/api/v1/futures/trade/place_order';
  const bodyObj = {
    symbol: env.BITUNIX_SYMBOL || 'BTCUSDT',
    side: d.side === 'LONG' ? 'BUY' : 'SELL', tradeSide: 'OPEN', orderType: 'MARKET',
    qty: '' + qty,
    tpPrice: '' + Math.round(d.tp), tpStopType: 'LAST_PRICE', tpOrderType: 'MARKET',
    slPrice: '' + Math.round(d.sl), slStopType: 'LAST_PRICE', slOrderType: 'MARKET'
  };
  const bodyStr = JSON.stringify(bodyObj);
  const headers = await bxHeaders(env, '', bodyStr);
  try {
    const r = await bxFetch(env, path, 'POST', headers, bodyStr);
    const j = await r.json().catch(() => null);
    const out = r.status + ' ' + JSON.stringify(j || {}).slice(0, 300);
    console.log('bitunix order:', out); // visible en Logs
    return out;
  } catch (e) { console.log('bitunix error:', e.message); return 'error: ' + e.message; }
}

// Publica un tweet con OAuth 1.0a (firma HMAC-SHA1 con Web Crypto del Worker).
async function postX(env, text) {
  const url = 'https://api.twitter.com/2/tweets';
  const enc = s => encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const oauth = {
    oauth_consumer_key: env.X_API_KEY,
    oauth_nonce: Math.random().toString(36).slice(2) + Date.now(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000) + '',
    oauth_token: env.X_ACCESS_TOKEN,
    oauth_version: '1.0'
  };
  const params = Object.keys(oauth).sort().map(k => enc(k) + '=' + enc(oauth[k])).join('&');
  const base = 'POST&' + enc(url) + '&' + enc(params); // cuerpo JSON no entra en la firma (API v2)
  const signingKey = enc(env.X_API_SECRET) + '&' + enc(env.X_ACCESS_SECRET);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingKey), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(base));
  oauth.oauth_signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  const header = 'OAuth ' + Object.keys(oauth).sort().map(k => enc(k) + '="' + enc(oauth[k]) + '"').join(', ');
  const r = await fetch(url, { method: 'POST', headers: { 'Authorization': header, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  return r.ok;
}

// Formateo de dinero estilo español ($1.234) sin depender de Intl.
function money(v) {
  v = Math.round(v);
  const s = ('' + Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '$' + (v < 0 ? '-' : '') + s;
}

// ── ESTRATEGIA QUE SE TRADEA (por defecto, el BOT APROBADO 8/8) ──
// 'momaccel' = Aceleración de momentum (el aprobado) · 'robmom' = Momentum
// robusto multi-horizonte · 'consensus' = consenso de estrategias.
function momaccelSig(cl, j) {
  if (j < 62) return 0;
  const m1 = cl[j - 1] / cl[j - 21] - 1, m2 = cl[j - 21] / cl[j - 41] - 1;
  return (m1 > 0 && m1 > m2) ? 1 : (m1 < 0 && m1 < m2) ? -1 : 0;
}
function robmomSig(cl, j) {
  if (j < 210) return 0;
  const m = k => cl[j - 1] / cl[j - 1 - k] - 1;
  const s60 = m(60) > 0.02 ? 1 : m(60) < -0.02 ? -1 : 0, s90 = m(90) > 0.05 ? 1 : m(90) < -0.05 ? -1 : 0, s120 = m(120) > 0 ? 1 : -1;
  let hi = -1e18, lo = 1e18; for (let q = j - 100; q < j; q++) { if (cl[q] > hi) hi = cl[q]; if (cl[q] < lo) lo = cl[q]; }
  const s = (s60 + s90 + s120 + (cl[j - 1] > (hi + lo) / 2 ? 1 : -1)) / 4;
  if (s <= 0.3) return 0;
  let mu = 0; const rr = []; for (let q = j - 21; q < j - 1; q++) { const x = Math.log(cl[q] / cl[q - 1]); rr.push(x); mu += x; } mu /= 20;
  let vv = 0; for (const x of rr) vv += (x - mu) * (x - mu); vv = Math.sqrt(vv / 20);
  return vv > 0.055 ? Math.min(1, s) * 0.5 : Math.min(1, s);
}
// Backtest LIGERO de la estrategia (mismos costes que la web) → APY histórico.
function simLite(cl, sig) {
  const n = cl.length; if (n < 300) return null;
  const cost = 0.0004 + 0.0005, fund = 0.0003;
  const lr = []; for (let i = 1; i < n; i++) lr.push(Math.log(cl[i] / cl[i - 1]));
  const vol = j => { let m = 0; for (let k = j - 20; k < j; k++) m += lr[k - 1]; m /= 20; let s = 0; for (let k = j - 20; k < j; k++) { const x = lr[k - 1] - m; s += x * x; } return Math.sqrt(s / 20); };
  let eq = 1, pos = 0, sz = 0;
  for (let j = 220; j < n; j++) {
    const s = sig(cl, j), lev = Math.max(0.25, Math.min(3, 0.022 / (vol(j) || 0.02)));
    if (Math.sign(s) !== Math.sign(pos) || Math.abs(s - pos) >= 0.08) {
      if (pos !== 0) eq *= (1 - cost * Math.abs(sz));
      if (s !== 0) eq *= (1 - cost * lev);
      pos = s; sz = s * lev;
    }
    const r = cl[j] / cl[j - 1] - 1;
    if (pos !== 0) eq *= Math.max(1e-4, 1 + sz * r - Math.abs(sz) * fund);
  }
  const years = (n - 220) / 365;
  return { cagr: years > 0 ? (Math.pow(Math.max(eq, 1e-6), 1 / years) - 1) * 100 : 0, years };
}
// Calcula el análisis de BTC y la operación de la ESTRATEGIA elegida.
async function analyze(env) {
  try {
    // histórico LARGO por el mirror público de Binance (funciona desde Cloudflare)
    // + extensión Bitstamp pre-2017 (mismo empalme con solape que la web)
    let cl = [], end = Date.now(), firstTs = null;
    for (let pg = 0; pg < 4; pg++) {
      const kk = await fetch('https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000&endTime=' + end).then(r => r.json());
      if (!Array.isArray(kk) || !kk.length) break;
      cl = kk.map(x => parseFloat(x[4])).concat(cl); firstTs = kk[0][0]; end = kk[0][0] - 864e5;
      if (kk.length < 1000) break;
    }
    if (cl.length < 260) return null;
    const NEED = 210 + 9 * 365 + 2;
    if (cl.length < NEED && firstTs) { try {
      const jj = await fetch('https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=' + Math.min(1000, (NEED - cl.length) + 30) + '&end=' + Math.floor(firstTs / 1000)).then(r => r.json());
      const oc = ((jj.data && jj.data.ohlc) || []).map(x => parseFloat(x.close)).filter(Number.isFinite);
      if (oc.length > 30) { const ratio = cl[0] / oc[oc.length - 1]; cl = oc.slice(0, -1).map(v => v * ratio).concat(cl); }
    } catch (e) {} }
    cl = cl.slice(-NEED);
    const n = cl.length, price = cl[n - 1];
    const rets = []; for (let i = 1; i < n; i++) rets.push(Math.log(cl[i] / cl[i - 1]));
    const recent = rets.slice(-30);

    // Monte Carlo ligero (bootstrap de los retornos recientes), 30 días.
    const N = 4000, days = 30;
    const step = price > 50000 ? 5000 : price > 10000 ? 2000 : price > 2000 ? 500 : 100;
    const lvl = Math.round(price * 1.1 / step) * step;
    let up = 0, touch = 0;
    for (let p = 0; p < N; p++) {
      let v = price, mx = price;
      for (let dd = 0; dd < days; dd++) { v *= Math.exp(recent[(Math.random() * recent.length) | 0]); if (v > mx) mx = v; }
      if (v > price) up++;
      if (mx >= lvl) touch++;
    }
    const probUp = Math.round(up / N * 100), touchPct = Math.round(touch / N * 100);

    // ESTRATEGIA elegida (por defecto, el BOT APROBADO) + consenso para contexto
    const con = botConsensus(cl);
    const stratName = (env && env.BITUNIX_STRATEGY) || 'robmom';
    const stratSig = stratName === 'robmom' ? robmomSig : stratName === 'consensus' ? null : momaccelSig;
    const botName = stratName === 'robmom' ? 'Momentum robusto (multi-horizonte)' : stratName === 'consensus' ? 'Consenso de bots' : 'Aceleración de momentum';
    const raw = stratSig ? stratSig(cl, n) : (con.side === 'LONG' ? 1 : con.side === 'SHORT' ? -1 : 0);
    const side = raw > 0 ? 'LONG' : raw < 0 ? 'SHORT' : null;
    const sim = stratSig ? simLite(cl, stratSig) : null;
    const apy = sim ? Math.round(sim.cagr) : null;
    let entry = null, tp = null, sl = null;
    if (side) {
      let mu = 0; for (const r of recent) mu += r; mu /= recent.length;
      let vv = 0; for (const r of recent) vv += (r - mu) * (r - mu); vv = Math.sqrt(vv / recent.length);
      const slPct = Math.min(0.12, Math.max(0.02, 1.6 * vv * Math.sqrt(5))), tpPct = slPct * 1.6;
      entry = price;
      tp = side === 'LONG' ? price * (1 + tpPct) : price * (1 - tpPct);
      sl = side === 'LONG' ? price * (1 - slPct) : price * (1 + slPct);
    }
    const fig = detectFigure(cl);
    const mom = price / cl[n - 22] - 1;
    return { price, probUp, touchPct, lvl, mom, con, side, entry, tp, sl, fig, botName, apy, years: sim ? +sim.years.toFixed(1) : null };
  } catch (e) { return null; }
}

// Mensaje "normal" (rotación de variantes) a partir del análisis.
function normalText(env, d) {
  const con = d.con, side = d.side, fig = d.fig;
  const pool = [
    '🔮 Nuevo cono BTC: posibilidad del ' + d.touchPct + '% de tocar ' + money(d.lvl) + ' en 30 días.',
    '📊 BTC ' + money(d.price) + ' · ' + d.probUp + '% de probabilidad de subir a 30 días.',
    '📈 BTC ' + money(d.price) + ' · sesgo ' + (d.mom >= 0 ? '+' : '') + (d.mom * 100).toFixed(1) + '% (momentum 21d).'
  ];
  if (side) pool.push('🤖 Bots (' + con.long + '▲/' + con.short + '▼ de ' + con.n + '): ' + side + '.');
  if (side) pool.push('🤖 ' + (d.botName || 'Bot') + ': ' + side + ' · entrada ' + money(d.entry) + ' · 🎯 TP ' + money(d.tp) + ' · 🛑 SL ' + money(d.sl) + '.');
  if (d.apy != null) pool.push('🏅 Bot aprobado (' + d.botName + '): ' + (d.apy >= 0 ? '+' : '') + d.apy + '%/año histórico en ' + (d.years || 9) + ' años (con comisiones)' + (side ? ' · ahora ' + side : ' · ahora fuera') + '. Tradealo en Bitunix (código ffcczq).');
  if (fig) pool.push('📐 Posible ' + fig.name + (fig.forming ? ' (en formación)' : ' (confirmada)') + ': objetivo ' + money(fig.target) + ' · ' + fig.prob + '% de acierto histórico.');
  const tail = ['', '', ' ⚡', ' 🟠', ' #BTC'][(Math.random() * 5) | 0];
  let msg = pool[(Math.random() * pool.length) | 0] + tail;
  if (Math.random() < 0.34) {
    const apy = (env && env.BITUNIX_APY) ? env.BITUNIX_APY : 'hasta 20%';
    msg += '\n\n💰 Gana ' + apy + ' APY en Bitunix · código ffcczq · https://www.bitunix.com/register?inviteCode=ffcczq';
  }
  return msg + '\n\n⚠️ No es consejo financiero.';
}

// Consenso de varias estrategias de bots (subconjunto representativo de las 40).
function botConsensus(cl) {
  const n = cl.length, j = n;
  const ma = p => { let s = 0; for (let i = j - p; i < j; i++) s += cl[i]; return s / p; };
  const mom = k => cl[j - 1] / cl[j - 1 - k] - 1;
  const rsi = () => { let g = 0, l = 0; for (let i = j - 14; i < j; i++) { const ch = cl[i] - cl[i - 1]; if (ch >= 0) g += ch; else l -= ch; } const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs); };
  const up200 = cl[j - 1] > ma(200);
  const s = [];
  s.push(ma(50) > ma(200) ? 1 : -1);                                  // cruce 50/200
  s.push(ma(20) > ma(100) ? 1 : -1);                                  // cruce 20/100
  s.push(ma(10) > ma(50) ? 1 : -1);                                   // cruce 10/50
  s.push(cl[j - 1] > ma(100) ? 1 : -1);                               // precio vs MA100
  s.push(mom(60) > 0.02 ? 1 : mom(60) < -0.02 ? -1 : 0);              // momentum 60d
  s.push(mom(20) > 0.04 ? 1 : mom(20) < -0.04 ? -1 : 0);              // momentum 20d
  s.push(mom(120) > 0 ? 1 : -1);                                      // momentum 120d
  { let hi = -1e18, lo = 1e18; for (let i = j - 55; i < j; i++) { if (cl[i] > hi) hi = cl[i]; if (cl[i] < lo) lo = cl[i]; } s.push(cl[j - 1] > (hi + lo) / 2 ? 1 : -1); } // Donchian 55
  { const r = rsi(); let x = r < 30 ? 1 : r > 70 ? -1 : 0; x = up200 ? Math.max(0, x) : Math.min(0, x); s.push(x); } // RSI a favor de tendencia
  { const my = cl[j - 1] / ma(200); s.push(my < 0.8 ? 1 : my > 2.4 ? -1 : 0); } // Mayer
  let long = 0, short = 0; for (const x of s) { if (x > 0) long++; else if (x < 0) short++; }
  const tot = s.length, net = (long - short) / tot;
  return { side: net > 0.15 ? 'LONG' : net < -0.15 ? 'SHORT' : null, long, short, n: tot, net };
}

// Detecta la figura gráfica más reciente (ruptura de rango / doble techo-suelo)
// y su probabilidad = acierto histórico a 10 días sobre el propio histórico.
function detectFigure(cl) {
  const n = cl.length, W = 4, R = 20, H = 10;
  const maxN = (j, w) => { let v = -1e18; for (let k = Math.max(0, j - w); k < j; k++) if (cl[k] > v) v = cl[k]; return v; };
  const minN = (j, w) => { let v = 1e18; for (let k = Math.max(0, j - w); k < j; k++) if (cl[k] < v) v = cl[k]; return v; };
  const near = (a, b, t) => Math.abs(a - b) / ((a + b) / 2) < t;
  const PH = [], PL = [];
  for (let i = W; i < n - W; i++) { let h = 1, l = 1; for (let kk = i - W; kk <= i + W; kk++) { if (cl[kk] > cl[i]) h = 0; if (cl[kk] < cl[i]) l = 0; } if (h) PH.push(i); if (l) PL.push(i); }
  const recent = (arr, j, m) => { const o = []; for (let z = arr.length - 1; z >= 0 && o.length < m; z--) if (arr[z] <= j - W) o.unshift(arr[z]); return o; };
  const rangeUp = j => { const d = maxN(j, 25); return (cl[j] > d && cl[j - 1] <= d) ? { target: cl[j] * 1.1 } : null; };
  const rangeDn = j => { const d = minN(j, 25); return (cl[j] < d && cl[j - 1] >= d) ? { target: cl[j] * 0.9 } : null; };
  const dTop = j => { const h = recent(PH, j, 2); if (h.length < 2 || !near(cl[h[0]], cl[h[1]], 0.05)) return null; const v = Math.min(cl[h[0]], cl[h[1]]), top = (cl[h[0]] + cl[h[1]]) / 2; if ((top - v) / v < 0.04) return null; return (cl[j] < v && cl[j - 1] >= v) ? { target: v - (top - v) } : null; };
  const dBot = j => { const l = recent(PL, j, 2); if (l.length < 2 || !near(cl[l[0]], cl[l[1]], 0.05)) return null; const v = Math.max(cl[l[0]], cl[l[1]]), bot = (cl[l[0]] + cl[l[1]]) / 2; if ((v - bot) / bot < 0.04) return null; return (cl[j] > v && cl[j - 1] <= v) ? { target: v + (v - bot) } : null; };
  const cands = [
    { name: 'Ruptura de rango ↑', dir: 1, fn: rangeUp }, { name: 'Ruptura de rango ↓', dir: -1, fn: rangeDn },
    { name: 'Doble techo', dir: -1, fn: dTop }, { name: 'Doble suelo', dir: 1, fn: dBot }
  ];
  for (const { name, dir, fn } of cands) {
    let trig = null; for (let j = n - 1; j >= n - R; j--) { const r = fn(j); if (r) { trig = r; break; } }
    if (!trig) continue;
    let k = 0, win = 0; for (let j = 60; j < n - H; j++) { if (fn(j)) { k++; if (((cl[j + H] - cl[j]) / cl[j]) * dir > 0) win++; } }
    if (k < 3) continue;
    return { name, dir, forming: false, target: trig.target, prob: Math.round(win / k * 100) };
  }
  return null;
}
