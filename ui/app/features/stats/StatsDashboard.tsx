import {
  ArrowRight,
  Building2,
  Download,
  MapPinned,
  RotateCcw,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  bedroomDistribution,
  groupListings,
  priceDistribution,
  scatterSample,
  stratumDistribution,
  summarizeListings,
  type DistributionBucket,
  type GroupDimension,
} from "@/app/lib/stats";
import {
  filterListings,
  normalizeText,
  queryFromRouterSearch,
} from "@/app/lib/core";
import type {
  Listing,
  Locale,
  SearchQuery,
  StatsScope,
  StatsSearch,
} from "@/app/lib/types";
import { formatCompactCop, formatCop } from "@/app/lib/i18n";

type RankingMetric = "pricePerM2" | "price" | "inventory";
type CatalogKind = "sales" | "rentals";

type Props = {
  salesListings: Listing[];
  rentalListings: Listing[];
  favoriteIds: string[];
  search: StatsSearch;
  locale: Locale;
  onSearchChange: (search: StatsSearch) => void;
  onDrillDown: (kind: CatalogKind, query: SearchQuery) => void;
};

const copy = {
  es: {
    title: "Pulso del mercado",
    subtitle: "Filtra el inventario completo y abre cualquier corte en su mapa correspondiente.",
    scope: "Ámbito",
    all: "Todos",
    sales: "Ventas",
    rentals: "Arriendos",
    projects: "Proyectos nuevos",
    resale: "Usados / no proyectos",
    filters: "Filtros estadísticos",
    clear: "Limpiar",
    search: "Buscar",
    source: "Fuente",
    market: "Mercado",
    bogota: "Bogotá",
    sabana: "Sabana",
    locality: "Localidad",
    municipality: "Municipio",
    neighborhood: "Barrio",
    developer: "Constructora",
    bedrooms: "Habitaciones",
    bathrooms: "Baños mín.",
    parking: "Parqueaderos mín.",
    stratum: "Estrato",
    projectStatus: "Estado del proyecto",
    allNew: "Todos los nuevos",
    construction: "En construcción",
    preconstruction: "Sobre planos",
    immediate: "Entrega inmediata",
    coordinates: "Coordenadas",
    exact: "Exactas",
    approximate: "Aproximadas",
    favorites: "Favoritos",
    favoritesOnly: "Solo favoritos",
    priceMin: "Precio mín.",
    priceMax: "Precio máx.",
    areaMin: "Área mín.",
    areaMax: "Área máx.",
    inventory: "Inventario",
    listings: "Anuncios",
    salesInventory: "Ventas",
    rentalInventory: "Arriendos",
    projectInventory: "Proyectos",
    medianPrice: "Precio mediano",
    medianRent: "Canon mediano",
    medianPriceM2: "Mediana / m²",
    medianArea: "Área mediana",
    coverage: "Cobertura de datos",
    ofScope: "del ámbito",
    vsScope: "vs. su universo",
    areaKnown: "con área",
    stratumKnown: "con estrato",
    separated: "Los precios de venta y los cánones mensuales se calculan por separado.",
    salePrices: "Precios de venta",
    rentalPrices: "Cánones mensuales",
    priceDistribution: "Distribución de precios",
    priceDistributionHelp: "Selecciona un rango para abrir sus anuncios.",
    stratumInventory: "Inventario por estrato",
    bedroomInventory: "Inventario por habitaciones",
    scatter: "Precio vs. área",
    scatterHelp: "Muestra representativa; se excluye el 2% superior de precio y área.",
    rankings: "Comparación geográfica",
    minSample: "Muestra mínima",
    price: "Precio mediano",
    priceM2: "Precio / m²",
    export: "Exportar CSV",
    noGroups: "No hay grupos con la muestra mínima seleccionada.",
    rank: "Pos.",
    area: "Área",
    openListings: "Abrir anuncios",
    noResults: "No hay anuncios para esta combinación de filtros.",
    unknown: "Sin dato",
  },
  en: {
    title: "Market pulse",
    subtitle: "Filter the complete inventory and open any slice in its matching map.",
    scope: "Scope",
    all: "All",
    sales: "Sales",
    rentals: "Rentals",
    projects: "New projects",
    resale: "Resale / non-projects",
    filters: "Statistics filters",
    clear: "Clear",
    search: "Search",
    source: "Source",
    market: "Market",
    bogota: "Bogotá",
    sabana: "Metro area",
    locality: "Locality",
    municipality: "Municipality",
    neighborhood: "Neighborhood",
    developer: "Developer",
    bedrooms: "Bedrooms",
    bathrooms: "Min. bathrooms",
    parking: "Min. parking",
    stratum: "Stratum",
    projectStatus: "Project status",
    allNew: "All new projects",
    construction: "Under construction",
    preconstruction: "Pre-construction",
    immediate: "Immediate delivery",
    coordinates: "Coordinates",
    exact: "Exact",
    approximate: "Approximate",
    favorites: "Favorites",
    favoritesOnly: "Favorites only",
    priceMin: "Min. price",
    priceMax: "Max. price",
    areaMin: "Min. area",
    areaMax: "Max. area",
    inventory: "Inventory",
    listings: "Listings",
    salesInventory: "Sales",
    rentalInventory: "Rentals",
    projectInventory: "Projects",
    medianPrice: "Median price",
    medianRent: "Median monthly rent",
    medianPriceM2: "Median / m²",
    medianArea: "Median area",
    coverage: "Data coverage",
    ofScope: "of scope",
    vsScope: "vs. its universe",
    areaKnown: "with area",
    stratumKnown: "with stratum",
    separated: "Sale prices and monthly rents are calculated separately.",
    salePrices: "Sale prices",
    rentalPrices: "Monthly rents",
    priceDistribution: "Price distribution",
    priceDistributionHelp: "Select a range to open its listings.",
    stratumInventory: "Inventory by stratum",
    bedroomInventory: "Inventory by bedrooms",
    scatter: "Price vs. area",
    scatterHelp: "Representative sample; the top 2% of price and area is excluded.",
    rankings: "Geographic comparison",
    minSample: "Minimum sample",
    price: "Median price",
    priceM2: "Price / m²",
    export: "Export CSV",
    noGroups: "No groups meet the selected minimum sample.",
    rank: "Rank",
    area: "Area",
    openListings: "Open listings",
    noResults: "No listings match this filter combination.",
    unknown: "Unknown",
  },
} as const;

function percentage(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function change(value: number | null, baseline: number | null) {
  if (value === null || baseline === null || baseline === 0) return null;
  return ((value - baseline) / baseline) * 100;
}

function ChangeLabel({ value, locale, suffix }: { value: number | null; locale: Locale; suffix: string }) {
  if (value === null || Math.abs(value) < 0.05) {
    return <span className="text-slate-500 dark:text-slate-400">≈ {suffix}</span>;
  }
  const positive = value > 0;
  return (
    <span className={positive ? "inline-flex items-center gap-1 text-amber-700 dark:text-amber-300" : "inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300"}>
      {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {new Intl.NumberFormat(locale, { signDisplay: "always", maximumFractionDigits: 1 }).format(value)}% {suffix}
    </span>
  );
}

function MetricCard({ label, value, context }: { label: string; value: string; context: React.ReactNode }) {
  return (
    <Card className="gap-0 p-4">
      <span className="text-[10px] font-extrabold tracking-[0.11em] text-slate-500 uppercase dark:text-slate-400">{label}</span>
      <strong className="mt-2 block text-2xl tracking-[-0.045em] text-slate-950 dark:text-white">{value}</strong>
      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold">{context}</div>
    </Card>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-[10px] font-extrabold tracking-[0.07em] text-muted-foreground uppercase">
      {label}
      {children}
    </label>
  );
}

function uniqueOptions(listings: Listing[], value: (listing: Listing) => string | null | undefined, locale: Locale) {
  const options = new Map<string, string>();
  const score = (item: string) =>
    (/^[A-ZÁÉÍÓÚÑ]/.test(item) ? 2 : 0) +
    (/[áéíóúñÁÉÍÓÚÑ]/.test(item) ? 1 : 0);
  for (const listing of listings) {
    const item = value(listing)?.trim();
    if (!item) continue;
    const key = normalizeText(item);
    const current = options.get(key);
    if (!current || score(item) > score(current)) options.set(key, item);
  }
  return [...options.values()].sort((a, b) => a.localeCompare(b, locale));
}

function Distribution({ title, help, buckets, onSelect }: { title: string; help?: string; buckets: DistributionBucket[]; onSelect: (bucket: DistributionBucket) => void }) {
  const maximum = Math.max(...buckets.map((bucket) => bucket.count), 1);
  return (
    <section>
      <div className="mb-4">
        <h2 className="m-0 text-base font-bold tracking-[-0.025em]">{title}</h2>
        {help && <p className="mt-1 mb-0 text-xs text-slate-500 dark:text-slate-400">{help}</p>}
      </div>
      <div className="grid gap-2">
        {buckets.filter((bucket) => bucket.count > 0).map((bucket) => (
          <button key={bucket.id} type="button" className="group grid grid-cols-[minmax(72px,0.9fr)_minmax(80px,2fr)_42px] items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-emerald-500 sm:grid-cols-[minmax(105px,0.8fr)_minmax(120px,2fr)_60px] sm:gap-3" onClick={() => onSelect(bucket)} aria-label={`${bucket.label}: ${bucket.count}`}>
            <span className="truncate text-xs font-semibold">{bucket.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><span className="block h-full rounded-full bg-emerald-500 transition-[width] group-hover:bg-emerald-400" style={{ width: `${(bucket.count / maximum) * 100}%` }} /></span>
            <strong className="text-right font-mono text-xs">{bucket.count.toLocaleString()}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function PriceAreaScatter({ listings, locale, title, help }: { listings: Listing[]; locale: Locale; title: string; help: string }) {
  const points = useMemo(() => scatterSample(listings), [listings]);
  const width = 720;
  const height = 270;
  const padding = { top: 16, right: 18, bottom: 42, left: 74 };
  const maxArea = Math.max(...points.map((point) => point.areaM2 ?? 0), 1);
  const maxPrice = Math.max(...points.map((point) => point.priceCop), 1);
  const x = (area: number) => padding.left + (area / maxArea) * (width - padding.left - padding.right);
  const y = (price: number) => height - padding.bottom - (price / maxPrice) * (height - padding.top - padding.bottom);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <section>
      <h2 className="m-0 text-base font-bold tracking-[-0.025em]">{title}</h2>
      <p className="mt-1 mb-3 text-xs text-slate-500 dark:text-slate-400">{help}</p>
      <svg className="h-auto w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${points.length} points`}>
        <title>{title}</title>
        {ticks.map((tick) => { const value = maxPrice * tick; const position = y(value); return <g key={`y-${tick}`}><line x1={padding.left} x2={width - padding.right} y1={position} y2={position} stroke="currentColor" className="text-slate-200 dark:text-white/10" /><text x={padding.left - 10} y={position + 4} textAnchor="end" className="fill-slate-500 text-[10px] dark:fill-slate-400">{formatCompactCop(value, locale)}</text></g>; })}
        {ticks.map((tick) => { const value = maxArea * tick; const position = x(value); return <g key={`x-${tick}`}><line x1={position} x2={position} y1={padding.top} y2={height - padding.bottom} stroke="currentColor" className="text-slate-100 dark:text-white/5" /><text x={position} y={height - 16} textAnchor="middle" className="fill-slate-500 text-[10px] dark:fill-slate-400">{Math.round(value)} m²</text></g>; })}
        {points.map((point) => <circle key={point.id} cx={x(point.areaM2 ?? 0)} cy={y(point.priceCop)} r="3" className="fill-emerald-500/35 stroke-emerald-600/30 dark:fill-emerald-400/30 dark:stroke-emerald-300/30" />)}
      </svg>
    </section>
  );
}

function cleanStatsSearch(search: StatsSearch) {
  return Object.fromEntries(Object.entries(search).filter(([, value]) => value !== "" && value !== undefined)) as StatsSearch;
}

export function StatsDashboard({ salesListings, rentalListings, favoriteIds, search, locale, onSearchChange, onDrillDown }: Props) {
  const c = copy[locale];
  const scope: StatsScope = search.scope ?? "all";
  const [dimension, setDimension] = useState<GroupDimension>("neighborhood");
  const [minimumSample, setMinimumSample] = useState(20);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric>("pricePerM2");
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const allCatalogListings = useMemo(() => [...salesListings, ...rentalListings], [rentalListings, salesListings]);
  const query = useMemo(() => queryFromRouterSearch(search), [search]);
  const filteredSales = useMemo(() => {
    const filtered = filterListings(salesListings, query);
    return search.favorites === "only" ? filtered.filter((listing) => favoriteSet.has(listing.id)) : filtered;
  }, [favoriteSet, query, salesListings, search.favorites]);
  const filteredRentals = useMemo(() => {
    const filtered = filterListings(rentalListings, query);
    return search.favorites === "only" ? filtered.filter((listing) => favoriteSet.has(listing.id)) : filtered;
  }, [favoriteSet, query, rentalListings, search.favorites]);
  const baselineSales = useMemo(() => scope === "projects" ? salesListings.filter((listing) => listing.resultType === "Proyecto") : scope === "resale" ? salesListings.filter((listing) => listing.resultType === "Inmueble") : salesListings, [salesListings, scope]);
  const scopedSales = useMemo(() => scope === "projects" ? filteredSales.filter((listing) => listing.resultType === "Proyecto") : scope === "resale" ? filteredSales.filter((listing) => listing.resultType === "Inmueble") : filteredSales, [filteredSales, scope]);
  const listings = useMemo(
    () => scope === "rentals" ? filteredRentals : scope === "all" ? [...scopedSales, ...filteredRentals] : scopedSales,
    [filteredRentals, scopedSales, scope],
  );
  const baselineListings = scope === "rentals" ? rentalListings : scope === "all" ? allCatalogListings : baselineSales;
  const metrics = useMemo(() => summarizeListings(listings), [listings]);
  const baseline = useMemo(() => summarizeListings(baselineListings), [baselineListings]);
  const saleMetrics = useMemo(() => summarizeListings(scopedSales), [scopedSales]);
  const rentalMetrics = useMemo(() => summarizeListings(filteredRentals), [filteredRentals]);
  const projectMetrics = useMemo(() => summarizeListings(filteredSales.filter((listing) => listing.resultType === "Proyecto")), [filteredSales]);
  const activeKind: CatalogKind = scope === "rentals" ? "rentals" : "sales";
  const sourceOptions = useMemo(() => {
    const sources = new Map<string, string>();
    for (const listing of allCatalogListings) {
      sources.set(listing.source, listing.sourceName ?? listing.source);
      for (const evidence of listing.evidence ?? []) sources.set(evidence.source, evidence.sourceName);
    }
    return [...sources].sort(([, a], [, b]) => a.localeCompare(b, locale));
  }, [allCatalogListings, locale]);
  const localityOptions = useMemo(() => uniqueOptions(allCatalogListings, (listing) => listing.locality, locale), [allCatalogListings, locale]);
  const municipalityOptions = useMemo(() => uniqueOptions(allCatalogListings, (listing) => listing.municipality, locale), [allCatalogListings, locale]);
  const developerOptions = useMemo(() => uniqueOptions(salesListings, (listing) => listing.developerName, locale), [locale, salesListings]);
  const groups = useMemo(() => groupListings(listings, dimension, minimumSample), [dimension, listings, minimumSample]);
  const rankedGroups = useMemo(() => {
    const metric = scope === "all" ? "inventory" : rankingMetric;
    const value = (group: (typeof groups)[number]) => metric === "inventory" ? group.count : metric === "price" ? group.medianPrice ?? -1 : group.medianPricePerM2 ?? -1;
    return [...groups].sort((a, b) => value(b) - value(a)).slice(0, 15);
  }, [groups, rankingMetric, scope]);
  const hasFilters = Object.keys(cleanStatsSearch(search)).some((key) => key !== "scope") || scope !== "all";

  const update = (patch: Partial<StatsSearch>) => onSearchChange(cleanStatsSearch({ ...search, ...patch }));
  const drillQuery = (patch: Partial<SearchQuery> = {}) => {
    const next = { ...query, ...patch, useMapBounds: false, mapBounds: null };
    if (scope === "projects") { next.resultType = "Proyecto"; if (!next.projectStatus) next.projectStatus = "new"; }
    if (scope === "resale") next.resultType = "Inmueble";
    return next;
  };
  const drill = (kind: CatalogKind, patch: Partial<SearchQuery> = {}) => onDrillDown(kind, drillQuery(patch));
  const applyPriceBucket = (kind: CatalogKind, bucket: DistributionBucket) => drill(kind, { minPrice: bucket.min === undefined ? "" : String(bucket.min), maxPrice: bucket.max === undefined ? "" : String(bucket.max) });

  function downloadCsv() {
    const includePrices = scope !== "all";
    const fields = [c.rank, dimension === "locality" ? c.locality : c.neighborhood, c.inventory, ...(includePrices ? [c.price, c.priceM2, c.area] : [])];
    const rows = rankedGroups.map((group, index) => [index + 1, group.label, group.count, ...(includePrices ? [group.medianPrice, group.medianPricePerM2, group.medianArea] : [])]);
    const csv = [fields, ...rows].map((row) => row.map((cell) => { const value = String(cell ?? ""); return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`${csv}\n`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `casa-mapa-${scope}-${dimension}-stats.csv`; anchor.click(); URL.revokeObjectURL(url);
  }

  const translatedPriceBuckets = (rows: Listing[], kind: CatalogKind) => priceDistribution(rows, kind === "rentals" ? "rental" : "sale").map((bucket) => ({ ...bucket, label: locale === "es" ? bucket.label : bucket.label.replace("Hasta", "Up to").replace("Más de", "Over") }));
  const stratumBuckets = stratumDistribution(listings).map((bucket) => ({ ...bucket, label: locale === "es" ? bucket.label : bucket.value === "unknown" ? c.unknown : `Stratum ${bucket.value}` }));
  const bedroomBuckets = bedroomDistribution(listings).map((bucket) => ({ ...bucket, label: locale === "es" ? bucket.label : `${bucket.value === "7plus" ? "7+" : bucket.value} bedrooms` }));

  return (
    <section className="min-h-[calc(100vh-var(--topbar))] bg-background px-4 py-5 text-foreground max-[1024px]:min-h-[calc(100vh-var(--topbar)-56px)] max-[1024px]:pb-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <header>
          <span className="font-mono text-[10px] font-extrabold tracking-[0.14em] text-emerald-700 uppercase dark:text-emerald-300">{hasFilters ? c.filters : c.all}</span>
          <h1 className="mt-1 mb-0 text-3xl font-bold tracking-[-0.05em]">{c.title}</h1>
          <p className="mt-2 mb-0 max-w-2xl text-sm text-slate-600 dark:text-slate-300">{c.subtitle}</p>
        </header>

        <Card className="mt-6 gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 flex items-center gap-2 text-sm font-bold"><SlidersHorizontal size={17} /> {c.filters}</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => onSearchChange({})}><RotateCcw size={14} /> {c.clear}</Button>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <FilterField label={c.scope}><NativeSelect aria-label={c.scope} value={scope} onChange={(event) => update({ scope: event.target.value === "all" ? undefined : event.target.value as StatsScope, projectStatus: undefined, developer: undefined })}><option value="all">{c.all}</option><option value="sales">{c.sales}</option><option value="rentals">{c.rentals}</option><option value="projects">{c.projects}</option><option value="resale">{c.resale}</option></NativeSelect></FilterField>
            <FilterField label={c.search}><Input aria-label={c.search} value={search.text ?? ""} onChange={(event) => update({ text: event.target.value || undefined })} placeholder="Chicó, Cedritos…" /></FilterField>
            <FilterField label={c.source}><NativeSelect aria-label={c.source} value={search.source ?? ""} onChange={(event) => update({ source: event.target.value || undefined })}><option value="">{c.all}</option>{sourceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</NativeSelect></FilterField>
            <FilterField label={c.market}><NativeSelect aria-label={c.market} value={search.market ?? ""} onChange={(event) => update({ market: event.target.value || undefined })}><option value="">{c.all}</option><option value="bogota">{c.bogota}</option><option value="sabana">{c.sabana}</option></NativeSelect></FilterField>
            <FilterField label={c.locality}><NativeSelect aria-label={c.locality} value={search.locality ?? ""} onChange={(event) => update({ locality: event.target.value || undefined })}><option value="">{c.all}</option>{localityOptions.map((value) => <option key={value}>{value}</option>)}</NativeSelect></FilterField>
            <FilterField label={c.municipality}><NativeSelect aria-label={c.municipality} value={search.municipality ?? ""} onChange={(event) => update({ municipality: event.target.value || undefined })}><option value="">{c.all}</option>{municipalityOptions.map((value) => <option key={value}>{value}</option>)}</NativeSelect></FilterField>
            <FilterField label={c.neighborhood}><Input aria-label={c.neighborhood} value={search.neighborhood ?? ""} onChange={(event) => update({ neighborhood: event.target.value || undefined })} placeholder="Chicó, Cedritos…" /></FilterField>
            {scope === "projects" && <FilterField label={c.developer}><NativeSelect aria-label={c.developer} value={search.developer ?? ""} onChange={(event) => update({ developer: event.target.value || undefined })}><option value="">{c.all}</option>{developerOptions.map((value) => <option key={value}>{value}</option>)}</NativeSelect></FilterField>}
            <FilterField label={c.bedrooms}><NativeSelect aria-label={c.bedrooms} value={search.bedrooms ?? ""} onChange={(event) => update({ bedrooms: event.target.value || undefined })}><option value="">{c.all}</option>{[1,2,3,4,5,6].map((value) => <option key={value} value={value}>{value}</option>)}<option value="7plus">7+</option></NativeSelect></FilterField>
            <FilterField label={c.bathrooms}><NativeSelect aria-label={c.bathrooms} value={search.minBathrooms ?? ""} onChange={(event) => update({ minBathrooms: event.target.value || undefined })}><option value="">{c.all}</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value}+</option>)}</NativeSelect></FilterField>
            <FilterField label={c.parking}><NativeSelect aria-label={c.parking} value={search.minParking ?? ""} onChange={(event) => update({ minParking: event.target.value || undefined })}><option value="">{c.all}</option>{[1,2,3,4].map((value) => <option key={value} value={value}>{value}+</option>)}</NativeSelect></FilterField>
            <FilterField label={c.stratum}><NativeSelect aria-label={c.stratum} value={search.stratum ?? ""} onChange={(event) => update({ stratum: event.target.value || undefined })}><option value="">{c.all}</option>{[1,2,3,4,5,6].map((value) => <option key={value} value={value}>{value}</option>)}<option value="unknown">{c.unknown}</option></NativeSelect></FilterField>
            {scope === "projects" && <FilterField label={c.projectStatus}><NativeSelect aria-label={c.projectStatus} value={search.projectStatus ?? ""} onChange={(event) => update({ projectStatus: event.target.value || undefined })}><option value="">{c.allNew}</option><option value="construction">{c.construction}</option><option value="preconstruction">{c.preconstruction}</option><option value="immediate">{c.immediate}</option></NativeSelect></FilterField>}
            <FilterField label={c.coordinates}><NativeSelect aria-label={c.coordinates} value={search.coordinatePrecision ?? ""} onChange={(event) => update({ coordinatePrecision: event.target.value || undefined })}><option value="">{c.all}</option><option value="listing">{c.exact}</option><option value="neighborhood_centroid">{c.approximate}</option></NativeSelect></FilterField>
            <FilterField label={c.favorites}><NativeSelect aria-label={c.favorites} value={search.favorites ?? ""} onChange={(event) => update({ favorites: event.target.value === "only" ? "only" : undefined })}><option value="">{c.all}</option><option value="only">{c.favoritesOnly} ({favoriteIds.length})</option></NativeSelect></FilterField>
            {scope !== "all" && <FilterField label={c.priceMin}><Input aria-label={c.priceMin} inputMode="numeric" value={search.minPrice ?? ""} onChange={(event) => update({ minPrice: event.target.value || undefined })} /></FilterField>}
            {scope !== "all" && <FilterField label={c.priceMax}><Input aria-label={c.priceMax} inputMode="numeric" value={search.maxPrice ?? ""} onChange={(event) => update({ maxPrice: event.target.value || undefined })} /></FilterField>}
            <FilterField label={c.areaMin}><Input aria-label={c.areaMin} inputMode="decimal" value={search.minArea ?? ""} onChange={(event) => update({ minArea: event.target.value || undefined })} /></FilterField>
            <FilterField label={c.areaMax}><Input aria-label={c.areaMax} inputMode="decimal" value={search.maxArea ?? ""} onChange={(event) => update({ maxArea: event.target.value || undefined })} /></FilterField>
          </div>
        </Card>

        {listings.length === 0 ? <Card className="mt-6 grid min-h-44 place-items-center p-6 text-sm text-muted-foreground">{c.noResults}</Card> : <>
          {scope === "all" ? <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard label={c.inventory} value={metrics.count.toLocaleString()} context={<span className="text-muted-foreground">100% {c.ofScope}</span>} />
              <MetricCard label={c.salesInventory} value={saleMetrics.count.toLocaleString()} context={<span className="text-muted-foreground">{percentage(saleMetrics.count, metrics.count).toFixed(1)}% {c.ofScope}</span>} />
              <MetricCard label={c.rentalInventory} value={rentalMetrics.count.toLocaleString()} context={<span className="text-muted-foreground">{percentage(rentalMetrics.count, metrics.count).toFixed(1)}% {c.ofScope}</span>} />
              <MetricCard label={c.projectInventory} value={projectMetrics.count.toLocaleString()} context={<span className="text-muted-foreground">{percentage(projectMetrics.count, saleMetrics.count).toFixed(1)}% {c.sales.toLowerCase()}</span>} />
              <MetricCard label={c.coverage} value={`${percentage(metrics.knownAreaCount, metrics.count).toFixed(1)}%`} context={<span className="text-muted-foreground">{c.areaKnown} · {percentage(metrics.knownStratumCount, metrics.count).toFixed(1)}% {c.stratumKnown}</span>} />
            </div>
            <p className="mt-3 mb-0 text-xs font-semibold text-muted-foreground">{c.separated}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <MetricCard label={`${c.sales} · ${c.medianPrice}`} value={saleMetrics.medianPrice ? formatCompactCop(saleMetrics.medianPrice, locale) : "—"} context={<span className="text-muted-foreground">{saleMetrics.count.toLocaleString()} {c.listings.toLowerCase()}</span>} />
              <MetricCard label={`${c.rentals} · ${c.medianRent}`} value={rentalMetrics.medianPrice ? formatCompactCop(rentalMetrics.medianPrice, locale) : "—"} context={<span className="text-muted-foreground">{rentalMetrics.count.toLocaleString()} {c.listings.toLowerCase()}</span>} />
              <MetricCard label={`${c.projects} · ${c.medianPrice}`} value={projectMetrics.medianPrice ? formatCompactCop(projectMetrics.medianPrice, locale) : "—"} context={<span className="text-muted-foreground">{projectMetrics.count.toLocaleString()} {c.listings.toLowerCase()}</span>} />
            </div>
          </> : <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label={c.listings} value={metrics.count.toLocaleString()} context={<span className="text-muted-foreground">{percentage(metrics.count, baseline.count).toFixed(1)}% {c.ofScope}</span>} />
            <MetricCard label={activeKind === "rentals" ? c.medianRent : c.medianPrice} value={metrics.medianPrice ? formatCompactCop(metrics.medianPrice, locale) : "—"} context={<ChangeLabel value={change(metrics.medianPrice, baseline.medianPrice)} locale={locale} suffix={c.vsScope} />} />
            <MetricCard label={c.medianPriceM2} value={metrics.medianPricePerM2 ? `${formatCompactCop(metrics.medianPricePerM2, locale)}/m²` : "—"} context={<ChangeLabel value={change(metrics.medianPricePerM2, baseline.medianPricePerM2)} locale={locale} suffix={c.vsScope} />} />
            <MetricCard label={c.medianArea} value={metrics.medianArea ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(metrics.medianArea)} m²` : "—"} context={<ChangeLabel value={change(metrics.medianArea, baseline.medianArea)} locale={locale} suffix={c.vsScope} />} />
            <MetricCard label={c.coverage} value={`${percentage(metrics.knownAreaCount, metrics.count).toFixed(1)}%`} context={<span className="text-muted-foreground">{c.areaKnown} · {percentage(metrics.knownStratumCount, metrics.count).toFixed(1)}% {c.stratumKnown}</span>} />
          </div>}

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {scope === "all" ? <>
              <Card className="p-5"><Distribution title={c.salePrices} help={c.priceDistributionHelp} buckets={translatedPriceBuckets(scopedSales, "sales")} onSelect={(bucket) => applyPriceBucket("sales", bucket)} /></Card>
              <Card className="p-5"><Distribution title={c.rentalPrices} help={c.priceDistributionHelp} buckets={translatedPriceBuckets(filteredRentals, "rentals")} onSelect={(bucket) => applyPriceBucket("rentals", bucket)} /></Card>
            </> : <>
              <Card className="p-5"><Distribution title={c.priceDistribution} help={c.priceDistributionHelp} buckets={translatedPriceBuckets(listings, activeKind)} onSelect={(bucket) => applyPriceBucket(activeKind, bucket)} /></Card>
              <Card className="p-5"><PriceAreaScatter listings={listings} locale={locale} title={c.scatter} help={c.scatterHelp} /></Card>
            </>}
            {scope === "all" ? <>
              <Card className="p-5"><Distribution title={`${c.sales} · ${c.stratumInventory}`} buckets={stratumDistribution(scopedSales).map((bucket) => ({ ...bucket, label: locale === "es" ? bucket.label : bucket.value === "unknown" ? c.unknown : `Stratum ${bucket.value}` }))} onSelect={(bucket) => drill("sales", { stratum: bucket.value ?? "" })} /></Card>
              <Card className="p-5"><Distribution title={`${c.rentals} · ${c.stratumInventory}`} buckets={stratumDistribution(filteredRentals).map((bucket) => ({ ...bucket, label: locale === "es" ? bucket.label : bucket.value === "unknown" ? c.unknown : `Stratum ${bucket.value}` }))} onSelect={(bucket) => drill("rentals", { stratum: bucket.value ?? "" })} /></Card>
              <Card className="p-5"><Distribution title={`${c.sales} · ${c.bedroomInventory}`} buckets={bedroomDistribution(scopedSales).map((bucket) => ({ ...bucket, label: locale === "es" ? bucket.label : `${bucket.value === "7plus" ? "7+" : bucket.value} bedrooms` }))} onSelect={(bucket) => drill("sales", { bedrooms: bucket.value ?? "" })} /></Card>
              <Card className="p-5"><Distribution title={`${c.rentals} · ${c.bedroomInventory}`} buckets={bedroomDistribution(filteredRentals).map((bucket) => ({ ...bucket, label: locale === "es" ? bucket.label : `${bucket.value === "7plus" ? "7+" : bucket.value} bedrooms` }))} onSelect={(bucket) => drill("rentals", { bedrooms: bucket.value ?? "" })} /></Card>
            </> : <>
              <Card className="p-5"><Distribution title={c.stratumInventory} buckets={stratumBuckets} onSelect={(bucket) => drill(activeKind, { stratum: bucket.value ?? "" })} /></Card>
              <Card className="p-5"><Distribution title={c.bedroomInventory} buckets={bedroomBuckets} onSelect={(bucket) => drill(activeKind, { bedrooms: bucket.value ?? "" })} /></Card>
            </>}
          </div>

          {scope !== "all" && <Card className="mt-6 gap-0 py-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b p-5">
              <div><h2 className="m-0 flex items-center gap-2 text-lg font-bold"><MapPinned size={19} className="text-emerald-600" /> {c.rankings}</h2><p className="mt-1 mb-0 text-xs text-muted-foreground">{c.openListings}</p></div>
              <div className="flex flex-wrap items-end gap-2">
                <FilterField label={c.rankings}><NativeSelect value={dimension} onChange={(event) => setDimension(event.target.value as GroupDimension)}><option value="neighborhood">{c.neighborhood}</option><option value="locality">{c.locality}</option></NativeSelect></FilterField>
                <FilterField label={c.minSample}><NativeSelect value={minimumSample} onChange={(event) => setMinimumSample(Number(event.target.value))}>{[5,10,20,50].map((value) => <option key={value}>{value}</option>)}</NativeSelect></FilterField>
                <Button variant="outline" type="button" onClick={downloadCsv}><Download size={15} /> {c.export}</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 border-b px-5 py-3">{([ ["pricePerM2", c.priceM2], ["price", c.price], ["inventory", c.inventory] ] as const).map(([value, label]) => <Button type="button" key={value} aria-pressed={rankingMetric === value} variant={rankingMetric === value ? "default" : "ghost"} size="sm" onClick={() => setRankingMetric(value)}>{label}</Button>)}</div>
            {rankedGroups.length === 0 ? <div className="grid min-h-40 place-items-center p-6 text-sm text-muted-foreground">{c.noGroups}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-left text-xs"><thead><tr className="text-[10px] tracking-[0.08em] text-muted-foreground uppercase"><th className="px-5 py-3">{c.rank}</th><th className="px-3 py-3">{dimension === "locality" ? c.locality : c.neighborhood}</th><th className="px-3 py-3 text-right">{c.inventory}</th><th className="px-3 py-3 text-right">{c.price}</th><th className="px-3 py-3 text-right">{c.priceM2}</th><th className="px-5 py-3 text-right">{c.area}</th></tr></thead><tbody>{rankedGroups.map((group, index) => <tr key={group.label} className="border-t hover:bg-emerald-500/5"><td className="px-5 py-3 font-mono text-muted-foreground">{index + 1}</td><td className="px-3 py-3"><Button type="button" variant="link" className="h-auto p-0" onClick={() => drill(activeKind, dimension === "locality" ? { locality: group.label } : { neighborhood: group.label })}><Building2 size={15} /> {group.label}</Button></td><td className="px-3 py-3 text-right font-mono">{group.count.toLocaleString()}</td><td className="px-3 py-3 text-right font-mono">{group.medianPrice ? formatCop(group.medianPrice, locale) : "—"}</td><td className="px-3 py-3 text-right font-mono">{group.medianPricePerM2 ? formatCompactCop(group.medianPricePerM2, locale) : "—"}</td><td className="px-5 py-3 text-right font-mono">{group.medianArea ? `${group.medianArea.toFixed(1)} m²` : "—"}</td></tr>)}</tbody></table></div>}
          </Card>}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {scope === "all" ? <><Button size="lg" type="button" variant="outline" onClick={() => drill("rentals")}>{c.rentals} ({filteredRentals.length.toLocaleString()}) <ArrowRight size={16} /></Button><Button size="lg" type="button" onClick={() => drill("sales")}>{c.sales} ({scopedSales.length.toLocaleString()}) <ArrowRight size={16} /></Button></> : <Button size="lg" type="button" onClick={() => drill(activeKind)}>{c.openListings} ({listings.length.toLocaleString()}) <ArrowRight size={16} /></Button>}
          </div>
        </>}
      </div>
    </section>
  );
}
