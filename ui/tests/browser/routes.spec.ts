import { expect, test } from "@playwright/test";

const routes = ["/explore", "/rentals", "/stats", "/favorites", "/saved"];

test("all application routes and nested reloads render locally", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.locator("header").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const fontState = await page.evaluate(() => ({
    family: getComputedStyle(document.body).fontFamily,
    loaded: document.fonts.check("16px 'Geist Variable'"),
    fontFiles: performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.endsWith(".woff2")).length,
  }));
  expect(fontState.family).toContain("Geist Variable");
  expect(fontState.loaded).toBe(true);
  expect(fontState.fontFiles).toBeGreaterThanOrEqual(1);
  expect(fontState.fontFiles).toBeLessThanOrEqual(2);
  await page.goto(
    "/explore?sort=random&stratum=9&minPrice=-5&resultType=House&source=unknown",
  );
  await expect(page).toHaveURL(/\/explore$/);

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.locator("body")).toContainText(/casa map/i);
  }

  const catalog = await page.request.get("/data/catalog.json");
  const listingId = (await catalog.json()).listings[0].id as string;
  await page.goto(`/explore/property/${encodeURIComponent(listingId)}?stratum=4`);
  await expect(page).toHaveURL(
    new RegExp(`/explore/property/${encodeURIComponent(listingId)}\\?stratum=4`),
  );
  await expect(page.getByText(listingId, { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(listingId, { exact: true }).first()).toBeVisible();

  await page.goto("/explore/property/not-in-this-catalog?text=Cedritos");
  await expect(page.getByText(/property not found|inmueble no encontrado/i)).toBeVisible();
  await page.getByRole("button", { name: /back to results|volver a resultados/i }).click();
  await expect(page).toHaveURL(/\/explore\?text=Cedritos$/);
});

test("rentals have an independent catalog, filters, and property history", async ({
  page,
}) => {
  const response = await page.request.get("/data/rentals.json");
  expect(response.ok()).toBe(true);
  const rentals = await response.json();
  expect(rentals.catalogKind).toBe("rentals");
  expect(rentals.summary.publishedRecords).toBe(9243);
  expect(
    rentals.listings.every(
      (listing: { operationType?: string }) => listing.operationType === "Arriendo",
    ),
  ).toBe(true);

  const listing = rentals.listings.find(
    (candidate: { source: string }) => candidate.source === "myhome",
  ) as { id: string };
  await page.goto("/rentals?source=myhome");
  await expect(page.getByRole("tab", { name: /rentals|arriendos/i })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(page.getByText(/83 resultados|83 results/i)).toBeVisible();
  await expect(page.getByRole("combobox", { name: /source|fuente/i })).toHaveValue(
    "myhome",
  );

  await page.goto(`/rentals/property/${encodeURIComponent(listing.id)}?source=myhome`);
  await expect(page.getByText(listing.id, { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(listing.id, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /close|cerrar/i }).click();
  await expect(page).toHaveURL(/\/rentals\?source=myhome$/);
});

test("source filter is URL-backed and includes HOME Bogotá listings", async ({
  page,
}) => {
  await page.goto("/explore?source=facebook-home-bogota");
  await expect(page.locator("article")).toHaveCount(5);
  await expect(page.getByText("HOME-32662", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /source|fuente/i }),
  ).toHaveValue("facebook-home-bogota");
});

test("MyHome source filter exposes only imported MyHome listings", async ({
  page,
}) => {
  await page.goto("/explore?source=myhome");
  await expect(page.locator("article")).toHaveCount(80);
  await expect(page.getByText(/243 resultados|243 results/i)).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /source|fuente/i }),
  ).toHaveValue("myhome");

  await page.goto("/explore?source=myhome&bedrooms=1");
  await expect(page.locator("article")).toHaveCount(44);
  await expect(page.getByText(/44 resultados|44 results/i)).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /bedrooms|habitaciones/i }),
  ).toHaveValue("1");
});

test("construction projects are filterable and expose delivery details", async ({
  page,
}) => {
  const response = await page.request.get("/data/catalog.json");
  const catalog = await response.json();
  const constructionProjects = catalog.listings.filter(
    (listing: {
      projectStatus?: string | null;
      source: string;
      resultType: string;
    }) =>
      listing.projectStatus === "En construcción" &&
      listing.source === "metrocuadrado" &&
      listing.resultType === "Proyecto",
  );

  expect(constructionProjects).toHaveLength(18);
  expect(new Set(constructionProjects.map((listing: { projectName: string }) => listing.projectName)).size).toBe(18);
  expect(constructionProjects.every((listing: { deliveryDate?: string | null }) => listing.deliveryDate)).toBe(true);

  await page.goto(
    "/explore?source=metrocuadrado&resultType=Proyecto&projectStatus=construction",
  );
  await expect(
    page.getByRole("combobox", { name: /source|fuente/i }),
  ).toHaveValue("metrocuadrado");
  await expect(
    page.getByRole("combobox", { name: /type|tipo/i }),
  ).toHaveValue("Proyecto");
  await expect(
    page.getByRole("combobox", { name: /project status|estado del proyecto/i }),
  ).toHaveValue("construction");
  // Alsacia Arboré is now led by its official record but still matches this
  // portal filter through the retained Metrocuadrado evidence.
  await expect(page.locator(".project-star-marker")).toHaveCount(19);
  await expect(
    page.locator("article").first().getByText(/en construcción|under construction/i),
  ).toBeVisible();

  const listing = constructionProjects[0] as {
    id: string;
    deliveryDate: string;
  };
  await page.goto(`/explore/property/${encodeURIComponent(listing.id)}`);
  await expect(page.getByText(listing.deliveryDate, { exact: false })).toBeVisible();
});

test("all new projects includes projects regardless of construction or delivery status", async ({
  page,
}) => {
  const response = await page.request.get("/data/catalog.json");
  const catalog = await response.json();
  const projects = catalog.listings.filter(
    (listing: { resultType: string }) => listing.resultType === "Proyecto",
  );
  const projectsWithoutStatus = projects.filter(
    (listing: { projectStatus?: string | null }) => !listing.projectStatus,
  );

  expect(projectsWithoutStatus.length).toBeGreaterThan(0);
  await page.goto("/explore?projectStatus=new");
  const statusFilter = page.getByRole("combobox", {
    name: /project status|estado del proyecto/i,
  });
  await expect(statusFilter).toHaveValue("new");
  await expect(
    statusFilter.locator('option[value="new"]'),
  ).toHaveText(/todos los proyectos nuevos|all new projects/i);
  await expect(
    page.getByText(new RegExp(`${projects.length} (resultados|results)`, "i")),
  ).toBeVisible();
  await expect(page.locator(".project-star-marker")).toHaveCount(projects.length);
});

test("official Amarilo projects are filterable with current sale status", async ({
  page,
}) => {
  const response = await page.request.get("/data/catalog.json");
  const catalog = await response.json();
  const projects = catalog.listings.filter(
    (listing: { source: string; resultType: string }) =>
      listing.source === "amarilo" && listing.resultType === "Proyecto",
  );

  expect(projects).toHaveLength(23);
  expect(
    projects.every(
      (listing: { deliveryDate?: string | null }) => listing.deliveryDate,
    ),
  ).toBe(true);

  await page.goto(
    "/explore?source=amarilo&resultType=Proyecto&projectStatus=new",
  );
  await expect(page.locator("article")).toHaveCount(23);
  await expect(page.getByText(/23 resultados|23 results/i)).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /source|fuente/i }),
  ).toHaveValue("amarilo");
  await expect(page.locator(".project-star-marker")).toHaveCount(23);
  await expect(
    page
      .locator("article")
      .first()
      .getByText(/sobre planos|pre-construction|entrega inmediata|immediate delivery/i),
  ).toBeVisible();
});

test("official developer projects expose Bogotá/Sabana coverage and apartment types", async ({
  page,
}) => {
  const response = await page.request.get("/data/catalog.json");
  const catalog = await response.json();
  const viena = catalog.listings.find(
    (listing: { projectName?: string | null }) => listing.projectName === "Viena",
  ) as {
    id: string;
    source: string;
    typologies: Array<{ priceCop: number; source: string }>;
    sourceDifferences: Array<{
      source: string;
      field: string;
      officialValue: unknown;
      portalValue: unknown;
    }>;
  };

  expect(viena.source).toBe("arquitectura-y-concreto");
  expect(viena.typologies.filter((typology) => typology.source === "arquitectura-y-concreto"))
    .toHaveLength(3);
  expect(
    viena.typologies
      .filter((typology) => typology.source === "arquitectura-y-concreto")
      .map((typology) => typology.priceCop),
  ).toEqual([
    445100000,
    467917810,
    543660795,
  ]);
  expect(viena.typologies.filter((typology) => typology.source === "ciencuadras"))
    .toHaveLength(2);
  expect(viena.sourceDifferences).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "ciencuadras",
        field: "priceCop",
        officialValue: 445100000,
        portalValue: 467875801,
      }),
    ]),
  );

  await page.goto("/explore?source=arquitectura-y-concreto&market=bogota");
  await expect(page.getByText(/4 resultados|4 results/i)).toBeVisible();
  await expect(page.getByText(/^Viena\s*·/).first()).toBeVisible();
  await page.goto(`/explore/property/${encodeURIComponent(viena.id)}`);
  await expect(page.getByRole("heading", { name: /tipos de apartamento|apartment types/i })).toBeVisible();
  await expect(page.getByText(/445.*100.*000/).first()).toBeVisible();

  await page.goto("/explore?market=sabana&resultType=Proyecto");
  await expect(page.getByText(/^Luna Apartamentos\s*·/).first()).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: /coverage|cobertura/i }),
  ).toHaveValue("sabana");
});

test("Construcciones Planificadas projects expose current priced typologies", async ({
  page,
}) => {
  const response = await page.request.get("/data/catalog.json");
  const catalog = await response.json();
  const projects = catalog.listings.filter(
    (listing: { source?: string }) => listing.source === "construcciones-planificadas",
  ) as Array<{
    id: string;
    projectName: string;
    projectStatus: string;
    typologies: Array<{ priceCop: number | null; source: string }>;
  }>;

  expect(projects.map((listing) => listing.projectName).sort()).toEqual([
    "Alsacia Arboré",
    "Palmeri",
    "Pinar 24",
    "Rocca",
    "Serraclara",
    "Zelva",
  ]);
  expect(projects.every((listing) => listing.projectStatus === "En construcción")).toBe(true);
  expect(projects.every((listing) => listing.typologies.every((type) => type.priceCop))).toBe(true);
  expect(
    Object.fromEntries(
      projects.map((listing) => [
        listing.projectName,
        listing.typologies.filter(
          (typology) => typology.source === "construcciones-planificadas",
        ).length,
      ]),
    ),
  ).toMatchObject({ Palmeri: 5, "Pinar 24": 3, Rocca: 3, Serraclara: 4, Zelva: 8 });
  expect(
    projects
      .find((listing) => listing.projectName === "Serraclara")
      ?.typologies.filter((typology) => typology.source === "zonario"),
  ).toHaveLength(5);

  await page.goto(
    "/explore?source=construcciones-planificadas&resultType=Proyecto&projectStatus=construction",
  );
  await expect(page.getByText(/6 resultados|6 results/i)).toBeVisible();
  await expect(page.locator(".project-star-marker")).toHaveCount(6);
  await page.goto(`/explore/property/${encodeURIComponent(projects[0].id)}`);
  await expect(
    page.getByRole("heading", { name: /tipos de apartamento|apartment types/i }),
  ).toBeVisible();
});

test("Ciencuadras expands multi-developer project coverage without replacing official evidence", async ({
  page,
}) => {
  const response = await page.request.get("/data/catalog.json");
  const catalog = await response.json();
  const projects = catalog.listings.filter(
    (listing: {
      source: string;
      evidence?: Array<{ source: string }>;
      projectStatus?: string | null;
    }) =>
      listing.source === "ciencuadras" ||
      listing.evidence?.some((entry) => entry.source === "ciencuadras"),
  );

  expect(projects.length).toBeGreaterThanOrEqual(100);
  expect(projects.every((listing: { projectStatus?: string | null }) => listing.projectStatus)).toBe(true);
  expect(
    new Set(projects.map((listing: { developerName?: string | null }) => listing.developerName).filter(Boolean)).size,
  ).toBeGreaterThanOrEqual(20);

  await page.goto("/explore?source=ciencuadras&resultType=Proyecto&projectStatus=new");
  await expect(
    page.getByRole("combobox", { name: /source|fuente/i }),
  ).toHaveValue("ciencuadras");
  await expect(page.locator(".project-star-marker")).toHaveCount(projects.length);
});

test("top 100 national developers expose their audited Bogotá and Sabana projects", async ({
  page,
}) => {
  const [developerResponse, catalogResponse] = await Promise.all([
    page.request.get("/data/developers.json"),
    page.request.get("/data/catalog.json"),
  ]);
  const developerAudit = await developerResponse.json();
  const catalog = await catalogResponse.json();
  const projects = catalog.listings.filter(
    (listing: { source: string; evidence?: Array<{ source: string }> }) =>
      listing.source === "zonario" ||
      listing.evidence?.some((entry) => entry.source === "zonario"),
  );

  expect(developerAudit.developers).toHaveLength(100);
  expect(
    developerAudit.developers.filter(
      (developer: { bogota_sabana_project_count: number }) =>
        developer.bogota_sabana_project_count > 0,
    ),
  ).toHaveLength(52);
  expect(projects.length).toBeGreaterThanOrEqual(350);
  expect(new Set(projects.map((listing: { developerName: string }) => listing.developerName)).size)
    .toBeGreaterThanOrEqual(50);
  expect(projects.some((listing: { market: string }) => listing.market === "sabana")).toBe(true);
  expect(
    catalog.listings
      .filter(
        (listing: { projectName?: string | null; market?: string }) =>
          listing.market === "sabana" &&
          listing.projectName?.toLocaleLowerCase("es") === "hacienda la herradura",
      )
      .map((listing: { municipality?: string | null }) => listing.municipality)
      .sort(),
  ).toEqual(["Cajicá", "Chía"]);

  await page.goto("/explore?source=zonario&resultType=Proyecto&projectStatus=new");
  await expect(
    page.getByRole("combobox", { name: /source|fuente/i }),
  ).toHaveValue("zonario");
  await expect(page.locator(".project-star-marker")).toHaveCount(projects.length);
});

test("filters, property selection, close, and history stay synchronized", async ({
  page,
}) => {
  await page.goto("/explore?text=Cedritos&stratum=4");
  const resultCard = page.locator("article").first();
  await expect(resultCard).toBeVisible();
  await resultCard.locator("button").first().click();
  await expect(page).toHaveURL(
    /\/explore\/property\/[^?]+\?text=Cedritos&stratum=4/,
  );
  const propertyUrl = page.url();

  await page.getByRole("button", { name: /close|cerrar/i }).click();
  await expect(page).toHaveURL(/\/explore\?text=Cedritos&stratum=4$/);
  await page.goBack();
  await expect(page).toHaveURL(propertyUrl);
  await page.goForward();
  await expect(page).toHaveURL(/\/explore\?text=Cedritos&stratum=4$/);
});

test("responsive controls remain contained at a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore");
  await expect(page.getByRole("button", { name: /filters|filtros/i }).first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /sales|ventas/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /rentals|arriendos/i })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("theme, language, and a favorite persist after reload", async ({ page }) => {
  await page.goto("/explore");
  const themeButton = page.getByRole("button", {
    name: /use light theme|usar tema claro/i,
  });
  await themeButton.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const localeButton = page.getByRole("button", {
    name: /cambiar a español|switch to english/i,
  });
  const initialLanguage = await page.locator("html").getAttribute("lang");
  await localeButton.click();

  const favoriteButton = page
    .locator("article")
    .first()
    .getByRole("button", { name: /favorites|favoritos/i });
  await favoriteButton.click();
  await expect(favoriteButton).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).not.toHaveAttribute(
    "lang",
    initialLanguage ?? "",
  );

  await page.goto("/favorites");
  await expect(page.locator("article").first()).toBeVisible();
  await page.reload();
  await expect(page.locator("article").first()).toBeVisible();
});
