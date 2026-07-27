# Casa Mapa

Casa Mapa is a local-first, bilingual explorer for Bogotá apartment listings.
It is a React 19 single-page application built with Vite, TanStack Router,
TanStack Query, Tailwind CSS, Dexie, and Leaflet/OpenStreetMap.

The generated catalog and cached property images are served from `public/`.
Favorites, statuses, notes, saved searches, language, and theme remain in the
browser's existing `casa-mapa` IndexedDB database (schema version 1).

## Local development

Use Node `22.23.1` (see `.nvmrc`) and run commands from this directory:

```bash
nvm use
npm install
npm run dev
```

The development server binds to `0.0.0.0:3000`. Open
`http://127.0.0.1:3000/explore`.

## Routes

- `/` redirects to `/explore`
- `/explore`
- `/explore/property/$listingId`
- `/stats`
- `/favorites`
- `/saved`

Explore filters are validated search parameters. Map bounds remain temporary
UI state and are never written to the URL.

## Validation

```bash
npm test
npm run test:browser
npm run lint
npm run typecheck
npm run build
```

`npm run verify` runs the catalog build followed by the complete suite above.
The production preview command is `npm start`.

This project is intentionally local-only. It has no authentication, server API,
cloud database, Cloudflare worker, or deployment configuration.
