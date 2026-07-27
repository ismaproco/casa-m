import { describe, expect, it } from "vitest";
import {
  MAP_PRICE_OVERFLOW_MIN,
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
});
