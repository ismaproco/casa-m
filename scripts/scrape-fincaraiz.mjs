import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const scrapeDirectory = path.join(repositoryRoot, "scrapes");
const outputPrefixArgument = process.argv.find((argument) =>
  argument.startsWith("--output-prefix="),
);
const outputPrefix =
  outputPrefixArgument?.split("=")[1] ?? "fincaraiz";
if (!/^[a-z0-9][a-z0-9-]*$/i.test(outputPrefix)) {
  throw new Error(`Invalid output prefix: ${outputPrefix}`);
}
const outputPath = path.join(
  scrapeDirectory,
  `${outputPrefix}-listings.json`,
);
const csvOutputPath = path.join(
  scrapeDirectory,
  `${outputPrefix}-listings.csv`,
);
const progressPath = path.join(
  scrapeDirectory,
  `${outputPrefix}-progress.json`,
);
const sourceUrl =
  process.argv.find((argument) => argument.startsWith("http")) ??
  "https://www.fincaraiz.com.co/venta/apartamentos/3-o-mas-habitaciones";
const maxPagesArgument = process.argv.find((argument) =>
  argument.startsWith("--max-pages="),
);
const requestedMaxPages = maxPagesArgument
  ? Number(maxPagesArgument.split("=")[1])
  : Number.POSITIVE_INFINITY;
const normalizationVersion = 4;
const concurrency = 10;
const maximumEmptyBatches = 6;
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36";

function pageUrl(page) {
  const url = new URL(sourceUrl);
  if (page > 1) url.searchParams.set("page", String(page));
  return url;
}

function parseNextData(html) {
  const match = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("FincaRaíz page did not include __NEXT_DATA__");
  return JSON.parse(match[1]);
}

async function fetchPage(page) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(pageUrl(page), {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "es-CO,es;q=0.9",
          "user-agent": userAgent,
        },
        redirect: "follow",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      const nextData = parseNextData(html);
      const search =
        nextData?.props?.pageProps?.fetchResult?.searchFast;
      if (!search?.data || !search?.paginatorInfo) {
        throw new Error("FincaRaíz search payload was missing");
      }
      return search;
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * 2 ** (attempt - 1)),
      );
    }
  }
  throw new Error(`Page ${page} failed after retries: ${lastError}`);
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const compact = String(value).trim().replace(/[^\d,.-]/g, "");
  const dotCount = (compact.match(/\./g) ?? []).length;
  const commaCount = (compact.match(/,/g) ?? []).length;
  let normalized = compact;

  if (dotCount > 0 && commaCount > 0) {
    normalized = compact.replace(/\./g, "").replace(",", ".");
  } else if (commaCount === 1) {
    normalized = compact.replace(",", ".");
  } else if (commaCount > 1) {
    normalized = compact.replace(/,/g, "");
  } else if (dotCount > 1) {
    normalized = compact.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sheetValue(property, field) {
  return property.technicalSheet?.find((item) => item.field === field)?.value;
}

function firstLocation(property, key) {
  return property.locations?.[key]?.[0]?.name ?? null;
}

function normalizeProperty(property) {
  const sourceLatitude = numericValue(property.latitude);
  const sourceLongitude = numericValue(property.longitude);
  const coordinatesAreInColombia =
    sourceLatitude !== null &&
    sourceLongitude !== null &&
    sourceLatitude >= -5 &&
    sourceLatitude <= 14 &&
    sourceLongitude >= -82 &&
    sourceLongitude <= -66;
  const latitude = coordinatesAreInColombia ? sourceLatitude : null;
  const longitude = coordinatesAreInColombia ? sourceLongitude : null;
  const sourceArea =
    numericValue(property.m2Built) ??
    numericValue(property.m2) ??
    numericValue(sheetValue(property, "m2Built"));
  const area = sourceArea !== null && sourceArea > 0 ? sourceArea : null;
  const price =
    numericValue(property.price?.amount) ??
    numericValue(property.price?.admin_included);
  const bedrooms =
    numericValue(property.bedrooms) ??
    numericValue(sheetValue(property, "bedrooms"));
  const bathrooms =
    numericValue(property.bathrooms) ??
    numericValue(sheetValue(property, "bathrooms"));
  const parking =
    numericValue(property.garage) ??
    numericValue(sheetValue(property, "garage"));
  const sourceStratum =
    numericValue(property.stratum) ??
    numericValue(sheetValue(property, "stratum"));
  const stratum =
    sourceStratum !== null && sourceStratum >= 1 && sourceStratum <= 6
      ? sourceStratum
      : null;
  let listingUrl = null;
  try {
    const candidate = new URL(property.link, sourceUrl);
    if (
      candidate.hostname === "fincaraiz.com.co" ||
      candidate.hostname.endsWith(".fincaraiz.com.co")
    ) {
      listingUrl = candidate.href;
    }
  } catch {
    // Preserve the source value below without presenting it as a usable URL.
  }

  return {
    id: `FR-${property.id}`,
    source: "fincaraiz",
    source_id: String(property.id),
    listing_url: listingUrl,
    raw_listing_link: property.link ?? null,
    title: property.title ?? null,
    result_type: property.property_type?.name ?? "Apartamento",
    operation_type: property.operation_type?.name ?? "Venta",
    price_cop: price,
    area_m2: area,
    price_per_m2:
      price && area ? Math.round(price / area) : null,
    bedrooms,
    bathrooms,
    parking_spaces: parking,
    stratum,
    source_stratum: sourceStratum,
    latitude,
    longitude,
    source_latitude: sourceLatitude,
    source_longitude: sourceLongitude,
    coordinate_precision:
      latitude !== null && longitude !== null ? "listing" : null,
    country: firstLocation(property, "country"),
    state: firstLocation(property, "state"),
    city: firstLocation(property, "city"),
    locality: firstLocation(property, "locality"),
    zone: firstLocation(property, "zone"),
    neighborhood:
      firstLocation(property, "neighbourhood") ??
      property.locations?.location_main?.name ??
      null,
    owner_name: property.owner?.name ?? null,
    image_url:
      property.images?.[0]?.image ??
      (property.img ? String(property.img).split("#")[0] : null),
    image_count: numericValue(property.image_count),
    created_at: property.created_at ?? null,
    updated_at: property.updated_at ?? null,
  };
}

async function readProgress() {
  try {
    const progress = JSON.parse(await readFile(progressPath, "utf8"));
    if (progress.source_url !== sourceUrl) return null;
    if (progress.normalization_version !== normalizationVersion) return null;
    if (progress.records?.length === 0) {
      try {
        const existingOutput = JSON.parse(await readFile(outputPath, "utf8"));
        if (
          existingOutput.source_url === sourceUrl &&
          existingOutput.normalization_version === normalizationVersion
        ) {
          progress.records = existingOutput.records;
        }
      } catch {
        // A missing output simply means the scrape will rebuild its records.
      }
    }
    return progress;
  } catch {
    return null;
  }
}

async function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`);
  await rename(temporaryPath, filePath);
}

async function atomicWriteText(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, value);
  await rename(temporaryPath, filePath);
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function saveProgress(completedPages, records, pageInfo) {
  await atomicWrite(progressPath, {
    schema_version: 1,
    normalization_version: normalizationVersion,
    source_url: sourceUrl,
    updated_at: new Date().toISOString(),
    completed_pages: completedPages,
    page_info: pageInfo,
    records,
  });
}

await mkdir(scrapeDirectory, { recursive: true });

const firstPage = await fetchPage(1);
const lastPage = Math.min(
  firstPage.paginatorInfo.lastPage,
  requestedMaxPages,
);
const previous = await readProgress();
const completedPages = new Set(
  (previous?.completed_pages ?? []).filter((page) => page <= lastPage),
);
const recordsById = new Map(
  (previous?.records ?? []).map((record) => [record.id, record]),
);

if (!completedPages.has(1)) {
  for (const property of firstPage.data) {
    const record = normalizeProperty(property);
    recordsById.set(record.id, record);
  }
  completedPages.add(1);
}

const pendingPages = [];
for (let page = 2; page <= lastPage; page += 1) {
  if (!completedPages.has(page)) pendingPages.push(page);
}

console.log(
  JSON.stringify({
    sourceUrl,
    reportedTotal: firstPage.paginatorInfo.total,
    pages: lastPage,
    resumedPages: completedPages.size,
    pendingPages: pendingPages.length,
  }),
);

let consecutiveEmptyBatches = 0;
let stopReason = null;

for (let offset = 0; offset < pendingPages.length; offset += concurrency) {
  const batch = pendingPages.slice(offset, offset + concurrency);
  const recordsBeforeBatch = recordsById.size;
  const results = await Promise.all(
    batch.map(async (page) => ({ page, search: await fetchPage(page) })),
  );
  for (const { page, search } of results) {
    for (const property of search.data) {
      const record = normalizeProperty(property);
      recordsById.set(record.id, record);
    }
    completedPages.add(page);
  }

  const processed = offset + batch.length;
  const addedInBatch = recordsById.size - recordsBeforeBatch;
  consecutiveEmptyBatches =
    addedInBatch === 0 ? consecutiveEmptyBatches + 1 : 0;
  const reachedRepeatBoundary =
    consecutiveEmptyBatches >= maximumEmptyBatches;

  if (
    processed % 30 < concurrency ||
    processed === pendingPages.length ||
    reachedRepeatBoundary
  ) {
    const records = [...recordsById.values()];
    await saveProgress(
      [...completedPages].sort((a, b) => a - b),
      records,
      firstPage.paginatorInfo,
    );
    console.log(
      JSON.stringify({
        completedPages: completedPages.size,
        totalPages: lastPage,
        records: records.length,
      }),
    );
  }

  if (reachedRepeatBoundary) {
    stopReason =
      `${maximumEmptyBatches * concurrency} consecutive pages produced ` +
      "no new listing IDs; FincaRaíz is repeating its deep-result fallback.";
    console.log(JSON.stringify({ stopReason }));
    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 120));
}

const records = [...recordsById.values()].sort((a, b) =>
  a.id.localeCompare(b.id),
);
const withCoordinates = records.filter(
  (record) => record.latitude !== null && record.longitude !== null,
).length;
const cityCounts = Object.entries(
  records.reduce((counts, record) => {
    const city = record.city ?? "Unknown";
    counts[city] = (counts[city] ?? 0) + 1;
    return counts;
  }, {}),
).sort((a, b) => b[1] - a[1]);

const output = {
  schema_version: 1,
  normalization_version: normalizationVersion,
  source: "fincaraiz",
  source_url: sourceUrl,
  scraped_at: new Date().toISOString(),
  reported_total: firstPage.paginatorInfo.total,
  pages_scraped: completedPages.size,
  last_page_scraped: Math.max(...completedPages),
  stopped_at_repeat_boundary: stopReason !== null,
  stop_reason: stopReason,
  records_count: records.length,
  records_with_coordinates: withCoordinates,
  city_counts: Object.fromEntries(cityCounts),
  records,
};

await atomicWrite(outputPath, output);
const csvFields = [
  "id",
  "source_id",
  "listing_url",
  "title",
  "price_cop",
  "area_m2",
  "price_per_m2",
  "bedrooms",
  "bathrooms",
  "parking_spaces",
  "stratum",
  "latitude",
  "longitude",
  "state",
  "city",
  "locality",
  "zone",
  "neighborhood",
  "owner_name",
  "image_url",
  "created_at",
  "updated_at",
];
await atomicWriteText(
  csvOutputPath,
  `${[
    csvFields.join(","),
    ...records.map((record) =>
      csvFields.map((field) => csvCell(record[field])).join(","),
    ),
  ].join("\n")}\n`,
);
await atomicWrite(progressPath, {
  schema_version: 1,
  normalization_version: normalizationVersion,
  source_url: sourceUrl,
  completed_at: output.scraped_at,
  completed_pages: [...completedPages].sort((a, b) => a - b),
  records,
});

console.log(
  JSON.stringify({
    outputPath,
    csvOutputPath,
    records: records.length,
    withCoordinates,
    topCities: cityCounts.slice(0, 10),
  }),
);
