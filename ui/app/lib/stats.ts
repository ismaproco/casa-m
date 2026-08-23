import type { Listing } from "./types";

export type ListingMetrics = {
  count: number;
  medianPrice: number | null;
  medianPricePerM2: number | null;
  medianArea: number | null;
  knownAreaCount: number;
  knownStratumCount: number;
};

export type GroupDimension = "neighborhood" | "locality";

export type GroupStat = {
  label: string;
  count: number;
  medianPrice: number | null;
  medianPricePerM2: number | null;
  medianArea: number | null;
};

export type DistributionBucket = {
  id: string;
  label: string;
  count: number;
  min?: number;
  max?: number;
  value?: string;
};

function finiteValues(values: Array<number | null | undefined>) {
  return values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
}

export function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(percentileValue * sorted.length) - 1),
  );
  return sorted[index];
}

export function summarizeListings(listings: Listing[]): ListingMetrics {
  const areas = finiteValues(listings.map((listing) => listing.areaM2));
  return {
    count: listings.length,
    medianPrice: median(finiteValues(listings.map((listing) => listing.priceCop))),
    medianPricePerM2: median(
      finiteValues(listings.map((listing) => listing.pricePerM2)),
    ),
    medianArea: median(areas),
    knownAreaCount: areas.length,
    knownStratumCount: listings.filter((listing) => listing.stratum !== null)
      .length,
  };
}

export function groupListings(
  listings: Listing[],
  dimension: GroupDimension,
  minimumSample = 20,
) {
  const groups = new Map<string, Listing[]>();
  for (const listing of listings) {
    const label = listing[dimension]?.trim();
    if (!label) continue;
    const rows = groups.get(label) ?? [];
    rows.push(listing);
    groups.set(label, rows);
  }

  return [...groups.entries()]
    .filter(([, rows]) => rows.length >= minimumSample)
    .map(([label, rows]): GroupStat => {
      const metrics = summarizeListings(rows);
      return {
        label,
        count: rows.length,
        medianPrice: metrics.medianPrice,
        medianPricePerM2: metrics.medianPricePerM2,
        medianArea: metrics.medianArea,
      };
    });
}

export function stratumDistribution(listings: Listing[]) {
  return ["1", "2", "3", "4", "5", "6", "unknown"].map(
    (value): DistributionBucket => ({
      id: `stratum-${value}`,
      label: value === "unknown" ? "Sin dato" : `Estrato ${value}`,
      value,
      count: listings.filter((listing) =>
        value === "unknown"
          ? listing.stratum === null
          : listing.stratum === Number(value),
      ).length,
    }),
  );
}

export function bedroomDistribution(listings: Listing[]) {
  const buckets = [
    { value: "1", label: "1 habitación" },
    { value: "2", label: "2 habitaciones" },
    { value: "3", label: "3 habitaciones" },
    { value: "4", label: "4 habitaciones" },
    { value: "5", label: "5 habitaciones" },
    { value: "6", label: "6 habitaciones" },
    { value: "7plus", label: "7+ habitaciones" },
  ];
  return buckets.map(
    ({ value, label }): DistributionBucket => ({
      id: `bedrooms-${value}`,
      label,
      value,
      count: listings.filter((listing) =>
        value === "7plus"
          ? listing.bedrooms >= 7
          : listing.bedrooms === Number(value),
      ).length,
    }),
  );
}

export function priceDistribution(listings: Listing[]) {
  const buckets: Array<DistributionBucket> = [
    { id: "price-under-300", label: "Hasta $300M", max: 300_000_000, count: 0 },
    {
      id: "price-300-500",
      label: "$300M–$500M",
      min: 300_000_001,
      max: 500_000_000,
      count: 0,
    },
    {
      id: "price-500-800",
      label: "$500M–$800M",
      min: 500_000_001,
      max: 800_000_000,
      count: 0,
    },
    {
      id: "price-800-1200",
      label: "$800M–$1.2B",
      min: 800_000_001,
      max: 1_200_000_000,
      count: 0,
    },
    {
      id: "price-1200-2000",
      label: "$1.2B–$2B",
      min: 1_200_000_001,
      max: 2_000_000_000,
      count: 0,
    },
    {
      id: "price-over-2000",
      label: "Más de $2B",
      min: 2_000_000_001,
      count: 0,
    },
  ];
  for (const listing of listings) {
    const bucket = buckets.find(
      ({ min, max }) =>
        (min === undefined || listing.priceCop >= min) &&
        (max === undefined || listing.priceCop <= max),
    );
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export function scatterSample(listings: Listing[], maximumPoints = 600) {
  const rows = listings.filter(
    (listing) =>
      listing.areaM2 !== null &&
      listing.areaM2 > 0 &&
      listing.priceCop > 0,
  );
  const areaCeiling = percentile(
    rows.map((listing) => listing.areaM2 as number),
    0.98,
  );
  const priceCeiling = percentile(
    rows.map((listing) => listing.priceCop),
    0.98,
  );
  const withoutOutliers = rows.filter(
    (listing) =>
      listing.areaM2! <= (areaCeiling ?? Infinity) &&
      listing.priceCop <= (priceCeiling ?? Infinity),
  );
  if (withoutOutliers.length <= maximumPoints) return withoutOutliers;
  const step = withoutOutliers.length / maximumPoints;
  return Array.from(
    { length: maximumPoints },
    (_, index) => withoutOutliers[Math.floor(index * step)],
  );
}
