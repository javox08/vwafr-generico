# Backtest de calibración del cono (7d y 30d)

Harness reproducible para medir y mejorar la **calibración** del cono de precio
del apartado Cuantitativo (`conformalize()` en `index.html`). No busca "acertar
la dirección" (eso lo limita el IC, ~0.10-0.17); busca que las **bandas** estén
bien calibradas: que la banda del 90% contenga el precio ~90% de las veces, y lo
más **estrecha** posible (nitidez).

## Datos
- `btc_daily.json` — 5.435 cierres diarios de BTC, **2011-08-18 → 2026-07-04**
  (Bitstamp, paginado). Cubre varios ciclos: bull/bear/lateral.
- Regenerar: `node fetch_btc.cjs` (guarda `btc_daily.json`).

## Metodología
- **Walk-forward sin fuga**: para cada día origen `t`, el cono se construye SOLO
  con datos hasta `t`; se compara con el precio real en `t+7` y `t+30`.
- **Split temporal** TRAIN (68% antiguo) / VALIDATION (32% reciente). Los
  parámetros se eligen en TRAIN y se miden en VALIDATION (fuera de muestra) para
  no sobreajustar.
- **Métrica**: pérdida **pinball** (quantile loss) — regla de puntuación propia
  que premia calibración y nitidez a la vez. Diagnóstico extra: cobertura al 90%
  y 50%.
- Se replica exactamente la matemática de `conformalize()`:
  `banda_tau = centro · exp((dem[e_tau] − dem[50]) · vs)`, con `dem` = retornos
  log a d días demeados y ordenados, `vs` = escala de volatilidad acotada.

## Scripts
- `cone_search.cjs` — búsqueda de 240 configs × 2 horizontes (ventana de vol,
  inicio del histórico, clamp de `vs`, drift). Escribe `cone_search_result.json`.
- `cone_calibration.cjs` — prueba **focalizada y robusta** (pocos parámetros):
  barre solo el par de la banda 90% y el 50%, elige por TRAIN, confirma en VAL,
  y valida en 3 splits temporales distintos.

## Resultado (2026-07)
El cono ya estaba **muy bien calibrado**. Reoptimizar los 9 cuantiles a la vez
**sobreajusta** (empeora fuera de muestra). El único cambio robusto y transferible:

| Horizonte | Antes | Cobertura antes | Después | Cobertura después | Pinball OOS |
|-----------|-------|-----------------|---------|-------------------|-------------|
| 7d  banda 90% | 4/96 | ~92% | **4/96 (igual)** | ~92% | óptimo, sin cambio |
| 30d banda 90% | 3/97 | ~93% (ancha) | **4/96** | ~90% (nominal) | **−1% a −3%** |
| 7d/30d banda 50% | 25/75 | ~48-52% | **25/75 (igual)** | óptimo | sin cambio |

Confirmado en 3 cortes temporales (68/60/75%): 4/96 mejora el 30d entre +1.05% y
+3.11% de pinball y acerca la cobertura a 90% exacto. Aplicado en `conformalize()`
(`const ql=4, qh=96`).

## Segunda mejora: modelo de volatilidad (EWMA λ=0.97)
`vol_model.cjs` comparó ventana rolling {15,25,40,60} y EWMA {0.90,0.94,0.97} para la
vol reciente que alimenta `vs`. La ventana simple de 25d (la que había) es ruidosa y
da bandazos. **EWMA λ=0.97 y rolling-60 ganan de forma robusta** en ambos horizontes y
los 3 cortes: pinball total OOS −0,5% a −1,2%. Aplicado en el cálculo de `recentVol`
(index.html). Se eligió EWMA por ser estándar (RiskMetrics) y adaptativo a picos.

## Lo que se probó y NO mejora (se mantiene el diseño actual)
Barridos rigurosos (1 grado de libertad, robustez exigida en los 3 cortes):
- **`per_pair_calibration.cjs`** — recalibrar cada par de banda (p10/p90, p25/p75,
  p40/p60): ningún par mejora en los 3 cortes → el mapeo ya es óptimo, tocarlo = overfit.
- **`recent_window.cjs`** — usar solo los últimos K días para los cuantiles: el 30d
  EMPEORA (se pierden las colas de crashes raros) y el 7d solo gana +0,1% (ruido).
  Usar todo el histórico es lo correcto.
- **`clamp_gamma.cjs`** — límites del clamp de `vs` y exponente `vs^γ`: el clamp
  [0.6,2.0] y γ=1 actuales son óptimos; γ=1.15 daba +0,1-0,3% en 2 de 3 cortes pero
  plano en el tercero → no robusto.

## Conclusión honesta
Tras probar 5 palancas distintas, el cono está **en su techo de calibración**. Se han
aplicado las 2 mejoras reales y transferibles (banda 30d + vol EWMA). Seguir tuneando
los mismos parámetros produce mejoras que NO sobreviven fuera de muestra = sobreajuste
(mejor en el histórico, peor en vivo). La mejora que quedaría es de otra naturaleza:
la SKILL DIRECCIONAL (el centro/deriva del cono), limitada por el IC (~0.10-0.17), que
ya se explota con las señales en vivo (tendencia, momentum, funding, patrones).
