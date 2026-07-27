import {
  createRootRoute,
  Link,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { CircleAlert, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

function RouteError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <main className="grid min-h-screen place-content-center justify-items-center gap-4 bg-background p-6 text-center text-foreground">
      <CircleAlert className="text-destructive" size={36} />
      <div>
        <h1 className="m-0 text-xl">Casa Mapa could not open this view</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
      <Button onClick={() => void router.invalidate()}>
        <RotateCcw size={16} /> Try again
      </Button>
    </main>
  );
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-content-center justify-items-center gap-4 bg-background p-6 text-center text-foreground">
      <span className="font-mono text-5xl font-black text-primary">404</span>
      <div>
        <h1 className="m-0 text-xl">This Casa Mapa route does not exist</h1>
        <p className="text-sm text-muted-foreground">
          Esta ruta no existe. Return to the apartment explorer.
        </p>
      </div>
      <Button asChild>
        <Link to="/explore">
          <Home size={16} /> Explore
        </Link>
      </Button>
    </main>
  );
}

export const Route = createRootRoute({
  component: Outlet,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});
