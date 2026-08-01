import { expect, test } from "@playwright/test";

const routes = ["/explore", "/stats", "/favorites", "/saved"];

test("all application routes and nested reloads render locally", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/explore$/);
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
  await expect(page.getByRole("tab", { name: /explore|explorar/i })).toBeVisible();
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
