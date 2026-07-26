"use client";

import {
  Archive,
  Bath,
  BedDouble,
  BookmarkPlus,
  CarFront,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  ExternalLink,
  FileUp,
  Filter,
  Heart,
  Languages,
  List,
  Map as MapIcon,
  MapPin,
  Menu,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MapPanel } from "./MapPanel";
import {
  DEFAULT_QUERY,
  compareSnapshot,
  createSnapshot,
  filterListings,
  listingSummary,
  queryFromSearchParams,
  queryToSearchParams,
} from "./lib/core";
import {
  db,
  exportUserData,
  importUserData,
  isValidImport,
} from "./lib/db";
import { formatCompactCop, formatCop, t } from "./lib/i18n";
import type {
  CatalogSnapshot,
  Favorite,
  FavoriteStatus,
  Listing as ListingType,
  Locale,
  MapBounds,
  SavedSearch,
  SearchQuery,
} from "./lib/types";

type MainView = "explore" | "favorites" | "saved";
type MobilePane = "list" | "map";

function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/data/catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((value: CatalogSnapshot) => setCatalog(value))
      .catch((reason) => setError(String(reason)));
  }, []);
  return { catalog, error };
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: React.ReactNode;
  helper?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {helper && <small>{helper}</small>}
    </label>
  );
}

function EmptyState({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon}
      <p>{children}</p>
    </div>
  );
}

export default function CasaExplorer() {
  const { catalog, error: catalogError } = useCatalog();
  const [locale, setLocale] = useState<Locale>("es");
  const [localeReady, setLocaleReady] = useState(false);
  const c = t(locale);
  const [query, setQuery] = useState<SearchQuery>(DEFAULT_QUERY);
  const [view, setView] = useState<MainView>("explore");
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPresentation, setSelectedPresentation] = useState<
    "drawer" | "modal"
  >("drawer");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(80);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInitialized = useRef(false);

  const updateQuery = useCallback(
    <K extends keyof SearchQuery>(key: K, value: SearchQuery[K]) => {
      setQuery((current) => ({ ...current, [key]: value }));
      setVisibleLimit(80);
    },
    [],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      setQuery(queryFromSearchParams(params));
      urlInitialized.current = true;
    });
    const preferred =
      navigator.language.toLocaleLowerCase().startsWith("es") ? "es" : "en";
    Promise.all([
      db.favorites.toArray(),
      db.savedSearches.orderBy("updatedAt").reverse().toArray(),
      db.settings.get("locale"),
    ])
      .then(([favoriteRows, searchRows, localeSetting]) => {
        setFavorites(favoriteRows);
        setSavedSearches(searchRows);
        setLocale(
          localeSetting?.value === "es" || localeSetting?.value === "en"
            ? localeSetting.value
            : preferred,
        );
        setLocaleReady(true);
      })
      .catch(() => {
        setLocale(preferred);
        setLocaleReady(true);
        setStorageAvailable(false);
      });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!urlInitialized.current) return;
    const params = queryToSearchParams(query);
    const next = params.toString()
      ? `${window.location.pathname}?${params}`
      : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [query]);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (!localeReady) return;
    db.settings
      .put({ key: "locale", value: locale })
      .catch(() => setStorageAvailable(false));
  }, [locale, localeReady]);

  useEffect(() => {
    if (!catalog) return;
    const rows = catalog.listings.map((listing) => ({
      listingId: listing.id,
      fingerprint: listing.fingerprint,
      summary: listingSummary(listing),
      lastSeenVersion: catalog.catalogVersion,
    }));
    db.catalogBaselines
      .bulkPut(rows)
      .catch(() => setStorageAvailable(false));
  }, [catalog]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredListings = useMemo(
    () => filterListings(catalog?.listings ?? [], query),
    [catalog, query],
  );
  const listingById = useMemo(
    () => new Map((catalog?.listings ?? []).map((listing) => [listing.id, listing])),
    [catalog],
  );
  const selectedListing = selectedId ? listingById.get(selectedId) ?? null : null;
  useEffect(() => {
    if (!selectedListing || selectedPresentation !== "modal") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedListing, selectedPresentation]);
  const activeSaved = savedSearches.find((saved) => saved.id === activeSavedId);
  const activeUpdates = activeSaved
    ? compareSnapshot(activeSaved.snapshot, filteredListings)
    : null;
  const activeUpdateCount = activeUpdates
    ? activeUpdates.added.length +
      activeUpdates.changed.length +
      activeUpdates.removed.length
    : 0;

  const favoriteCards = useMemo(
    () =>
      favorites
        .map((favorite) => ({
          favorite,
          listing: listingById.get(favorite.listingId) ?? favorite.lastKnown,
          unavailable: !listingById.has(favorite.listingId),
        }))
        .sort((a, b) => b.favorite.updatedAt.localeCompare(a.favorite.updatedAt)),
    [favorites, listingById],
  );

  const setMapBounds = useCallback((bounds: MapBounds) => {
    setQuery((current) => ({ ...current, mapBounds: bounds }));
  }, []);

  async function toggleFavorite(listing: ListingType) {
    const existing = favorites.find((item) => item.listingId === listing.id);
    try {
      if (existing) {
        await db.favorites.delete(listing.id);
        setFavorites((current) =>
          current.filter((item) => item.listingId !== listing.id),
        );
      } else {
        const now = new Date().toISOString();
        const favorite: Favorite = {
          listingId: listing.id,
          status: "interested",
          note: "",
          lastKnown: listing,
          acknowledgedFingerprint: listing.fingerprint,
          createdAt: now,
          updatedAt: now,
        };
        await db.favorites.put(favorite);
        setFavorites((current) => [favorite, ...current]);
      }
    } catch {
      setStorageAvailable(false);
    }
  }

  async function updateFavorite(
    favorite: Favorite,
    patch: Partial<Pick<Favorite, "status" | "note">>,
  ) {
    const updated = {
      ...favorite,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setFavorites((current) =>
      current.map((item) =>
        item.listingId === updated.listingId ? updated : item,
      ),
    );
    try {
      await db.favorites.put(updated);
    } catch {
      setStorageAvailable(false);
    }
  }

  async function createSavedSearch() {
    if (!catalog || !saveName.trim()) return;
    const now = new Date().toISOString();
    const saved: SavedSearch = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      query,
      snapshot: createSnapshot(filteredListings),
      createdAt: now,
      updatedAt: now,
      lastReviewedCatalogVersion: catalog.catalogVersion,
    };
    try {
      await db.savedSearches.put(saved);
      setSavedSearches((current) => [saved, ...current]);
      setActiveSavedId(saved.id);
      setSaveOpen(false);
      setSaveName("");
    } catch {
      setStorageAvailable(false);
    }
  }

  async function overwriteActiveSearch() {
    if (!catalog || !activeSaved) return;
    if (
      !window.confirm(
        locale === "es"
          ? "Actualizar los filtros reiniciará el conteo de cambios. ¿Continuar?"
          : "Updating filters will reset the change baseline. Continue?",
      )
    )
      return;
    const updated: SavedSearch = {
      ...activeSaved,
      query,
      snapshot: createSnapshot(filteredListings),
      updatedAt: new Date().toISOString(),
      lastReviewedCatalogVersion: catalog.catalogVersion,
    };
    await db.savedSearches.put(updated);
    setSavedSearches((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  async function acknowledgeUpdates() {
    if (!catalog || !activeSaved) return;
    const updated: SavedSearch = {
      ...activeSaved,
      snapshot: createSnapshot(filteredListings),
      updatedAt: new Date().toISOString(),
      lastReviewedCatalogVersion: catalog.catalogVersion,
    };
    await db.savedSearches.put(updated);
    setSavedSearches((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  function applySavedSearch(saved: SavedSearch) {
    setQuery(saved.query);
    setActiveSavedId(saved.id);
    setView("explore");
    setVisibleLimit(80);
  }

  async function deleteSavedSearch(saved: SavedSearch) {
    if (
      !window.confirm(
        locale === "es"
          ? `¿Eliminar “${saved.name}”?`
          : `Delete “${saved.name}”?`,
      )
    )
      return;
    await db.savedSearches.delete(saved.id);
    setSavedSearches((current) => current.filter((item) => item.id !== saved.id));
    if (activeSavedId === saved.id) setActiveSavedId(null);
  }

  async function downloadBackup() {
    const value = await exportUserData();
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `casa-mapa-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    try {
      const value: unknown = JSON.parse(await file.text());
      if (!isValidImport(value)) throw new Error("invalid");
      await importUserData(value);
      const [favoriteRows, searchRows] = await Promise.all([
        db.favorites.toArray(),
        db.savedSearches.orderBy("updatedAt").reverse().toArray(),
      ]);
      setFavorites(favoriteRows);
      setSavedSearches(searchRows);
      setToast(c.importSuccess);
    } catch {
      setToast(c.importError);
    }
  }

  async function resetLocalData() {
    if (
      !window.confirm(
        locale === "es"
          ? "Esto borrará favoritos, notas y búsquedas guardadas de este dispositivo."
          : "This will erase favorites, notes, and saved searches from this device.",
      )
    )
      return;
    await db.transaction(
      "rw",
      db.favorites,
      db.savedSearches,
      db.catalogBaselines,
      async () => {
        await Promise.all([
          db.favorites.clear(),
          db.savedSearches.clear(),
          db.catalogBaselines.clear(),
        ]);
      },
    );
    setFavorites([]);
    setSavedSearches([]);
    setActiveSavedId(null);
    setDataOpen(false);
  }

  const clearFilters = () => {
    setQuery(DEFAULT_QUERY);
    setActiveSavedId(null);
    setVisibleLimit(80);
  };

  if (!catalog && !catalogError) {
    return (
      <main className="loading-screen">
        <div className="brand-mark">CM</div>
        <span>{c.loading}</span>
      </main>
    );
  }
  if (catalogError || !catalog) {
    return (
      <main className="loading-screen error">
        <CircleAlert />
        <strong>Catalog unavailable</strong>
        <span>{catalogError}</span>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setView("explore");
            setSelectedId(null);
          }}
          aria-label={c.explore}
        >
          <span className="brand-mark">CM</span>
          <span>
            <strong>{c.brand}</strong>
            <small>
              {catalog.summary.publishedRecords.toLocaleString(
                locale === "es" ? "es-CO" : "en-US",
              )}{" "}
              {c.verified}
            </small>
          </span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={view === "explore" ? "active" : ""}
            onClick={() => setView("explore")}
          >
            <MapPin size={17} /> {c.explore}
          </button>
          <button
            className={view === "favorites" ? "active" : ""}
            onClick={() => setView("favorites")}
          >
            <Heart size={17} /> {c.favorites}
            <span className="count-badge">{favorites.length}</span>
          </button>
          <button
            className={view === "saved" ? "active" : ""}
            onClick={() => setView("saved")}
          >
            <Archive size={17} /> {c.saved}
            <span className="count-badge">{savedSearches.length}</span>
          </button>
        </nav>
        <div className="top-actions">
          <button
            className="icon-text-button"
            onClick={() => setDataOpen(true)}
          >
            <Database size={17} />
            <span>{c.data}</span>
          </button>
          <button
            className="locale-button"
            onClick={() => setLocale(locale === "es" ? "en" : "es")}
            aria-label={locale === "es" ? "Switch to English" : "Cambiar a español"}
          >
            <Languages size={17} />
            {locale === "es" ? "EN" : "ES"}
          </button>
          <button
            className="mobile-menu"
            onClick={() => setFiltersOpen(true)}
            aria-label={c.filters}
          >
            <Menu />
          </button>
        </div>
      </header>

      {!storageAvailable && (
        <div className="storage-warning" role="alert">
          <CircleAlert size={17} /> {c.storageWarning}
        </div>
      )}

      {view === "explore" && (
        <div className="explore-layout">
          <aside className={`filters-panel ${filtersOpen ? "open" : ""}`}>
            <div className="panel-heading">
              <span>
                <SlidersHorizontal size={17} /> {c.filters}
              </span>
              <button
                className="mobile-close"
                onClick={() => setFiltersOpen(false)}
                aria-label={c.close}
              >
                <X />
              </button>
            </div>
            <div className="filters-scroll">
              <Field label={c.searchPlaceholder}>
                <div className="input-with-icon">
                  <Search size={16} />
                  <input
                    aria-label={c.searchPlaceholder}
                    value={query.text}
                    onChange={(event) => updateQuery("text", event.target.value)}
                    placeholder="Chicó, Cedritos…"
                  />
                </div>
              </Field>
              <div className="filter-group">
                <span className="group-label">{c.price}</span>
                <div className="range-pair">
                  <input
                    aria-label={`${c.price} ${c.min}`}
                    inputMode="numeric"
                    value={query.minPrice}
                    onChange={(event) =>
                      updateQuery("minPrice", event.target.value)
                    }
                    placeholder={c.min}
                  />
                  <input
                    aria-label={`${c.price} ${c.max}`}
                    inputMode="numeric"
                    value={query.maxPrice}
                    onChange={(event) =>
                      updateQuery("maxPrice", event.target.value)
                    }
                    placeholder={c.max}
                  />
                </div>
              </div>
              <div className="filter-group">
                <span className="group-label">{c.area}</span>
                <div className="range-pair">
                  <input
                    aria-label={`${c.area} ${c.min}`}
                    inputMode="decimal"
                    value={query.minArea}
                    onChange={(event) =>
                      updateQuery("minArea", event.target.value)
                    }
                    placeholder={c.min}
                  />
                  <input
                    aria-label={`${c.area} ${c.max}`}
                    inputMode="decimal"
                    value={query.maxArea}
                    onChange={(event) =>
                      updateQuery("maxArea", event.target.value)
                    }
                    placeholder={c.max}
                  />
                </div>
              </div>
              <div className="filter-grid">
                <Field label={c.bedrooms}>
                  <select
                    value={query.bedrooms}
                    onChange={(event) =>
                      updateQuery("bedrooms", event.target.value)
                    }
                  >
                    <option value="">{c.all}</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                  </select>
                </Field>
                <Field label={c.bathrooms}>
                  <select
                    value={query.minBathrooms}
                    onChange={(event) =>
                      updateQuery("minBathrooms", event.target.value)
                    }
                  >
                    <option value="">{c.all}</option>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option value={value} key={value}>
                        {value}+
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="filter-grid">
                <Field label={c.parking}>
                  <select
                    value={query.minParking}
                    onChange={(event) =>
                      updateQuery("minParking", event.target.value)
                    }
                  >
                    <option value="">{c.all}</option>
                    {[1, 2, 3, 4].map((value) => (
                      <option value={value} key={value}>
                        {value}+
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={c.type}>
                  <select
                    value={query.resultType}
                    onChange={(event) =>
                      updateQuery("resultType", event.target.value)
                    }
                  >
                    <option value="">{c.all}</option>
                    <option value="Inmueble">{c.inmueble}</option>
                    <option value="Proyecto">{c.proyecto}</option>
                  </select>
                </Field>
              </div>
              <Field label={c.stratum} helper={c.stratumHelp}>
                <select
                  value={query.stratum}
                  onChange={(event) => updateQuery("stratum", event.target.value)}
                >
                  <option value="">{c.all}</option>
                  {[3, 4, 5, 6].map((value) => (
                    <option value={value} key={value}>
                      {value}
                    </option>
                  ))}
                  <option value="unknown">{c.unknown}</option>
                </select>
              </Field>
              <Field label={c.sort}>
                <select
                  value={query.sort}
                  onChange={(event) =>
                    updateQuery(
                      "sort",
                      event.target.value as SearchQuery["sort"],
                    )
                  }
                >
                  <option value="neighborhood">{c.neighborhood}</option>
                  <option value="priceAsc">{c.priceLow}</option>
                  <option value="priceDesc">{c.priceHigh}</option>
                  <option value="areaDesc">{c.areaHigh}</option>
                  <option value="pricePerM2Asc">{c.sqmLow}</option>
                </select>
              </Field>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={query.useMapBounds}
                  disabled={!query.mapBounds}
                  onChange={(event) =>
                    updateQuery("useMapBounds", event.target.checked)
                  }
                />
                <span>{c.mapArea}</span>
              </label>
            </div>
            <div className="filters-actions">
              <button className="secondary" onClick={clearFilters}>
                <RotateCcw size={15} /> {c.clear}
              </button>
              <button
                className="primary"
                onClick={() => {
                  setFiltersOpen(false);
                  if (activeSaved) void overwriteActiveSearch();
                  else setSaveOpen(true);
                }}
              >
                {activeSaved ? <Save size={15} /> : <BookmarkPlus size={15} />}
                {activeSaved ? c.saveChanges : c.saveSearch}
              </button>
            </div>
          </aside>

          <section className="results-panel">
            <div className="results-toolbar">
              <div>
                <strong>{filteredListings.length.toLocaleString()}</strong>{" "}
                <span>{c.results}</span>
                {activeSaved && <em>{activeSaved.name}</em>}
              </div>
              <div className="mobile-pane-toggle" role="group">
                <button
                  className={mobilePane === "list" ? "active" : ""}
                  onClick={() => setMobilePane("list")}
                >
                  <List size={15} /> {c.list}
                </button>
                <button
                  className={mobilePane === "map" ? "active" : ""}
                  onClick={() => setMobilePane("map")}
                >
                  <MapIcon size={15} /> {c.map}
                </button>
              </div>
              <button
                className="filter-trigger"
                onClick={() => setFiltersOpen(true)}
              >
                <Filter size={16} /> {c.filters}
              </button>
            </div>
            {activeUpdates && activeUpdateCount > 0 && (
              <div className="updates-banner">
                <div>
                  <strong>{c.updates}</strong>
                  <span>
                    {activeUpdates.added.length} {c.newMatches} ·{" "}
                    {activeUpdates.changed.length} {c.changedMatches} ·{" "}
                    {activeUpdates.removed.length} {c.removedMatches}
                  </span>
                </div>
                <button onClick={() => void acknowledgeUpdates()}>
                  <Check size={15} /> {c.reviewed}
                </button>
              </div>
            )}
            <div
              className={`list-scroll ${mobilePane === "map" ? "mobile-hidden" : ""}`}
            >
              {filteredListings.length === 0 ? (
                <EmptyState icon={<Search size={30} />}>{c.noResults}</EmptyState>
              ) : (
                <>
                  {filteredListings.slice(0, visibleLimit).map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      locale={locale}
                      favorite={favorites.some(
                        (item) => item.listingId === listing.id,
                      )}
                      selected={selectedId === listing.id}
                      onFavorite={() => void toggleFavorite(listing)}
                      onSelect={() => {
                        setSelectedPresentation("drawer");
                        setSelectedId(listing.id);
                      }}
                      onHover={setHoveredId}
                    />
                  ))}
                  {visibleLimit < filteredListings.length && (
                    <button
                      className="show-more"
                      onClick={() => setVisibleLimit((value) => value + 80)}
                    >
                      {c.showMore}{" "}
                      <span>
                        ({Math.min(80, filteredListings.length - visibleLimit)})
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          <div
            className={`map-column ${mobilePane === "list" ? "mobile-hidden" : ""}`}
          >
            <MapPanel
              listings={filteredListings}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={(id) => {
                setSelectedPresentation("modal");
                setSelectedId(id);
              }}
              onBoundsChange={setMapBounds}
              unavailableLabel={c.mapUnavailable}
            />
          </div>
        </div>
      )}

      {view === "favorites" && (
        <section className="library-page">
          <div className="library-heading">
            <div>
              <span className="eyebrow">{c.favorites}</span>
              <h1>
                {favorites.length} {c.favorites.toLocaleLowerCase()}
              </h1>
            </div>
          </div>
          {favoriteCards.length === 0 ? (
            <EmptyState icon={<Heart size={32} />}>{c.noFavorites}</EmptyState>
          ) : (
            <div className="favorites-grid">
              {favoriteCards.map(({ favorite, listing, unavailable }) => (
                <FavoriteCard
                  key={favorite.listingId}
                  favorite={favorite}
                  listing={listing}
                  unavailable={unavailable}
                  locale={locale}
                  onChange={(patch) => void updateFavorite(favorite, patch)}
                  onRemove={() => void toggleFavorite(listing)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {view === "saved" && (
        <section className="library-page">
          <div className="library-heading">
            <div>
              <span className="eyebrow">{c.saved}</span>
              <h1>
                {savedSearches.length} {c.saved.toLocaleLowerCase()}
              </h1>
            </div>
          </div>
          {savedSearches.length === 0 ? (
            <EmptyState icon={<Archive size={32} />}>{c.noSaved}</EmptyState>
          ) : (
            <div className="saved-list">
              {savedSearches.map((saved) => {
                const matches = filterListings(catalog.listings, saved.query);
                const updates = compareSnapshot(saved.snapshot, matches);
                const count =
                  updates.added.length +
                  updates.changed.length +
                  updates.removed.length;
                return (
                  <article className="saved-row" key={saved.id}>
                    <div className="saved-icon">
                      <Search size={19} />
                    </div>
                    <div className="saved-copy">
                      <h2>{saved.name}</h2>
                      <span>
                        {matches.length.toLocaleString()} {c.results}
                      </span>
                      <SearchSummary query={saved.query} locale={locale} />
                    </div>
                    {count > 0 && (
                      <div className="saved-updates">
                        <strong>{count}</strong>
                        <span>{c.updates}</span>
                      </div>
                    )}
                    <div className="saved-actions">
                      <button
                        className="danger-ghost"
                        onClick={() => void deleteSavedSearch(saved)}
                        aria-label={`${c.delete} ${saved.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        className="primary"
                        onClick={() => applySavedSearch(saved)}
                      >
                        {c.apply} <ChevronRight size={16} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {selectedListing && selectedPresentation === "drawer" && (
        <ListingDrawer
          listing={selectedListing}
          locale={locale}
          isFavorite={favorites.some(
            (item) => item.listingId === selectedListing.id,
          )}
          onFavorite={() => void toggleFavorite(selectedListing)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {selectedListing && selectedPresentation === "modal" && (
        <div
          className="modal-backdrop listing-detail-backdrop"
          onMouseDown={() => setSelectedId(null)}
        >
          <ListingDrawer
            listing={selectedListing}
            locale={locale}
            modal
            isFavorite={favorites.some(
              (item) => item.listingId === selectedListing.id,
            )}
            onFavorite={() => void toggleFavorite(selectedListing)}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {saveOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSaveOpen(false)}>
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{c.saved}</span>
                <h2 id="save-title">{c.saveSearch}</h2>
              </div>
              <button onClick={() => setSaveOpen(false)} aria-label={c.close}>
                <X />
              </button>
            </div>
            <Field label={c.searchName}>
              <input
                autoFocus
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createSavedSearch();
                }}
              />
            </Field>
            <SearchSummary query={query} locale={locale} />
            <div className="modal-actions">
              <button className="secondary" onClick={() => setSaveOpen(false)}>
                {c.cancel}
              </button>
              <button
                className="primary"
                disabled={!saveName.trim()}
                onClick={() => void createSavedSearch()}
              >
                <Save size={16} /> {c.create}
              </button>
            </div>
          </section>
        </div>
      )}

      {dataOpen && (
        <div className="modal-backdrop" onMouseDown={() => setDataOpen(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{c.data}</span>
                <h2 id="data-title">{c.dataHelp}</h2>
              </div>
              <button onClick={() => setDataOpen(false)} aria-label={c.close}>
                <X />
              </button>
            </div>
            <div className="catalog-meta">
              <div>
                <span>{c.catalogUpdated}</span>
                <strong>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(catalog.publishedAt))}
                </strong>
              </div>
              <div>
                <span>Version</span>
                <strong className="mono">{catalog.catalogVersion}</strong>
              </div>
            </div>
            <div className="data-actions">
              <button onClick={() => void downloadBackup()}>
                <Download size={18} />
                <span>{c.export}</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()}>
                <FileUp size={18} />
                <span>{c.import}</span>
              </button>
              <button className="danger" onClick={() => void resetLocalData()}>
                <Trash2 size={18} />
                <span>{c.reset}</span>
              </button>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImport(file);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={17} /> {toast}
        </div>
      )}
    </main>
  );
}

function ListingCard({
  listing,
  locale,
  favorite,
  selected,
  onFavorite,
  onSelect,
  onHover,
}: {
  listing: ListingType;
  locale: Locale;
  favorite: boolean;
  selected: boolean;
  onFavorite: () => void;
  onSelect: () => void;
  onHover: (id: string | null) => void;
}) {
  const c = t(locale);
  return (
    <article
      className={`listing-card ${selected ? "selected" : ""}`}
      onMouseEnter={() => onHover(listing.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        className="card-main"
        onClick={onSelect}
        aria-label={`${listing.neighborhood ?? listing.projectName}: ${formatCop(listing.priceCop, locale)}`}
      >
        <span className="listing-type">{listing.resultType}</span>
        <strong className="card-price">
          {formatCompactCop(listing.priceCop, locale)}
        </strong>
        <span className="card-location">
          {listing.projectName && <b>{listing.projectName} · </b>}
          {listing.neighborhood ?? "Bogotá"}
        </span>
        <span className="card-id">{listing.id}</span>
        <div className="facts-row">
          <span>
            <BedDouble size={15} /> {listing.bedrooms}
          </span>
          <span>
            <Bath size={15} /> {listing.bathrooms}
          </span>
          <span>
            <CarFront size={15} /> {listing.parkingSpaces ?? "—"}
          </span>
          <span className="area-fact">{listing.areaM2 ?? "—"} m²</span>
        </div>
        <div className="card-footer">
          <span>
            {listing.pricePerM2
              ? `${formatCompactCop(listing.pricePerM2, locale)}/m²`
              : "—"}
          </span>
          {listing.coordinatePrecision === "neighborhood_centroid" && (
            <em>
              <MapPin size={12} /> {c.approximate}
            </em>
          )}
          {listing.dataWarnings.length > 0 && (
            <em className="warning">
              <CircleAlert size={12} /> {c.verifyData}
            </em>
          )}
        </div>
      </button>
      <button
        className={`favorite-button ${favorite ? "active" : ""}`}
        onClick={onFavorite}
        aria-label={favorite ? `${c.delete} ${c.favorites}` : c.favorites}
        aria-pressed={favorite}
      >
        <Heart size={19} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}

function ListingDrawer({
  listing,
  locale,
  modal = false,
  isFavorite,
  onFavorite,
  onClose,
}: {
  listing: ListingType;
  locale: Locale;
  modal?: boolean;
  isFavorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
}) {
  const c = t(locale);
  return (
    <aside
      className={`listing-drawer ${modal ? "modal-card" : ""}`}
      role={modal ? "dialog" : undefined}
      aria-modal={modal || undefined}
      aria-labelledby={modal ? "listing-detail-title" : undefined}
      aria-label={modal ? undefined : listing.neighborhood ?? listing.id}
      onMouseDown={modal ? (event) => event.stopPropagation() : undefined}
    >
      <div className="drawer-accent">
        <span>{listing.resultType}</span>
        <button autoFocus={modal} onClick={onClose} aria-label={c.close}>
          <X />
        </button>
      </div>
      <div className="drawer-body">
        <span className="eyebrow">{listing.id}</span>
        <h2 id={modal ? "listing-detail-title" : undefined}>
          {listing.projectName ?? listing.neighborhood ?? "Bogotá"}
        </h2>
        {listing.projectName && <p>{listing.neighborhood}</p>}
        <strong className="drawer-price">
          {formatCop(listing.priceCop, locale)}
        </strong>
        {listing.dataWarnings.length > 0 && (
          <div className="inline-warning">
            <CircleAlert size={16} /> {c.verifyData}
          </div>
        )}
        <div className="drawer-facts">
          <div>
            <BedDouble />
            <strong>{listing.bedrooms}</strong>
            <span>{c.bedrooms}</span>
          </div>
          <div>
            <Bath />
            <strong>{listing.bathrooms}</strong>
            <span>{c.bathrooms.replace(" mín.", "").replace("Min. ", "")}</span>
          </div>
          <div>
            <CarFront />
            <strong>{listing.parkingSpaces ?? "—"}</strong>
            <span>{c.parking.replace(" mín.", "").replace("Min. ", "")}</span>
          </div>
          <div>
            <SlidersHorizontal />
            <strong>{listing.areaM2 ?? "—"}</strong>
            <span>m²</span>
          </div>
        </div>
        <dl className="drawer-details">
          <div>
            <dt>{c.stratum}</dt>
            <dd>{listing.stratum ?? c.unknown}</dd>
          </div>
          <div>
            <dt>{c.price}/m²</dt>
            <dd>
              {listing.pricePerM2
                ? formatCop(listing.pricePerM2, locale)
                : "—"}
            </dd>
          </div>
          <div>
            <dt>{c.map}</dt>
            <dd>
              {listing.coordinatePrecision === "neighborhood_centroid"
                ? c.approximate
                : locale === "es"
                  ? "Coordenada del anuncio"
                  : "Listing coordinate"}
            </dd>
          </div>
        </dl>
      </div>
      <div className="drawer-actions">
        <button
          className={`secondary ${isFavorite ? "favorite-active" : ""}`}
          onClick={onFavorite}
        >
          <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
          {c.favorites}
        </button>
        <a
          className="primary"
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {c.viewSource} <ExternalLink size={16} />
        </a>
      </div>
    </aside>
  );
}

function FavoriteCard({
  favorite,
  listing,
  unavailable,
  locale,
  onChange,
  onRemove,
}: {
  favorite: Favorite;
  listing: ListingType;
  unavailable: boolean;
  locale: Locale;
  onChange: (patch: Partial<Pick<Favorite, "status" | "note">>) => void;
  onRemove: () => void;
}) {
  const c = t(locale);
  const changed =
    !unavailable && favorite.acknowledgedFingerprint !== listing.fingerprint;
  return (
    <article className={`favorite-card ${unavailable ? "unavailable" : ""}`}>
      <div className="favorite-card-heading">
        <div>
          <span className="listing-type">{listing.resultType}</span>
          <h2>{listing.projectName ?? listing.neighborhood ?? listing.id}</h2>
          <strong>{formatCop(listing.priceCop, locale)}</strong>
        </div>
        <button onClick={onRemove} aria-label={`${c.delete} ${c.favorites}`}>
          <Heart fill="currentColor" />
        </button>
      </div>
      {(unavailable || changed) && (
        <div className="favorite-alert">
          <CircleAlert size={15} /> {unavailable ? c.unavailable : c.changed}
        </div>
      )}
      <div className="facts-row">
        <span>
          <BedDouble size={15} /> {listing.bedrooms}
        </span>
        <span>
          <Bath size={15} /> {listing.bathrooms}
        </span>
        <span>
          <CarFront size={15} /> {listing.parkingSpaces ?? "—"}
        </span>
        <span>{listing.areaM2 ?? "—"} m²</span>
      </div>
      <Field label={locale === "es" ? "Estado" : "Status"}>
        <select
          value={favorite.status}
          onChange={(event) =>
            onChange({ status: event.target.value as FavoriteStatus })
          }
        >
          <option value="interested">{c.interested}</option>
          <option value="contacted">{c.contacted}</option>
          <option value="dismissed">{c.dismissed}</option>
        </select>
      </Field>
      <Field label={c.note}>
        <textarea
          value={favorite.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder={c.notePlaceholder}
          rows={3}
        />
      </Field>
      <a href={listing.url} target="_blank" rel="noopener noreferrer">
        {c.viewSource} <ExternalLink size={14} />
      </a>
    </article>
  );
}

function SearchSummary({
  query,
  locale,
}: {
  query: SearchQuery;
  locale: Locale;
}) {
  const c = t(locale);
  const parts: string[] = [];
  if (query.text) parts.push(query.text);
  if (query.minPrice)
    parts.push(`≥ ${formatCompactCop(Number(query.minPrice), locale)}`);
  if (query.maxPrice)
    parts.push(`≤ ${formatCompactCop(Number(query.maxPrice), locale)}`);
  if (query.minArea) parts.push(`≥ ${query.minArea} m²`);
  if (query.bedrooms) parts.push(`${query.bedrooms} ${c.bedrooms.toLowerCase()}`);
  if (query.minBathrooms)
    parts.push(`${query.minBathrooms}+ ${c.bathrooms.toLowerCase()}`);
  if (query.minParking)
    parts.push(`${query.minParking}+ ${c.parking.toLowerCase()}`);
  if (query.resultType) parts.push(query.resultType);
  if (query.stratum) parts.push(`${c.stratum} ${query.stratum}`);
  if (query.useMapBounds) parts.push(c.mapArea);
  return (
    <div className="search-summary">
      {(parts.length ? parts : [c.all]).map((part, index) => (
        <span key={`${part}-${index}`}>{part}</span>
      ))}
    </div>
  );
}
