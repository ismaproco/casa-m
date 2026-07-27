# Casa Mapa

Local-first, bilingual explorer for comparing Bogotá apartment listings without
requiring an account, hosted API, or cloud database.

## Problem and motivation

Property searches are difficult to compare when listings come from different
sources, map and list views drift out of sync, and useful decisions are lost
between browsing sessions. Casa Mapa turns a generated listing catalog into one
searchable workspace with filters, map context, notes, favorites, saved
searches, and aggregate statistics.

The application is intentionally local-first. Catalog data and cached images
are static build inputs, while personal data stays in the browser. This keeps
the project deployable as static files and avoids introducing authentication
and server infrastructure for single-user data.

## Architecture decisions and trade-offs

### Static catalog, local user data

Root-level collection and enrichment scripts produce source artifacts.
`ui/scripts/build-catalog.mjs` validates and deduplicates those records, attaches
cached images, computes fingerprints, and writes the catalog consumed by the
application.

The browser fetches that generated catalog through TanStack Query. Favorites,
listing statuses, notes, saved searches, catalog baselines, locale, and theme
are stored in IndexedDB through Dexie.

This separation makes the read path simple and keeps personal state private. The
trade-off is that catalog updates require rebuilding the static data and user
data does not automatically synchronize across browsers or devices.

### URL state versus temporary UI state

TanStack Router owns routes and validates the explorer's search parameters.
Shareable filters and sorting live in the URL. Map bounds, hover state, open
dialogs, and other temporary interactions remain component state.

Keeping only durable navigation state in the URL supports browser history and
direct links without turning every map movement into a navigation event.

### Focused state ownership

- TanStack Query owns catalog loading, caching, and error state.
- Dexie owns persistent browser records and exposes live queries.
- TanStack Router owns navigation and validated search parameters.
- React component state owns temporary presentation state.

No global state library is used. This reduces duplicated state, but requires
clear boundaries between navigation, persistence, server-state-style caching,
and component interactions.

### Local deployment

The production build is a static Vite application. Docker Compose provides a
repeatable LAN setup in which a Node container builds the application and
Nginx serves the resulting SPA.

This is not a cloud architecture: the project currently has no server API,
authentication, cloud database, analytics, service worker, or remote user-data
synchronization.

## Data flow

```text
collection/enrichment scripts
            |
            v
      source artifacts
            |
            v
 catalog validation + build ------> static catalog and cached images
            |                                  |
            v                                  v
     TanStack Query --------------------> React explorer
                                               |
                                               v
                                    Dexie / IndexedDB user data
```

## Tech stack

| Area | Technology |
| --- | --- |
| Application | React 19, TypeScript, Vite |
| Routing and data loading | TanStack Router, TanStack Query |
| Local persistence | Dexie, IndexedDB |
| Map | Leaflet, OpenStreetMap |
| UI | Tailwind CSS, shadcn/Radix, Lucide |
| Testing | Vitest, Playwright |
| Local serving | Docker Compose, Nginx |

## Testing and quality

The test suite covers:

- filtering, sorting, saved-search snapshots, and search-parameter validation;
- map price buckets and localized labels;
- statistics calculations and distributions;
- IndexedDB import/export contracts;
- direct route loading and typed navigation;
- browser history, nested-route reloads, responsive containment, locale/theme
  persistence, and IndexedDB persistence.

Run the complete verification pipeline from `ui/`:

```bash
npm run verify
```

That command rebuilds the catalog, runs Vitest and Playwright, lints the
application, performs a strict TypeScript check, and creates a production
bundle.

No public scale or performance claims are made because the repository does not
currently contain a reproducible benchmark.

## Run locally

Use Node `22.23.1` and run application commands from `ui/`:

```bash
cd ui
nvm use
npm install
npm run dev
```

Open `http://127.0.0.1:3000/explore`.

Useful commands:

```bash
npm test
npm run test:browser
npm run lint
npm run typecheck
npm run build
npm run verify
npm start
```

## Repository layout

```text
.
├── scripts/                 # Collection and enrichment scripts
├── scrapes/                 # Local source artifacts (gitignored)
├── docker-compose.yml
├── nginx/
└── ui/
    ├── app/                 # Features, domain helpers, persistence, styles
    ├── src/routes/          # TanStack file-based routes
    ├── public/data/         # Generated catalog and report
    ├── scripts/             # Catalog build and image-cache tasks
    └── tests/               # Vitest and Playwright tests
```
