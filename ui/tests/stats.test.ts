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
      .toBe(3);
    expect(
      stratumDistribution(rows).reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(3);
    expect(
      bedroomDistribution(rows).find((bucket) => bucket.value === "7plus")
        ?.count,
    ).toBe(2);
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
