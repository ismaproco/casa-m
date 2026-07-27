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
    expect(router.state.matches.at(-1)?.search).toMatchObject({
      text: "Cedritos",
      stratum: "4",
    });

    await router.navigate({
      to: "/explore",
      search: { text: "Cedritos", stratum: "4" },
    });
    expect(router.state.location.pathname).toBe("/explore");
    expect(router.state.matches.at(-1)?.search).toMatchObject({
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

  it("navigates through stats, favorites, and saved routes", async () => {
    const router = testRouter("/stats");
    await router.load();
    expect(router.state.location.pathname).toBe("/stats");
    await router.navigate({ to: "/favorites" });
    expect(router.state.location.pathname).toBe("/favorites");
    await router.navigate({ to: "/saved" });
    expect(router.state.location.pathname).toBe("/saved");
  });
});
