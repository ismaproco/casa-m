export type Locale = "es" | "en";

export type FavoriteStatus = "interested" | "contacted" | "dismissed";

export type ListingSource = string;

export type ProjectMarket = "bogota" | "sabana";

export type ProjectTypology = {
  id: string;
  name: string;
  areaM2: number;
  privateAreaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  priceCop: number | null;
  priceNote: string | null;
  description: string | null;
  source: ListingSource;
  sourceName: string;
  sourceUrl: string;
  sourceKind: "official" | "portal";
};

export type ProjectEvidence = {
  source: ListingSource;
  sourceName: string;
  sourceKind: "official" | "portal";
  url: string;
  collectedAt: string | null;
  priceCop: number | null;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  projectStatus: string | null;
};

export type ProjectDifference = {
  source: ListingSource;
  sourceName: string;
  sourceUrl: string;
  field:
    | "priceCop"
    | "areaM2"
    | "bedrooms"
    | "bathrooms"
    | "parkingSpaces"
    | "projectStatus";
  officialValue: string | number | null;
  portalValue: string | number | null;
};

export type Listing = {
  id: string;
  source: ListingSource;
  resultType: "Inmueble" | "Proyecto";
  operationType?: "Venta" | "Arriendo";
  projectName: string | null;
  projectStatus?: string | null;
  deliveryDate?: string | null;
  sourceName?: string;
  developerName?: string | null;
  sourceKind?: "official" | "portal";
  market?: ProjectMarket;
  municipality?: string | null;
  typologies?: ProjectTypology[];
  evidence?: ProjectEvidence[];
  sourceDifferences?: ProjectDifference[];
  neighborhood: string | null;
  locality: string | null;
  zone: string | null;
  city: string;
  priceCop: number;
  areaM2: number | null;
  pricePerM2: number | null;
  bedrooms: number;
  bathrooms: number;
  parkingSpaces: number | null;
  stratum: number | null;
  latitude: number;
  longitude: number;
  coordinatePrecision: "listing" | "neighborhood_centroid";
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  url: string;
  fingerprint: string;
  dataWarnings: string[];
  availabilityStatus?: "available" | "unavailable";
  availabilityCheckedAt?: string | null;
  lastSeenAt?: string | null;
};

export type CatalogSnapshot = {
  schemaVersion: 1;
  catalogVersion: string;
  catalogKind?: "sales" | "rentals";
  publishedAt: string;
  sourceUpdatedAt: string;
  summary: {
    sourceRecords: number;
    publishedRecords: number;
    excludedRecords: number;
    approximateCoordinates: number;
    knownStratum: number;
    officialProjects: number;
    sabanaProjects: number;
    apartmentTypes: number;
    sourceDifferences: number;
    topDevelopersAudited?: number;
    topDevelopersWithRegionalProjects?: number;
    availableRecords?: number;
    unavailableRecords?: number;
    duplicateRecords?: number;
  };
  listings: Listing[];
};

export type SortOption =
  | "neighborhood"
  | "priceAsc"
  | "priceDesc"
  | "areaDesc"
  | "pricePerM2Asc";

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type SearchQuery = {
  text: string;
  source: string;
  developer: string;
  locality: string;
  municipality: string;
  neighborhood: string;
  coordinatePrecision: string;
  market: string;
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
  bedrooms: string;
  minBathrooms: string;
  minParking: string;
  resultType: string;
  projectStatus: string;
  stratum: string;
  sort: SortOption;
  useMapBounds: boolean;
  mapBounds: MapBounds | null;
};

export type ExploreSearch = Partial<
  Omit<SearchQuery, "useMapBounds" | "mapBounds">
> & {
  saved?: string;
  favorites?: "only";
};

export type StatsScope = "all" | "sales" | "rentals" | "projects" | "resale";

export type StatsSearch = ExploreSearch & {
  scope?: StatsScope;
};

export type ListingSummary = Pick<
  Listing,
  | "id"
  | "neighborhood"
  | "projectName"
  | "priceCop"
  | "areaM2"
  | "bedrooms"
  | "bathrooms"
  | "parkingSpaces"
  | "url"
  | "fingerprint"
>;

export type SearchSnapshot = Record<string, ListingSummary>;

export type SavedSearch = {
  id: string;
  name: string;
  query: SearchQuery;
  snapshot: SearchSnapshot;
  createdAt: string;
  updatedAt: string;
  lastReviewedCatalogVersion: string;
  catalogKind?: "sales" | "rentals";
};

export type Favorite = {
  listingId: string;
  status: FavoriteStatus;
  note: string;
  lastKnown: Listing;
  acknowledgedFingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type CatalogBaseline = {
  listingId: string;
  fingerprint: string;
  summary: ListingSummary;
  lastSeenVersion: string;
};

export type Setting = {
  key: string;
  value: string;
};

export type SearchUpdates = {
  added: ListingSummary[];
  changed: ListingSummary[];
  removed: ListingSummary[];
};

export type UserDataExport = {
  schemaVersion: 1;
  exportedAt: string;
  favorites: Favorite[];
  savedSearches: SavedSearch[];
  settings: Setting[];
};
