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
    // YouTube: el contador de suscriptores aparece como texto (idioma según región del edge)
    jt('https://www.youtube.com/@javox-k9p').then(h => {
      const m = h.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/) ||
        h.match(/([\d.,]+\s?[KM]?)\s+(?:subscribers|suscriptores)/i);
      if (m) out.youtube = { subs: m[1].trim() };
      const vd = h.match(/"videosCountText":\{"runs":\[\{"text":"([^"]+)"/);
      if (vd && out.youtube) out.youtube.videos = vd[1];
    }).catch(() => {}),
    // Twitch: si está emitiendo, la página incluye isLiveBroadcast (schema.org)
    jt('https://www.twitch.tv/javoxmaster').then(h => {
      out.twitch = { live: h.includes('isLiveBroadcast') };
    }).catch(() => {}),
    // X (Twitter): seguidores vía FxTwitter (espejo público, sin clave)
    jt('https://api.fxtwitter.com/Javidelatorrev1', 5000).then(h => {
      const j = JSON.parse(h);
      if (j && j.user && Number.isFinite(j.user.followers)) out.x = { f: j.user.followers };
    }).catch(() => {}),
    // Facebook: nombre real de cada página (título) y me gusta/seguidores si el HTML público los muestra
    ...[['fb1', 'https://www.facebook.com/share/1ThN8wBtBZ/'], ['fb2', 'https://www.facebook.com/share/1B3hDAVPse/']].map(([k, u]) =>
      jt(u, 7000, UA_IOS).then(h => {
        const t = h.match(/<title>([^<]{2,60})<\/title>/);
        const c = h.match(/([\d.,]+)\s*(?:mil\s*)?(?:seguidores|followers|me gusta|likes)/i);
        const o = {};
        if (t && !/facebook|log in|iniciar/i.test(t[1])) o.name = t[1].trim();
        if (c) o.n = c[0].replace(/likes?/i, 'me gusta').replace(/followers/i, 'seguidores');
        if (o.name || o.n) out[k] = o;
      }).catch(() => {})),
  ]);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  res.status(200).json(out);
}
