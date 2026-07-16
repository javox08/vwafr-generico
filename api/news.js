// Relé de NOTICIAS cripto en español (Vercel): Google News RSS (agrega Expansión,
// Investing, FXStreet, CoinTelegraph…). Prioriza POLÍTICA/REGULACIÓN/MACRO (SEC, leyes,
// gobiernos, Fed/BCE, ETF, demandas, prohibiciones…) y PENALIZA el análisis de opinión
// de terceros (predicciones, "podría", soportes/resistencias, analistas). Caché 15 min.
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' };

const HOT = /última hora|urgente|alerta|flash/i;
// POLÍTICA / regulación / institucional / macro → lo que el usuario quiere ver
const POL = /\bsec\b|cnmv|regulaci|\bley(es)?\b|normativ|gobierno|congreso|senado|parlamento|casa blanca|trump|biden|elecci|ministr|decreto|\bbce\b|\bfed\b|reserva federal|tipos de inter|tesoro|hacienda|impuesto|fiscal[íi]a|multa|sanci|demanda|juez|tribunal|prohib|aprueba|autoriza|licencia|mica\b|uni[óo]n europea|bruselas|\bue\b|china|rusia|el salvador|banco central|reserva estratégica|etf|blackrock|fidelity|adopci|legaliz|regulador|senador|diputad|gobernador|quiebra|hack|roba|liquidacion|récord|máximo hist/i;
// ANÁLISIS de terceros / opinión / predicción → fuera (no es noticia, es opinión)
const ANA = /podría|puede alcanzar|análisis|analista|predic|pronost|proyecta|opina|cree que|sugiere|apunta a|formando|patrón|soporte|resistencia|precio objetivo|objetivo de precio|alcanzar[áa]|rumbo a|camino a|según (glassnode|santiment|cryptoquant|un analista|expertos)|on.?chain|se dispara hacia|esto es lo que|por qué|cómo invertir|mejores criptomonedas|top \d|guía|¿|capitulaci|trampa (alcista|bajista)/i;

const FEEDS = [
  'https://news.google.com/rss/search?q=bitcoin+OR+ethereum+OR+criptomonedas&hl=es&gl=ES&ceid=ES:es',
  'https://news.google.com/rss/search?q=criptomonedas+(regulaci%C3%B3n+OR+SEC+OR+ley+OR+gobierno+OR+ETF)&hl=es&gl=ES&ceid=ES:es',
];

const grab = (u) => {
  const c = new AbortController(); const tm = setTimeout(() => c.abort(), 7000);
  return fetch(u, { headers: UA, signal: c.signal }).then(r => r.text()).finally(() => clearTimeout(tm));
};

export default async function handler(req, res) {
  const out = { t: Date.now(), items: [] };
  try {
    const xmls = await Promise.all(FEEDS.map(u => grab(u).catch(() => '')));
    const items = [];
    for (const xml of xmls) {
      const re = /<item>([\s\S]*?)<\/item>/g; let m;
      while ((m = re.exec(xml)) && items.length < 80) {
        const it = m[1];
        const g = tag => { const x = it.match(new RegExp('<' + tag + '>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</' + tag + '>')); return x ? x[1].trim() : ''; };
        let title = g('title'); const link = g('link'), pub = g('pubDate'), src = g('source');
        if (!title || !link) continue;
        const cut = title.lastIndexOf(' - ');
        const source = src || (cut > 10 ? title.slice(cut + 3) : '');
        if (cut > 10) title = title.slice(0, cut);
        title = title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
        const d = Date.parse(pub) || 0;
        const ageH = (Date.now() - d) / 36e5;
        // puntuación: política/institucional manda; el análisis de opinión se descarta
        let score = ageH < 3 ? 3 : ageH < 12 ? 2 : ageH < 24 ? 1 : 0;
        const isPol = POL.test(title), isAna = ANA.test(title);
        if (isPol) score += 5;
        if (isAna) score -= 6;           // opinión/predicción → prácticamente fuera
        if (HOT.test(title)) score += 5;
        if (!isPol && !HOT.test(title)) score -= 1; // sin ángulo político ni urgencia, pesa menos
        items.push({ t: title, s: source, u: link, d, score,
          hot: HOT.test(title) || (isPol && ageH < 3) });
      }
    }
    // dedupe por primeras 6 palabras y descarta puntuaciones negativas (opinión pura)
    const seen = new Set(); const uniq = [];
    for (const it of items.sort((a, b) => b.score - a.score || b.d - a.d)) {
      if (it.score < 1) continue;
      const k = it.t.toLowerCase().split(/\s+/).slice(0, 6).join(' ');
      if (seen.has(k)) continue; seen.add(k); uniq.push(it);
      if (uniq.length >= 12) break;
    }
    out.items = uniq.map(({ score, ...x }) => x);
  } catch (e) {}
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  res.status(200).json(out);
}
