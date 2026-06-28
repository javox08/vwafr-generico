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
  async scheduled(event, env, ctx) {
    ctx.waitUntil(maybeSend(env));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/send') { const n = await sendOnce(env); return new Response('enviado a ' + n + ' destino(s)'); }
    return new Response('VWAFR Telegram worker OK · usa /send para una prueba');
  }
};

// El cron dispara cada ~20 min; enviamos con ~34% de probabilidad → de media
// ~1 mensaje/hora, con horario IRREGULAR (no se nota que es un bot).
async function maybeSend(env) {
  if (Math.random() > 0.34) return 0;
  return sendOnce(env);
}

async function sendOnce(env) {
  const text = await buildMessage();
  if (!text) return 0;
  let count = 0;
  // ── Telegram ──
  const token = env.TELEGRAM_TOKEN;
  const chats = (env.CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (token && chats.length) {
    for (const chat of chats) {
      await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
      }).catch(() => {});
      count++;
    }
  }
  // ── X / Twitter (opcional) ──
  if (env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET) {
    const ok = await postX(env, text.slice(0, 270)).catch(() => false);
    if (ok) count++;
  }
  return count;
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

async function buildMessage() {
  try {
    const k = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=220').then(r => r.json());
    if (!Array.isArray(k) || k.length < 60) return null;
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
      for (let d = 0; d < days; d++) { v *= Math.exp(recent[(Math.random() * recent.length) | 0]); if (v > mx) mx = v; }
      if (v > price) up++;
      if (mx >= lvl) touch++;
    }
    const probUp = Math.round(up / N * 100), touchPct = Math.round(touch / N * 100);

    // Señal simple de "bots": tendencia (MA50/MA200) + momentum 21d.
    const sma = p => { let s = 0; for (let i = n - p; i < n; i++) s += cl[i]; return s / p; };
    const trendUp = sma(50) > sma(200), mom = price / cl[n - 22] - 1;
    const side = (trendUp && mom > 0) ? 'LONG' : (!trendUp && mom < 0) ? 'SHORT' : null;

    // Entrada / TP / SL por volatilidad (desviación de los retornos recientes).
    let entry = null, tp = null, sl = null;
    if (side) {
      let mu = 0; for (const r of recent) mu += r; mu /= recent.length;
      let vv = 0; for (const r of recent) vv += (r - mu) * (r - mu); vv = Math.sqrt(vv / recent.length);
      const slPct = Math.min(0.12, Math.max(0.02, 1.6 * vv * Math.sqrt(5))), tpPct = slPct * 1.6;
      entry = price;
      tp = side === 'LONG' ? price * (1 + tpPct) : price * (1 - tpPct);
      sl = side === 'LONG' ? price * (1 - slPct) : price * (1 + slPct);
    }

    const pool = [
      '🔮 Nuevo cono BTC: posibilidad del ' + touchPct + '% de tocar ' + money(lvl) + ' en 30 días.',
      '📊 BTC ' + money(price) + ' · ' + probUp + '% de probabilidad de subir a 30 días.',
      '📈 BTC ' + money(price) + ' · sesgo ' + (mom >= 0 ? '+' : '') + (mom * 100).toFixed(1) + '% (momentum 21d).'
    ];
    if (side) pool.push('🤖 Señal de los bots: ' + side + ' (tendencia ' + (trendUp ? 'alcista' : 'bajista') + ').');
    if (side) pool.push('🤖 Operación bots: ' + side + ' · entrada ' + money(entry) + ' · 🎯 TP ' + money(tp) + ' · 🛑 SL ' + money(sl) + '.');
    const tail = ['', '', ' ⚡', ' 🟠', ' #BTC'][(Math.random() * 5) | 0];
    return pool[(Math.random() * pool.length) | 0] + tail + '\n\n⚠️ No es consejo financiero.';
  } catch (e) { return null; }
}
