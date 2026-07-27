#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const scrapeDirectory = path.join(repositoryRoot, "scrapes");
const strataArgument =
  process.argv
    .find((argument) => argument.startsWith("--strata="))
    ?.split("=")[1] ?? "1,2";
const strata = strataArgument
  .split(",")
  .map(Number)
  .filter((value) => Number.isInteger(value) && value >= 1 && value <= 6);
const outputPrefix =
  process.argv
    .find((argument) => argument.startsWith("--output-prefix="))
    ?.split("=")[1] ?? `metrocuadrado-bogota-estrato-${strata.join("-")}`;

if (strata.length === 0) throw new Error("At least one valid stratum is required");
if (!/^[a-z0-9][a-z0-9-]*$/i.test(outputPrefix)) {
  throw new Error(`Invalid output prefix: ${outputPrefix}`);
}

const outputPath = path.join(scrapeDirectory, `${outputPrefix}-listings.json`);
const csvOutputPath = path.join(
  scrapeDirectory,
  `${outputPrefix}-listings.csv`,
);
const concurrency = 6;
const pageSize = 50;
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36";

function sourceUrl(stratum, page = 1) {
  const url = new URL(
    `https://www.metrocuadrado.com/apartamento/venta/bogota/` +
      `3-habitaciones-estrato-${stratum}/`,
  );
  url.searchParams.set("search", "form");
  if (page > 1) url.searchParams.set("page", String(page));
  return url;
}

function flightPayload(html) {
  const chunks = [];
  for (const match of html.matchAll(
    /self\.__next_f\.push\((\[.*?\])\)<\/script>/gs,
  )) {
    try {
      const value = JSON.parse(match[1]);
      if (typeof value[1] === "string") chunks.push(value[1]);
    } catch {
      // Ignore unrelated or partially streamed React Flight chunks.
    }
  }
  return chunks.join("");
}

function parseObjectAfter(payload, marker) {
  const markerIndex = payload.indexOf(marker);
  const start = payload.indexOf("{", markerIndex + marker.length);
  if (markerIndex < 0 || start < 0) {
    throw new Error(`Metrocuadrado payload did not include ${marker}`);
  }

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
  throw new Error(`Metrocuadrado payload contained an incomplete ${marker}`);
}

async function loadSearchConfig(stratum) {
  const response = await fetch(sourceUrl(stratum), {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "es-CO,es;q=0.9",
      "user-agent": userAgent,
    },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`Metrocuadrado config HTTP ${response.status}`);
  const payload = flightPayload(await response.text());
  return parseObjectAfter(payload, '"env":');
}

async function fetchResults(config, stratum, from) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const url = new URL("/rest-search/search", config.apiUrl);
      url.searchParams.set("size", String(pageSize));
      url.searchParams.set("from", String(from));
      url.searchParams.set("realEstateTypeList", "apartamento");
      url.searchParams.set("realEstateBusinessList", "venta");
      url.searchParams.set("city", "bogota");
      url.searchParams.set("roomList", "3");
      url.searchParams.set("stratumList", String(stratum));
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "accept-language": "es-CO,es;q=0.9",
          "x-api-key": config.apiKey,
          "user-agent": userAgent,
        },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * 2 ** (attempt - 1)),
        );
      }
    }
  }
  throw new Error(
    `Stratum ${stratum}, offset ${from} failed after retries: ${lastError}`,
  );
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinates(property) {
  const latitude = numericValue(property.localizacion?.lat);
  const longitude = numericValue(property.localizacion?.lon);
  const valid =
    latitude !== null &&
    longitude !== null &&
    latitude >= 3.7 &&
    latitude <= 5.2 &&
    longitude >= -75 &&
    longitude <= -73.4;
  return valid
    ? { latitude, longitude, precision: "listing" }
    : { latitude: null, longitude: null, precision: null };
}

function normalizeProperty(property, requestedStratum) {
  const sourceId = String(property.midinmueble);
  const area =
    numericValue(property.marea) ??
    numericValue(property.mareac) ??
    numericValue(property.areaprivada);
  const price = numericValue(property.mvalorventa);
  const bedrooms = numericValue(property.mnrocuartos);
  const bathrooms = numericValue(property.mnrobanos);
  const parking = numericValue(property.mnrogarajes);
  const stratum = numericValue(property.estrato) ?? requestedStratum;
  const coordinate = coordinates(property);

  return {
    id: `MC-${sourceId}`,
    source: "metrocuadrado",
    source_id: sourceId,
    listing_url: new URL(
      property.link ?? property.data?.murldetalle,
      "https://www.metrocuadrado.com",
    ).href,
    raw_listing_link: property.link ?? property.data?.murldetalle ?? null,
    title: property.title ?? null,
    result_type:
      property.categoria === "Proyecto" || property.mnombreproyecto
        ? "Proyecto"
        : "Apartamento",
    operation_type: "Venta",
    price_cop: price,
    area_m2: area,
    price_per_m2:
      price !== null && area !== null && area > 0
        ? Math.round(price / area)
        : null,
    bedrooms,
    bathrooms,
    parking_spaces: parking,
    stratum,
    source_stratum: numericValue(property.estrato),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    source_latitude: coordinate.latitude,
    source_longitude: coordinate.longitude,
    coordinate_precision: coordinate.precision,
    country: "Colombia",
    state: "Bogotá D.C.",
    city: property.mciudad?.nombre ?? "Bogotá D.C.",
    locality: null,
    zone: property.mzona?.nombre ?? null,
    neighborhood:
      property.mnombrecomunbarrio ?? property.mbarrio ?? null,
    owner_name: property.data?.mnombrevisitor ?? null,
    image_url: property.imageLink ?? null,
    image_count: Array.isArray(property.mgaleriainmueble)
      ? property.mgaleriainmueble.length
      : null,
    created_at: null,
    updated_at: null,
  };
}

async function atomicWrite(filePath, content) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

await mkdir(scrapeDirectory, { recursive: true });

const recordsById = new Map();
const strataSummary = [];

for (const stratum of strata) {
  const config = await loadSearchConfig(stratum);
  const rawById = new Map();
  let reportedTotal = 0;
  let totalPages = 0;
  let noGrowthPasses = 0;

  for (let pass = 1; pass <= 5; pass += 1) {
    const first = await fetchResults(config, stratum, 0);
    reportedTotal = Math.max(reportedTotal, first.totalEntries);
    totalPages = Math.ceil(reportedTotal / pageSize);
    const pageResults = [{ page: 1, results: first.results }];

    for (let start = 2; start <= totalPages; start += concurrency) {
      const pages = Array.from(
        { length: Math.min(concurrency, totalPages - start + 1) },
        (_, offset) => start + offset,
      );
      pageResults.push(
        ...(await Promise.all(
          pages.map(async (page) => ({
            page,
            results: (
              await fetchResults(config, stratum, pageSize * (page - 1))
            ).results,
          })),
        )),
      );
    }

    const before = rawById.size;
    for (const { results } of pageResults) {
      for (const property of results) {
        rawById.set(String(property.midinmueble), property);
      }
    }
    noGrowthPasses = rawById.size === before ? noGrowthPasses + 1 : 0;
    if (rawById.size >= reportedTotal || noGrowthPasses >= 2) break;
  }

  const acceptedIds = new Set();
  for (const property of rawById.values()) {
    const record = normalizeProperty(property, stratum);
    if (
      record.bedrooms === null ||
      record.bedrooms < 3 ||
      record.stratum !== stratum ||
      !/^Bogotá(?: D\.C\.)?$/i.test(record.city)
    ) {
      continue;
    }
    recordsById.set(record.id, record);
    acceptedIds.add(record.id);
  }

  strataSummary.push({
    stratum,
    reported_total: reportedTotal,
    pages: totalPages,
    accepted: acceptedIds.size,
  });
  console.log(JSON.stringify(strataSummary.at(-1)));
}

const records = [...recordsById.values()].sort((a, b) =>
  a.id.localeCompare(b.id),
);
const scrapedAt = new Date().toISOString();
const output = {
  schema_version: 1,
  source: "metrocuadrado",
  source_urls: strata.map((stratum) => sourceUrl(stratum).href),
  scraped_at: scrapedAt,
  filters: {
    city: "Bogotá D.C.",
    property_type: "Apartamento",
    operation_type: "Venta",
    minimum_bedrooms: 3,
    strata,
  },
  strata_summary: strataSummary,
  records_count: records.length,
  records_with_listing_urls: records.filter((record) => record.listing_url)
    .length,
  records_with_coordinates: records.filter(
    (record) => record.latitude !== null && record.longitude !== null,
  ).length,
  records,
};

await atomicWrite(outputPath, `${JSON.stringify(output)}\n`);

const csvFields = [
  "id",
  "source",
  "source_id",
  "listing_url",
  "title",
  "result_type",
  "price_cop",
  "area_m2",
  "price_per_m2",
  "bedrooms",
  "bathrooms",
  "parking_spaces",
  "stratum",
  "latitude",
  "longitude",
  "city",
  "zone",
  "neighborhood",
  "owner_name",
  "image_url",
];
await atomicWrite(
  csvOutputPath,
  `${[
    csvFields.join(","),
    ...records.map((record) =>
      csvFields.map((field) => csvCell(record[field])).join(","),
    ),
  ].join("\n")}\n`,
);

console.log(
  JSON.stringify(
    {
      outputPath,
      csvOutputPath,
      records: output.records_count,
      withCoordinates: output.records_with_coordinates,
      withUrls: output.records_with_listing_urls,
      strataSummary,
    },
    null,
    2,
  ),
);
