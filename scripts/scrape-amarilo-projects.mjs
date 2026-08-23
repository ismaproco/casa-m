#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputPath = path.join(
  repositoryRoot,
  "scrapes",
  "amarilo-bogota-new-projects.json",
);
const sourceUrl = "https://amarilo.com.co/proyectos";
const apiUrl = new URL("https://apiweb.amarilo.com.co/search/v1/proyecto");
apiUrl.searchParams.set("filter[field_proy_ubicacion__ciudad]", "Bogotá");
apiUrl.searchParams.set("page[limit]", "100");
const duplicateProjectNames = new Set(["zermatt"]);
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36";
const execFileAsync = promisify(execFile);

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedName(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function decodeHtml(value) {
  return value
    .replace(/<!--.*?-->/gs, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .replace(/\*+$/g, "")
    .trim();
}

async function fetchText(url, accept = "text/html,application/xhtml+xml") {
  const { stdout: text } = await execFileAsync(
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
      `accept: ${accept}`,
      "--header",
      "accept-language: es-CO,es;q=0.9",
      "--user-agent",
      userAgent,
      String(url),
    ],
    { maxBuffer: 25 * 1024 * 1024 },
  );
  if (/cf-chl-|verify you are human|access denied|captcha/i.test(text)) {
    throw new Error(`anti_bot:${url}`);
  }
  return text;
}

async function deliveryDate(url, state) {
  if (state === "Entrega inmediata") return "Inmediata";
  const html = await fetchText(url);
  const match = html.match(/Fecha entrega:\s*(?:<[^>]+>)*(.{1,300}?)(?:<\/strong>|<style)/i);
  return match ? decodeHtml(match[1]) : null;
}

const payload = JSON.parse(await fetchText(apiUrl, "application/json"));
if (!Array.isArray(payload.data)) throw new Error("invalid_amarilo_payload");

const records = [];
const exclusions = [];
for (const project of payload.data) {
  const sourceId = String(project.nid);
  if (project.field_proy_tipo_inmueble !== "Apartamento") {
    exclusions.push({ id: sourceId, reason: "not_apartment" });
    continue;
  }
  if (duplicateProjectNames.has(normalizedName(project.title))) {
    exclusions.push({ id: sourceId, reason: "duplicate_existing_project" });
    continue;
  }

  const figures = project.field_proy_cifras ?? {};
  const price = numeric(figures.field_proy_precio_desde);
  const area = numeric(figures.field_proy_area_desde);
  const bedrooms = numeric(figures.field_proy_habitaciones);
  const bathrooms = numeric(figures.field_proy_banos);
  const [longitude, latitude] = String(project.field_proy_geolocalizacion ?? "")
    .split(",")
    .map(numeric);
  const complete =
    price !== null &&
    price > 0 &&
    area !== null &&
    area > 0 &&
    bedrooms !== null &&
    bathrooms !== null &&
    latitude !== null &&
    longitude !== null &&
    latitude >= 4.45 &&
    latitude <= 4.85 &&
    longitude >= -74.25 &&
    longitude <= -73.95;
  if (!complete) {
    exclusions.push({ id: sourceId, reason: "incomplete_or_non_bogota_data" });
    continue;
  }

  const listingUrl = new URL(project.url, "https://amarilo.com.co").href;
  let delivery = null;
  try {
    delivery = await deliveryDate(listingUrl, project.field_proy_estado);
  } catch (error) {
    exclusions.push({
      id: sourceId,
      reason: error instanceof Error ? error.message : String(error),
    });
    continue;
  }
  records.push({
    id: `AMARILO-${sourceId}`,
    source: "amarilo",
    source_id: sourceId,
    listing_url: listingUrl,
    title: project.title,
    result_type: "Proyecto",
    operation_type: "Venta",
    project_status: project.field_proy_estado || "Proyecto nuevo",
    delivery_date: delivery,
    price_cop: price,
    area_m2: area,
    price_per_m2: Math.round(price / area),
    bedrooms,
    bathrooms,
    parking_spaces: null,
    stratum: null,
    latitude,
    longitude,
    coordinate_precision: "listing",
    country: "Colombia",
    state: "Bogotá D.C.",
    city: "Bogotá D.C.",
    locality: null,
    zone: null,
    neighborhood: project.field_grandes_desarrollo || null,
    address: project.field_proy_direccion || null,
    image_url: project.field_proy_galeria?.[0] ?? null,
    raw_card: `${project.title} · ${project.field_proy_estado}`,
  });
}

records.sort((a, b) => a.title.localeCompare(b.title, "es"));
exclusions.sort((a, b) => a.id.localeCompare(b.id));
const scrapedAt = new Date().toISOString();
const output = {
  schema_version: 1,
  source: "amarilo",
  source_url: sourceUrl,
  api_url: apiUrl.href,
  criteria: {
    city: "Bogotá D.C.",
    transaction: "venta",
    property_type: "Apartamento",
    states: ["Sobre planos", "Entrega inmediata"],
  },
  scraped_at: scrapedAt,
  discovered_projects: payload.totalRows ?? payload.data.length,
  record_count: records.length,
  excluded_count: exclusions.length,
  exclusions,
  records,
};

await mkdir(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
process.stdout.write(
  `Guardados ${records.length} proyectos nuevos de Amarilo en Bogotá\n`,
);
