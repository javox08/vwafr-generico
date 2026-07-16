// Relé de REDES SOCIALES (Vercel): seguidores en vivo para el menú de redes.
// Scrapea las páginas públicas (TikTok/YouTube/Twitch no dan API gratis con CORS)
// y cachea 1h en el edge para no hacer spam. Si algo falla, el campo va vacío y
// el cliente cae a su última cifra conocida.
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' };
const UA_IOS = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const jt = (u, ms = 6000, hd = UA) => {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  return fetch(u, { headers: hd, signal: c.signal }).then(r => r.text()).finally(() => clearTimeout(t));
};

export default async function handler(req, res) {
  const out = { t: Date.now() };
  await Promise.all([
    // TikTok: followerCount/videoCount/heartCount vienen en el JSON embebido de la página
    jt('https://www.tiktok.com/@javox_008').then(h => {
      const f = h.match(/"followerCount":(\d+)/), v = h.match(/"videoCount":(\d+)/), l = h.match(/"heartCount":(\d+)/);
      if (f) out.tiktok = { f: +f[1], v: v ? +v[1] : null, likes: l ? +l[1] : null };
    }).catch(() => {}),
    // YouTube: el contador de suscriptores aparece como texto. OJO: desde el edge de la UE
    // (fra1) YouTube devuelve la página de CONSENTIMIENTO sin datos → cookie SOCS la salta.
    jt('https://www.youtube.com/@javox-k9p', 6000, { ...UA, Cookie: 'SOCS=CAI', 'Accept-Language': 'en' }).then(h => {
      const m = h.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) ||
        h.match(/([\d.,]+\s?[KM]?)\s+(?:subscribers|suscriptores)/i) ||
        h.match(/"subscriberCount":"(\d+)"/);
      if (m) out.youtube = { subs: m[1].trim() };
      const vd = h.match(/"videosCountText":\{"runs":\[\{"text":"([^"]+)"/);
      if (vd && out.youtube) out.youtube.videos = vd[1];
    }).catch(() => {}),
    // Twitch vía DecAPI (fiable; el HTML de twitch.tv daba falsos positivos de directo):
    // uptime = "... is offline" si no emite, o el tiempo en directo si sí. + seguidores.
    jt('https://decapi.me/twitch/uptime/javoxmaster', 5000).then(h => {
      const s = (h || '').trim();
      out.twitch = Object.assign(out.twitch || {}, { live: s.length > 0 && !/offline|not live|error|no user/i.test(s) });
    }).catch(() => {}),
    jt('https://decapi.me/twitch/followcount/javoxmaster', 5000).then(h => {
      const n = parseInt((h || '').trim(), 10);
      if (Number.isFinite(n) && n >= 0) out.twitch = Object.assign(out.twitch || {}, { f: n });
    }).catch(() => {}),
    // X (Twitter): seguidores vía FxTwitter (espejo público, sin clave)
    jt('https://api.fxtwitter.com/Javidelatorrev1', 5000).then(h => {
      const j = JSON.parse(h);
      if (j && j.user && Number.isFinite(j.user.followers)) out.x = { f: j.user.followers };
    }).catch(() => {}),
    // Facebook: nombre real y me gusta/seguidores si el HTML los muestra. Desde Vercel el
    // UA de iPhone recibe bloqueo → probamos el crawler oficial (recibe las og:meta) y
    // el móvil como respaldo, leyendo og:title además de <title>.
    ...[['fb1', 'https://www.facebook.com/share/1ThN8wBtBZ/'], ['fb2', 'https://www.facebook.com/share/1B3hDAVPse/']].map(([k, u]) =>
      (async () => {
        for (const hd of [{ 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' }, UA_IOS]) {
          try {
            const h = await jt(u, 6000, hd);
            const t = h.match(/<meta property="og:title" content="([^"]{2,80})"/) || h.match(/<title>([^<]{2,60})<\/title>/);
            const c = h.match(/([\d.,]+)\s*(?:mil\s*)?(?:seguidores|followers|me gusta|likes)/i);
            const o = {};
            if (t && !/facebook|log in|iniciar|inicia sesión/i.test(t[1])) o.name = t[1].trim();
            if (c) o.n = c[0].replace(/likes?/i, 'me gusta').replace(/followers/i, 'seguidores');
            if (o.name || o.n) { out[k] = o; return; }
          } catch (e) {}
        }
      })()),
  ]);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  res.status(200).json(out);
}
