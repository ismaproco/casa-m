import { formatCompactCop } from "./i18n";
import type { Locale } from "./types";

export const MAP_PRICE_BUCKET_SIZE = 250_000_000;
export const MAP_PRICE_OVERFLOW_MIN = 5_000_000_000;
export const MAP_RENTAL_PRICE_OVERFLOW_MIN = 50_000_000;

export const MAP_RENTAL_PRICE_THRESHOLDS = [
  0,
  1_200_000,
  1_500_000,
  1_800_000,
  2_100_000,
  2_500_000,
  3_000_000,
  3_500_000,
  4_000_000,
  4_500_000,
  5_000_000,
  6_000_000,
  7_000_000,
  8_000_000,
  10_000_000,
  12_000_000,
  15_000_000,
  18_000_000,
  22_000_000,
  30_000_000,
  MAP_RENTAL_PRICE_OVERFLOW_MIN,
] as const;

const MAP_PRICE_COLORS = [
  "#3b4cc0",
  "#4267c7",
  "#4380cc",
  "#3f98c9",
  "#35adc3",
  "#2bc0b5",
  "#32cfa0",
  "#54d884",
  "#7bdd67",
  "#a4dd4f",
  "#c9d83f",
  "#e6cd36",
  "#f6bb32",
  "#f9a12d",
  "#f78327",
  "#ed6422",
  "#db461f",
  "#c22d26",
  "#a51c35",
  "#861445",
  "#5f0f40",
] as const;

export type MapPriceBucket = {
  index: number;
  min: number;
  maxExclusive: number | null;
  color: string;
};

export type MapPriceScale = "sale" | "rental";

function rentalPriceBucket(priceCop: number): MapPriceBucket {
  if (priceCop >= MAP_RENTAL_PRICE_OVERFLOW_MIN) {
    return {
      index: MAP_PRICE_COLORS.length - 1,
      min: MAP_RENTAL_PRICE_OVERFLOW_MIN,
      maxExclusive: null,
      color: MAP_PRICE_COLORS.at(-1) as string,
    };
  }
  const index = Math.max(
    0,
    MAP_RENTAL_PRICE_THRESHOLDS.findIndex(
      (threshold, thresholdIndex) =>
        thresholdIndex < MAP_RENTAL_PRICE_THRESHOLDS.length - 1 &&
        priceCop >= threshold &&
        priceCop < MAP_RENTAL_PRICE_THRESHOLDS[thresholdIndex + 1],
    ),
  );
  return {
    index,
    min: MAP_RENTAL_PRICE_THRESHOLDS[index],
    maxExclusive: MAP_RENTAL_PRICE_THRESHOLDS[index + 1],
    color: MAP_PRICE_COLORS[index],
  };
}

export function mapPriceBucket(
  priceCop: number,
  scale: MapPriceScale = "sale",
): MapPriceBucket {
  if (scale === "rental") return rentalPriceBucket(priceCop);
  if (priceCop >= MAP_PRICE_OVERFLOW_MIN) {
    return {
      index: MAP_PRICE_COLORS.length - 1,
      min: MAP_PRICE_OVERFLOW_MIN,
      maxExclusive: null,
      color: MAP_PRICE_COLORS.at(-1) as string,
    };
  }

  const index = Math.max(
    0,
    Math.floor(priceCop / MAP_PRICE_BUCKET_SIZE),
  );
  return {
    index,
    min: index * MAP_PRICE_BUCKET_SIZE,
    maxExclusive: (index + 1) * MAP_PRICE_BUCKET_SIZE,
    color: MAP_PRICE_COLORS[index],
  };
}

export function mapPriceBucketLabel(
  priceCop: number,
  locale: Locale,
  scale: MapPriceScale = "sale",
) {
  const bucket = mapPriceBucket(priceCop, scale);
  const minimum = formatCompactCop(bucket.min, locale);
  if (bucket.maxExclusive === null) return `${minimum}+`;
  return `${minimum}–<${formatCompactCop(bucket.maxExclusive, locale)}`;
}
