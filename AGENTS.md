# Casa Mapa — Agent Guide

## Scope and non-negotiable constraints

- The Git repository root is the workspace root (`casa/`). Data collection and
  enrichment live alongside Docker deploy files here; the application lives in
  `ui/`.
- Run application commands from `ui/` with Node `22.23.1` from `.nvmrc`.
- Keep Casa Mapa strictly local. Never publish or deploy it to ChatGPT Sites,
  create a Sites version, or produce a production URL. Sites metadata was
  removed during the Vite migration; its absence does not relax this rule.
- Preserve unrelated work. Always inspect `git status` before editing. The
  current working tree contains a substantial uncommitted framework migration
  plus earlier uncommitted UI/data changes.
- Treat `scrapes/`, `ui/public/data/`, and downloaded property images as data
  artifacts rather than hand-authored application source.
- Do not bypass CAPTCHA, anti-bot controls, or completed scrape audit chunks.
  Read `SESSION_COMMANDS.md` before continuing collection work.

## Product

Casa Mapa is a bilingual Spanish/English, local-first explorer for Bogotá
apartments. It provides:

- text search, sorting, and structured property filters;
- synchronized list and Leaflet/OpenStreetMap views;
- routed property details;
- favorites, statuses, notes, and saved searches;
- local user-data import/export;
- listing statistics and drill-down distributions;
- persistent light/dark theme and locale preferences.

The catalog and property images are static local files. User-specific records
remain in IndexedDB through Dexie. There is no authentication, server API,
cloud database, analytics, PWA, or service worker.

## Current architecture

Casa Mapa is a React 19 client application built with Vite 8:

- TanStack Router owns routes, browser history, and validated explore search
  parameters.
- TanStack Query owns catalog loading, caching, loading, and error state.
- Dexie owns persistent local records; favorites and saved searches use live
  queries rather than duplicated component state.
- Component-local React state owns temporary controls such as mobile pane,
  dialogs, visible-result limit, hover state, and map bounds.
- Tailwind CSS v4 and shadcn/Radix provide layout and controls.
- Leaflet renders OpenStreetMap tiles and price markers.

No global state library is used.

## Routes and navigation behavior

- `/` redirects to `/explore`.
- `/explore`
- `/explore/property/$listingId`
- `/rentals`
- `/rentals/property/$listingId`
- `/stats`
- `/favorites`
- `/saved`

Explore and rental filters are validated URL search parameters. Invalid numeric, sorting,
stratum, bedroom, result-type, parking, and bathroom values are removed and
defaults restored. Typing filters replaces the current history entry. View
changes and property selection push normal history entries.

Sales and rentals use physically separate generated catalogs and navigation
tabs. Map bounds and other temporary UI state do not belong in the URL. Closing a
property returns to its `/explore` or `/rentals` parent with active filters intact. An unknown property
ID keeps the explorer shell visible and offers a return to results.

## Project structure

```text
casa/                              # Git repository root
├── README.md                      # Product overview + local / Docker usage
├── AGENTS.md
├── SESSION_COMMANDS.md
├── docker-compose.yml             # server.local / LAN Docker stack
├── nginx/                         # SPA nginx config for Compose
├── manifest.json
├── scripts/                       # Root scrape / enrichment scripts
├── scrapes/                       # Data artifacts (gitignored)
└── ui/
    ├── index.html                 # Metadata, favicon, Vite mount point
    ├── src/
    │   ├── main.tsx               # React/Query/Router bootstrap
    │   ├── router.tsx             # Typed router configuration
    │   ├── routeTree.gen.ts       # Generated TanStack route tree
    │   └── routes/                # File-based route definitions
    ├── app/
    │   ├── CasaExplorer.tsx       # Compatibility re-export
    │   ├── MapPanel.tsx           # Compatibility re-export
    │   ├── StatsDashboard.tsx     # Compatibility re-export
    │   ├── globals.css            # Theme tokens, fonts, base and Leaflet CSS
    │   ├── features/
    │   │   ├── catalog/           # TanStack Query catalog loader
    │   │   ├── explorer/          # Explorer application orchestration
    │   │   ├── map/               # Leaflet map
    │   │   └── stats/             # Statistics UI
    │   └── lib/
    │       ├── core.ts            # Filtering, search validation, snapshots
    │       ├── db.ts              # Dexie v1 schema and import/export
    │       ├── i18n.ts            # Bilingual copy and COP formatting
    │       ├── mapPricing.ts      # Marker buckets, colors, labels
    │       ├── stats.ts           # Pure statistics calculations
    │       └── types.ts           # Shared domain types
    ├── components/ui/             # shadcn/Radix primitives
    ├── lib/utils.ts               # `cn()` utility
    ├── public/
    │   ├── data/                  # Generated catalog and report
    │   └── property-images/       # Locally cached WebP imagery
    ├── scripts/
    │   ├── build-catalog.mjs
    │   ├── build-rentals.mjs
    │   └── cache-property-images.mjs
    ├── tests/
    │   ├── browser/               # Playwright integration tests
    │   └── *.test.ts              # Vitest unit/router/persistence tests
    ├── playwright.config.ts
    ├── vite.config.ts
    └── package.json
```

## Runtime and commands

From `ui/`:

```sh
nvm use
npm run dev
npm test
npm run test:browser
npm run lint
npm run typecheck
npm run build
npm run verify
npm start
```

- Development and preview bind to `0.0.0.0:3000`.
- `npm run build` runs `data:build` first, rewriting the independent sales
  `catalog.json` and rental `rentals.json` catalogs and their reports.
- `npm run verify` runs catalog generation, Vitest, Playwright, ESLint, strict
  TypeScript, and a production Vite build.
- Prefer targeted tests while iterating, then run checks proportional to the
  change. Always run `git diff --check` before handoff.
- Direct production-preview reloads of nested routes must return the Vite SPA
  shell successfully.

## UI conventions

- Use Tailwind utilities for layout, spacing, type, responsive behavior, and
  component composition.
- Reuse the existing shadcn primitives before adding custom controls. Keep the
  established `radix-nova` style and semantic color tokens.
- Use `cn()` from `lib/utils.ts` for conditional classes.
- Keep `globals.css` limited to design tokens, font declarations, global base
  rules, accessibility preferences, and third-party/generated DOM such as
  Leaflet.
- Use Lucide icons through `lucide-react`.
- Preserve keyboard focus, reduced-motion behavior, accessible names, and
  touch-sized actions.

## Typography findings

- The application uses locally bundled `Geist Variable` for the sans and
  heading stacks. Import only `@fontsource-variable/geist/wght.css`; do not
  import italic or every style unless the UI genuinely needs them.
- Fontsource declares the family as `"Geist Variable"`. Do not point Tailwind
  at the old Next.js `--font-geist-sans` variable; that variable no longer
  exists and causes browser-dependent fallback rendering.
- The current stack is explicitly defined in `app/globals.css` with modern
  system fallbacks. The normal Latin variable asset is approximately 30 KB and
  uses `font-display: swap`; no font request goes to Google or another network
  host.
- Keep UI identifiers and dense numeric metadata on the explicit system mono
  stack. Avoid applying monospace to ordinary labels or property text.

## Responsive layout findings

- At `1024px` and below, use the fixed bottom navigation rather than squeezing
  desktop navigation into the header.
- Every view must reserve the bottom-navigation height when it is active.
- Keep responsive grid children at `min-w-0`; wrap or truncate text
  deliberately and avoid minimum widths wider than the container.
- Validate explore, map, filters, cards, property details, dialogs, favorites,
  saved searches, and statistics at desktop, tablet, and narrow mobile sizes.
  Pay special attention to long Spanish labels and floating map controls.

## Map price-marker rules

- Price fill uses `COP 250_000_000` buckets defined only in
  `app/lib/mapPricing.ts`.
- Coverage is 20 regular buckets from zero through just under
  `COP 5_000_000_000`, followed by one distinctive overflow color for
  `COP 5_000_000_000+`.
- Rentals use their own non-linear monthly-price thresholds from zero through
  `COP 50_000_000`, followed by the same distinctive overflow color. Do not
  reuse sale-price buckets for rentals.
- Keep the spectral progression and strong extreme color.
- Do not add a price legend unless requested.
- Tooltips show the full localized COP price and bucket label.
- Preserve the outline distinction for approximate
  `neighborhood_centroid` coordinates.
- Update `tests/mapPricing.test.ts` whenever boundaries, labels, or overflow
  behavior change.

## Data flow and persistence

1. Root scripts collect and enrich source records under `scrapes/`.
2. `ui/scripts/build-catalog.mjs` builds sales while `build-rentals.mjs` builds
   rentals from their own scrape artifacts. Both validate coordinates and URLs,
   attach local images, and compute fingerprints.
3. TanStack Query fetches `/data/catalog.json` or `/data/rentals.json` according
   to the active sales/rentals route.
4. Pure helpers in `app/lib/core.ts` validate route search, filter and sort
   listings, and compare saved-search snapshots.
5. Dexie stores favorites, saved searches, catalog baselines, locale, and theme.

Keep the IndexedDB database name `casa-mapa` and schema version `1` unless a
real migration is designed and tested; existing user data must survive app
changes. Do not manually edit generated catalogs to fix source data.

## Testing boundaries

- `tests/core.test.ts`: filtering, snapshots, route search validation.
- `tests/mapPricing.test.ts`: price buckets and localized labels.
- `tests/stats.test.ts`: aggregate metrics and distributions.
- `tests/db.test.ts`: export/import and persistent record contracts.
- `tests/router.test.ts`: direct route loading and typed navigation.
- `tests/browser/routes.spec.ts`: all routes, nested reloads, invalid search
  cleanup, property history behavior, responsive containment, font loading,
  locale/theme persistence, and IndexedDB persistence.

## Git history and working-tree context

The visible committed history currently contains three commits:

1. `3e81e3b` — initial Casa Mapa explorer, catalog pipeline, IndexedDB model,
   bilingual UI, and tests.
2. `03c2383` — corrected OpenStreetMap locations and map controls.
3. `e3c3ea9` — connected map selection to property details.

The current working tree then expands the product substantially: Bogotá-only
catalog updates, cached local images, shadcn/Tailwind responsive refinements,
dark theme, statistics, price-marker buckets, and the uncommitted migration
from Next.js/vinext/Cloudflare to Vite/TanStack. Do not assume these changes are
committed or safe to discard.

## Current validation baseline

The latest completed migration baseline passed:

- 20 Vitest tests across five files;
- four Playwright Chromium integration scenarios;
- ESLint;
- strict TypeScript with no emit and incremental mode disabled;
- `git diff --check`;
- Vite 8 production build;
- production-preview HTTP 200 responses for `/`, every top-level route, and a
  nested property route.

The automated browser suite verified desktop and 390 px mobile behavior,
filter/property history, direct nested-route reloads, theme/language
persistence, and IndexedDB persistence. The embedded in-app browser was not
available during that session, so do not claim screenshot-level verification
without performing a future interactive pass.
