import { createFileRoute } from "@tanstack/react-router";
import CasaExplorer from "@/app/CasaExplorer";

export const Route = createFileRoute("/stats")({
  component: CasaExplorer,
});
