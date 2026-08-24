#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const uiRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(uiRoot, "..");
const scrapeDirectory = path.join(repositoryRoot, "scrapes");
const sourcePaths = [
  "metrocuadrado-bogota-rental-listings.json",
  "myhome-bogota-rental-listings.json",
].map((fileName) => path.join(scrapeDirectory, fileName));
const outputDirectory = path.join(uiRoot, "public", "data");
const catalogPath = path.join(outputDirectory, "rentals.json");
const reportPath = path.join(outputDirectory, "rentals-report.json");
const imageManifestPath = path.join(uiRoot, "public", "property-images", "manifest.json");

function sha(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function nullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validBogotaCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 4.25 &&
    latitude <= 5.25 &&
    longitude >= -74.85 &&
    longitude <= -73.65
  );
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

const exclusions = [];
const listings = [];
for (const record of recordsById.values()) {
  const reasons = [];
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  const priceCop = Number(record.price_cop);
  if (!/^Bogotá(?: D\.C\.)?$/i.test(record.city)) reasons.push("outside_bogota");
  if (!record.listing_url) reasons.push("missing_url");
  if (!validBogotaCoordinate(latitude, longitude)) reasons.push("invalid_coordinate");
  if (!Number.isFinite(priceCop) || priceCop <= 0) reasons.push("invalid_price");
  if (reasons.length) {
    exclusions.push({ id: record.id, reasons });
    continue;
  }

  const sourceName =
    record.source === "metrocuadrado"
      ? "Metrocuadrado"
      : record.source === "myhome"
        ? "MyHome"
        : record.source;
  const areaM2 = nullableNumber(record.area_m2);
  const material = {
    source: record.source,
    sourceName,
    sourceKind: "portal",
    resultType: "Inmueble",
    operationType: "Arriendo",
    projectName: record.title || null,
    projectStatus: null,
    deliveryDate: null,
    neighborhood: record.neighborhood ?? null,
    locality: record.locality ?? null,
    zone: record.zone ?? null,
    city: "Bogotá",
    market: "bogota",
    municipality: "Bogotá",
    priceCop,
    areaM2,
    bedrooms: Number(record.bedrooms),
    bathrooms: Number(record.bathrooms),
    parkingSpaces: nullableNumber(record.parking_spaces),
    stratum: nullableNumber(record.stratum),
    url: record.listing_url,
  };
  const imageEntry = imageManifest.entries?.[record.id];
  const hasLocalImage = imageEntry?.active !== false && imageEntry?.status === "available";
  listings.push({
    id: record.id,
    ...material,
    pricePerM2:
      areaM2 && areaM2 > 0 ? Math.round(priceCop / areaM2) : null,
    latitude,
    longitude,
    coordinatePrecision:
      record.coordinate_precision === "neighborhood_centroid"
        ? "neighborhood_centroid"
        : "listing",
    thumbnailUrl: hasLocalImage ? imageEntry.thumbnailPath : null,
    imageUrl: hasLocalImage ? imageEntry.detailPath : null,
    fingerprint: sha(material).slice(0, 16),
    dataWarnings:
      priceCop < 100_000 || priceCop > 100_000_000 ? ["rent_outlier"] : [],
  });
}

listings.sort((a, b) => a.id.localeCompare(b.id));
const catalogVersion = sha(
  listings.map(({ id, fingerprint, latitude, longitude, imageUrl }) => ({
    id,
    fingerprint,
    latitude,
    longitude,
    imageUrl,
  })),
).slice(0, 16);
const publishedAt = new Date().toISOString();
const summary = {
  sourceRecords: recordsById.size,
  publishedRecords: listings.length,
  excludedRecords: exclusions.length,
  approximateCoordinates: listings.filter(
    (listing) => listing.coordinatePrecision === "neighborhood_centroid",
  ).length,
  knownStratum: listings.filter((listing) => listing.stratum !== null).length,
  officialProjects: 0,
  sabanaProjects: 0,
  apartmentTypes: 0,
  sourceDifferences: 0,
};
const sourceUpdatedAt =
  sources
    .map(({ data }) => data.scraped_at ?? data.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? publishedAt;
const catalog = {
  schemaVersion: 1,
  catalogVersion,
  catalogKind: "rentals",
  publishedAt,
  sourceUpdatedAt,
  summary,
  listings,
};
const report = {
  generatedAt: publishedAt,
  catalogVersion,
  summary,
  inputs: sources.map(({ fileName, data }) => ({
    fileName,
    source: data.source,
    records: data.records.length,
    scrapedAt: data.scraped_at ?? null,
  })),
  exclusions,
  warningCounts: listings.reduce((counts, listing) => {
    for (const warning of listing.dataWarnings) {
      counts[warning] = (counts[warning] ?? 0) + 1;
    }
    return counts;
  }, {}),
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(catalogPath, `${JSON.stringify(catalog)}\n`, "utf8"),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
]);
process.stdout.write(
  `${JSON.stringify({ generatedAt: publishedAt, catalogVersion, summary }, null, 2)}\n`,
);
