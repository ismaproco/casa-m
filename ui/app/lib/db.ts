import Dexie, { type EntityTable } from "dexie";
import type {
  CatalogBaseline,
  Favorite,
  SavedSearch,
  Setting,
  UserDataExport,
} from "./types";

export class CasaDatabase extends Dexie {
  favorites!: EntityTable<Favorite, "listingId">;
  savedSearches!: EntityTable<SavedSearch, "id">;
  catalogBaselines!: EntityTable<CatalogBaseline, "listingId">;
  settings!: EntityTable<Setting, "key">;

  constructor() {
    super("casa-mapa");
    this.version(1).stores({
      favorites: "listingId,status,updatedAt",
      savedSearches: "id,updatedAt",
      catalogBaselines: "listingId,lastSeenVersion",
      settings: "key",
    });
  }
}

export const db = new CasaDatabase();

export async function exportUserData(): Promise<UserDataExport> {
  const [favorites, savedSearches, settings] = await Promise.all([
    db.favorites.toArray(),
    db.savedSearches.toArray(),
    db.settings.toArray(),
  ]);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    favorites,
    savedSearches,
    settings,
  };
}

export function isValidImport(value: unknown): value is UserDataExport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UserDataExport>;
  return (
    candidate.schemaVersion === 1 &&
    Array.isArray(candidate.favorites) &&
    Array.isArray(candidate.savedSearches) &&
    Array.isArray(candidate.settings)
  );
}

export async function importUserData(value: UserDataExport) {
  await db.transaction(
    "rw",
    db.favorites,
    db.savedSearches,
    db.settings,
    async () => {
      await Promise.all([
        db.favorites.clear(),
        db.savedSearches.clear(),
        db.settings.clear(),
      ]);
      await db.favorites.bulkPut(value.favorites);
      await db.savedSearches.bulkPut(value.savedSearches);
      await db.settings.bulkPut(value.settings);
    },
  );
}
