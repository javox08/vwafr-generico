// Relé de REDES SOCIALES (Vercel): seguidores en vivo para el menú de redes.
// Scrapea las páginas públicas (TikTok/YouTube/Twitch no dan API gratis con CORS)
// y cachea 1h en el edge para no hacer spam. Si algo falla, el campo va vacío y
// el cliente cae a su última cifra conocida.
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' };
const jt = (u, ms = 6000) => {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  return fetch(u, { headers: UA, signal: c.signal }).then(r => r.text()).finally(() => clearTimeout(t));
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
  ]);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  res.status(200).json(out);
}
