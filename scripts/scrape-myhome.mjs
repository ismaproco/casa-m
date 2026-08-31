#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const operation =
  process.argv
    .find((argument) => argument.startsWith("--operation="))
    ?.split("=")[1] ?? "sale";
if (operation !== "sale" && operation !== "rent") {
  throw new Error(`Unsupported operation: ${operation}`);
}
const isRental = operation === "rent";
const outputPath = path.join(
  repositoryRoot,
  "scrapes",
  isRental
    ? "myhome-bogota-rental-listings.json"
    : "myhome-bogota-listings.json",
);
const searchParameters =
  `type=apartamento&status=${isRental ? "for-rent" : "venta"}&location%5B0%5D=-`;
const sourceUrl = `https://www.myhome.com.co/busqueda/?${searchParameters}`;
const concurrency = 4;

function decodeHtml(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll("&nbsp;", " ")
    .replaceAll("&hellip;", "…")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function textContent(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function numberFrom(value) {
  const match = value.replaceAll(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function priceFrom(value) {
  const match = value.match(/\$\s*([\d.,]+)/);
  return match ? Number(match[1].replace(/\D/g, "")) : null;
}

function validCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 4.45 &&
    latitude <= 4.85 &&
    longitude >= -74.25 &&
    longitude <= -73.95
  );
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "CasaMapaLocalCatalog/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const html = await response.text();
  if (/cf-chl-|<title>Just a moment|verify you are human|access denied/i.test(html)) {
    throw new Error(`anti_bot:${url}`);
  }
  return html;
}

function parseCards(html) {
  const cards = [];
  for (const match of html.matchAll(
    /<article\s+class="[^"]*property-item[^"]*"[^>]*>([\s\S]*?)<\/article>/gi,
  )) {
    const card = match[1];
    const heading = card.match(
      /<h4[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!heading) continue;
    const meta = card.match(
      /<div\s+class="property-meta"[^>]*>([\s\S]*?)<\/div>/i,
    )?.[1];
    const values = meta
      ? textContent(meta)
          .split(/\s+/)
          .map((value) => numberFrom(value))
          .filter((value) => value !== null)
      : [];
    const title = textContent(heading[2]);
    const imageUrl = card.match(/\bdata-src="(https:[^"]+)"/i)?.[1] ?? null;
    const priceCop = priceFrom(
      card.match(/<h5\s+class="price"[^>]*>([\s\S]*?)<\/h5>/i)?.[1] ?? "",
    );
    const [areaM2, bedrooms, bathrooms, parkingSpaces] = values;
    cards.push({
      url: heading[1],
      title,
      imageUrl,
      priceCop,
      areaM2: areaM2 ?? null,
      bedrooms,
      bathrooms: bathrooms ?? 0,
      parkingSpaces: parkingSpaces ?? null,
      rawCard: textContent(card),
    });
  }
  return cards;
}

function tableValues(html) {
  const values = new Map();
  for (const match of html.matchAll(
    /<tr[^>]*>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<\/tr>/gi,
  )) {
    values.set(
      textContent(match[1]).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
      textContent(match[2]),
    );
  }
  return values;
}

function firstTableNumber(values, labels) {
  for (const label of labels) {
    const value = values.get(label);
    if (value) return numberFrom(value);
  }
  return null;
}

function neighborhoodFromTitle(title) {
  return (
    title
      .split(/\s+[–—]\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .at(-1) ?? null
  );
}

function parseDetail(card, html) {
  const propertyId = textContent(
    html.match(
      /<span\s+class="pro_price id"[^>]*>([\s\S]*?)<\/span>/i,
    )?.[1] ?? "",
  );
  const marker = html.match(
    /propertyMarkerInfo\s*=\s*\{[^}]*"lat":"([^"]+)"[^}]*"lang":"([^"]+)"/i,
  );
  const latitude = marker ? Number(marker[1]) : Number.NaN;
  const longitude = marker ? Number(marker[2]) : Number.NaN;
  const hasCoordinate = validCoordinate(latitude, longitude);
  const values = tableValues(html);
  const areaM2 = firstTableNumber(values, ["area"]);
  const bedrooms = firstTableNumber(values, ["alcobas", "habitaciones"]);
  const bathrooms = firstTableNumber(values, ["banos"]);
  const parkingSpaces = firstTableNumber(values, [
    "parqueaderos",
    "garajes",
  ]);
  const stratum = firstTableNumber(values, ["estrato"]);
  const detailPrice = priceFrom(
    html.match(/<div\s+class="prop_extra"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ??
      "",
  );
  const priceCop = card.priceCop ?? detailPrice;
  const bedroomCount = bedrooms ?? card.bedrooms;
  if (!propertyId) throw new Error(`missing_property_id:${card.url}`);
  if (!hasCoordinate) throw new Error(`missing_coordinate:${propertyId}`);
  if (!Number.isFinite(bedroomCount) || bedroomCount < 0) {
    throw new Error(`invalid_bedrooms:${propertyId}`);
  }
  if (!priceCop) throw new Error(`missing_price:${propertyId}`);
  return {
    id: `${isRental ? "MYHOME-RENT" : "MYHOME"}-${propertyId}`,
    source: "myhome",
    source_id: propertyId,
    result_type: "Inmueble",
    operation_type: isRental ? "Arriendo" : "Venta",
    title: card.title,
    neighborhood: neighborhoodFromTitle(card.title),
    locality: null,
    zone: null,
    city: "Bogotá D.C.",
    price_cop: priceCop,
    area_m2: areaM2 ?? card.areaM2,
    bedrooms: bedroomCount,
    bathrooms: bathrooms ?? card.bathrooms,
    parking_spaces: parkingSpaces ?? card.parkingSpaces,
    stratum: stratum && stratum >= 1 && stratum <= 6 ? stratum : null,
    listing_url: card.url,
    image_url: card.imageUrl,
    latitude: hasCoordinate ? latitude : null,
    longitude: hasCoordinate ? longitude : null,
    coordinate_precision: hasCoordinate ? "listing" : null,
    raw_card: card.rawCard,
  };
}

async function collectCards() {
  const firstHtml = await fetchHtml(sourceUrl);
  const resultCount = Number(
    firstHtml.match(/<strong>(\d+)<\/strong>\s*resultados/i)?.[1] ?? 0,
  );
  const pageCount = Math.max(1, Math.ceil(resultCount / 20));
  const pages = [firstHtml];
  for (let page = 2; page <= pageCount; page += 1) {
    pages.push(
      await fetchHtml(
        `https://www.myhome.com.co/busqueda/page/${page}/?${searchParameters}`,
      ),
    );
  }
  const cards = pages.flatMap(parseCards);
  const unique = [...new Map(cards.map((card) => [card.url, card])).values()];
  if (unique.length !== resultCount) {
    throw new Error(`card_count:${unique.length}/${resultCount}`);
  }
  return unique;
}

async function enrichCards(cards) {
  const records = new Array(cards.length);
  const exclusions = [];
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < cards.length) {
      const index = cursor;
      cursor += 1;
      try {
        if (/(^|\W)(casa|oficina|lote|finca|local|consultorio)(\W|$)/i.test(cards[index].title)) {
          throw new Error("non_apartment");
        }
        const html = await fetchHtml(cards[index].url);
        records[index] = parseDetail(cards[index], html);
      } catch (error) {
        exclusions.push({
          url: cards[index].url,
          title: cards[index].title,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
      completed += 1;
      if (completed % 20 === 0 || completed === cards.length) {
        process.stdout.write(`Detalles ${completed}/${cards.length}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { records: records.filter(Boolean), exclusions };
}

async function auditListingAvailability(record) {
  try {
    const response = await fetch(record.listing_url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "CasaMapaLocalCatalog/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 429 || response.status >= 500) return "unknown";
    if (response.status === 404 || response.status === 410) return "unavailable";
    const html = await response.text();
    if (/propiedad no disponible|inmueble no disponible|ya no (?:se encuentra|est[aá]) disponible|publicaci[oó]n finalizada/i.test(html)) {
      return "unavailable";
    }
    return response.ok && html.includes(String(record.source_id))
      ? "available"
      : "unavailable";
  } catch {
    return "unknown";
  }
}

const cards = await collectCards();
process.stdout.write(`Tarjetas válidas: ${cards.length}\n`);
const { records: currentRecords, exclusions } = await enrichCards(cards);
const scrapedAt = new Date().toISOString();
let previousOutput = null;
try {
  previousOutput = JSON.parse(await readFile(outputPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const previousRecords = previousOutput?.records ?? [];
const previousById = new Map(previousRecords.map((record) => [record.id, record]));
const discoveredUrls = new Set(cards.map((card) => card.url));
const refreshedRecords = currentRecords.map((record) => {
  const previous = previousById.get(record.id);
  return {
    ...record,
    availability_status: "available",
    availability_check_method: "search_index",
    first_seen_at: previous
      ? previous.first_seen_at ?? previousOutput?.scraped_at ?? scrapedAt
      : scrapedAt,
    last_seen_at: scrapedAt,
    availability_checked_at: scrapedAt,
  };
});
const currentIds = new Set(refreshedRecords.map((record) => record.id));
const missingRecords = previousRecords.filter(
  (record) => !currentIds.has(record.id) && !discoveredUrls.has(record.listing_url),
);
const missingStatuses = new Map();
for (const record of missingRecords) {
  missingStatuses.set(record.id, await auditListingAvailability(record));
}
const retainedRecords = previousRecords
  .filter((record) => !currentIds.has(record.id))
  .map((record) => {
    const stillDiscovered = discoveredUrls.has(record.listing_url);
    const auditedStatus = stillDiscovered
      ? "available"
      : missingStatuses.get(record.id);
    const status =
      auditedStatus === "unknown"
        ? record.availability_check_method === "detail_page"
          ? record.availability_status
          : "available"
        : auditedStatus;
    return {
      ...record,
      availability_status: status,
      availability_check_method:
        auditedStatus === "unknown"
          ? record.availability_check_method ?? null
          : stillDiscovered
            ? "search_index"
            : "detail_page",
      first_seen_at: record.first_seen_at ?? previousOutput?.scraped_at ?? null,
      last_seen_at: status === "available"
        ? scrapedAt
        : record.last_seen_at ?? previousOutput?.scraped_at ?? null,
      availability_checked_at:
        auditedStatus === "unknown"
          ? record.availability_checked_at ?? null
          : scrapedAt,
    };
  });
const records = [...refreshedRecords, ...retainedRecords].sort((a, b) =>
  a.id.localeCompare(b.id),
);
const output = {
  schema_version: 1,
  source: "myhome",
  source_url: sourceUrl,
  criteria: {
    city: "Bogotá D.C.",
    transaction: isRental ? "arriendo" : "venta",
    property_type: "apartamento",
    minimum_bedrooms: 0,
  },
  scraped_at: scrapedAt,
  discovered_count: cards.length,
  record_count: records.length,
  available_count: records.filter(
    (record) => record.availability_status === "available",
  ).length,
  unavailable_count: records.filter(
    (record) => record.availability_status === "unavailable",
  ).length,
  excluded_count: exclusions.length,
  exclusions,
  records,
};

await mkdir(path.dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await rename(temporaryPath, outputPath);
process.stdout.write(`Guardados ${records.length} anuncios en ${outputPath}\n`);
