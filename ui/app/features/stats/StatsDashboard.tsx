import {
  ArrowRight,
  Building2,
  Download,
  MapPinned,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import type { Listing, Locale, SearchQuery } from "@/app/lib/types";
import { formatCompactCop, formatCop } from "@/app/lib/i18n";

type RankingMetric = "pricePerM2" | "price" | "inventory";

type Props = {
  allListings: Listing[];
  listings: Listing[];
  query: SearchQuery;
  locale: Locale;
  onApplyFilters: (patch: Partial<SearchQuery>) => void;
  onShowResults: () => void;
};

const text = {
  es: {
    title: "Pulso del mercado",
    subtitle:
      "Compara el segmento filtrado con Bogotá y la Sabana y abre cualquier corte en el mapa.",
    segment: "Segmento actual",
    allBogota: "Bogotá y Sabana",
    listings: "Anuncios",
    medianPrice: "Precio mediano",
    medianPriceM2: "Precio mediano / m²",
    medianArea: "Área mediana",
    coverage: "Cobertura de datos",
    ofCatalog: "del catálogo",
    vsBogota: "vs. catálogo",
    areaKnown: "con área",
    stratumKnown: "con estrato",
    seeListings: "Ver anuncios",
    priceDistribution: "Distribución de precios",
    priceDistributionHelp: "Selecciona un rango para abrir sus anuncios.",
    stratum: "Inventario por estrato",
    bedrooms: "Inventario por habitaciones",
    scatter: "Precio vs. área",
    scatterHelp:
      "Muestra representativa; se excluye el 2% superior de precio y área.",
    rankings: "Comparación geográfica",
    locality: "Localidad",
    neighborhood: "Barrio",
    minSample: "Muestra mínima",
    inventory: "Inventario",
    price: "Precio mediano",
    priceM2: "Precio / m²",
    export: "Exportar CSV",
    noGroups: "No hay grupos con la muestra mínima seleccionada.",
    rank: "Pos.",
    area: "Área",
    clickToExplore: "Abrir anuncios",
  },
  en: {
    title: "Market pulse",
    subtitle:
      "Compare the filtered segment with Bogotá and its metro area, then open any slice on the map.",
    segment: "Current segment",
    allBogota: "Bogotá + metro area",
    listings: "Listings",
    medianPrice: "Median price",
    medianPriceM2: "Median price / m²",
    medianArea: "Median area",
    coverage: "Data coverage",
    ofCatalog: "of catalog",
    vsBogota: "vs. catalog",
    areaKnown: "with area",
    stratumKnown: "with stratum",
    seeListings: "View listings",
    priceDistribution: "Price distribution",
    priceDistributionHelp: "Select a range to open its listings.",
    stratum: "Inventory by stratum",
    bedrooms: "Inventory by bedrooms",
    scatter: "Price vs. area",
    scatterHelp:
      "Representative sample; the top 2% of price and area is excluded.",
    rankings: "Geographic comparison",
    locality: "Locality",
    neighborhood: "Neighborhood",
    minSample: "Minimum sample",
    inventory: "Inventory",
    price: "Median price",
    priceM2: "Price / m²",
    export: "Export CSV",
    noGroups: "No groups meet the selected minimum sample.",
    rank: "Rank",
    area: "Area",
    clickToExplore: "Open listings",
  },
} as const;

function percentage(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function change(value: number | null, baseline: number | null) {
  if (value === null || baseline === null || baseline === 0) return null;
  return ((value - baseline) / baseline) * 100;
}

function ChangeLabel({
  value,
  locale,
  suffix,
}: {
  value: number | null;
  locale: Locale;
  suffix: string;
}) {
  if (value === null || Math.abs(value) < 0.05) {
    return <span className="text-slate-500 dark:text-slate-400">≈ {suffix}</span>;
  }
  const positive = value > 0;
  return (
    <span
      className={
        positive
          ? "text-amber-700 dark:text-amber-300"
          : "text-emerald-700 dark:text-emerald-300"
      }
    >
      {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {new Intl.NumberFormat(locale, {
        signDisplay: "always",
        maximumFractionDigits: 1,
      }).format(value)}
      % {suffix}
    </span>
  );
}

function MetricCard({
  label,
  value,
  context,
}: {
  label: string;
  value: string;
  context: React.ReactNode;
}) {
  return (
    <Card className="gap-0 p-4">
      <span className="text-[10px] font-extrabold tracking-[0.11em] text-slate-500 uppercase dark:text-slate-400">
        {label}
      </span>
      <strong className="mt-2 block text-2xl tracking-[-0.045em] text-slate-950 dark:text-white">
        {value}
      </strong>
      <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold">
        {context}
      </div>
    </Card>
  );
}

function Distribution({
  title,
  help,
  buckets,
  onSelect,
}: {
  title: string;
  help?: string;
  buckets: DistributionBucket[];
  onSelect: (bucket: DistributionBucket) => void;
}) {
  const maximum = Math.max(...buckets.map((bucket) => bucket.count), 1);
  return (
    <section>
      <div className="mb-4">
        <h2 className="m-0 text-base font-bold tracking-[-0.025em]">{title}</h2>
        {help && (
          <p className="mt-1 mb-0 text-xs text-slate-500 dark:text-slate-400">
            {help}
          </p>
        )}
      </div>
      <div className="grid gap-2">
        {buckets
          .filter((bucket) => bucket.count > 0)
          .map((bucket) => (
            <button
              key={bucket.id}
              type="button"
              className="group grid grid-cols-[minmax(72px,0.9fr)_minmax(80px,2fr)_42px] items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-emerald-500 sm:grid-cols-[minmax(105px,0.8fr)_minmax(120px,2fr)_60px] sm:gap-3"
              onClick={() => onSelect(bucket)}
              aria-label={`${bucket.label}: ${bucket.count}`}
            >
              <span className="truncate text-xs font-semibold">
                {bucket.label}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                <span
                  className="block h-full rounded-full bg-emerald-500 transition-[width] group-hover:bg-emerald-400"
                  style={{ width: `${(bucket.count / maximum) * 100}%` }}
                />
              </span>
              <strong className="text-right font-mono text-xs">
                {bucket.count.toLocaleString()}
              </strong>
            </button>
          ))}
      </div>
    </section>
  );
}

function PriceAreaScatter({
  listings,
  locale,
  title,
  help,
}: {
  listings: Listing[];
  locale: Locale;
  title: string;
  help: string;
}) {
  const points = useMemo(() => scatterSample(listings), [listings]);
  const width = 720;
  const height = 270;
  const padding = { top: 16, right: 18, bottom: 42, left: 74 };
  const maxArea = Math.max(...points.map((point) => point.areaM2 ?? 0), 1);
  const maxPrice = Math.max(...points.map((point) => point.priceCop), 1);
  const x = (area: number) =>
    padding.left +
    (area / maxArea) * (width - padding.left - padding.right);
  const y = (price: number) =>
    height -
    padding.bottom -
    (price / maxPrice) * (height - padding.top - padding.bottom);
  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section>
      <h2 className="m-0 text-base font-bold tracking-[-0.025em]">{title}</h2>
      <p className="mt-1 mb-3 text-xs text-slate-500 dark:text-slate-400">
        {help}
      </p>
      <svg
        className="h-auto w-full overflow-visible"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${title}: ${points.length} points`}
      >
        <title>{title}</title>
        {yTicks.map((tick) => {
          const value = maxPrice * tick;
          const position = y(value);
          return (
            <g key={`y-${tick}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={position}
                y2={position}
                stroke="currentColor"
                className="text-slate-200 dark:text-white/10"
              />
              <text
                x={padding.left - 10}
                y={position + 4}
                textAnchor="end"
                className="fill-slate-500 text-[10px] dark:fill-slate-400"
              >
                {formatCompactCop(value, locale)}
              </text>
            </g>
          );
        })}
        {xTicks.map((tick) => {
          const value = maxArea * tick;
          const position = x(value);
          return (
            <g key={`x-${tick}`}>
              <line
                x1={position}
                x2={position}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke="currentColor"
                className="text-slate-100 dark:text-white/5"
              />
              <text
                x={position}
                y={height - 16}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] dark:fill-slate-400"
              >
                {Math.round(value)} m²
              </text>
            </g>
          );
        })}
        {points.map((point) => (
          <circle
            key={point.id}
            cx={x(point.areaM2 ?? 0)}
            cy={y(point.priceCop)}
            r="3"
            className="fill-emerald-500/35 stroke-emerald-600/30 dark:fill-emerald-400/30 dark:stroke-emerald-300/30"
          />
        ))}
      </svg>
    </section>
  );
}

export function StatsDashboard({
  allListings,
  listings,
  query,
  locale,
  onApplyFilters,
  onShowResults,
}: Props) {
  const c = text[locale];
  const [dimension, setDimension] = useState<GroupDimension>("neighborhood");
  const [minimumSample, setMinimumSample] = useState(20);
  const [rankingMetric, setRankingMetric] =
    useState<RankingMetric>("pricePerM2");

  const metrics = useMemo(() => summarizeListings(listings), [listings]);
  const baseline = useMemo(
    () => summarizeListings(allListings),
    [allListings],
  );
  const groups = useMemo(
    () => groupListings(listings, dimension, minimumSample),
    [dimension, listings, minimumSample],
  );
  const priceBuckets = useMemo(
    () =>
      priceDistribution(listings).map((bucket, index) => ({
        ...bucket,
        label:
          locale === "es"
            ? bucket.label
            : [
                "Up to $300M",
                "$300M–$500M",
                "$500M–$800M",
                "$800M–$1.2B",
                "$1.2B–$2B",
                "Over $2B",
              ][index],
      })),
    [listings, locale],
  );
  const stratumBuckets = useMemo(
    () =>
      stratumDistribution(listings).map((bucket) => ({
        ...bucket,
        label:
          locale === "es"
            ? bucket.label
            : bucket.value === "unknown"
              ? "Unknown"
              : `Stratum ${bucket.value}`,
      })),
    [listings, locale],
  );
  const bedroomBuckets = useMemo(
    () =>
      bedroomDistribution(listings).map((bucket) => ({
        ...bucket,
        label:
          locale === "es"
            ? bucket.label
            : `${bucket.value === "7plus" ? "7+" : bucket.value} bedrooms`,
      })),
    [listings, locale],
  );
  const rankedGroups = useMemo(() => {
    const value = (group: (typeof groups)[number]) => {
      if (rankingMetric === "inventory") return group.count;
      if (rankingMetric === "price") return group.medianPrice ?? -1;
      return group.medianPricePerM2 ?? -1;
    };
    return [...groups].sort((a, b) => value(b) - value(a)).slice(0, 15);
  }, [groups, rankingMetric]);

  const hasFilters =
    listings.length !== allListings.length ||
    Object.entries(query).some(
      ([key, value]) =>
        key !== "sort" &&
        key !== "mapBounds" &&
        key !== "useMapBounds" &&
        value !== "" &&
        value !== false &&
        value !== null,
    );

  function downloadCsv() {
    const fields = [
      c.rank,
      dimension === "locality" ? c.locality : c.neighborhood,
      c.inventory,
      c.price,
      c.priceM2,
      c.area,
    ];
    const rows = rankedGroups.map((group, index) => [
      index + 1,
      group.label,
      group.count,
      group.medianPrice,
      group.medianPricePerM2,
      group.medianArea,
    ]);
    const csv = [fields, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const value = cell ?? "";
            const string = String(value);
            return /[",\n]/.test(string)
              ? `"${string.replace(/"/g, '""')}"`
              : string;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${csv}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `casa-mapa-${dimension}-stats.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const applyPriceBucket = (bucket: DistributionBucket) => {
    onApplyFilters({
      minPrice: bucket.min === undefined ? "" : String(bucket.min),
      maxPrice: bucket.max === undefined ? "" : String(bucket.max),
    });
  };

  return (
    <section className="min-h-[calc(100vh-var(--topbar))] bg-background px-4 py-5 text-foreground max-[1024px]:min-h-[calc(100vh-var(--topbar)-56px)] max-[1024px]:pb-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1480px]">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] font-extrabold tracking-[0.14em] text-emerald-700 uppercase dark:text-emerald-300">
              {hasFilters ? c.segment : c.allBogota}
            </span>
            <h1 className="mt-1 mb-0 text-3xl font-bold tracking-[-0.05em]">
              {c.title}
            </h1>
            <p className="mt-2 mb-0 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              {c.subtitle}
            </p>
          </div>
          <Button
            size="lg"
            type="button"
            onClick={onShowResults}
          >
            {c.seeListings} ({listings.length.toLocaleString()})
            <ArrowRight size={16} />
          </Button>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label={c.listings}
            value={metrics.count.toLocaleString()}
            context={
              <span className="text-slate-500 dark:text-slate-400">
                {percentage(metrics.count, baseline.count).toFixed(1)}%{" "}
                {c.ofCatalog}
              </span>
            }
          />
          <MetricCard
            label={c.medianPrice}
            value={
              metrics.medianPrice
                ? formatCompactCop(metrics.medianPrice, locale)
                : "—"
            }
            context={
              <ChangeLabel
                value={change(metrics.medianPrice, baseline.medianPrice)}
                locale={locale}
                suffix={c.vsBogota}
              />
            }
          />
          <MetricCard
            label={c.medianPriceM2}
            value={
              metrics.medianPricePerM2
                ? `${formatCompactCop(metrics.medianPricePerM2, locale)}/m²`
                : "—"
            }
            context={
              <ChangeLabel
                value={change(
                  metrics.medianPricePerM2,
                  baseline.medianPricePerM2,
                )}
                locale={locale}
                suffix={c.vsBogota}
              />
            }
          />
          <MetricCard
            label={c.medianArea}
            value={
              metrics.medianArea
                ? `${new Intl.NumberFormat(locale, {
                    maximumFractionDigits: 1,
                  }).format(metrics.medianArea)} m²`
                : "—"
            }
            context={
              <ChangeLabel
                value={change(metrics.medianArea, baseline.medianArea)}
                locale={locale}
                suffix={c.vsBogota}
              />
            }
          />
          <MetricCard
            label={c.coverage}
            value={`${percentage(metrics.knownAreaCount, metrics.count).toFixed(1)}%`}
            context={
              <span className="text-slate-500 dark:text-slate-400">
                {c.areaKnown} ·{" "}
                {percentage(metrics.knownStratumCount, metrics.count).toFixed(1)}
                % {c.stratumKnown}
              </span>
            }
          />
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <Card className="p-5">
            <Distribution
              title={c.priceDistribution}
              help={c.priceDistributionHelp}
              buckets={priceBuckets}
              onSelect={applyPriceBucket}
            />
          </Card>
          <Card className="p-5">
            <PriceAreaScatter
              listings={listings}
              locale={locale}
              title={c.scatter}
              help={c.scatterHelp}
            />
          </Card>
          <Card className="p-5">
            <Distribution
              title={c.stratum}
              buckets={stratumBuckets}
              onSelect={(bucket) =>
                onApplyFilters({ stratum: bucket.value ?? "" })
              }
            />
          </Card>
          <Card className="p-5">
            <Distribution
              title={c.bedrooms}
              buckets={bedroomBuckets}
              onSelect={(bucket) =>
                onApplyFilters({ bedrooms: bucket.value ?? "" })
              }
            />
          </Card>
        </div>

        <Card className="mt-6 gap-0 py-0">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-5 dark:border-white/10">
            <div>
              <h2 className="m-0 flex items-center gap-2 text-lg font-bold tracking-[-0.03em]">
                <MapPinned size={19} className="text-emerald-600" />
                {c.rankings}
              </h2>
              <p className="mt-1 mb-0 text-xs text-slate-500 dark:text-slate-400">
                {c.clickToExplore}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-[10px] font-extrabold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400">
                {c.rankings}
                <NativeSelect
                  className="w-full"
                  value={dimension}
                  onChange={(event) =>
                    setDimension(event.target.value as GroupDimension)
                  }
                >
                  <option value="neighborhood">{c.neighborhood}</option>
                  <option value="locality">{c.locality}</option>
                </NativeSelect>
              </label>
              <label className="grid gap-1 text-[10px] font-extrabold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400">
                {c.minSample}
                <NativeSelect
                  className="w-full"
                  value={minimumSample}
                  onChange={(event) =>
                    setMinimumSample(Number(event.target.value))
                  }
                >
                  {[5, 10, 20, 50].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <Button
                variant="outline"
                type="button"
                onClick={downloadCsv}
              >
                <Download size={15} />
                {c.export}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-slate-200 px-5 py-3 dark:border-white/10">
            {(
              [
                ["pricePerM2", c.priceM2],
                ["price", c.price],
                ["inventory", c.inventory],
              ] as const
            ).map(([value, label]) => (
              <Button
                type="button"
                key={value}
                aria-pressed={rankingMetric === value}
                variant={rankingMetric === value ? "default" : "ghost"}
                size="sm"
                onClick={() => setRankingMetric(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          {rankedGroups.length === 0 ? (
            <div className="grid min-h-40 place-items-center p-6 text-sm text-slate-500">
              {c.noGroups}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead>
                  <tr className="text-[10px] tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400">
                    <th className="px-5 py-3">{c.rank}</th>
                    <th className="px-3 py-3">
                      {dimension === "locality" ? c.locality : c.neighborhood}
                    </th>
                    <th className="px-3 py-3 text-right">{c.inventory}</th>
                    <th className="px-3 py-3 text-right">{c.price}</th>
                    <th className="px-3 py-3 text-right">{c.priceM2}</th>
                    <th className="px-5 py-3 text-right">{c.area}</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedGroups.map((group, index) => (
                    <tr
                      key={group.label}
                      className="border-t border-slate-100 hover:bg-emerald-500/5 dark:border-white/5"
                    >
                      <td className="px-5 py-3 font-mono text-slate-500">
                        {index + 1}
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0"
                          onClick={() =>
                            onApplyFilters({ text: group.label })
                          }
                        >
                          <Building2 size={15} />
                          {group.label}
                        </Button>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {group.count.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {group.medianPrice
                          ? formatCop(group.medianPrice, locale)
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono">
                        {group.medianPricePerM2
                          ? formatCompactCop(group.medianPricePerM2, locale)
                          : "—"}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        {group.medianArea
                          ? `${group.medianArea.toFixed(1)} m²`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {hasFilters && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <SlidersHorizontal size={14} />
            {c.segment}: {listings.length.toLocaleString()} /{" "}
            {allListings.length.toLocaleString()}
          </div>
        )}
      </div>
    </section>
  );
}
