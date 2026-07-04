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
(`const ql=4, qh=96`). Más allá de esto, seguir tocando parámetros = sobreajuste
(mejor en el histórico, peor en vivo).
