# VWAFR · Bot de Telegram 24/7 (Cloudflare Worker)

Manda mensajes automáticos sobre BTC a tus grupos/chats **aunque la web esté
cerrada**, calculando su propio análisis (no depende del navegador). Gratis con
el plan Free de Cloudflare Workers.

## Qué envía
~1 mensaje por hora (horario irregular), por ejemplo:
- 🔮 *Nuevo cono BTC: posibilidad del 22% de tocar $66.000 en 30 días.*
- 📊 *BTC $60.000 · 55% de probabilidad de subir a 30 días.*
- 🤖 *Operación bots: LONG · entrada $60.000 · 🎯 TP $63.500 · 🛑 SL $57.800.* (consenso de los bots)
- 📐 *Posible Ruptura de rango ↑ (confirmada): objetivo $66.000 · 68% de acierto histórico.*
- 💰 *Gana hasta 20% APY en Bitunix · código ffcczq* (promo, en ~1 de cada 3)

Y termina siempre con *⚠️ No es consejo financiero.* La señal de operación es el
**consenso de varias estrategias de bots** (no una sola). Cambia el texto del APY
en `wrangler.toml` (`BITUNIX_APY`).

## Pasos (una vez, ~5 minutos)

1. **Crea el bot** en Telegram con **@BotFather** → `/newbot` → copia el **token**.
2. **Añade el bot a tu grupo** (o canal como administrador). Si no escribe en el
   grupo, desactiva el privacy mode: BotFather → `/setprivacy` → *Disable*.
3. **Consigue los chat IDs**: añade **@userinfobot** a un chat o usa **@getidsbot**
   en el grupo. Los IDs de grupo empiezan por `-100…`.
4. **Instala wrangler y despliega** (necesitas Node 18+):

   ```bash
   cd worker
   npm install -g wrangler          # o usa: npx wrangler ...
   wrangler login                   # abre el navegador y autoriza

   # pon tus destinos (separados por coma) en wrangler.toml -> CHAT_IDS
   #   CHAT_IDS = "-1001234567890,987654321"

   wrangler secret put TELEGRAM_TOKEN   # pega aquí el token del bot
   wrangler deploy
   ```

5. **Listo.** El cron empieza solo. Para probar al instante, abre en el
   navegador la URL del worker que te dio `wrangler deploy` y añade `/send`:
   `https://vwafr-telegram.TU-SUBDOMINIO.workers.dev/send`

## Publicar también en X (Twitter) — opcional
El worker puede **tuitear** el mismo mensaje. Necesitas una cuenta de
desarrollador (https://developer.x.com) con una App con permisos **Read and
Write** y los 4 datos de OAuth 1.0a:

```bash
wrangler secret put X_API_KEY          # API Key (consumer key)
wrangler secret put X_API_SECRET       # API Key Secret
wrangler secret put X_ACCESS_TOKEN     # Access Token
wrangler secret put X_ACCESS_SECRET    # Access Token Secret
wrangler deploy
```

Con esos 4 secretos, cada envío también se publica en X. Si no los pones, solo
manda por Telegram. **Ojo al límite del plan Free de X (~500 posts/mes):** con
~1/hora te pasarías; sube el `cron` (p. ej. `0 */2 * * *`, cada 2 h) o baja la
probabilidad de envío en `worker.js`.

## Ajustes
- **Frecuencia**: en `wrangler.toml`, `crons`. Por defecto `*/20 * * * *` (cada
  20 min) y el worker envía con ~34% de probabilidad → ~1/hora irregular. Para
  más mensajes, sube la probabilidad en `worker.js` (`Math.random() > 0.34`).
- **Destinos**: cámbialos en `wrangler.toml` (CHAT_IDS) y vuelve a `wrangler deploy`,
  o en el panel de Cloudflare (Workers → tu worker → Settings → Variables).
- **Token**: si lo cambias, `wrangler secret put TELEGRAM_TOKEN` otra vez.

## Notas
- El token se guarda como **secret** en Cloudflare (no en el repo).
- El plan Free de Workers cubre de sobra este uso (cron + alguna llamada).
- El panel "Avisos por Telegram" de la web sigue funcionando para envíos
  **mientras la app está abierta**; este worker es el modo **24/7**. Puedes usar
  los dos o solo el worker.
