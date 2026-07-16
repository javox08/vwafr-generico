// Relé de NOTICIAS cripto en español (Vercel): Google News RSS (agrega Expansión,
// Investing, FXStreet, CoinTelegraph…), con puntuación de IMPORTANCIA estilo terminal:
// solo pasan los titulares que importan (última hora, récords, Fed/IPC, ETF, hacks…).
// Caché 15 min en el edge.
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' };

// palabras que hacen IMPORTANTE un titular (y las que lo marcan como ÚLTIMA HORA)
const HOT = /última hora|urgente|alerta|rompe|flash/i;
const BIG = /récord|máximo|mínimo|ath|supera|desploma|cae|hunde|dispara|sube|salta|fed|bce|ipc|inflación|tipos|sec |etf|hack|roban|quiebra|liquidacion|halving|regulación|ley|prohib|aprueba|el salvador|blackrock|estrategia|microstrategy|ballena|whale|billón|mil millones/i;

export default async function handler(req, res) {
  const out = { t: Date.now(), items: [] };
  try {
    const c = new AbortController(); const tm = setTimeout(() => c.abort(), 7000);
    const xml = await fetch('https://news.google.com/rss/search?q=bitcoin+OR+ethereum+OR+criptomonedas&hl=es&gl=ES&ceid=ES:es',
      { headers: UA, signal: c.signal }).then(r => r.text()).finally(() => clearTimeout(tm));
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g; let m;
    while ((m = re.exec(xml)) && items.length < 40) {
      const it = m[1];
      const g = tag => { const x = it.match(new RegExp('<' + tag + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>')); return x ? x[1].trim() : ''; };
      let title = g('title'); const link = g('link'), pub = g('pubDate'), src = g('source');
      if (!title || !link) continue;
      // Google News añade " - Medio" al final del título → lo separamos
      const cut = title.lastIndexOf(' - ');
      const source = src || (cut > 10 ? title.slice(cut + 3) : '');
      if (cut > 10) title = title.slice(0, cut);
      title = title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const d = Date.parse(pub) || 0;
      // puntuación: recencia (0-3) + palabras grandes (0-3) + última hora (5)
      const ageH = (Date.now() - d) / 36e5;
      let score = ageH < 3 ? 3 : ageH < 12 ? 2 : ageH < 24 ? 1 : 0;
      if (BIG.test(title)) score += 3;
      if (HOT.test(title)) score += 5;
      items.push({ t: title, s: source, u: link, d, hot: HOT.test(title) || (BIG.test(title) && ageH < 3), score });
    }
    // dedupe por primeras 6 palabras (Google repite la misma noticia de varios medios)
    const seen = new Set(); const uniq = [];
    for (const it of items.sort((a, b) => b.score - a.score || b.d - a.d)) {
      const k = it.t.toLowerCase().split(/\s+/).slice(0, 6).join(' ');
      if (seen.has(k)) continue; seen.add(k); uniq.push(it);
      if (uniq.length >= 10) break;
    }
    out.items = uniq.map(({ score, ...x }) => x);
  } catch (e) {}
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.status(200).json(out);
}
