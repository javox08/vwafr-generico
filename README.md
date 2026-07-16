# VWAFR · Cripto Quant

Web de **análisis cripto 100% automático en español**, gratuita y sin registro:
funding en vivo de 17 exchanges, análisis multi-temporalidad estilo Velo (CVD,
interés abierto, funding, premium) que explica POR QUÉ sube o baja Bitcoin,
mapa de liquidaciones con volumen real, patrones backtesteados, probabilidades
Monte Carlo de tocar niveles, noticias cripto con filtro político, calendario
económico estilo Investing (IPC/IPP/empleo), ciclo por halving, bots con
backtest de 9 años y ciclo macro mundial.

**En vivo:** https://vwafr-generico.pages.dev/

## Arquitectura

- **`index.html`** — TODA la app: un solo archivo (React 18 por CDN + Babel
  standalone compilando en el navegador). Sin build. Se despliega tal cual en
  **Cloudflare Pages** (rama `main`).
- **`functions/api/funding.js`** — función de Cloudflare Pages: funding + OI
  del top 10 en los exchanges que Cloudflare puede alcanzar (OKX, KuCoin,
  BingX, Hyperliquid…).
- **`api/ls.js` y `api/fr.js`** — relés en **Vercel** (Frankfurt), para APIs
  sin CORS o geo-bloqueadas en Cloudflare/navegador:
  - `ls.js`: long/short (masa = cuentas OKX+Bybit+Binance · pros = posiciones
    de top traders OKX+Binance ponderadas por OI), taker 24h + CVD de futuros,
    premium agregado, históricos de OI/funding/premium, volumen futuros/spot.
  - `fr.js`: funding + OI de Gate, MEXC, Binance, Bybit, Bitget, Kraken, HTX,
    CoinEx, Bitfinex, dYdX, WhiteBIT, Phemex y Deribit (normalizado a %/8h).
  - `social.js`: seguidores en vivo del menú de Redes (TikTok, YouTube, Twitch
    con detección de directo vía DecAPI, X vía FxTwitter, Facebook) · caché 1h.
  - `news.js`: titulares cripto en español vía Google News, con filtro
    política/regulación-primero y descarte de análisis de opinión · caché 15 min.
- **`worker/`** — Cloudflare Worker con cron: mensajes automáticos a Telegram
  (y opcional X/LinkedIn) y bot de trading opcional en Bitunix (ver su README).
- **`sw.js`** — service worker (PWA instalable, offline, network-first para el
  documento: las versiones nuevas llegan solas).

## Regla de oro de los datos

**Fuente canónica única por concepto.** Todos los paneles de long/short leen
los MISMOS valores del relé `ls.js` (BTC): masa, pros, aperturas taker y el
⭐ consenso (masa + pros×2 + aperturas). El mapa de liquidez es un dato
DISTINTO (dinero en riesgo de liquidación estimado del volumen real, con el
reparto por vela según su taker buy/sell) y así se etiqueta. Nada de datos
inventados: si una fuente falla, el panel lo dice o cae a otra fuente real.

## Desarrollo y verificación

No hay build: edita `index.html` y recarga. Para verificar de verdad (el
Babel compila en el navegador, un error rompe la vista entera):

```bash
# harness de render real (ver libtest/browser/README.md):
SP=<scratch> node libtest/browser/buildtest.cjs quant   # o home/bots/cycle/pib
chromium --headless --no-sandbox --virtual-time-budget=25000 --dump-dom test_quant.html
# criterio: #root con contenido + ERRCOUNT:0 + greps SOLO sobre el DOM (sin <script>)

# capturas móviles REALES (el headless CLI clampa el viewport a 500px):
NODE_PATH=/opt/node22/lib/node_modules node libtest/browser/pwshot.cjs test_quant.html out.png 414
```

- **`libtest/`** — backtests reproducibles (cono, patrones, bots, veredictos
  Velo…) con sus hallazgos en `libtest/README.md`. Los números de acierto que
  muestra la web salen de aquí; si cambias una lógica, re-ejecuta su backtest.

## Principios

- Honestidad estadística: los % de acierto son medidos, con n y margen; lo que
  no tiene ventaja se dice ("~50% = describe, no predice").
- Solo velas cerradas para confirmar patrones/veredictos.
- Todo automático (60 s – 2 min por panel). No es consejo financiero.
