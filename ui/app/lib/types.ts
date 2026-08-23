export type Locale = "es" | "en";

export type FavoriteStatus = "interested" | "contacted" | "dismissed";

export type ListingSource =
  | "fincaraiz"
  | "metrocuadrado"
  | "facebook-home-bogota"
  | "myhome"
  | "amarilo";

export type Listing = {
  id: string;
  source: ListingSource;
  resultType: "Inmueble" | "Proyecto";
  projectName: string | null;
  projectStatus?: string | null;
  deliveryDate?: string | null;
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
};

export type CatalogSnapshot = {
  schemaVersion: 1;
  catalogVersion: string;
  publishedAt: string;
  sourceUpdatedAt: string;
  summary: {
    sourceRecords: number;
    publishedRecords: number;
    excludedRecords: number;
    approximateCoordinates: number;
    knownStratum: number;
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
