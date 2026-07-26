# Computer Use integration tests

Run these prompts against the local or deployed Casa Mapa application in a
fresh Chrome tab. Use only visible UI controls, and inspect the page after each
action before deciding whether the test passed.

## CU-01 — Catalog and bilingual shell

> Open the Casa Mapa application. Confirm that the header reports 2,275
> verified Bogotá apartments, the results list loads, and a map is visible.
> Switch the interface to English, reload the page, and verify that English
> remains selected. Switch back to Spanish for the remaining tests.

Pass: catalog count is 2,275; cards and map render; language survives reload.

## CU-02 — Search and combined filters

> In the main search field, search for `Chicó`. Confirm the result count drops
> and every visible card is relevant to Chicó. Set minimum bathrooms to 3 and
> minimum parking spaces to 2. Confirm the count drops or stays the same and
> every visible card shows at least 3 bathrooms and 2 parking spaces. Clear all
> filters and confirm the full result count returns.

Pass: text normalization handles the accent; numeric filters are conjunctive;
clear returns to 2,275.

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

> In Explore, select a visible listing card and confirm the matching map point
> becomes selected and the detail panel opens. Close the detail panel. Confirm
> the page exposes List and Map controls for narrow screens and that the map
> failure message is not shown when tiles are available.

Pass: card selection drives map/detail state; mobile controls are present;
normal map state has no failure warning.

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
> locations are both visible. Activate Zoom out and verify the map changes from
> zoom 14 to zoom 13. Activate Zoom in and verify it returns to zoom 14. Click a
> visible location and confirm its listing drawer opens. Close it, zoom out,
> activate Fit listings, and confirm the map returns to the Cedritos result
> bounds.

Pass: executed with Computer Use on 2026-07-25. OpenStreetMap rendered the 47
Cedritos results as visible points; zoom out, zoom in, marker selection, and
fit-to-results all changed the map as expected.

## CU-08 — Map-dot details modal

> Click any visible location dot on the OpenStreetMap. Confirm a centered modal
> card opens above a dimmed map and shows the listing ID, project or
> neighborhood, price, bedrooms, bathrooms, parking, area, stratum, price per
> square meter, coordinate quality, favorite action, and source link. Confirm
> the close button and Escape key each dismiss the modal.

Pass: executed with Computer Use on 2026-07-25. A Cedritos dot opened the
matching listing in a fully layered modal; the expected facts and actions were
present, focus moved to Close, and both Close and Escape dismissed it.
