#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputPath = path.join(
  repositoryRoot,
  "scrapes",
  "construcciones-planificadas-bogota-sabana-projects.json",
);
const origin = "https://www.construccionesplanificadas.com";
const sitemapUrl = `${origin}/us_portfolio-sitemap.xml`;
const activeCategoryUrl = `${origin}/portfolio_category/en-ejecucion/`;
const execFileAsync = promisify(execFile);
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36";

const projects = {
  palmeri: {
    title: "Palmeri",
    latitude: 4.712846,
    longitude: -74.029063,
    neighborhood: "Robledales Reservado",
    locality: "Usaquén",
    address: "Carrera 7 con calle 134",
    bedrooms: { A: 1, B: 2, C: 2, D: 3, E: null },
  },
  "alsacia-arbore": {
    title: "Alsacia Arboré",
    latitude: 4.645215,
    longitude: -74.12474,
    neighborhood: "Ciudad Alsacia",
    locality: "Kennedy",
    address: "Ciudad Alsacia",
    bedrooms: { "1": 2, "2": 2, "3": 2 },
  },
  rocca: {
    title: "Rocca",
    latitude: 4.656902795317944,
    longitude: -74.10724102460837,
    neighborhood: "Boaterra",
    locality: "Fontibón",
    address: "Avenida El Dorado entre avenida NQS y avenida 68",
    bedrooms: { "10": 1, "11": 2, "12": 2 },
  },
  "boaterra-zelva-en-ejecucion": {
    title: "Zelva",
    latitude: 4.656902795317944,
    longitude: -74.10724102460837,
    neighborhood: "Boaterra",
    locality: "Fontibón",
    address: "Avenida El Dorado entre avenida NQS y avenida 68",
    bedrooms: { "1": 1, "2": 2, "2B": 2, "3": 2, "4": 3, "5": 2, "6": 3, "7": 3 },
  },
  "pinar-24-vis": {
    title: "Pinar 24",
    latitude: 4.672132644841734,
    longitude: -74.16646663805818,
    neighborhood: "Modelia",
    locality: "Fontibón",
    address: "Avenida La Esperanza con avenida Ciudad de Cali",
    bedrooms: { "1": 1, "2": 1, "3": 1 },
  },
  "serraclara-apartamentos": {
    title: "Serraclara",
    latitude: 4.7483212,
    longitude: -74.033207,
    neighborhood: "La Uribe",
    locality: "Usaquén",
    address: "Calle 170 con carrera 12",
    bedrooms: { A: 1, B: 2, C: 3, E: 3 },
  },
};

const auditedActiveHousingWithoutPrice = new Set(["alsacia-parc"]);
const umbrellaDevelopments = new Set(["boaterra", "robledales-reservado"]);
const staleActiveUrls = new Set(["pinar-24-nueva-torre"]);

async function fetchText(url) {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "--fail",
      "--location",
      "--compressed",
      "--silent",
      "--show-error",
      "--max-time",
      "30",
      "--header",
      "accept-language: es-CO,es;q=0.9",
      "--user-agent",
      userAgent,
      url,
    ],
    { maxBuffer: 30 * 1024 * 1024 },
  );
  if (
    /<title>[^<]*(?:verify you are human|access denied|just a moment)/i.test(stdout) ||
    /id=["']cf-chl-/i.test(stdout)
  ) {
    throw new Error(`anti_bot:${url}`);
  }
  return stdout;
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&sup2;/gi, "²")
    .replace(/&#8211;/gi, "–")
    .replace(/&#\d+;|&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromUrl(url) {
  return new URL(url).pathname.match(/^\/portfolio\/([^/]+)\/?$/)?.[1] ?? null;
}

function portfolioUrls(value) {
  return [
    ...new Set(
      [...value.matchAll(/https:\/\/www\.construccionesplanificadas\.com\/portfolio\/[^<"'?#\s]+/g)]
        .map(([url]) => url.replace(/\/$/, "") + "/"),
    ),
  ];
}

function numberFrom(value, pattern) {
  const match = value.match(pattern);
  if (!match) return null;
  const number = Number(match[1].replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function copFrom(value) {
  const match = value.match(/\$\s*([\d.,]+)/);
  if (!match) return null;
  const number = Number(match[1].replace(/\D/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)`, "i"),
  )?.[1]?.replace(/&amp;/g, "&") ?? null;
}

function parseTypologies(html, slug, project) {
  const sections = html.split(/<div class="w-tabs-section(?: active)?" id="[^"]+">/).slice(1);
  return sections.flatMap((section, index) => {
    const next = section.indexOf('<div class="w-tabs-section" id=');
    const text = decodeHtml(next >= 0 ? section.slice(0, next) : section);
    const tab = text.match(/^TIPO\s+([A-Z0-9]+)/i)?.[1]?.toUpperCase();
    const area = numberFrom(text, /Área Construida:\s*(?:Desde\s*:?)?\s*([\d.,]+)/i);
    const privateArea = numberFrom(text, /Área Privada:\s*(?:Desde\s*:?)?\s*([\d.,]+)/i);
    const price = copFrom(text);
    if (!tab || !area || !price || /\bVENDIDO\b/i.test(text)) return [];
    if (!(tab in project.bedrooms)) return [];
    const bathroomCount = numberFrom(text, /(\d+)\s+Baños?/i);
    const bathrooms = bathroomCount ?? (/\bBaño\b/i.test(text) ? 1 : null);
    const parkingSpaces = numberFrom(text, /(\d+)\s+(?:garajes|parqueaderos)/i);
    const fixedMaximum = /Precio Fijo de hasta/i.test(text);
    return [{
      id: `CP-${slug}-${tab.toLowerCase()}-${index + 1}`,
      name: `Tipo ${tab}`,
      area_m2: area,
      private_area_m2: privateArea,
      bedrooms: project.bedrooms[tab],
      bathrooms,
      parking_spaces: parkingSpaces,
      price_cop: price,
      price_note: fixedMaximum
        ? "Precio máximo fijo publicado por la constructora"
        : "Precio desde publicado por la constructora",
      description: text.slice(0, 800),
      source: "construcciones-planificadas",
      source_name: "Construcciones Planificadas",
      source_url: `${origin}/portfolio/${slug}/`,
      source_kind: "official",
    }];
  });
}

const [sitemap, activeCategory] = await Promise.all([
  fetchText(sitemapUrl),
  fetchText(activeCategoryUrl),
]);
const sitemapUrls = portfolioUrls(sitemap);
const activeUrls = portfolioUrls(activeCategory);
const activeSlugs = new Set(activeUrls.map(slugFromUrl).filter(Boolean));
const discoveredUrls = [...new Set([...sitemapUrls, ...activeUrls])].sort();
const records = [];
const exclusions = [];

for (const url of discoveredUrls) {
  const slug = slugFromUrl(url);
  if (!slug) continue;
  if (!activeSlugs.has(slug)) {
    exclusions.push({ slug, url, reasons: ["not_in_active_category"] });
    continue;
  }
  if (umbrellaDevelopments.has(slug)) {
    exclusions.push({ slug, url, reasons: ["umbrella_development_leaf_projects_collected"] });
    continue;
  }
  if (auditedActiveHousingWithoutPrice.has(slug)) {
    exclusions.push({ slug, url, reasons: ["active_housing_missing_disclosed_price"] });
    continue;
  }
  if (staleActiveUrls.has(slug)) {
    exclusions.push({ slug, url, reasons: ["stale_active_category_url_http_404"] });
    continue;
  }
  const project = projects[slug];
  if (!project) {
    exclusions.push({ slug, url, reasons: ["not_active_apartment_project"] });
    continue;
  }
  try {
    const html = await fetchText(url);
    const typologies = parseTypologies(html, slug, project);
    const representative = [...typologies].sort((a, b) => a.price_cop - b.price_cop)[0];
    if (!representative) {
      exclusions.push({ slug, url, reasons: ["missing_current_priced_typologies"] });
      continue;
    }
    records.push({
      id: `CP-${slug}`,
      source: "construcciones-planificadas",
      source_name: "Construcciones Planificadas",
      source_kind: "official",
      developer_name: "Construcciones Planificadas S.A.",
      listing_url: url,
      title: project.title,
      result_type: "Proyecto",
      operation_type: "Venta",
      project_status: "En construcción",
      delivery_date: null,
      price_cop: representative.price_cop,
      area_m2: representative.area_m2,
      bedrooms: representative.bedrooms ?? 0,
      bathrooms: representative.bathrooms ?? 0,
      parking_spaces: representative.parking_spaces,
      stratum: null,
      latitude: project.latitude,
      longitude: project.longitude,
      coordinate_precision: "listing",
      country: "Colombia",
      state: "Bogotá D.C.",
      city: "Bogotá D.C.",
      municipality: "Bogotá",
      market: "bogota",
      locality: project.locality,
      zone: null,
      neighborhood: project.neighborhood,
      address: project.address,
      image_url: metaContent(html, "og:image"),
      typologies,
    });
  } catch (error) {
    exclusions.push({ slug, url, reasons: [error instanceof Error ? error.message : String(error)] });
  }
}

records.sort((a, b) => a.title.localeCompare(b.title, "es"));
exclusions.sort((a, b) => a.slug.localeCompare(b.slug, "es"));
const output = {
  schema_version: 1,
  source: "construcciones-planificadas",
  source_name: "Construcciones Planificadas",
  source_url: origin,
  source_kind: "official",
  geography: ["Bogotá D.C."],
  criteria: {
    transaction: "venta",
    property_type: "Apartamento",
    status_source: activeCategoryUrl,
    excluded_statuses: ["vendido", "terminado"],
  },
  status: "completed",
  scraped_at: new Date().toISOString(),
  discovered_count: discoveredUrls.length,
  active_category_count: activeUrls.length,
  record_count: records.length,
  exclusion_count: exclusions.length,
  records,
  exclusions,
};

await mkdir(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
process.stdout.write(
  `${JSON.stringify({ outputPath, discovered: discoveredUrls.length, active: activeUrls.length, records: records.length, exclusions: exclusions.length }, null, 2)}\n`,
);
