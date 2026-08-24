import { createFileRoute } from "@tanstack/react-router";
import CasaExplorer from "@/app/CasaExplorer";
import { validateStatsSearch } from "@/app/lib/core";

export const Route = createFileRoute("/stats")({
  validateSearch: validateStatsSearch,
  component: CasaExplorer,
});
