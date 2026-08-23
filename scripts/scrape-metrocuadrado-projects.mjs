#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputPath = path.join(
  repositoryRoot,
  "scrapes",
  "metrocuadrado-bogota-construction-projects.json",
);
const sourceUrl =
  "https://www.metrocuadrado.com/proyectos-vivienda-nueva/venta/bogota/";
const pageSize = 50;
const concurrency = 6;
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36";

function flightPayload(html) {
  const chunks = [];
  for (const match of html.matchAll(
    /self\.__next_f\.push\((\[.*?\])\)<\/script>/gs,
  )) {
    try {
      const value = JSON.parse(match[1]);
      if (typeof value[1] === "string") chunks.push(value[1]);
    } catch {
      // Ignore unrelated streamed React chunks.
    }
  }
  return chunks.join("");
}

function parseObjectAfter(payload, marker) {
  const markerIndex = payload.indexOf(marker);
  const start = payload.indexOf("{", markerIndex + marker.length);
  if (markerIndex < 0 || start < 0) throw new Error(`missing_payload:${marker}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < payload.length; index += 1) {
    const character = payload[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(payload.slice(start, index + 1));
    }
  }
  throw new Error(`incomplete_payload:${marker}`);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "es-CO,es;q=0.9",
      "user-agent": userAgent,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  const text = await response.text();
  if (/cf-chl-|verify you are human|access denied/i.test(text)) {
    throw new Error(`anti_bot:${url}`);
  }
  return text;
}

async function loadConfig() {
  const payload = flightPayload(await fetchText(sourceUrl));
  return parseObjectAfter(payload, '"env":');
}

async function fetchResults(config, from) {
  const url = new URL("/rest-search/search", config.apiUrl);
  url.searchParams.set("size", String(pageSize));
  url.searchParams.set("from", String(from));
  url.searchParams.set("realEstateTypeList", "apartaestudio,apartamento");
  url.searchParams.set("realEstateBusinessList", "venta");
  url.searchParams.set("realEstateStatusList", "nuevo");
  url.searchParams.set("city", "bogota");
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "accept-language": "es-CO,es;q=0.9",
      "x-api-key": config.apiKey,
      "user-agent": userAgent,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`search_HTTP_${response.status}`);
  return response.json();
}

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(property, detail) {
  const sourceId = String(property.midinmueble);
  const rawArea =
    numeric(property.marea) ??
    numeric(property.mareac) ??
    numeric(property.areaprivada);
  // Some project units lose the decimal separator in Metrocuadrado's API
  // (for example, 92.37 m² is returned as 9237). Apartment units over
  // 1,000 m² are treated as these hundredths values.
  const area = rawArea !== null && rawArea > 1_000 ? rawArea / 100 : rawArea;
  const price = numeric(property.mvalorventa);
  const latitude = numeric(property.localizacion?.lat);
  const longitude = numeric(property.localizacion?.lon);
  const url = new URL(
    property.link ?? property.data?.murldetalle,
    "https://www.metrocuadrado.com",
  ).href;
  return {
    id: `MC-${sourceId}`,
    source: "metrocuadrado",
    source_id: sourceId,
    listing_url: url,
    raw_listing_link: property.link ?? property.data?.murldetalle ?? null,
    title: property.mnombreproyecto ?? property.title ?? null,
    result_type: "Proyecto",
    operation_type: "Venta",
    project_status: "En construcción",
    delivery_date: detail.deliveryDate,
    price_cop: price,
    area_m2: area,
    price_per_m2:
      price !== null && area !== null && area > 0
        ? Math.round(price / area)
        : null,
    bedrooms: numeric(property.mnrocuartos),
    bathrooms: numeric(property.mnrobanos),
    parking_spaces: numeric(property.mnrogarajes),
    stratum: numeric(property.estrato),
    latitude,
    longitude,
    coordinate_precision: "listing",
    country: "Colombia",
    state: "Bogotá D.C.",
    city: property.mciudad?.nombre ?? "Bogotá D.C.",
    locality: null,
    zone: property.mzona?.nombre ?? null,
    neighborhood: property.mnombrecomunbarrio ?? property.mbarrio ?? null,
    image_url: property.imageLink ?? null,
    raw_card: property.title ?? property.mnombreproyecto ?? sourceId,
  };
}

async function projectDetail(property) {
  const url = new URL(
    property.link ?? property.data?.murldetalle,
    "https://www.metrocuadrado.com",
  ).href;
  const html = await fetchText(url);
  const state = html.match(/Estado:\s*([^<]+)/i)?.[1]?.trim() ?? null;
  const deliveryDate =
    html.match(/Fecha de entrega:\s*([^<]+)/i)?.[1]?.trim() ?? null;
  return { state, deliveryDate };
}

const config = await loadConfig();
const first = await fetchResults(config, 0);
const pages = [first];
for (let from = pageSize; from < first.totalEntries; from += pageSize) {
  pages.push(await fetchResults(config, from));
}
const properties = [
  ...new Map(
    pages
      .flatMap((page) => page.results)
      .filter((property) => property.mnombreproyecto || property.categoria === "Proyecto")
      .map((property) => [String(property.midinmueble), property]),
  ).values(),
];

const records = [];
const exclusions = [];
let cursor = 0;
let completed = 0;
async function worker() {
  while (cursor < properties.length) {
    const index = cursor;
    cursor += 1;
    const property = properties[index];
    try {
      const detail = await projectDetail(property);
      if (!/^En Construcci[oó]n$/i.test(detail.state ?? "")) {
        exclusions.push({
          id: String(property.midinmueble),
          reason: "not_in_construction",
          state: detail.state,
        });
      } else {
        const record = normalize(property, detail);
        const valid =
          record.price_cop !== null &&
          record.area_m2 !== null &&
          record.bedrooms !== null &&
          record.bathrooms !== null &&
          record.latitude !== null &&
          record.longitude !== null &&
          /^Bogotá(?: D\.C\.)?$/i.test(record.city);
        if (valid) records.push(record);
        else exclusions.push({ id: record.source_id, reason: "incomplete_data" });
      }
    } catch (error) {
      exclusions.push({
        id: String(property.midinmueble),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    completed += 1;
    if (completed % 20 === 0 || completed === properties.length) {
      process.stdout.write(`Detalles ${completed}/${properties.length}\n`);
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
records.sort((a, b) => a.id.localeCompare(b.id));
exclusions.sort((a, b) => a.id.localeCompare(b.id));

const scrapedAt = new Date().toISOString();
const output = {
  schema_version: 1,
  source: "metrocuadrado",
  source_url: sourceUrl,
  criteria: {
    city: "Bogotá D.C.",
    transaction: "venta",
    property_types: ["apartaestudio", "apartamento"],
    property_status: "nuevo",
    project_status: "En construcción",
  },
  scraped_at: scrapedAt,
  discovered_units: properties.length,
  record_count: records.length,
  excluded_count: exclusions.length,
  exclusions,
  records,
};

await mkdir(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
process.stdout.write(`Guardados ${records.length} proyectos en construcción\n`);
