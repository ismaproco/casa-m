import { useQuery } from "@tanstack/react-query";
import type { CatalogSnapshot } from "@/app/lib/types";

export type CatalogKind = "sales" | "rentals";

async function fetchCatalog(kind: CatalogKind): Promise<CatalogSnapshot> {
  const response = await fetch(
    kind === "rentals" ? "/data/rentals.json" : "/data/catalog.json",
  );
  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status})`);
  }
  return response.json() as Promise<CatalogSnapshot>;
}

export function useCatalog(kind: CatalogKind = "sales", enabled = true) {
  return useQuery({
    queryKey: ["catalog", kind],
    queryFn: () => fetchCatalog(kind),
    enabled,
  });
}
