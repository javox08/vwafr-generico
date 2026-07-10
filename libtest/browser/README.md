# Test de render REAL de la web (headless)

IMPORTANTE: el headless Chromium del sandbox NO tiene red → los CDN (React/Babel)
no cargan y `#root` queda vacío. Un test que solo mire "0 errores" sin comprobar
que `#root` tiene contenido NO está ejecutando la app (los grep pueden coincidir
con el código fuente del script babel, que también está en el DOM).

Cómo testear de verdad:
1. Descargar react/react-dom/babel de cdnjs a `libs/` (curl vía proxy).
2. Reescribir los `src` de los CDN a `./libs/*.js` en una copia de index.html.
3. Inyectar `quantmock.js` (intercepta fetch y sirve datos sintéticos: klines
   multi-temporalidad con formato Binance, relé ls con todos los campos, fr, etc.)
   + un sink que vuelca window.__errs al DOM.
4. Forzar la vista a probar (`useState('quant')` o 'home').
5. Chromium headless con `--virtual-time-budget=25000`, dump-dom y verificar:
   - `#root` NO vacío (la app montó)
   - ERRCOUNT:0 (sin errores de compilación babel ni de runtime)
   - paneles presentes en el DOM SIN contar los <script> (quitarlos antes de grep)

## Capturas MÓVILES de verdad: pwshot.cjs (Playwright)

OJO: `chromium --headless --window-size=414,...` CLAMPA el viewport a un mínimo
de ~500px (comprobado: window.innerWidth=500 aunque pidas 390/414). Las capturas
"414" hechas así son en realidad un layout de 500px RECORTADO por la derecha →
parece que la página se sale/clipa cuando en realidad no. Verificado con
Playwright a 414 reales: scrollWidth=414 y 0 elementos desbordados.

Para capturas móviles fiables usa Playwright (instalado global en /opt/node22):

    NODE_PATH=/opt/node22/lib/node_modules node pwshot.cjs \
      /ruta/test_quant.html /ruta/salida.png 414

Lanza el Chromium del sistema (`executablePath:'/opt/pw-browsers/chromium'`,
NO `npx playwright install`), espera 9s a que el mock alimente los efectos,
imprime `INNERW / SCROLLW / OVF` (elementos que se salen del viewport, ignorando
los que están dentro de contenedores con scroll horizontal propio) y guarda una
captura full-page al ancho EXACTO pedido.
