import { describe, expect, it } from "vitest";
import {
  bedroomDistribution,
  groupListings,
  median,
  priceDistribution,
  scatterSample,
  stratumDistribution,
  summarizeListings,
} from "../app/lib/stats";
import type { Listing } from "../app/lib/types";

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  id: "FR-1",
  source: "fincaraiz",
  resultType: "Inmueble",
  projectName: null,
  neighborhood: "Chicó",
  locality: "Chapinero",
  zone: "Zona Norte",
  city: "Bogotá",
  priceCop: 900_000_000,
  areaM2: 100,
  pricePerM2: 9_000_000,
  bedrooms: 3,
  bathrooms: 2,
  parkingSpaces: 1,
  stratum: 6,
  latitude: 4.67,
  longitude: -74.05,
  coordinatePrecision: "listing",
  url: "https://www.fincaraiz.com.co/listing/1",
  fingerprint: "a",
  dataWarnings: [],
  ...overrides,
});

describe("statistics", () => {
  it("calculates medians and completeness", () => {
    expect(median([10, 30, 20, 40])).toBe(25);
    const metrics = summarizeListings([
      listing({ priceCop: 500, areaM2: 50, stratum: 4 }),
      listing({ id: "2", priceCop: 900, areaM2: null, stratum: null }),
      listing({ id: "3", priceCop: 700, areaM2: 70, stratum: 5 }),
    ]);
    expect(metrics).toMatchObject({
      count: 3,
      medianPrice: 700,
      medianArea: 60,
      knownAreaCount: 2,
      knownStratumCount: 2,
    });
  });

  it("counts projects with an unpublished price without treating it as zero", () => {
    const rows = [
      listing({ id: "known", priceCop: 600_000_000 }),
      listing({ id: "consult", priceCop: 0, pricePerM2: null }),
    ];
    expect(summarizeListings(rows)).toMatchObject({
      count: 2,
      medianPrice: 600_000_000,
    });
    expect(priceDistribution(rows).reduce((sum, bucket) => sum + bucket.count, 0))
      .toBe(1);
  });

  it("groups by geography and enforces a minimum sample", () => {
    const rows = [
      listing(),
      listing({ id: "2" }),
      listing({ id: "3", neighborhood: "Cedritos", locality: "Usaquén" }),
    ];
    expect(groupListings(rows, "neighborhood", 2)).toEqual([
      expect.objectContaining({ label: "Chicó", count: 2 }),
    ]);
    expect(groupListings(rows, "locality", 1)).toHaveLength(2);
  });

  it("creates clickable filter distributions without gaps", () => {
    const rows = [
      listing({ id: "one", bedrooms: 1 }),
      listing({ id: "two", bedrooms: 2 }),
      listing({ priceCop: 300_000_000, stratum: 3, bedrooms: 3 }),
      listing({
        id: "2",
        priceCop: 300_000_001,
        stratum: null,
        bedrooms: 7,
      }),
      listing({ id: "3", priceCop: 2_000_000_001, stratum: 6, bedrooms: 9 }),
    ];
    expect(priceDistribution(rows).reduce((sum, bucket) => sum + bucket.count, 0))
      .toBe(5);
    expect(
      stratumDistribution(rows).reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(5);
    expect(
      bedroomDistribution(rows).find((bucket) => bucket.value === "7plus")
        ?.count,
    ).toBe(2);
    expect(
      bedroomDistribution(rows).reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(5);
  });

  it("uses monthly-rent buckets independently from sale prices", () => {
    const rows = [
      listing({ id: "low-rent", priceCop: 2_000_000, operationType: "Arriendo" }),
      listing({ id: "mid-rent", priceCop: 4_000_001, operationType: "Arriendo" }),
      listing({ id: "high-rent", priceCop: 25_000_001, operationType: "Arriendo" }),
    ];
    const buckets = priceDistribution(rows, "rental");
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
    expect(buckets.find((bucket) => bucket.id === "rent-under-2")?.count).toBe(1);
    expect(buckets.find((bucket) => bucket.id === "rent-4-8")?.count).toBe(1);
    expect(buckets.find((bucket) => bucket.id === "rent-over-25")?.count).toBe(1);
  });

  it("downsamples scatter data and excludes top outliers", () => {
    const rows = Array.from({ length: 100 }, (_, index) =>
      listing({
        id: String(index),
        areaM2: index === 99 ? 10_000 : 50 + index,
        priceCop: index === 99 ? 100_000_000_000 : 400_000_000 + index,
      }),
    );
    const sample = scatterSample(rows, 20);
    expect(sample.length).toBe(20);
    expect(sample.some((row) => row.id === "99")).toBe(false);
  });
});
