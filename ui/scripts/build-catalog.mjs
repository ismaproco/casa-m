#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(uiRoot, "..");
const sourcePaths = [
  "fincaraiz-stratified-listings.json",
  "fincaraiz-bogota-estrato-1-2-listings.json",
  "metrocuadrado-bogota-estrato-1-2-listings.json",
].map((fileName) => path.join(repositoryRoot, "scrapes", fileName));
const outputDirectory = path.join(uiRoot, "public", "data");
const catalogPath = path.join(outputDirectory, "catalog.json");
const reportPath = path.join(outputDirectory, "catalog-report.json");
const imageManifestPath = path.join(
  uiRoot,
  "public",
  "property-images",
  "manifest.json",
);

function sha(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isColombiaCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -5 &&
    latitude <= 14 &&
    longitude >= -82 &&
    longitude <= -66
  );
}

function nullableNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function warningFlags(record) {
  const warnings = [];
  if (record.price_cop < 50_000_000 || record.price_cop > 20_000_000_000) {
    warnings.push("price_outlier");
  }
  if (
    record.area_m2 !== null &&
    record.area_m2 !== undefined &&
    (!Number.isFinite(record.area_m2) ||
      record.area_m2 <= 0 ||
      record.area_m2 > 1_000)
  ) {
    warnings.push("area_outlier");
  }
  return warnings;
}

const sources = await Promise.all(
  sourcePaths.map(async (sourcePath) => ({
    fileName: path.basename(sourcePath),
    data: JSON.parse(await readFile(sourcePath, "utf8")),
  })),
);
let imageManifest = { entries: {} };
try {
  imageManifest = JSON.parse(await readFile(imageManifestPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const recordsById = new Map();
for (const { data } of sources) {
  for (const record of data.records) recordsById.set(record.id, record);
}
const bogotaRecords = [...recordsById.values()].filter((record) =>
  /^Bogotá(?: D\.C\.)?$/i.test(record.city),
);
const exclusions = [];
const listings = [];

for (const record of bogotaRecords) {
  const reasons = [];
  if (!record.listing_url) reasons.push("missing_url");
  if (!isColombiaCoordinate(record.latitude, record.longitude))
    reasons.push("invalid_coordinate");
  if (reasons.length) {
    exclusions.push({ id: record.id, reasons });
    continue;
  }

  const material = {
    resultType: record.result_type ?? "Inmueble",
    projectName: record.title || null,
    neighborhood: record.neighborhood ?? null,
    locality: record.locality ?? null,
    zone: record.zone ?? null,
    priceCop: Number(record.price_cop),
    areaM2: nullableNumber(record.area_m2),
    bedrooms: Number(record.bedrooms),
    bathrooms: Number(record.bathrooms),
    parkingSpaces: nullableNumber(record.parking_spaces),
    stratum: nullableNumber(record.stratum),
    url: record.listing_url,
  };
  const imageEntry = imageManifest.entries?.[record.id];
  const hasLocalImage =
    imageEntry?.active !== false && imageEntry?.status === "available";

  listings.push({
    id: record.id,
    ...material,
    city: "Bogotá",
    pricePerM2:
      material.areaM2 && material.areaM2 > 0
        ? Math.round(material.priceCop / material.areaM2)
        : null,
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    coordinatePrecision:
      record.coordinate_precision === "neighborhood_centroid"
        ? "neighborhood_centroid"
        : "listing",
    thumbnailUrl: hasLocalImage ? imageEntry.thumbnailPath : null,
    imageUrl: hasLocalImage ? imageEntry.detailPath : null,
    fingerprint: sha(material).slice(0, 16),
    dataWarnings: warningFlags(record),
  });
}

listings.sort((a, b) => a.id.localeCompare(b.id));
const contentForVersion = listings.map(
  ({
    id,
    fingerprint,
    latitude,
    longitude,
    coordinatePrecision,
    imageUrl,
  }) => ({
    id,
    fingerprint,
    latitude,
    longitude,
    coordinatePrecision,
    imageUrl,
  }),
);
const catalogVersion = sha(contentForVersion).slice(0, 16);
const publishedAt = new Date().toISOString();
const summary = {
  sourceRecords: bogotaRecords.length,
  publishedRecords: listings.length,
  excludedRecords: exclusions.length,
  approximateCoordinates: listings.filter(
    (listing) => listing.coordinatePrecision === "neighborhood_centroid",
  ).length,
  knownStratum: listings.filter((listing) => listing.stratum !== null).length,
};

const catalog = {
  schemaVersion: 1,
  catalogVersion,
  publishedAt,
  sourceUpdatedAt:
    sources
      .map(({ data }) => data.scraped_at ?? data.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? publishedAt,
  summary,
  listings,
};
const report = {
  generatedAt: publishedAt,
  catalogVersion,
  summary,
  inputs: sources.map(({ fileName, data }) => ({
    fileName,
    source: data.source ?? null,
    records: data.records.length,
    scrapedAt: data.scraped_at ?? data.updated_at ?? null,
  })),
  exclusions,
  warningCounts: listings.reduce((counts, listing) => {
    for (const warning of listing.dataWarnings) {
      counts[warning] = (counts[warning] ?? 0) + 1;
    }
    return counts;
  }, {}),
  images: {
    available: listings.filter((listing) => listing.imageUrl).length,
    missing: listings.filter((listing) => !listing.imageUrl).length,
    archived: Object.values(imageManifest.entries ?? {}).filter(
      (entry) => entry.active === false,
    ).length,
  },
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(catalogPath, `${JSON.stringify(catalog)}\n`, "utf8"),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
]);

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: report.generatedAt,
      catalogVersion: report.catalogVersion,
      summary: report.summary,
      warningCounts: report.warningCounts,
    },
    null,
    2,
  )}\n`,
);
