import { describe, expect, it } from "vitest";
import {
  compareSnapshot,
  createSnapshot,
  filterListings,
  listingMatches,
  normalizeText,
  queryFromRouterSearch,
  queryToRouterSearch,
  validateExploreSearch,
  validateStatsSearch,
} from "../app/lib/core";
import type { Listing, SearchQuery } from "../app/lib/types";
import { DEFAULT_QUERY } from "../app/lib/core";

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  id: "M-1",
  source: "metrocuadrado",
  resultType: "Inmueble",
  projectName: null,
  neighborhood: "Chicó Reservado",
  locality: "Chapinero",
  zone: "Zona Norte",
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

  it("matches a project by developer name", () => {
    expect(
      listingMatches(
        listing({
          resultType: "Proyecto",
          projectName: "Proyecto regional",
          developerName: "Constructora Bolívar",
        }),
        query({ text: "constructora bolivar" }),
      ),
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
          source: "metrocuadrado",
          stratum: "6",
        }),
      ),
    ).toBe(true);
  });

  it("keeps projects with an unpublished price unless a price filter is active", () => {
    const consultPriceProject = listing({
      resultType: "Proyecto",
      projectName: "Laurel Bosques de La Calera",
      priceCop: 0,
      pricePerM2: null,
      areaM2: null,
      typologies: [],
    });
    expect(listingMatches(consultPriceProject, query())).toBe(true);
    expect(
      listingMatches(consultPriceProject, query({ maxPrice: "500000000" })),
    ).toBe(false);
  });

  it("filters by catalog source", () => {
    expect(
      listingMatches(listing(), query({ source: "metrocuadrado" })),
    ).toBe(true);
    expect(
      listingMatches(listing(), query({ source: "fincaraiz" })),
    ).toBe(false);
    expect(
      listingMatches(
        listing({ source: "myhome" }),
        query({ source: "myhome" }),
      ),
    ).toBe(true);
    expect(
      listingMatches(
        listing({ source: "amarilo", resultType: "Proyecto" }),
        query({ source: "amarilo", resultType: "Proyecto" }),
      ),
    ).toBe(true);
  });

  it("matches exact URL-backed statistics drill-down fields", () => {
    const row = listing({
      locality: "Chapinero",
      neighborhood: "Chicó",
      municipality: "Bogotá",
      developerName: "Constructora Bolívar",
      coordinatePrecision: "listing",
    });
    expect(listingMatches(row, query({
      locality: "chapinero",
      neighborhood: "chico",
      municipality: "Bogotá",
      developer: "Constructora Bolívar",
      coordinatePrecision: "listing",
    }))).toBe(true);
    expect(listingMatches(row, query({ locality: "Usaquén" }))).toBe(false);
  });

  it("filters Bogotá and Sabana projects and matches any apartment typology", () => {
    const sabanaProject = listing({
      source: "arquitectura-y-concreto",
      sourceName: "Arquitectura y Concreto",
      resultType: "Proyecto",
      market: "sabana",
      municipality: "Chía",
      typologies: [
        {
          id: "type-1",
          name: "62 m²",
          areaM2: 62,
          privateAreaM2: 55.5,
          bedrooms: 2,
          bathrooms: 2,
          parkingSpaces: 1,
          priceCop: 320_000_000,
          priceNote: null,
          description: null,
          source: "arquitectura-y-concreto",
          sourceName: "Arquitectura y Concreto",
          sourceUrl: "https://example.com/project",
          sourceKind: "official",
        },
        {
          id: "type-2",
          name: "80 m²",
          areaM2: 80,
          privateAreaM2: 72,
          bedrooms: 3,
          bathrooms: 2,
          parkingSpaces: 1,
          priceCop: 450_000_000,
          priceNote: null,
          description: null,
          source: "arquitectura-y-concreto",
          sourceName: "Arquitectura y Concreto",
          sourceUrl: "https://example.com/project",
          sourceKind: "official",
        },
      ],
    });

    expect(listingMatches(sabanaProject, query({ market: "sabana" }))).toBe(true);
    expect(listingMatches(sabanaProject, query({ market: "bogota" }))).toBe(false);
    expect(
      listingMatches(
        sabanaProject,
        query({ bedrooms: "3", minArea: "75", maxPrice: "500000000" }),
      ),
    ).toBe(true);
  });

  it("filters new projects by their verified sale status", () => {
    const construction = listing({
      resultType: "Proyecto",
      projectStatus: "En construcción",
    });
    const onPlan = listing({
      id: "M-2",
      resultType: "Proyecto",
      projectStatus: "Sobre planos",
    });
    const immediate = listing({
      id: "M-3",
      resultType: "Proyecto",
      projectStatus: "Entrega inmediata",
    });
    const statusPending = listing({
      id: "M-4",
      resultType: "Proyecto",
      projectStatus: null,
    });
    const regularListing = listing({
      id: "M-5",
      resultType: "Inmueble",
      projectStatus: "En construcción",
    });

    expect(
      filterListings(
        [construction, onPlan, immediate, statusPending, regularListing],
        query({ projectStatus: "new" }),
      ).map((value) => value.id),
    ).toEqual(["M-1", "M-2", "M-3", "M-4"]);
    expect(
      filterListings(
        [construction, onPlan, immediate],
        query({ projectStatus: "construction" }),
      ).map((value) => value.id),
    ).toEqual(["M-1"]);
    expect(
      listingMatches(onPlan, query({ projectStatus: "preconstruction" })),
    ).toBe(true);
    expect(
      listingMatches(immediate, query({ projectStatus: "immediate" })),
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

describe("explore route search", () => {
  it("rejects invalid enum and numeric values", () => {
    expect(
      validateExploreSearch({
        sort: "random",
        stratum: "9",
        bedrooms: "0",
        minPrice: "-5",
        maxArea: "large",
        resultType: "House",
        projectStatus: "finished",
        source: "unknown-source",
        market: "outside",
      }),
    ).toEqual({});
    expect(
      queryFromRouterSearch({
        sort: "random",
        stratum: "9",
        minPrice: "-5",
      }),
    ).toEqual(DEFAULT_QUERY);
  });

  it("round-trips filters without transient map state", () => {
    const source = query({
      text: "Chicó",
      minPrice: "800000000",
      bedrooms: "3",
      source: "facebook-home-bogota",
      market: "bogota",
      stratum: "6",
      sort: "priceAsc",
      useMapBounds: true,
      mapBounds: { west: -75, south: 4, east: -73, north: 5 },
    });
    const search = queryToRouterSearch(source, "saved-1");
    expect(search).toEqual({
      text: "Chicó",
      minPrice: "800000000",
      bedrooms: "3",
      source: "facebook-home-bogota",
      market: "bogota",
      stratum: "6",
      sort: "priceAsc",
      saved: "saved-1",
    });
    expect(queryFromRouterSearch(search)).toEqual({
      ...source,
      useMapBounds: false,
      mapBounds: null,
    });
  });

  it("accepts one- and two-bedroom filters", () => {
    expect(validateExploreSearch({ bedrooms: "1" })).toEqual({
      bedrooms: "1",
    });
    expect(validateExploreSearch({ bedrooms: "2" })).toEqual({
      bedrooms: "2",
    });
  });

  it("validates project-status filters", () => {
    expect(validateExploreSearch({ projectStatus: "new" })).toEqual({
      projectStatus: "new",
    });
    expect(validateExploreSearch({ projectStatus: "construction" })).toEqual({
      projectStatus: "construction",
    });
  });

  it("validates the Construcciones Planificadas source filter", () => {
    expect(
      validateExploreSearch({ source: "construcciones-planificadas" }),
    ).toEqual({ source: "construcciones-planificadas" });
  });

  it("validates the Ciencuadras project source filter", () => {
    expect(validateExploreSearch({ source: "ciencuadras" })).toEqual({
      source: "ciencuadras",
    });
  });

  it("validates the Zonario project source filter", () => {
    expect(validateExploreSearch({ source: "zonario" })).toEqual({
      source: "zonario",
    });
  });

  it("validates statistics scopes and advanced drill-down filters", () => {
    expect(validateStatsSearch({
      scope: "rentals",
      locality: "Chapinero",
      municipality: "Chía",
      neighborhood: "Chicó",
      developer: "Constructora Bolívar",
      coordinatePrecision: "listing",
      favorites: "only",
    })).toMatchObject({
      scope: "rentals",
      locality: "Chapinero",
      municipality: "Chía",
      neighborhood: "Chicó",
      developer: "Constructora Bolívar",
      coordinatePrecision: "listing",
      favorites: "only",
    });
    expect(validateStatsSearch({
      scope: "mixed-prices",
      coordinatePrecision: "street",
      favorites: "yes",
    })).toEqual({});
  });
});
