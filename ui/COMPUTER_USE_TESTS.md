# Computer Use integration tests

Run these prompts against the local Casa Mapa application at
`http://127.0.0.1:3000/explore` in a fresh Chrome tab. Use only visible UI
controls, and inspect the page after each action before deciding whether the
test passed.

Do not deploy the application. Use the real routes `/explore`, `/stats`,
`/favorites`, `/saved`, and `/explore/property/$listingId` throughout the run.

## CU-01 — Catalog and bilingual shell

> Open the Casa Mapa application. Confirm that the header reports 11,771
> apartments in Bogotá, the results list loads, and a map is visible.
> Switch the interface to English, reload the page, and verify that English
> remains selected. Switch back to Spanish for the remaining tests.

Pass: catalog count is 11,771; cards and map render; language survives reload.

## CU-02 — Search and combined filters

> In the main search field, search for `Chicó`. Confirm the result count drops
> and every visible card is relevant to Chicó. Set Estrato to 6, minimum
> bathrooms to 2, and minimum parking spaces to 1. Confirm each step narrows or
> preserves the count and every visible card satisfies the active filters.
> Clear all filters and confirm the full result count returns.

Pass: neighborhood search handles the accent; estrato and numeric filters are
conjunctive; clear returns to 11,771.

## CU-03 — Favorite, note, and reload persistence

> Favorite the first visible listing. Open Favorites, set its status to
> Contacted, and enter the note `Llamar el lunes`. Reload the page, return to
> Favorites, and verify that the same listing, status, and note remain.

Pass: favorite, status, and note persist after a hard reload.

## CU-04 — Saved search and baseline

> Return to Explore, search for `Cedritos`, and save the search as
> `Cedritos familiar`. Open Saved Searches and confirm the named search shows a
> match count. Apply it, reload the page, open Saved Searches again, and verify
> it remains available with the same filter.

Pass: saved query and baseline persist and can be reapplied.

## CU-05 — Map/list synchronization and responsive affordances

> Open `/explore`, select a visible listing card, and confirm the URL changes
> to `/explore/property/$listingId` while retaining active filter parameters.
> Confirm the results list is
> replaced by that property's detail pane, the matching map point is
> highlighted, and the map centers on it at zoom 15 or closer. Close the detail
> pane and confirm the results list returns. Confirm the page exposes List and
> Map controls for narrow screens and that the map failure message is not shown
> when tiles are available.

Pass: card selection drives the shared route/map/detail state; closing returns
to `/explore` with the filters intact; browser Back and Forward restore both
states; mobile controls are present; normal map state has no failure warning.

## CU-06 — Local data tools

> Open Data. Confirm the page explains that data is stored only on this device
> and provides Export backup, Import backup, and Erase local data actions. Do
> not erase the test data.

Pass: all three controls exist and the device-local limitation is explicit.

## Executed run — 2026-07-25

All six prompts passed in Google Chrome against `http://localhost:3000/`
using Computer Use:

- **CU-01:** Loaded 2,275 results and the OpenStreetMap-backed map. Spanish
  remained selected after reload.
- **CU-02:** `Chicó` returned 388 results; adding 3+ bathrooms returned 360
  and adding 2+ parking spaces returned 345. Clear restored 2,275.
- **CU-03:** Listing `11813-M4938401`, status `Contactado`, and note
  `Llamar el lunes` all remained after reload.
- **CU-04:** `Cedritos familiar` saved with 47 results, reapplied, and remained
  available after reload.
- **CU-05:** A listing card and a single map marker each opened the matching
  detail drawer. At a 390 px emulated viewport, the Lista, Mapa, and Filtros
  controls were present and the map toggle displayed the interactive map.
- **CU-06:** Datos exposed Exportar respaldo, Importar respaldo, and Borrar
  datos locales. No test data was erased.

## CU-07 — OpenStreetMap locations and controls

> Search for `Cedritos`. Confirm the OpenStreetMap tiles and colored listing
> locations are both visible. Activate Zoom out and verify the map zoom
> decreases by one. Activate Zoom in and verify it returns to the previous
> zoom. Click a
> visible location and confirm its listing drawer opens. Close it, zoom out,
> activate Fit listings, and confirm the map returns to the Cedritos result
> bounds.

Pass: executed with Computer Use on 2026-07-25. OpenStreetMap rendered the 47
Cedritos results as visible points; zoom out, zoom in, marker selection, and
fit-to-results all changed the map as expected.

## CU-08 — Shared property details pane

> Click any visible location dot on the OpenStreetMap. Confirm the property list
> is hidden and replaced by a details pane showing the listing ID, project or
> neighborhood, price, bedrooms, bathrooms, parking, area, stratum, price per
> square meter, coordinate quality, favorite action, and source link. Confirm
> there is no modal or dimmed overlay. Close the pane and verify the property
> list returns.

Pass: executed with Computer Use on 2026-07-25. A Cedritos dot replaced the
list with listing `12937-M6496771` in the shared details pane; the expected
facts and actions were present, no overlay appeared, and Close restored the
list.

## CU-09 — Network-bound local server

> Start Casa Mapa with its normal development command. Confirm the server
> advertises at least one Network URL in addition to localhost. Open the
> application through a Network URL and verify the catalog, OpenStreetMap, list
> selection, and details pane load normally.

Pass: executed on 2026-07-25. The server bound to `0.0.0.0` and advertised
multiple LAN/VPN addresses, including `http://192.168.137.11:3000/`.

## CU-10 — Modern dark theme and persistence

> Open Casa Mapa through a Network URL. Confirm the interface starts in a dark
> theme with readable filters, listing cards, controls, map labels, and property
> details. Select a listing and confirm the shared details pane remains legible
> while the matching map point is centered. Switch to the light theme, reload,
> and verify the light theme persists. Switch back to dark and confirm the
> theme control updates accordingly.

Pass: executed with Computer Use on 2026-07-25. The dark listing view and
details pane rendered with readable contrast, OpenStreetMap remained usable,
the light preference survived reload, and dark mode was restored successfully.

## Historical expanded Colombia-catalog run — 2026-07-26

The updated Colombia-wide catalog was tested through the network URL
`http://192.168.137.11:3000/` using Computer Use:

- Reload displayed 49,073 apartments across Colombia.
- Searching for `Medellín` returned 7,247 results.
- Applying Estrato 4 narrowed the Medellín search to 1,133 results.
- Selecting listing `FR-6983917` replaced the list with its detail pane and
  centered OpenStreetMap at zoom 15.
- Zoom in changed the map from zoom 15 to zoom 16.
- Clicking a different visible map point selected `FR-193584212`, updated the
  detail pane, and recentered the map.
- Clearing all filters restored all 49,073 map points and fit the map to
  Colombia at zoom 5.
- The selected listing exposed a working FincaRaíz source link.

## CU-11 — Bogotá-only catalog

> Reload Casa Mapa and clear all filters. Confirm the header and result count
> both show 11,771 apartments in Bogotá. Inspect several visible cards and map
> tooltips and confirm each location is Bogotá. Search for `Medellín` and
> confirm no results are returned. Clear the search and confirm the full
> Bogotá count returns.

Pass: the application exposes only Bogotá listings while the source scrape
remains available separately.

Executed with Computer Use on 2026-07-26: reload showed 11,771 apartments in
Bogotá and 11,771 OpenStreetMap points; searching for `Medellín` returned zero
results; clearing the search restored the full Bogotá catalog at zoom 9.

## CU-12 — Filter-aware market statistics

> Clear all filters and open Stats. Confirm the dashboard shows 11,771 Bogotá
> listings, median price, median price per square meter, median area, and data
> coverage. Confirm the price distribution, price-versus-area plot, stratum
> distribution, bedroom distribution, and geographic comparison are visible.
> Switch Geographic comparison from Neighborhood to Locality. Select Stratum 4
> and confirm Explore opens with the Stratum filter set to 4, the URL persists
> `stratum=4`, 2,358 results are shown, and the OpenStreetMap zoom controls are
> present. Reopen Stats and confirm the current segment contains 2,358 listings.

Pass: executed with Computer Use on 2026-07-26 through
`http://192.168.137.11:3000/`. The all-Bogotá dashboard reported a COP 910M
median price, COP 6.7M/m² median price per square meter, 133 m² median area,
96.6% area coverage, and 97.7% stratum coverage. The geographic dimension
changed to Locality. Selecting Stratum 4 opened Explore at `?stratum=4` with
2,358 results and working OpenStreetMap controls; reopening Stats showed the
same 2,358-listing segment with recalculated KPIs and charts.

## CU-13 — FincaRaíz and Metrocuadrado strata 1–2 update

> Open the application through its Network URL and clear all filters. Confirm
> the catalog shows 12,391 Bogotá listings. Open Stats and verify Stratum 1
> contains 129 listings and Stratum 2 contains 929. Select Stratum 1 and confirm
> Explore opens with 129 results and working OpenStreetMap zoom controls. Search
> for `MC-19258-M6748947`, open its only result, and verify the details pane
> shows the matching ID, centers the map at zoom 15, and offers a
> Metrocuadrado-labeled source link.

Pass: executed with Computer Use on 2026-07-26 through
`http://192.168.137.11:3000/`. The updated catalog and both Stats counts
matched. The Stratum 1 drill-down produced 129 map results. The Metrocuadrado
sample opened in the shared details pane, centered OpenStreetMap at its listing
coordinate, and displayed `View on Metrocuadrado`.

## CU-14 — Strictly local property images

> Open the application through its Network URL and search for
> `MC-19258-M6748947`. Confirm its result card uses a compact, cropped property
> thumbnail. Open the result and confirm the shared details pane uses a larger
> version of the same locally cached image while OpenStreetMap stays centered
> at zoom 15. Clear the filters, search for `FR-11025597`, and confirm both its
> result card and details pane show the styled `CM` fallback rather than a
> broken image.

Pass: executed with Computer Use on 2026-07-26 through
`http://192.168.137.11:3000/`. The cached Metrocuadrado image rendered at both
UI sizes, the details pane and map remained synchronized, and the FincaRaíz
listing without a downloadable source image rendered the fallback correctly
in both contexts.
