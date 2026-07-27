import { createFileRoute } from "@tanstack/react-router";
import { validateExploreSearch } from "@/app/lib/core";

export const Route = createFileRoute("/explore/property/$listingId")({
  validateSearch: validateExploreSearch,
  component: () => null,
});
