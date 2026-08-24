import {
  createMemoryHistory,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { routeTree } from "../src/routeTree.gen";

function testRouter(initialEntry: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

describe("application routes", () => {
  it("loads an explore URL with search parameters", async () => {
    const router = testRouter(
      "/explore?sort=random&stratum=9&minPrice=-5&resultType=House",
    );
    await router.load();
    expect(router.state.location.pathname).toBe("/explore");
    expect(router.state.location.search).toMatchObject({
      sort: "random",
      stratum: 9,
    });
  });

  it("supports direct property loading and history navigation", async () => {
    const router = testRouter("/explore?text=Cedritos&stratum=4");
    await router.load();
    await router.navigate({
      to: "/explore/property/$listingId",
      params: { listingId: "FR-123" },
      search: { text: "Cedritos", stratum: "4" },
    });
    expect(router.state.location.pathname).toBe(
      "/explore/property/FR-123",
    );
    expect(router.state.matches.at(-1)?.params).toMatchObject({
      listingId: "FR-123",
    });
    expect(router.state.location.search).toMatchObject({
      text: "Cedritos",
      stratum: "4",
    });

    await router.navigate({
      to: "/explore",
      search: { text: "Cedritos", stratum: "4" },
    });
    expect(router.state.location.pathname).toBe("/explore");
    expect(router.state.location.search).toMatchObject({
      text: "Cedritos",
      stratum: "4",
    });

    await router.navigate({
      to: "/explore/property/$listingId",
      params: { listingId: "FR-123" },
      search: { text: "Cedritos", stratum: "4" },
    });
    expect(router.state.location.pathname).toBe(
      "/explore/property/FR-123",
    );
  });

  it("supports rental filters and direct rental property loading", async () => {
    const router = testRouter("/rentals?source=myhome&bedrooms=1");
    await router.load();
    expect(router.state.location.pathname).toBe("/rentals");
    expect(router.state.location.search).toMatchObject({
      source: "myhome",
      bedrooms: 1,
    });
    await router.navigate({
      to: "/rentals/property/$listingId",
      params: { listingId: "MC-RENT-123" },
      search: { source: "metrocuadrado", bedrooms: "2" },
    });
    expect(router.state.location.pathname).toBe(
      "/rentals/property/MC-RENT-123",
    );
    expect(router.state.location.search).toMatchObject({
      source: "metrocuadrado",
      bedrooms: "2",
    });
  });

  it("navigates through rentals, stats, favorites, and saved routes", async () => {
    const router = testRouter("/stats");
    await router.load();
    expect(router.state.location.pathname).toBe("/stats");
    await router.navigate({ to: "/rentals" });
    expect(router.state.location.pathname).toBe("/rentals");
    await router.navigate({ to: "/favorites" });
    expect(router.state.location.pathname).toBe("/favorites");
    await router.navigate({ to: "/saved" });
    expect(router.state.location.pathname).toBe("/saved");
  });
});
