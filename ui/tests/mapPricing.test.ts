import { describe, expect, it } from "vitest";
import {
  MAP_PRICE_OVERFLOW_MIN,
  MAP_RENTAL_PRICE_OVERFLOW_MIN,
  MAP_RENTAL_PRICE_THRESHOLDS,
  mapPriceBucket,
  mapPriceBucketLabel,
} from "../app/lib/mapPricing";

describe("map price buckets", () => {
  it("puts exact COP 250M boundaries in the next bucket", () => {
    expect(mapPriceBucket(249_999_999)).toMatchObject({
      index: 0,
      min: 0,
      maxExclusive: 250_000_000,
    });
    expect(mapPriceBucket(250_000_000)).toMatchObject({
      index: 1,
      min: 250_000_000,
      maxExclusive: 500_000_000,
    });
  });

  it("uses one overflow bucket from COP 5B upward", () => {
    const threshold = mapPriceBucket(MAP_PRICE_OVERFLOW_MIN);
    const extreme = mapPriceBucket(5_500_000_000_000);

    expect(threshold).toMatchObject({
      min: MAP_PRICE_OVERFLOW_MIN,
      maxExclusive: null,
    });
    expect(extreme).toEqual(threshold);
  });

  it("assigns a unique color to every bucket below COP 5B", () => {
    const colors = Array.from({ length: 20 }, (_, index) =>
      mapPriceBucket(index * 250_000_000).color,
    );

    expect(new Set(colors).size).toBe(colors.length);
  });

  it("formats ranges and overflow labels for the tooltip", () => {
    expect(mapPriceBucketLabel(620_000_000, "en")).toContain("500M");
    expect(mapPriceBucketLabel(620_000_000, "en")).toContain("750M");
    expect(mapPriceBucketLabel(6_000_000_000, "en")).toContain("5B+");
  });

  it("uses an independent percentile-calibrated monthly rental scale", () => {
    expect(MAP_RENTAL_PRICE_THRESHOLDS).toHaveLength(21);
    expect(
      new Set(
        MAP_RENTAL_PRICE_THRESHOLDS.map(
          (threshold) => mapPriceBucket(threshold, "rental").color,
        ),
      ).size,
    ).toBe(21);
    expect(mapPriceBucket(1_199_999, "rental")).toMatchObject({
      index: 0,
      min: 0,
      maxExclusive: 1_200_000,
    });
    expect(mapPriceBucket(1_200_000, "rental")).toMatchObject({
      index: 1,
      min: 1_200_000,
      maxExclusive: 1_500_000,
    });
    expect(mapPriceBucket(4_250_000, "rental")).toMatchObject({
      min: 4_000_000,
      maxExclusive: 4_500_000,
    });
    expect(mapPriceBucket(4_250_000, "rental").color).not.toBe(
      mapPriceBucket(4_250_000, "sale").color,
    );
  });

  it("uses a rental overflow color from COP 50M and labels monthly ranges", () => {
    expect(mapPriceBucket(MAP_RENTAL_PRICE_OVERFLOW_MIN, "rental")).toMatchObject({
      min: MAP_RENTAL_PRICE_OVERFLOW_MIN,
      maxExclusive: null,
    });
    expect(mapPriceBucket(2_000_000_000, "rental")).toEqual(
      mapPriceBucket(MAP_RENTAL_PRICE_OVERFLOW_MIN, "rental"),
    );
    expect(mapPriceBucketLabel(4_250_000, "es", "rental")).toMatch(/4\s*M/);
    expect(mapPriceBucketLabel(4_250_000, "es", "rental")).toMatch(/4,5\s*M/);
    expect(
      mapPriceBucketLabel(MAP_RENTAL_PRICE_OVERFLOW_MIN, "en", "rental"),
    ).toMatch(/50\s*M\+/);
  });
});
