import { useQuery } from "@tanstack/react-query";
import type { CatalogSnapshot } from "@/app/lib/types";

async function fetchCatalog(): Promise<CatalogSnapshot> {
  const response = await fetch("/data/catalog.json");
  if (!response.ok) {
    throw new Error(`Catalog request failed (${response.status})`);
  }
  return response.json() as Promise<CatalogSnapshot>;
}

export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: fetchCatalog,
  });
}
