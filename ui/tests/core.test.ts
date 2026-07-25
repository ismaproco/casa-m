import { describe, expect, it } from "vitest";
import {
  compareSnapshot,
  createSnapshot,
  filterListings,
  listingMatches,
  normalizeText,
} from "../app/lib/core";
import type { Listing, SearchQuery } from "../app/lib/types";
import { DEFAULT_QUERY } from "../app/lib/core";

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  id: "M-1",
  resultType: "Inmueble",
  projectName: null,
  neighborhood: "Chicó Reservado",
  city: "Bogotá D.C.",
  priceCop: 900_000_000,
  areaM2: 120,
  pricePerM2: 7_500_000,
  bedrooms: 3,
  bathrooms: 2,
  parkingSpaces: 2,
  stratum: 6,
  latitude: 4.67,
  longitude: -74.05,
  coordinatePrecision: "listing",
  url: "https://example.com/M-1",
  fingerprint: "a",
  dataWarnings: [],
  ...overrides,
});

const query = (overrides: Partial<SearchQuery> = {}): SearchQuery => ({
  ...DEFAULT_QUERY,
  ...overrides,
});

describe("catalog filtering", () => {
  it("normalizes accents and case", () => {
    expect(normalizeText("CHICÓ")).toBe("chico");
    expect(
      listingMatches(listing(), query({ text: "chico reservado" })),
    ).toBe(true);
  });

  it("combines numeric, type, and stratum filters", () => {
    expect(
      listingMatches(
        listing(),
        query({
          minPrice: "800000000",
          maxPrice: "1000000000",
          minArea: "100",
          bedrooms: "3",
          minBathrooms: "2",
          minParking: "2",
          resultType: "Inmueble",
          stratum: "6",
        }),
      ),
    ).toBe(true);
  });

  it("filters to active map bounds", () => {
    expect(
      listingMatches(
        listing(),
        query({
          useMapBounds: true,
          mapBounds: { west: -74.06, south: 4.66, east: -74.04, north: 4.68 },
        }),
      ),
    ).toBe(true);
    expect(
      listingMatches(
        listing(),
        query({
          useMapBounds: true,
          mapBounds: { west: -74.2, south: 4.5, east: -74.1, north: 4.6 },
        }),
      ),
    ).toBe(false);
  });

  it("sorts null area values last", () => {
    const values = filterListings(
      [listing({ id: "a", areaM2: null }), listing({ id: "b", areaM2: 200 })],
      query({ sort: "areaDesc" }),
    );
    expect(values.map((value) => value.id)).toEqual(["b", "a"]);
  });
});

describe("saved search changes", () => {
  it("detects additions, material changes, and removals", () => {
    const previous = createSnapshot([
      listing({ id: "kept", fingerprint: "old" }),
      listing({ id: "removed", fingerprint: "x" }),
    ]);
    const updates = compareSnapshot(previous, [
      listing({ id: "kept", fingerprint: "new" }),
      listing({ id: "added", fingerprint: "a" }),
    ]);
    expect(updates.added.map((value) => value.id)).toEqual(["added"]);
    expect(updates.changed.map((value) => value.id)).toEqual(["kept"]);
    expect(updates.removed.map((value) => value.id)).toEqual(["removed"]);
  });
});
