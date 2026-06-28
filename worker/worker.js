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
    return new Response('VWAFR worker OK · /send para una prueba');
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

// Aviso cuando la RUTA del bot cambia: lado, entrada, TP, SL y enlace al bot.
function updateText(env, d) {
  const url = env.BOT_URL || 'https://vwafr-generico.pages.dev/';
  return '🔄 Ruta actualizada · Operación de los bots rentables\n' +
    (d.side === 'LONG' ? '▲ LONG' : '▼ SHORT') + ' BTC ' + money(d.entry) + '\n' +
    '🎯 TP ' + money(d.tp) + '  ·  🛑 SL ' + money(d.sl) + '\n' +
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
// Ejecuta la señal del CONSENSO de los bots en Bitunix Futures cuando cambia la
// ruta. Por SEGURIDAD va en DRY-RUN salvo que pongas BITUNIX_TRADE = "live".
// IMPORTANTE: verifica endpoints/firma con la doc oficial y PRUEBA con tamaño
// mínimo antes de operar en serio. Es dinero real: puedes perderlo.
async function bitunixTrade(env, d) {
  if (!env.BITUNIX_API_KEY || !env.BITUNIX_API_SECRET || !d.side) return;
  if ((env.BITUNIX_TRADE || '').toLowerCase() !== 'live') return; // DRY-RUN por defecto
  const base = 'https://fapi.bitunix.com', path = '/api/v1/futures/trade/place_order';
  const bodyObj = {
    symbol: env.BITUNIX_SYMBOL || 'BTCUSDT',
    side: d.side === 'LONG' ? 'BUY' : 'SELL', tradeSide: 'OPEN', orderType: 'MARKET',
    qty: '' + (env.BITUNIX_QTY || '0.001'),
    tpPrice: '' + Math.round(d.tp), slPrice: '' + Math.round(d.sl)
  };
  const bodyStr = JSON.stringify(bodyObj), ts = Date.now() + '', nonce = Math.random().toString(36).slice(2);
  const sign = await hmacHex(env.BITUNIX_API_SECRET, nonce + ts + env.BITUNIX_API_KEY + bodyStr);
  await fetch(base + path, {
    method: 'POST',
    headers: { 'api-key': env.BITUNIX_API_KEY, 'nonce': nonce, 'timestamp': ts, 'sign': sign, 'Content-Type': 'application/json' },
    body: bodyStr
  }).catch(() => {});
}
async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
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

// Calcula el análisis ligero de BTC y la operación del consenso de los bots.
async function analyze(env) {
  try {
    const k = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=1000').then(r => r.json());
    if (!Array.isArray(k) || k.length < 260) return null;
    const cl = k.map(x => parseFloat(x[4]));
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

    // SEÑAL DE LOS BOTS: consenso de varias estrategias (la operación de los 25 bots).
    const con = botConsensus(cl);
    const side = con.side;
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
    return { price, probUp, touchPct, lvl, mom, con, side, entry, tp, sl, fig };
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
  if (side) pool.push('🤖 Operación bots: ' + side + ' · entrada ' + money(d.entry) + ' · 🎯 TP ' + money(d.tp) + ' · 🛑 SL ' + money(d.sl) + '.');
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
  const cands = [['Ruptura de rango ↑', 1, rangeUp], ['Ruptura de rango ↓', -1, rangeDn], ['Doble techo', -1, dTop], ['Doble suelo', 1, dBot]];
  for (const [name, dir, fn] of cands) {
    let trig = null; for (let j = n - 1; j >= n - R; j--) { const r = fn(j); if (r) { trig = r; break; } }
    if (!trig) continue;
    let k = 0, win = 0; for (let j = 60; j < n - H; j++) { if (fn(j)) { k++; if (((cl[j + H] - cl[j]) / cl[j]) * dir > 0) win++; } }
    if (k < 3) continue;
    return { name, dir, forming: false, target: trig.target, prob: Math.round(win / k * 100) };
  }
  return null;
}
