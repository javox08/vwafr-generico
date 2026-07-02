// Relé mínimo hacia la API de Bitunix (fapi.bitunix.com) para el worker de
// Cloudflare. Necesario porque Bitunix devuelve 403 "Access restricted" a las
// peticiones que salen de las IPs de Cloudflare Workers. Se despliega gratis
// en Vercel (región Frankfurt, ver vercel.json) importando este repo.
//
// Recibe POST con { p: ruta, m: método, h: cabeceras firmadas, b: cuerpo } y
// devuelve la respuesta de Bitunix TAL CUAL (mismo código de estado y cuerpo).
// Solo permite rutas de /api/v1/futures/ y no guarda ni registra nada; la
// firma la hace el worker con sus secrets, aquí no hay ninguna clave.
const ALLOWED = ['api-key', 'nonce', 'timestamp', 'sign', 'language', 'content-type'];

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') { res.status(405).send('solo POST'); return; }
    const { p, m, h, b } = req.body || {};
    if (typeof p !== 'string' || !p.startsWith('/api/v1/futures/')) { res.status(400).send('ruta no permitida'); return; }
    const hl = {};
    if (h && typeof h === 'object') for (const k of Object.keys(h)) hl[k.toLowerCase()] = h[k];
    const headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    };
    for (const k of ALLOWED) { if (typeof hl[k] === 'string') headers[k] = hl[k]; }
    const method = m === 'POST' ? 'POST' : 'GET';
    const r = await fetch('https://fapi.bitunix.com' + p, { method, headers, body: method === 'POST' ? ('' + (b || '')) : undefined });
    const txt = await r.text();
    res.status(r.status);
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    res.send(txt);
  } catch (e) { res.status(502).send('relay error: ' + e.message); }
};
