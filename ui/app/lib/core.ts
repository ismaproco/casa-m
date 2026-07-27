import type {
  Listing,
  ListingSummary,
  ExploreSearch,
  SearchQuery,
  SearchSnapshot,
  SearchUpdates,
} from "./types";

export const DEFAULT_QUERY: SearchQuery = {
  text: "",
  minPrice: "",
  maxPrice: "",
  minArea: "",
  maxArea: "",
  bedrooms: "",
  minBathrooms: "",
  minParking: "",
  resultType: "",
  stratum: "",
  sort: "neighborhood",
  useMapBounds: false,
  mapBounds: null,
};

export function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .trim();
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function listingMatches(listing: Listing, query: SearchQuery) {
  const needle = normalizeText(query.text);
  if (
    needle &&
    !normalizeText(
      `${listing.city} ${listing.locality ?? ""} ${listing.zone ?? ""} ${listing.neighborhood ?? ""} ${listing.projectName ?? ""} ${listing.id}`,
    ).includes(needle)
  ) {
    return false;
  }

  const minPrice = optionalNumber(query.minPrice);
  const maxPrice = optionalNumber(query.maxPrice);
  const minArea = optionalNumber(query.minArea);
  const maxArea = optionalNumber(query.maxArea);
  if (minPrice !== null && listing.priceCop < minPrice) return false;
  if (maxPrice !== null && listing.priceCop > maxPrice) return false;
  if (minArea !== null && (listing.areaM2 === null || listing.areaM2 < minArea))
    return false;
  if (maxArea !== null && (listing.areaM2 === null || listing.areaM2 > maxArea))
    return false;
  if (
    query.bedrooms &&
    (query.bedrooms === "7plus"
      ? listing.bedrooms < 7
      : listing.bedrooms !== Number(query.bedrooms))
  )
    return false;
  if (
    query.minBathrooms &&
    listing.bathrooms < Number(query.minBathrooms)
  )
    return false;
  if (
    query.minParking &&
    (listing.parkingSpaces ?? 0) < Number(query.minParking)
  )
    return false;
  if (query.resultType && listing.resultType !== query.resultType) return false;
  if (
    query.stratum === "unknown" &&
    listing.stratum !== null
  )
    return false;
  if (
    query.stratum &&
    query.stratum !== "unknown" &&
    listing.stratum !== Number(query.stratum)
  )
    return false;

  if (query.useMapBounds && query.mapBounds) {
    const { west, south, east, north } = query.mapBounds;
    if (
      listing.longitude < west ||
      listing.longitude > east ||
      listing.latitude < south ||
      listing.latitude > north
    ) {
      return false;
    }
  }
  return true;
}

export function sortListings(listings: Listing[], query: SearchQuery) {
  const sorted = [...listings];
  const neighborhood = (listing: Listing) =>
    listing.neighborhood ?? listing.projectName ?? "";
  sorted.sort((a, b) => {
    if (query.sort === "priceAsc") return a.priceCop - b.priceCop;
    if (query.sort === "priceDesc") return b.priceCop - a.priceCop;
    if (query.sort === "areaDesc") return (b.areaM2 ?? -1) - (a.areaM2 ?? -1);
    if (query.sort === "pricePerM2Asc")
      return (a.pricePerM2 ?? Infinity) - (b.pricePerM2 ?? Infinity);
    return neighborhood(a).localeCompare(neighborhood(b), "es");
  });
  return sorted;
}

export function filterListings(listings: Listing[], query: SearchQuery) {
  return sortListings(
    listings.filter((listing) => listingMatches(listing, query)),
    query,
  );
}

export function listingSummary(listing: Listing): ListingSummary {
  return {
    id: listing.id,
    neighborhood: listing.neighborhood,
    projectName: listing.projectName,
    priceCop: listing.priceCop,
    areaM2: listing.areaM2,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    parkingSpaces: listing.parkingSpaces,
    url: listing.url,
    fingerprint: listing.fingerprint,
  };
}

export function createSnapshot(listings: Listing[]): SearchSnapshot {
  return Object.fromEntries(
    listings.map((listing) => [listing.id, listingSummary(listing)]),
  );
}

export function compareSnapshot(
  previous: SearchSnapshot,
  currentListings: Listing[],
): SearchUpdates {
  const current = createSnapshot(currentListings);
  const added: ListingSummary[] = [];
  const changed: ListingSummary[] = [];
  const removed: ListingSummary[] = [];

  for (const [id, summary] of Object.entries(current)) {
    if (!previous[id]) added.push(summary);
    else if (previous[id].fingerprint !== summary.fingerprint)
      changed.push(summary);
  }
  for (const [id, summary] of Object.entries(previous)) {
    if (!current[id]) removed.push(summary);
  }
  return { added, changed, removed };
}

export function queryFromSearchParams(params: URLSearchParams): SearchQuery {
  return queryFromRouterSearch(Object.fromEntries(params.entries()));
}

const SORT_OPTIONS: SearchQuery["sort"][] = [
  "neighborhood",
  "priceAsc",
  "priceDesc",
  "areaDesc",
  "pricePerM2Asc",
];

const NUMERIC_SEARCH_KEYS = [
  "minPrice",
  "maxPrice",
  "minArea",
  "maxArea",
] as const;

function validNumericSearch(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  if (!text) return "";
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? text : "";
}

export function validateExploreSearch(
  input: Record<string, unknown>,
): ExploreSearch {
  const result: ExploreSearch = {
    ...(typeof input.text === "string" && input.text
      ? { text: input.text }
      : {}),
  };

  for (const key of NUMERIC_SEARCH_KEYS) {
    const value = validNumericSearch(input[key]);
    if (value) result[key] = value;
  }
  const bedrooms = String(input.bedrooms ?? "");
  if (["3", "4", "5", "6", "7plus"].includes(bedrooms)) {
    result.bedrooms = bedrooms;
  }
  const bathrooms = String(input.minBathrooms ?? "");
  if (["1", "2", "3", "4", "5"].includes(bathrooms)) {
    result.minBathrooms = bathrooms;
  }
  const parking = String(input.minParking ?? "");
  if (["1", "2", "3", "4"].includes(parking)) {
    result.minParking = parking;
  }
  if (input.resultType === "Inmueble" || input.resultType === "Proyecto") {
    result.resultType = input.resultType;
  }
  const stratum = String(input.stratum ?? "");
  if (["1", "2", "3", "4", "5", "6", "unknown"].includes(stratum)) {
    result.stratum = stratum;
  }
  if (
    typeof input.sort === "string" &&
    SORT_OPTIONS.includes(input.sort as SearchQuery["sort"])
  ) {
    result.sort = input.sort as SearchQuery["sort"];
  }
  if (typeof input.saved === "string" && input.saved.trim()) {
    result.saved = input.saved;
  }
  return result;
}

export function queryFromRouterSearch(
  search: Record<string, unknown>,
): SearchQuery {
  const validated = validateExploreSearch(search);
  const query = { ...DEFAULT_QUERY };
  for (const key of [
    "text",
    "minPrice",
    "maxPrice",
    "minArea",
    "maxArea",
    "bedrooms",
    "minBathrooms",
    "minParking",
    "resultType",
    "stratum",
  ] as const) {
    query[key] = validated[key] ?? "";
  }
  query.sort = validated.sort ?? DEFAULT_QUERY.sort;
  return query;
}

export function queryToRouterSearch(
  query: SearchQuery,
  saved?: string | null,
): Partial<ExploreSearch> {
  const search: Partial<ExploreSearch> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === "mapBounds" || key === "useMapBounds") continue;
    if (
      typeof value === "string" &&
      value &&
      value !== DEFAULT_QUERY[key as keyof SearchQuery]
    ) {
      Object.assign(search, { [key]: value });
    }
  }
  if (saved) search.saved = saved;
  return search;
}

export function queryToSearchParams(query: SearchQuery) {
  const params = new URLSearchParams();
  const search = queryToRouterSearch(query);
  for (const [key, value] of Object.entries(search)) {
    if (value) params.set(key, value);
  }
  return params;
}
