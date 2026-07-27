import { createFileRoute } from "@tanstack/react-router";
import CasaExplorer from "@/app/CasaExplorer";
import { validateExploreSearch } from "@/app/lib/core";

export const Route = createFileRoute("/explore")({
  validateSearch: validateExploreSearch,
  pendingComponent: () => (
    <main className="grid min-h-screen place-content-center bg-[#10212a] text-sm font-semibold text-white">
      Loading Casa Mapa…
    </main>
  ),
  component: CasaExplorer,
});
