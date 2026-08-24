# Continuación de la recolección — Metrocuadrado

## Criterios

- Operación: compra.
- Ciudad: Bogotá D.C.
- Tipo: apartamentos, incluyendo resultados etiquetados como `Proyecto`.
- Habitaciones: 3 o más.
- Fuente inicial: <https://www.metrocuadrado.com/apartamento/venta/bogota/3-habitaciones/?search=form>.

## Archivos y estado

- `manifest.json`: criterios y la última página completada.
- `scrapes/chunk-XXXX.json`: un archivo por página de resultados; no sobrescribir lotes existentes.
- `last_completed_page` en `manifest.json` debe actualizarse solo después de validar y guardar el lote de esa página.

## Rutina de continuación

1. Abrir la URL de fuente en Chrome mediante Computer Use.
2. Leer `manifest.json` y navegar a `last_completed_page + 1` con la paginación visible.
3. Extraer únicamente tarjetas que muestren `3 hab.` o más. Incluir las que indiquen `Proyecto`.
4. Para cada tarjeta, guardar cuando esté disponible: id, tipo de resultado, barrio, zona, ciudad, precio COP, área m², habitaciones, baños, parqueaderos, URL y resumen de la tarjeta.
5. Guardar el resultado en `chunk-XXXX.json` y luego aumentar `last_completed_page`.
6. Si aparece CAPTCHA, control anti-bot o una advertencia de seguridad, detenerse: no intentar sortearlo.

## Estado de la interfaz

El filtro quedó aplicado manualmente: en **Características principales**, seleccionar el botón **3** de **Habitaciones**. La URL resultante contiene `/apartamento/venta/bogota/3-habitaciones/`. No utilizar automatización destinada a aparentar comportamiento humano ni a sortear controles del sitio.

## Estado final

- Recolección completada hasta la última página disponible: `200`.
- Archivos presentes: `chunk-0001.json` a `chunk-0200.json`.
- Total recopilado: 200 páginas y 1200 registros.
- El manifiesto quedó marcado con `status: completed`.

## Recorrido adicional: estratos 3 a 6

- Se seleccionaron simultáneamente los estratos `3`, `4`, `5` y `6`.
- Se recorrieron las 200 páginas visibles del filtro.
- Se examinaron 1224 tarjetas; las páginas 75, 94 y 200 cargaron 14 y las demás 6.
- Los lotes de auditoría están en `estrato-3-plus/chunk-XXXX.json`.
- Cada lote guarda únicamente anuncios cuyo ID no existía antes de procesar esa página.
- Se encontraron 528 anuncios nuevos.
- `listings-master.json` es la colección unificada y deduplicada, con 1189 anuncios.

## Recorrido adicional: 2 baños y 2 parqueaderos

- Se mantuvieron seleccionados 3 habitaciones y estratos 3, 4, 5 y 6.
- Se añadieron los filtros de 2 baños y 2 parqueaderos.
- La combinación produjo 19 páginas y se examinaron 342 tarjetas.
- Se encontraron 43 IDs nuevos.
- Los lotes de auditoría están en `estrato-3-plus-2-banos-2-parqueaderos/`.
- La colección maestra deduplicada contiene ahora 1232 anuncios.

## Recorridos individuales por estrato

- Se recorrieron por separado los estratos 3, 4, 5 y 6 manteniendo 3 o más habitaciones.
- Estrato 3: 38 estados validados y 94 IDs nuevos.
- Estrato 4: 62 estados validados y 173 IDs nuevos.
- Estrato 5: 54 estados validados y 208 IDs nuevos.
- Estrato 6: 144 estados validados y 571 IDs nuevos.
- Cada transición utilizó la flecha de paginación y exigió un conjunto de tarjetas diferente.
- Los directorios terminados en `-final` y los directorios `-tail` son las auditorías vigentes.
- Los directorios anteriores marcados `superseded` se conservan únicamente como evidencia.
- La colección maestra deduplicada contiene ahora 2282 anuncios.

## Comandos de validación

```sh
casa_dir=/Users/savathos/repos/tryouts/casa
jq empty "$casa_dir"/manifest.json "$casa_dir"/chunk-*.json
jq '.last_completed_page' "$casa_dir"/manifest.json
jq -s '{archivos:length, registros:(map(.record_count // 0)|add), pagina_minima:(map(.source_page)|min), pagina_maxima:(map(.source_page)|max)}' "$casa_dir"/chunk-*.json
jq '{record_count}' "$casa_dir"/listings-master.json
jq -s '{paginas:length, nuevos:([.[].records[]]|length), ids_unicos:([.[].records[].listing_id]|unique|length)}' "$casa_dir"/estrato-3-plus/chunk-*.json
```

## Proyectos oficiales de constructoras

- El universo de referencia es el segmento **Constructores y Promotores
  Inmobiliarios** de Camacol Bogotá y Cundinamarca.
- La cobertura geográfica admite Bogotá D.C. y la Sabana como mercados
  separados.
- Se incluyen lanzamiento, preventa/sobre planos, ventas y construcción; se
  excluyen agotados y proyectos completamente entregados.
- No se inventan precios ni tipologías. Las fichas activas incompletas se
  publican con `data_gaps` y “Consultar precio”; `exclusions` queda reservado
  para proyectos fuera de cobertura, ocultos, inactivos o con ubicación no
  recuperable.
- Arquitectura y Concreto tiene un colector estructurado en
  `scripts/scrape-arquitectura-concreto-projects.mjs` que consume únicamente
  datos públicos de Gatsby/Contentful. El corte actual contiene los 15
  proyectos de apartamentos activos de su página de Cundinamarca: 12 en
  Bogotá y 3 en la Sabana.
- Construcciones Planificadas tiene un colector estructurado en
  `scripts/scrape-construcciones-planificadas-projects.mjs`. Audita el sitemap
  completo y la categoría oficial `En ejecución`; excluye tipologías vendidas,
  usos no residenciales y proyectos sin precio divulgado.
- El inventario amplio de proyectos nuevos de Ciencuadras se auditó con Chrome
  Computer Use: 18 páginas visibles, 114 proyectos, 258 tipologías y 28
  constructoras/promotores. Se conserva como evidencia de portal y usa
  centroides aproximados de localidad cuando la tarjeta no publica el punto.
- El censo nacional de constructoras usa el inventario público de 1.166
  proyectos activos de Zonario, normaliza razones sociales y alias regionales,
  y conserva exactamente los 100 grupos con mayor inventario nacional. El
  corte actual encontró 52 con oferta en Bogotá/Sabana y 48 sin oferta
  regional; publicó 364 proyectos fuente con 1.457 tipologías. La Nota 2025 y
  el inventario Camacol de `Mi Casa en Bogotá` se guardan como fuentes de
  contraste metodológico. La lista pública se genera en
  `ui/public/data/developers.json`.

```sh
source /Users/savathos/.nvm/nvm.sh
nvm use 22.23.1
node scripts/scrape-arquitectura-concreto-projects.mjs
node scripts/scrape-construcciones-planificadas-projects.mjs
node scripts/scrape-zonario-top-developers.mjs
cd ui
npm run images:cache
npm run catalog:build
```

## Arriendos separados de ventas

- Metrocuadrado reportó 9.312 apartamentos en arriendo; el colector guardó
  9.309 y el catálogo publicó 9.160 con coordenadas válidas.
- MyHome usa el estado técnico `for-rent` (etiquetado “Renta”): guardó y publicó
  83 resultados.
- El catálogo independiente `ui/public/data/rentals.json` contiene 9.243
  arriendos de Bogotá, de cualquier cantidad de habitaciones. No se fusiona
  con `catalog.json`, que continúa siendo exclusivamente de ventas.

```sh
source /Users/savathos/.nvm/nvm.sh
nvm use 22.23.1
node scripts/scrape-metrocuadrado.mjs --operation=rent --min-bedrooms=0 --strata=all
node scripts/scrape-myhome.mjs --operation=rent
cd ui
npm run images:cache
npm run rentals:build
```
