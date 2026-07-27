import { formatCompactCop } from "./i18n";
import type { Locale } from "./types";

export const MAP_PRICE_BUCKET_SIZE = 250_000_000;
export const MAP_PRICE_OVERFLOW_MIN = 5_000_000_000;

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

export function mapPriceBucket(priceCop: number): MapPriceBucket {
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

export function mapPriceBucketLabel(priceCop: number, locale: Locale) {
  const bucket = mapPriceBucket(priceCop);
  const minimum = formatCompactCop(bucket.min, locale);
  if (bucket.maxExclusive === null) return `${minimum}+`;
  return `${minimum}–<${formatCompactCop(bucket.maxExclusive, locale)}`;
}
