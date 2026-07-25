#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(uiRoot, "..");
const sourcePath = path.join(repositoryRoot, "scrapes", "listings-master.json");
const outputDirectory = path.join(uiRoot, "public", "data");
const catalogPath = path.join(outputDirectory, "catalog.json");
const reportPath = path.join(outputDirectory, "catalog-report.json");

function sha(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isBogotaCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 4.4 &&
    latitude <= 4.9 &&
    longitude >= -74.3 &&
    longitude <= -73.9
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

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const exclusions = [];
const listings = [];

for (const record of source.records) {
  const reasons = [];
  if (record.listing_check_status !== "live") reasons.push("not_live");
  if (!record.listing_url) reasons.push("missing_url");
  if (!isBogotaCoordinate(record.latitude, record.longitude))
    reasons.push("invalid_coordinate");
  if (reasons.length) {
    exclusions.push({ id: record.listing_id, reasons });
    continue;
  }

  const material = {
    resultType: record.result_type === "Proyecto" ? "Proyecto" : "Inmueble",
    projectName: record.project_name ?? record.name ?? null,
    neighborhood: record.neighborhood ?? null,
    priceCop: Number(record.price_cop),
    areaM2: nullableNumber(record.area_m2),
    bedrooms: Number(record.bedrooms),
    bathrooms: Number(record.bathrooms),
    parkingSpaces: nullableNumber(record.parking_spaces),
    stratum: nullableNumber(record.stratum),
    url: record.listing_url,
  };

  listings.push({
    id: record.listing_id,
    ...material,
    city: record.city ?? "Bogotá D.C.",
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
    fingerprint: sha(material).slice(0, 16),
    dataWarnings: warningFlags(record),
  });
}

listings.sort((a, b) => a.id.localeCompare(b.id));
const contentForVersion = listings.map(
  ({ id, fingerprint, latitude, longitude, coordinatePrecision }) => ({
    id,
    fingerprint,
    latitude,
    longitude,
    coordinatePrecision,
  }),
);
const catalogVersion = sha(contentForVersion).slice(0, 16);
const publishedAt = new Date().toISOString();
const summary = {
  sourceRecords: source.records.length,
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
  sourceUpdatedAt: source.updated_at,
  summary,
  listings,
};
const report = {
  generatedAt: publishedAt,
  catalogVersion,
  summary,
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

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
