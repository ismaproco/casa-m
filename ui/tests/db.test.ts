import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { Favorite, SavedSearch, UserDataExport } from "../app/lib/types";
import { DEFAULT_QUERY } from "../app/lib/core";
import {
  db,
  exportUserData,
  importUserData,
  isValidImport,
} from "../app/lib/db";

const listing = {
  id: "test-listing",
  source: "fincaraiz" as const,
  resultType: "Inmueble" as const,
  projectName: null,
  neighborhood: "Cedritos",
  locality: "Usaquén",
  zone: "Norte",
  city: "Bogotá D.C.",
  priceCop: 500_000_000,
  areaM2: 80,
  pricePerM2: 6_250_000,
  bedrooms: 3,
  bathrooms: 2,
  parkingSpaces: 1,
  stratum: 4,
  latitude: 4.72,
  longitude: -74.04,
  coordinatePrecision: "listing" as const,
  url: "https://example.com/test-listing",
  fingerprint: "fingerprint",
  dataWarnings: [],
};

afterEach(async () => {
  await Promise.all([
    db.favorites.clear(),
    db.savedSearches.clear(),
    db.catalogBaselines.clear(),
    db.settings.clear(),
  ]);
});

describe("local user data", () => {
  it("exports and restores favorites, searches, and settings", async () => {
    const now = new Date().toISOString();
    const favorite: Favorite = {
      listingId: listing.id,
      status: "contacted",
      note: "Llamar el lunes",
      lastKnown: listing,
      acknowledgedFingerprint: listing.fingerprint,
      createdAt: now,
      updatedAt: now,
    };
    const saved: SavedSearch = {
      id: "saved-1",
      name: "Cedritos familiar",
      query: { ...DEFAULT_QUERY, text: "Cedritos" },
      snapshot: {},
      createdAt: now,
      updatedAt: now,
      lastReviewedCatalogVersion: "catalog-1",
    };
    await Promise.all([
      db.favorites.put(favorite),
      db.savedSearches.put(saved),
      db.settings.put({ key: "locale", value: "es" }),
    ]);

    const backup = await exportUserData();
    expect(isValidImport(backup)).toBe(true);
    await Promise.all([
      db.favorites.clear(),
      db.savedSearches.clear(),
      db.settings.clear(),
    ]);
    await importUserData(backup);

    expect(await db.favorites.get(listing.id)).toEqual(favorite);
    expect(await db.savedSearches.get(saved.id)).toEqual(saved);
    expect(await db.settings.get("locale")).toEqual({
      key: "locale",
      value: "es",
    });
  });

  it("rejects malformed backups", () => {
    expect(isValidImport({ schemaVersion: 2 })).toBe(false);
    expect(
      isValidImport({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        favorites: [],
        savedSearches: [],
        settings: [],
      } satisfies UserDataExport),
    ).toBe(true);
  });
});
