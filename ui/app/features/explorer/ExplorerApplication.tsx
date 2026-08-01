import {
  Archive,
  BarChart3,
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
  Moon,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sun,
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
import {
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useCatalog } from "@/app/features/catalog/useCatalog";
import { MapPanel } from "@/app/MapPanel";
import { StatsDashboard } from "@/app/StatsDashboard";
import {
  DEFAULT_QUERY,
  compareSnapshot,
  createSnapshot,
  filterListings,
  listingSummary,
  queryFromRouterSearch,
  queryToRouterSearch,
  validateExploreSearch,
} from "@/app/lib/core";
import {
  db,
  exportUserData,
  importUserData,
  isValidImport,
} from "@/app/lib/db";
import { formatCompactCop, formatCop, t } from "@/app/lib/i18n";
import type {
  ExploreSearch,
  Favorite,
  FavoriteStatus,
  Listing as ListingType,
  Locale,
  MapBounds,
  SavedSearch,
  SearchQuery,
} from "@/app/lib/types";

type MainView = "explore" | "stats" | "favorites" | "saved";
type MobilePane = "list" | "map";
type Theme = "dark" | "light";

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
    <label className="grid min-w-0 gap-1.5">
      <span className="min-w-0 text-[10px] leading-tight font-extrabold tracking-[0.06em] text-muted-foreground uppercase">
        {label}
      </span>
      {children}
      {helper && <small className="-mt-0.5 text-[9px] text-muted-foreground">{helper}</small>}
    </label>
  );
}

function sourceActionLabel(url: string, locale: Locale, fallback: string) {
  try {
    const hostname = new URL(url).hostname;
    const source = hostname.includes("metrocuadrado")
      ? "Metrocuadrado"
      : hostname.includes("fincaraiz")
        ? "FincaRaíz"
        : hostname.includes("facebook")
          ? "Facebook"
          : null;
    if (!source) return fallback;
    return locale === "es" ? `Ver en ${source}` : `View on ${source}`;
  } catch {
    return fallback;
  }
}

function PropertyImage({
  src,
  alt,
  variant,
}: {
  src?: string | null;
  alt: string;
  variant: "card" | "detail" | "favorite";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const canShow = Boolean(src && failedSrc !== src);
  return (
    <span
      className={cn(
        "relative block overflow-hidden bg-muted",
        variant === "card" &&
          "col-start-1 row-span-5 row-start-1 size-[88px] rounded-lg max-[520px]:size-[72px]",
        variant === "detail" &&
          "mb-[18px] aspect-[4/3] max-h-[360px] w-full rounded-2xl",
        variant === "favorite" && "mb-3.5 h-[150px] w-full rounded-xl",
        !canShow &&
          "grid place-items-center bg-[radial-gradient(circle_at_25%_20%,color-mix(in_srgb,var(--primary)_20%,transparent),transparent_38%),linear-gradient(145deg,var(--muted),var(--secondary))] font-mono text-[11px] font-extrabold tracking-[0.08em] text-primary",
      )}
    >
      {src && canShow ? (
        // Images are already downloaded, resized, and optimized locally.
        <img
          className="block size-full object-cover"
          src={src}
          alt={alt}
          loading={variant === "detail" ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span aria-hidden="true">CM</span>
      )}
    </span>
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
    <div className="grid min-h-[280px] place-content-center justify-items-center gap-2.5 text-center text-muted-foreground">
      {icon}
      <p className="m-0 text-xs">{children}</p>
    </div>
  );
}

function UnknownProperty({
  listingId,
  locale,
  onClose,
}: {
  listingId: string;
  locale: Locale;
  onClose: () => void;
}) {
  return (
    <div className="grid h-full place-content-center justify-items-center gap-3 p-6 text-center">
      <CircleAlert className="text-amber-600" size={34} />
      <div>
        <h2 className="m-0 text-lg">
          {locale === "es" ? "Inmueble no encontrado" : "Property not found"}
        </h2>
        <p className="max-w-sm text-xs text-muted-foreground">
          {locale === "es"
            ? `El anuncio ${listingId} no está disponible en el catálogo local actual.`
            : `Listing ${listingId} is not available in the current local catalog.`}
        </p>
      </div>
      <Button onClick={onClose}>
        {locale === "es" ? "Volver a resultados" : "Back to results"}
      </Button>
    </div>
  );
}

export default function ExplorerApplication() {
  const { data: catalog, error: catalogError } = useCatalog();
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const rawRouterSearch = useRouterState({
    select: (state) => state.location.search,
  }) as Record<string, unknown>;
  const routerSearch = useSearch({ strict: false }) as Partial<ExploreSearch>;
  const params = useParams({ strict: false }) as { listingId?: string };
  const view: MainView = pathname.startsWith("/stats")
    ? "stats"
    : pathname.startsWith("/favorites")
      ? "favorites"
      : pathname.startsWith("/saved")
        ? "saved"
        : "explore";
  const [locale, setLocale] = useState<Locale>("es");
  const [localeReady, setLocaleReady] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const c = t(locale);
  const [query, setQuery] = useState<SearchQuery>(() =>
    queryFromRouterSearch(routerSearch),
  );
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const selectedId = params.listingId ?? null;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(80);
  const favorites = useLiveQuery(() => db.favorites.toArray(), [], []);
  const savedSearches = useLiveQuery(
    () => db.savedSearches.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );
  const [activeSavedId, setActiveSavedId] = useState<string | null>(
    routerSearch.saved ?? null,
  );
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navigateToView = useCallback(
    (next: MainView) => {
      if (next === "explore") {
        void router.navigate({
          to: "/explore",
          search: queryToRouterSearch(query, activeSavedId),
        });
      } else if (next === "stats") {
        void router.navigate({ to: "/stats" });
      } else if (next === "favorites") {
        void router.navigate({ to: "/favorites" });
      } else {
        void router.navigate({ to: "/saved" });
      }
    },
    [activeSavedId, query, router],
  );

  const navigateToProperty = useCallback(
    (listingId: string | null) => {
      if (listingId) {
        void router.navigate({
          to: "/explore/property/$listingId",
          params: { listingId },
          search: queryToRouterSearch(query, activeSavedId),
        });
      } else {
        void router.navigate({
          to: "/explore",
          search: queryToRouterSearch(query, activeSavedId),
        });
      }
    },
    [activeSavedId, query, router],
  );

  const replaceFilterSearch = useCallback(
    (nextQuery: SearchQuery, savedId = activeSavedId) => {
      const search = queryToRouterSearch(nextQuery, savedId);
      if (selectedId) {
        void router.navigate({
          to: "/explore/property/$listingId",
          params: { listingId: selectedId },
          search,
          replace: true,
        });
      } else {
        void router.navigate({ to: "/explore", search, replace: true });
      }
    },
    [activeSavedId, router, selectedId],
  );

  const updateQuery = useCallback(
    <K extends keyof SearchQuery>(key: K, value: SearchQuery[K]) => {
      const nextQuery = { ...query, [key]: value };
      setQuery(nextQuery);
      if (key !== "mapBounds" && key !== "useMapBounds") {
        replaceFilterSearch(nextQuery);
      }
      setVisibleLimit(80);
    },
    [query, replaceFilterSearch],
  );

  useEffect(() => {
    const preferred =
      navigator.language.toLocaleLowerCase().startsWith("es") ? "es" : "en";
    Promise.all([
      db.settings.get("locale"),
      db.settings.get("theme"),
    ])
      .then(([localeSetting, themeSetting]) => {
        setLocale(
          localeSetting?.value === "es" || localeSetting?.value === "en"
            ? localeSetting.value
            : preferred,
        );
        setTheme(themeSetting?.value === "light" ? "light" : "dark");
        setLocaleReady(true);
      })
      .catch(() => {
        setLocale(preferred);
        setLocaleReady(true);
        setStorageAvailable(false);
      });
  }, []);

  useEffect(() => {
    if (view !== "explore") return;
    // Back/forward navigation is the one external event that must rehydrate
    // controlled filter inputs while preserving transient map state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery((current) => ({
      ...queryFromRouterSearch(routerSearch),
      useMapBounds: current.useMapBounds,
      mapBounds: current.mapBounds,
    }));
    setActiveSavedId(routerSearch.saved ?? null);
  }, [pathname, routerSearch, view]);

  useEffect(() => {
    if (view !== "explore") return;
    const canonical = validateExploreSearch(rawRouterSearch);
    const rawEntries = JSON.stringify(Object.entries(rawRouterSearch).sort());
    const canonicalEntries = JSON.stringify(Object.entries(canonical).sort());
    if (rawEntries === canonicalEntries) return;
    if (selectedId) {
      void router.navigate({
        to: "/explore/property/$listingId",
        params: { listingId: selectedId },
        search: canonical,
        replace: true,
      });
    } else {
      void router.navigate({
        to: "/explore",
        search: canonical,
        replace: true,
      });
    }
  }, [rawRouterSearch, router, selectedId, view]);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (!localeReady) return;
    db.settings
      .put({ key: "locale", value: locale })
      .catch(() => setStorageAvailable(false));
  }, [locale, localeReady]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (!localeReady) return;
    db.settings
      .put({ key: "theme", value: theme })
      .catch(() => setStorageAvailable(false));
  }, [localeReady, theme]);

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
    if (!selectedListing) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") navigateToProperty(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [navigateToProperty, selectedListing]);
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
      setActiveSavedId(saved.id);
      replaceFilterSearch(query, saved.id);
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
  }

  function applySavedSearch(saved: SavedSearch) {
    const storedQuery = { ...DEFAULT_QUERY, ...saved.query };
    setQuery(storedQuery);
    setActiveSavedId(saved.id);
    setVisibleLimit(80);
    void router.navigate({
      to: "/explore",
      search: queryToRouterSearch(storedQuery, saved.id),
    });
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
    if (activeSavedId === saved.id) {
      setActiveSavedId(null);
      replaceFilterSearch(query, null);
    }
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
    setActiveSavedId(null);
    setDataOpen(false);
  }

  const clearFilters = () => {
    setQuery(DEFAULT_QUERY);
    setActiveSavedId(null);
    replaceFilterSearch(DEFAULT_QUERY, null);
    setVisibleLimit(80);
  };

  const applyStatsFilters = (patch: Partial<SearchQuery>) => {
    const nextQuery = {
      ...query,
      ...patch,
      useMapBounds: false,
      mapBounds: null,
    };
    setQuery(nextQuery);
    setVisibleLimit(80);
    void router.navigate({
      to: "/explore",
      search: queryToRouterSearch(nextQuery),
    });
  };

  if (!catalog && !catalogError) {
    return (
      <main className="grid min-h-screen place-content-center justify-items-center gap-3 bg-[#10212a] text-xs font-semibold tracking-[0.04em] text-white">
        <div className="grid size-10 place-items-center rounded-lg bg-[#2bb7a9] font-mono text-[13px] font-black tracking-[-0.04em] text-[#10212a]">
          CM
        </div>
        <span>{c.loading}</span>
      </main>
    );
  }
  if (catalogError || !catalog) {
    return (
      <main className="grid min-h-screen place-content-center justify-items-center gap-3 bg-[#10212a] text-xs font-semibold tracking-[0.04em] text-white">
        <CircleAlert />
        <strong>Catalog unavailable</strong>
        <span>{String(catalogError)}</span>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Tabs
        className="contents"
        value={view}
        onValueChange={(value) => navigateToView(value as MainView)}
      >
      <header className="relative z-40 grid h-[var(--topbar)] grid-cols-[minmax(250px,1fr)_auto_minmax(250px,1fr)] items-center gap-5 border-b border-white/10 bg-[#10212a] px-[18px] text-white max-[1120px]:grid-cols-[minmax(210px,1fr)_auto_minmax(170px,1fr)] max-[1024px]:grid-cols-[1fr_auto] max-[1024px]:gap-2 max-[1024px]:px-2.5 dark:bg-[#071116]">
        <button
          className="inline-flex items-center gap-[11px] justify-self-start bg-transparent p-0 text-left text-inherit"
          onClick={() => {
            navigateToView("explore");
          }}
          aria-label={c.explore}
        >
          <span className="grid size-10 place-items-center rounded-lg bg-[#2bb7a9] font-mono text-[13px] font-black tracking-[-0.04em] text-[#10212a] max-[860px]:size-9 dark:bg-[#52dbc9]">
            CM
          </span>
          <span className="grid gap-0.5 max-[520px]:hidden">
            <strong className="text-sm tracking-[0.13em] max-[860px]:text-xs">{c.brand}</strong>
            <small className="text-[10px] text-[#aebdc2] max-[1120px]:hidden">
              {catalog.summary.publishedRecords.toLocaleString(
                locale === "es" ? "es-CO" : "en-US",
              )}{" "}
              {c.verified}
            </small>
          </span>
        </button>
        <TabsList
          className="h-full items-stretch gap-1 rounded-none bg-transparent p-0 max-[1024px]:fixed max-[1024px]:inset-x-0 max-[1024px]:bottom-0 max-[1024px]:z-50 max-[1024px]:grid max-[1024px]:h-14 max-[1024px]:w-full max-[1024px]:grid-cols-4 max-[1024px]:border-t max-[1024px]:bg-card max-[1024px]:p-1 max-[1024px]:text-foreground max-[1024px]:shadow-[0_-8px_24px_rgb(0_0_0/0.08)]"
          variant="line"
          aria-label="Main navigation"
        >
          <TabsTrigger
            value="explore"
            className="h-full rounded-none px-[15px] text-[13px] font-semibold text-[#aebdc2] data-active:text-white max-[1024px]:flex-col max-[1024px]:gap-0.5 max-[1024px]:rounded-lg max-[1024px]:px-1 max-[1024px]:text-[10px] max-[1024px]:text-muted-foreground max-[1024px]:data-active:bg-accent max-[1024px]:data-active:text-primary"
          >
            <MapPin size={17} /> {c.explore}
          </TabsTrigger>
          <TabsTrigger
            value="stats"
            className="h-full rounded-none px-[15px] text-[13px] font-semibold text-[#aebdc2] data-active:text-white max-[1024px]:flex-col max-[1024px]:gap-0.5 max-[1024px]:rounded-lg max-[1024px]:px-1 max-[1024px]:text-[10px] max-[1024px]:text-muted-foreground max-[1024px]:data-active:bg-accent max-[1024px]:data-active:text-primary"
          >
            <BarChart3 size={17} /> {c.stats}
          </TabsTrigger>
          <TabsTrigger
            value="favorites"
            className="h-full rounded-none px-[15px] text-[13px] font-semibold text-[#aebdc2] data-active:text-white max-[1024px]:flex-col max-[1024px]:gap-0.5 max-[1024px]:rounded-lg max-[1024px]:px-1 max-[1024px]:text-[10px] max-[1024px]:text-muted-foreground max-[1024px]:data-active:bg-accent max-[1024px]:data-active:text-primary"
          >
            <Heart size={17} /> {c.favorites}
            <Badge variant="secondary" className="h-[18px] min-w-[18px] px-1 text-[10px] max-[1024px]:absolute max-[1024px]:top-1 max-[1024px]:right-[18%] max-[1024px]:h-4 max-[1024px]:min-w-4 max-[1024px]:px-1 max-[1024px]:text-[9px]">
              {favorites.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="saved"
            className="h-full rounded-none px-[15px] text-[13px] font-semibold text-[#aebdc2] data-active:text-white max-[1024px]:flex-col max-[1024px]:gap-0.5 max-[1024px]:rounded-lg max-[1024px]:px-1 max-[1024px]:text-[10px] max-[1024px]:text-muted-foreground max-[1024px]:data-active:bg-accent max-[1024px]:data-active:text-primary"
          >
            <Archive size={17} /> {c.saved}
            <Badge variant="secondary" className="h-[18px] min-w-[18px] px-1 text-[10px] max-[1024px]:absolute max-[1024px]:top-1 max-[1024px]:right-[18%] max-[1024px]:h-4 max-[1024px]:min-w-4 max-[1024px]:px-1 max-[1024px]:text-[9px]">
              {savedSearches.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            className="h-[38px] border border-white/15 bg-white/[0.06] px-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white max-[1024px]:size-9 max-[1024px]:px-0"
            onClick={() => setDataOpen(true)}
          >
            <Database size={17} />
            <span className="max-[1024px]:hidden">{c.data}</span>
          </Button>
          <Button
            variant="ghost"
            className="h-[38px] border border-white/15 bg-white/[0.06] px-2.5 text-xs font-bold text-slate-200 hover:bg-white/10 hover:text-white max-[1024px]:size-9 max-[1024px]:px-0"
            onClick={() => setLocale(locale === "es" ? "en" : "es")}
            aria-label={locale === "es" ? "Switch to English" : "Cambiar a español"}
          >
            <Languages size={17} />
            {locale === "es" ? "EN" : "ES"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="inline-flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-300 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300/30 hover:bg-white/10 hover:text-white"
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
            aria-label={
              theme === "dark"
                ? locale === "es"
                  ? "Usar tema claro"
                  : "Use light theme"
                : locale === "es"
                  ? "Usar tema oscuro"
                  : "Use dark theme"
            }
            title={
              theme === "dark"
                ? locale === "es"
                  ? "Tema claro"
                  : "Light theme"
                : locale === "es"
                  ? "Tema oscuro"
                  : "Dark theme"
            }
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-9 border border-white/15 bg-white/[0.06] text-slate-200 hover:bg-white/10 hover:text-white max-[860px]:inline-grid"
            onClick={() => setFiltersOpen(true)}
            aria-label={c.filters}
          >
            <Menu />
          </Button>
        </div>
      </header>

      {!storageAvailable && (
        <Alert className="relative z-30 min-h-[38px] place-items-center justify-center rounded-none border-x-0 border-t-0 border-amber-300 bg-amber-100 px-[18px] py-2 text-xs text-amber-950">
          <CircleAlert size={17} /> {c.storageWarning}
        </Alert>
      )}

      {view === "explore" && (
        <div className="grid h-[calc(100vh-var(--topbar))] min-h-0 grid-cols-[300px_minmax(360px,40%)_minmax(0,1fr)] overflow-hidden max-[1120px]:grid-cols-[280px_minmax(350px,42%)_minmax(0,1fr)] max-[1024px]:h-[calc(100vh-var(--topbar)-56px)] max-[860px]:relative max-[860px]:block">
          <aside
            className={cn(
              "relative z-20 grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-r bg-card [&>*]:min-w-0 max-[860px]:fixed max-[860px]:inset-[var(--topbar)_0_0_auto] max-[860px]:z-[90] max-[860px]:w-[min(400px,94vw)] max-[860px]:shadow-2xl max-[860px]:transition-transform",
              filtersOpen
                ? "max-[860px]:translate-x-0"
                : "max-[860px]:translate-x-[105%]",
            )}
          >
            <div className="flex h-12 items-center justify-between gap-3 border-b px-3.5">
              <span className="inline-flex items-center gap-2 text-xs font-extrabold tracking-[0.04em] uppercase">
                <SlidersHorizontal size={17} /> {c.filters}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="hidden max-[860px]:inline-flex"
                onClick={() => setFiltersOpen(false)}
                aria-label={c.close}
              >
                <X />
              </Button>
            </div>
            <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain p-3.5">
              <Field label={c.searchPlaceholder}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-2 left-2.5 z-10 text-muted-foreground" size={16} />
                  <Input
                    className="pl-8"
                    aria-label={c.searchPlaceholder}
                    value={query.text}
                    onChange={(event) => updateQuery("text", event.target.value)}
                    placeholder="Cedritos, Chicó, Usaquén…"
                  />
                </div>
              </Field>
              <div className="grid gap-2">
                <span className="text-[10px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">{c.price}</span>
                <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-1.5">
                  <Input
                    aria-label={`${c.price} ${c.min}`}
                    inputMode="numeric"
                    value={query.minPrice}
                    onChange={(event) =>
                      updateQuery("minPrice", event.target.value)
                    }
                    placeholder={c.min}
                  />
                  <Input
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
              <div className="grid gap-2">
                <span className="text-[10px] font-extrabold tracking-[0.06em] text-muted-foreground uppercase">{c.area}</span>
                <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-1.5">
                  <Input
                    aria-label={`${c.area} ${c.min}`}
                    inputMode="decimal"
                    value={query.minArea}
                    onChange={(event) =>
                      updateQuery("minArea", event.target.value)
                    }
                    placeholder={c.min}
                  />
                  <Input
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
              <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-1.5">
                <Field label={c.bedrooms}>
                  <NativeSelect className="w-full"
                    value={query.bedrooms}
                    onChange={(event) =>
                      updateQuery("bedrooms", event.target.value)
                    }
                  >
                    <option value="">{c.all}</option>
                    {[3, 4, 5, 6].map((value) => (
                      <option value={value} key={value}>
                        {value}
                      </option>
                    ))}
                    <option value="7plus">7+</option>
                  </NativeSelect>
                </Field>
                <Field label={c.bathrooms}>
                  <NativeSelect className="w-full"
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
                  </NativeSelect>
                </Field>
              </div>
              <div className="grid min-w-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-1.5">
                <Field label={c.parking}>
                  <NativeSelect className="w-full"
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
                  </NativeSelect>
                </Field>
                <Field label={c.type}>
                  <NativeSelect className="w-full"
                    value={query.resultType}
                    onChange={(event) =>
                      updateQuery("resultType", event.target.value)
                    }
                  >
                    <option value="">{c.all}</option>
                    <option value="Inmueble">{c.inmueble}</option>
                    <option value="Proyecto">{c.proyecto}</option>
                  </NativeSelect>
                </Field>
              </div>
              <Field label={c.source}>
                <NativeSelect
                  className="w-full"
                  value={query.source}
                  onChange={(event) =>
                    updateQuery("source", event.target.value)
                  }
                >
                  <option value="">{c.all}</option>
                  <option value="fincaraiz">{c.sourceFincaraiz}</option>
                  <option value="metrocuadrado">{c.sourceMetrocuadrado}</option>
                  <option value="facebook-home-bogota">
                    {c.sourceHomeBogota}
                  </option>
                </NativeSelect>
              </Field>
              <Field label={c.stratum} helper={c.stratumHelp}>
                <NativeSelect className="w-full"
                  value={query.stratum}
                  onChange={(event) => updateQuery("stratum", event.target.value)}
                >
                  <option value="">{c.all}</option>
                  {[1, 2, 3, 4, 5, 6].map((value) => (
                    <option value={value} key={value}>
                      {value}
                    </option>
                  ))}
                  <option value="unknown">{c.unknown}</option>
                </NativeSelect>
              </Field>
              <Field label={c.sort}>
                <NativeSelect className="w-full"
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
                </NativeSelect>
              </Field>
              <label className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2.5 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={query.useMapBounds}
                  disabled={!query.mapBounds}
                  onCheckedChange={(checked) =>
                    updateQuery("useMapBounds", checked === true)
                  }
                />
                <span>{c.mapArea}</span>
              </label>
            </div>
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2 border-t p-2.5">
              <Button className="min-w-0" variant="outline" onClick={clearFilters}>
                <RotateCcw size={15} /> {c.clear}
              </Button>
              <Button
                className="min-w-0"
                onClick={() => {
                  setFiltersOpen(false);
                  if (activeSaved) void overwriteActiveSearch();
                  else setSaveOpen(true);
                }}
              >
                {activeSaved ? <Save size={15} /> : <BookmarkPlus size={15} />}
                {activeSaved ? c.saveChanges : c.saveSearch}
              </Button>
            </div>
          </aside>

          <section className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] border-r bg-card max-[860px]:absolute max-[860px]:inset-0 max-[860px]:z-[2] max-[860px]:size-full max-[860px]:border-0">
            {selectedListing ? (
              <ListingDrawer
                listing={selectedListing}
                locale={locale}
                isFavorite={favorites.some(
                  (item) => item.listingId === selectedListing.id,
                )}
                onFavorite={() => void toggleFavorite(selectedListing)}
                onClose={() => navigateToProperty(null)}
              />
            ) : selectedId ? (
              <UnknownProperty
                listingId={selectedId}
                locale={locale}
                onClose={() => navigateToProperty(null)}
              />
            ) : (
              <>
                <div className="flex min-h-[49px] items-center justify-between gap-3 border-b bg-card/90 px-3.5 py-2 max-[860px]:min-h-[54px] max-[520px]:gap-1.5 max-[520px]:px-2">
                  <div className="min-w-0 text-xs">
                    <strong className="text-base tracking-[-0.02em]">{filteredListings.length.toLocaleString()}</strong>{" "}
                    <span className="text-muted-foreground">{c.results}</span>
                    {activeSaved && (
                      <em className="mt-px block max-w-[220px] overflow-hidden text-[10px] font-bold text-primary not-italic text-ellipsis whitespace-nowrap">
                        {activeSaved.name}
                      </em>
                    )}
                  </div>
                  <div className="hidden overflow-hidden rounded-lg border max-[860px]:flex" role="group">
                    <button
                      className={cn(
                        "inline-flex h-[30px] items-center gap-1 px-2 text-[10px]",
                        mobilePane === "list"
                          ? "bg-foreground text-background"
                          : "bg-card text-muted-foreground",
                      )}
                      onClick={() => setMobilePane("list")}
                    >
                      <List size={15} /> {c.list}
                    </button>
                    <button
                      className={cn(
                        "inline-flex h-[30px] items-center gap-1 px-2 text-[10px]",
                        mobilePane === "map"
                          ? "bg-foreground text-background"
                          : "bg-card text-muted-foreground",
                      )}
                      onClick={() => setMobilePane("map")}
                    >
                      <MapIcon size={15} /> {c.map}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    className="hidden h-[31px] gap-1 bg-accent px-2 text-[10px] font-bold text-primary max-[860px]:inline-flex max-[520px]:w-[31px] max-[520px]:justify-center max-[520px]:px-0 max-[520px]:[&_span]:hidden"
                    onClick={() => setFiltersOpen(true)}
                  >
                    <Filter size={16} /> <span>{c.filters}</span>
                  </Button>
                </div>
                {activeUpdates && activeUpdateCount > 0 && (
                  <div className="flex items-center justify-between gap-2.5 border-b border-amber-300 bg-amber-100 px-3 py-2 text-[10px] text-amber-950">
                    <div>
                      <strong>{c.updates}</strong>
                      <span>
                        {activeUpdates.added.length} {c.newMatches} ·{" "}
                        {activeUpdates.changed.length} {c.changedMatches} ·{" "}
                        {activeUpdates.removed.length} {c.removedMatches}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => void acknowledgeUpdates()}
                    >
                      <Check size={15} /> {c.reviewed}
                    </Button>
                  </div>
                )}
                <div
                  className={cn(
                    "min-h-0 overflow-y-auto p-2",
                    mobilePane === "map" && "max-[860px]:hidden",
                  )}
                >
                  {filteredListings.length === 0 ? (
                    <EmptyState icon={<Search size={30} />}>
                      {c.noResults}
                    </EmptyState>
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
                          selected={false}
                          onFavorite={() => void toggleFavorite(listing)}
                          onSelect={() => navigateToProperty(listing.id)}
                          onHover={setHoveredId}
                        />
                      ))}
                      {visibleLimit < filteredListings.length && (
                        <Button
                          variant="ghost"
                          className="h-10 w-full text-[11px] font-bold text-primary"
                          onClick={() => setVisibleLimit((value) => value + 80)}
                        >
                          {c.showMore}{" "}
                          <span>
                            (
                            {Math.min(
                              80,
                              filteredListings.length - visibleLimit,
                            )}
                            )
                          </span>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </section>

          <div
            className={cn(
              "min-h-0 min-w-0",
              "max-[860px]:absolute max-[860px]:inset-0 max-[860px]:z-[1] max-[860px]:size-full",
              mobilePane === "list"
                ? "max-[860px]:hidden"
                : "max-[860px]:z-[4] max-[860px]:pt-[54px]",
            )}
          >
            <MapPanel
              listings={filteredListings}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={(id) => {
                navigateToProperty(id);
                setMobilePane("list");
              }}
              onBoundsChange={setMapBounds}
              unavailableLabel={c.mapUnavailable}
              locale={locale}
            />
          </div>
        </div>
      )}

      {view === "favorites" && (
        <section className="min-h-[calc(100vh-var(--topbar))] bg-background px-[clamp(18px,5vw,70px)] pt-[34px] pb-[70px] max-[860px]:px-3 max-[860px]:pt-6 max-[860px]:pb-[60px]">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <span className="font-mono text-[9px] font-extrabold tracking-[0.1em] text-primary uppercase">{c.favorites}</span>
              <h1 className="mt-1 mb-0 text-[28px] tracking-[-0.05em]">
                {favorites.length} {c.favorites.toLocaleLowerCase()}
              </h1>
            </div>
          </div>
          {favoriteCards.length === 0 ? (
            <EmptyState icon={<Heart size={32} />}>{c.noFavorites}</EmptyState>
          ) : (
            <div className="grid grid-cols-3 gap-3.5 max-[1120px]:grid-cols-2 max-[860px]:grid-cols-1">
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

      {view === "stats" && (
        <StatsDashboard
          allListings={catalog.listings}
          listings={filteredListings}
          query={query}
          locale={locale}
          onApplyFilters={applyStatsFilters}
          onShowResults={() => {
            navigateToView("explore");
          }}
        />
      )}

      {view === "saved" && (
        <section className="min-h-[calc(100vh-var(--topbar))] bg-background px-[clamp(18px,5vw,70px)] pt-[34px] pb-[70px] max-[860px]:px-3 max-[860px]:pt-6 max-[860px]:pb-[60px]">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <span className="font-mono text-[9px] font-extrabold tracking-[0.1em] text-primary uppercase">{c.saved}</span>
              <h1 className="mt-1 mb-0 text-[28px] tracking-[-0.05em]">
                {savedSearches.length} {c.saved.toLocaleLowerCase()}
              </h1>
            </div>
          </div>
          {savedSearches.length === 0 ? (
            <EmptyState icon={<Archive size={32} />}>{c.noSaved}</EmptyState>
          ) : (
            <div className="grid gap-2">
              {savedSearches.map((saved) => {
                const storedQuery = { ...DEFAULT_QUERY, ...saved.query };
                const matches = filterListings(catalog.listings, storedQuery);
                const updates = compareSnapshot(saved.snapshot, matches);
                const count =
                  updates.added.length +
                  updates.changed.length +
                  updates.removed.length;
                return (
                  <article
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-4 rounded-xl border bg-card p-4 max-[860px]:grid-cols-[auto_minmax(0,1fr)_auto]"
                    key={saved.id}
                  >
                    <div className="grid size-[42px] place-items-center rounded-lg bg-accent text-primary">
                      <Search size={19} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="m-0 text-[15px]">{saved.name}</h2>
                      <span className="text-[10px] text-muted-foreground">
                        {matches.length.toLocaleString()} {c.results}
                      </span>
                      <SearchSummary query={storedQuery} locale={locale} />
                    </div>
                    {count > 0 && (
                    <Badge className="grid h-auto justify-items-center gap-0.5 px-3 py-1.5 max-[860px]:hidden">
                      <strong className="font-mono text-[15px]">{count}</strong>
                      <span className="text-[8px]">{c.updates}</span>
                    </Badge>
                    )}
                    <div className="flex items-center gap-1.5 max-[860px]:col-[2/-1] max-[860px]:justify-end">
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => void deleteSavedSearch(saved)}
                        aria-label={`${c.delete} ${saved.name}`}
                      >
                        <Trash2 size={16} />
                      </Button>
                      <Button
                        onClick={() => applySavedSearch(saved)}
                      >
                        {c.apply} <ChevronRight size={16} />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <span className="font-mono text-[9px] font-extrabold tracking-[0.1em] text-primary uppercase">{c.saved}</span>
            <DialogTitle>{c.saveSearch}</DialogTitle>
            <DialogDescription>{c.searchName}</DialogDescription>
          </DialogHeader>
            <SearchSummary query={query} locale={locale} />
            <Field label={c.searchName}>
              <Input
                autoFocus
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createSavedSearch();
                }}
              />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveOpen(false)}>
                {c.cancel}
              </Button>
              <Button
                disabled={!saveName.trim()}
                onClick={() => void createSavedSearch()}
              >
                <Save size={16} /> {c.create}
              </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dataOpen} onOpenChange={setDataOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <span className="font-mono text-[9px] font-extrabold tracking-[0.1em] text-primary uppercase">{c.data}</span>
            <DialogTitle>{c.dataHelp}</DialogTitle>
          </DialogHeader>
            <div className="my-4 grid grid-cols-2 gap-2 max-[520px]:grid-cols-1">
              <div className="grid gap-1 rounded-lg border bg-muted/50 p-3">
                <span className="text-[9px] text-muted-foreground">{c.catalogUpdated}</span>
                <strong>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(catalog.publishedAt))}
                </strong>
              </div>
              <div className="grid gap-1 rounded-lg border bg-muted/50 p-3">
                <span className="text-[9px] text-muted-foreground">Version</span>
                <strong className="font-mono text-xs">{catalog.catalogVersion}</strong>
              </div>
            </div>
            <div className="grid gap-2">
              <Button variant="outline" onClick={() => void downloadBackup()}>
                <Download size={18} />
                <span>{c.export}</span>
              </Button>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <FileUp size={18} />
                <span>{c.import}</span>
              </Button>
              <Button variant="destructive" onClick={() => void resetLocalData()}>
                <Trash2 size={18} />
                <span>{c.reset}</span>
              </Button>
              <Input
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
        </DialogContent>
      </Dialog>

      {toast && (
        <Alert className="fixed right-5 bottom-5 z-[120] w-auto max-w-[calc(100vw-40px)] grid-cols-[auto_1fr] items-center bg-[#10212a] px-3.5 py-2.5 text-[11px] font-bold text-white shadow-2xl dark:bg-[#071116]" role="status">
          <Check size={17} /> {toast}
        </Alert>
      )}
      </Tabs>
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
      className={cn(
        "relative mb-2 grid grid-cols-1 rounded-xl border bg-card shadow-xs transition hover:-translate-y-px hover:border-primary/40 hover:shadow-md",
        selected && "border-primary ring-2 ring-primary/20",
      )}
      onMouseEnter={() => onHover(listing.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2.5 gap-y-1 bg-transparent py-2.5 pr-[45px] pl-3 text-left max-[520px]:grid-cols-[72px_minmax(0,1fr)] max-[520px]:gap-x-2 max-[520px]:py-2.5 max-[520px]:pr-[42px] max-[520px]:pl-2.5"
        onClick={onSelect}
        aria-label={`${listing.neighborhood ?? listing.projectName}: ${formatCop(listing.priceCop, locale)}`}
      >
        <PropertyImage
          src={listing.thumbnailUrl}
          alt=""
          variant="card"
        />
        <span className="col-start-2 self-center font-mono text-[9px] font-extrabold tracking-[0.08em] text-primary uppercase">{listing.resultType}</span>
        <strong className="col-start-2 self-start text-[17px] tracking-[-0.035em] max-[520px]:text-[15px]">
          {formatCompactCop(listing.priceCop, locale)}
        </strong>
        <span className="col-start-2 min-w-0 max-w-full overflow-hidden text-[13px] font-bold text-ellipsis whitespace-nowrap">
          {listing.projectName && <b>{listing.projectName} · </b>}
          {listing.neighborhood ?? listing.city} · {listing.city}
        </span>
        <span className="col-start-2 font-mono text-[8px] text-muted-foreground">{listing.id}</span>
        <div className="col-start-2 mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] font-semibold text-muted-foreground max-[520px]:gap-x-2 max-[520px]:gap-y-1.5 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1">
          <span>
            <BedDouble size={15} /> {listing.bedrooms}
          </span>
          <span>
            <Bath size={15} /> {listing.bathrooms}
          </span>
          <span>
            <CarFront size={15} /> {listing.parkingSpaces ?? "—"}
          </span>
          <span className="ml-auto text-[11px] max-[520px]:ml-0">{listing.areaM2 ?? "—"} m²</span>
        </div>
        <div className="col-start-2 mt-1.5 flex min-h-[18px] items-center gap-2.5 border-t pt-1.5 text-[9px] text-muted-foreground max-[520px]:flex-wrap [&_em]:inline-flex [&_em]:items-center [&_em]:gap-1 [&_em]:font-bold [&_em]:not-italic">
          <span>
            {listing.pricePerM2
              ? `${formatCompactCop(listing.pricePerM2, locale)}/m²`
              : "—"}
          </span>
          {listing.coordinatePrecision === "neighborhood_centroid" && (
            <em className="text-amber-700">
              <MapPin size={12} /> {c.approximate}
            </em>
          )}
          {listing.dataWarnings.length > 0 && (
            <em className="text-destructive">
              <CircleAlert size={12} /> {c.verifyData}
            </em>
          )}
        </div>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-2 right-2 size-[30px] rounded-lg bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
          favorite && "bg-destructive/10 text-destructive",
        )}
        onClick={onFavorite}
        aria-label={favorite ? `${c.delete} ${c.favorites}` : c.favorites}
        aria-pressed={favorite}
      >
        <Heart size={19} fill={favorite ? "currentColor" : "none"} />
      </Button>
    </article>
  );
}

function ListingDrawer({
  listing,
  locale,
  isFavorite,
  onFavorite,
  onClose,
}: {
  listing: ListingType;
  locale: Locale;
  isFavorite: boolean;
  onFavorite: () => void;
  onClose: () => void;
}) {
  const c = t(locale);
  return (
    <aside
      className="grid h-full min-h-0 w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white text-[#10212a] dark:bg-[#101a21] dark:text-[#e8f0f2]"
      aria-label={listing.neighborhood ?? listing.id}
    >
      <div className="flex min-h-11 items-center justify-between bg-[#10212a] px-3.5 text-white">
        <span className="font-mono text-[10px] font-extrabold tracking-[0.1em] uppercase">
          {listing.resultType}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label={c.close}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 overflow-y-auto p-6">
        <PropertyImage
          src={listing.imageUrl}
          alt={
            listing.projectName ??
            listing.neighborhood ??
            `${listing.resultType} ${listing.id}`
          }
          variant="detail"
        />
        <span className="font-mono text-[10px] font-extrabold tracking-[0.08em] text-[#168f87] uppercase">
          {listing.id}
        </span>
        <h2 className="mt-2 mb-0.5 text-[25px] leading-[1.05] font-bold tracking-[-0.045em]">
          {listing.projectName ?? listing.neighborhood ?? listing.city}
        </h2>
        {listing.projectName && (
          <p className="mt-1.5 text-xs text-[#68777d]">
            {listing.neighborhood}
          </p>
        )}
        <strong className="mt-5 block text-[22px] tracking-[-0.04em]">
          {formatCop(listing.priceCop, locale)}
        </strong>
        {listing.dataWarnings.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#f0c3bc] bg-[#fff0ed] p-2 text-[10px] font-bold text-[#943c32]">
            <CircleAlert size={16} /> {c.verifyData}
          </div>
        )}
        <div className="mt-5 grid grid-cols-4 gap-1.5 [&>div]:grid [&>div]:justify-items-center [&>div]:gap-1 [&>div]:rounded-xl [&>div]:border [&>div]:border-[#d7dedb] [&>div]:bg-[#eef2ef] [&>div]:px-1 [&>div]:py-3 dark:[&>div]:border-[#263842] dark:[&>div]:bg-[#17242c] [&_svg]:w-[17px] [&_svg]:text-[#168f87] dark:[&_svg]:text-[#38c7b7] [&_strong]:font-mono [&_strong]:text-sm [&_span]:text-[8px] [&_span]:text-[#68777d] dark:[&_span]:text-[#91a4ad]">
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
        <dl className="mt-5 border-t border-[#d7dedb] dark:border-[#263842] [&>div]:flex [&>div]:justify-between [&>div]:gap-5 [&>div]:border-b [&>div]:border-[#d7dedb] dark:[&>div]:border-[#263842] [&>div]:py-3 [&>div]:text-[11px] [&_dd]:m-0 [&_dd]:font-semibold [&_dd]:text-right [&_dt]:text-[#68777d] dark:[&_dt]:text-[#91a4ad]">
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
      <div className="grid grid-cols-[0.8fr_1.2fr] gap-2 border-t border-[#d7dedb] bg-[#fafbfa] p-3 dark:border-[#263842] dark:bg-[#0d171d]">
        <Button
          variant={isFavorite ? "destructive" : "outline"}
          onClick={onFavorite}
        >
          <Heart size={17} fill={isFavorite ? "currentColor" : "none"} />
          {c.favorites}
        </Button>
        <Button asChild>
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {sourceActionLabel(listing.url, locale, c.viewSource)}{" "}
            <ExternalLink size={16} />
          </a>
        </Button>
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
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-card p-4 shadow-sm",
        unavailable && "opacity-65",
      )}
    >
      <PropertyImage
        src={listing.thumbnailUrl ?? listing.imageUrl}
        alt={
          listing.projectName ??
          listing.neighborhood ??
          `${listing.resultType} ${listing.id}`
        }
        variant="favorite"
      />
      <div className="flex items-start justify-between gap-3.5">
        <div className="min-w-0">
          <span className="font-mono text-[9px] font-extrabold tracking-[0.08em] text-primary uppercase">{listing.resultType}</span>
          <h2 className="my-1.5 overflow-hidden text-[17px] tracking-[-0.03em] text-ellipsis whitespace-nowrap">{listing.projectName ?? listing.neighborhood ?? listing.id}</h2>
          <strong className="text-sm">{formatCop(listing.priceCop, locale)}</strong>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 bg-destructive/10 text-destructive"
          onClick={onRemove}
          aria-label={`${c.delete} ${c.favorites}`}
        >
          <Heart fill="currentColor" />
        </Button>
      </div>
      {(unavailable || changed) && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 p-2 text-[10px] font-bold text-amber-950">
          <CircleAlert size={15} /> {unavailable ? c.unavailable : c.changed}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 border-b py-3 font-mono text-[10px] font-semibold text-muted-foreground [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1">
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
      <div className="mt-3">
      <Field label={locale === "es" ? "Estado" : "Status"}>
        <NativeSelect className="w-full"
          value={favorite.status}
          onChange={(event) =>
            onChange({ status: event.target.value as FavoriteStatus })
          }
        >
          <option value="interested">{c.interested}</option>
          <option value="contacted">{c.contacted}</option>
          <option value="dismissed">{c.dismissed}</option>
        </NativeSelect>
      </Field>
      </div>
      <div className="mt-3">
      <Field label={c.note}>
        <Textarea
          value={favorite.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder={c.notePlaceholder}
          rows={3}
        />
      </Field>
      </div>
      <a className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary no-underline" href={listing.url} target="_blank" rel="noopener noreferrer">
        {sourceActionLabel(listing.url, locale, c.viewSource)}{" "}
        <ExternalLink size={14} />
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
  if (query.source) {
    parts.push(
      query.source === "facebook-home-bogota"
        ? c.sourceHomeBogota
        : query.source === "metrocuadrado"
          ? c.sourceMetrocuadrado
          : c.sourceFincaraiz,
    );
  }
  if (query.stratum) parts.push(`${c.stratum} ${query.stratum}`);
  if (query.useMapBounds) parts.push(c.mapArea);
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {(parts.length ? parts : [c.all]).map((part, index) => (
        <Badge variant="secondary" className="h-auto px-2 py-1 text-[9px]" key={`${part}-${index}`}>{part}</Badge>
      ))}
    </div>
  );
}
