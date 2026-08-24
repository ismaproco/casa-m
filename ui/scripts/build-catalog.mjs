#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(uiRoot, "..");
const scrapeDirectory = path.join(repositoryRoot, "scrapes");
const standardSourceNames = [
  "fincaraiz-stratified-listings.json",
  "fincaraiz-bogota-estrato-1-2-listings.json",
  "metrocuadrado-bogota-estrato-1-2-listings.json",
  "metrocuadrado-bogota-construction-projects.json",
  "amarilo-bogota-new-projects.json",
  "facebook-home-bogota-listings.json",
  "myhome-bogota-listings.json",
  "arquitectura-concreto-bogota-sabana-projects.json",
];
const discoveredOfficialSourceNames = (await readdir(scrapeDirectory)).filter(
  (fileName) => /-bogota-sabana-projects\.json$/i.test(fileName),
);
const sourcePaths = [...new Set([
  ...standardSourceNames,
  ...discoveredOfficialSourceNames,
])].map((fileName) => path.join(scrapeDirectory, fileName));
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
const eligibleRecords = [...recordsById.values()].filter(
  (record) =>
    /^Bogotá(?: D\.C\.)?$/i.test(record.city) ||
    (record.result_type === "Proyecto" && record.market === "sabana"),
);
const exclusions = [];
let listings = [];

for (const record of eligibleRecords) {
  const reasons = [];
  if (!record.listing_url) reasons.push("missing_url");
  if (!isColombiaCoordinate(record.latitude, record.longitude))
    reasons.push("invalid_coordinate");
  if (reasons.length) {
    exclusions.push({ id: record.id, reasons });
    continue;
  }

  const material = {
    source: record.source ?? "fincaraiz",
    sourceName:
      record.source_name ??
      ({
        fincaraiz: "Finca Raíz",
        metrocuadrado: "Metrocuadrado",
        "facebook-home-bogota": "HOME Bogotá (Facebook)",
        myhome: "MyHome",
        amarilo: "Amarilo",
      }[record.source] ?? record.source),
    sourceKind:
      record.source_kind === "official" || record.source === "amarilo"
        ? "official"
        : "portal",
    developerName: record.developer_name ?? null,
    resultType: record.result_type ?? "Inmueble",
    projectName: record.title || null,
    projectStatus: record.project_status ?? null,
    deliveryDate: record.delivery_date ?? null,
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
    market: record.market === "sabana" ? "sabana" : "bogota",
    municipality:
      record.municipality ??
      (/^Bogotá(?: D\.C\.)?$/i.test(record.city) ? "Bogotá" : record.city),
  };
  const imageEntry = imageManifest.entries?.[record.id];
  const hasLocalImage =
    imageEntry?.active !== false && imageEntry?.status === "available";

  listings.push({
    id: record.id,
    ...material,
    city: material.market === "sabana" ? material.municipality : "Bogotá",
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
    typologies: Array.isArray(record.typologies)
      ? record.typologies.map((typology) => ({
          id: String(typology.id),
          name: typology.name ?? `${typology.area_m2} m²`,
          areaM2: Number(typology.area_m2),
          privateAreaM2: nullableNumber(typology.private_area_m2),
          bedrooms: nullableNumber(typology.bedrooms),
          bathrooms: nullableNumber(typology.bathrooms),
          parkingSpaces: nullableNumber(typology.parking_spaces),
          priceCop: nullableNumber(typology.price_cop),
          priceNote: typology.price_note ?? null,
          description: typology.description ?? null,
          source: typology.source ?? material.source,
          sourceName: typology.source_name ?? material.sourceName,
          sourceUrl: typology.source_url ?? material.url,
          sourceKind:
            typology.source_kind === "official" ? "official" : "portal",
        }))
      : [],
    fingerprint: sha(material).slice(0, 16),
    dataWarnings: warningFlags(record),
  });
}

function normalizedProjectName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/\b(proyecto|apartamentos?|torres?|etapa\s+\d+)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function projectTypology(listing) {
  return {
    id: listing.id,
    name: listing.areaM2 ? `${listing.areaM2} m²` : listing.id,
    areaM2: listing.areaM2,
    privateAreaM2: null,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    parkingSpaces: listing.parkingSpaces,
    priceCop: listing.priceCop,
    priceNote: null,
    description: null,
    source: listing.source,
    sourceName: listing.sourceName,
    sourceUrl: listing.url,
    sourceKind: listing.sourceKind,
  };
}

function evidenceFor(listing) {
  return {
    source: listing.source,
    sourceName: listing.sourceName,
    sourceKind: listing.sourceKind,
    url: listing.url,
    collectedAt: null,
    priceCop: listing.priceCop,
    areaM2: listing.areaM2,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    parkingSpaces: listing.parkingSpaces,
    projectStatus: listing.projectStatus ?? null,
  };
}

function sourceDifferences(official, evidence) {
  if (!official) return [];
  const fields = [
    "priceCop",
    "areaM2",
    "bedrooms",
    "bathrooms",
    "parkingSpaces",
    "projectStatus",
  ];
  return evidence.flatMap((entry) => {
    if (entry.sourceKind !== "portal") return [];
    return fields
      .filter(
        (field) =>
          official[field] !== null &&
          entry[field] !== null &&
          official[field] !== entry[field],
      )
      .map((field) => ({
        source: entry.source,
        sourceName: entry.sourceName,
        sourceUrl: entry.url,
        field,
        officialValue: official[field],
        portalValue: entry[field],
      }));
  });
}

const projectGroups = new Map();
const regularListings = [];
for (const listing of listings) {
  if (listing.resultType !== "Proyecto") {
    regularListings.push(listing);
    continue;
  }
  const key = `${listing.market}:${normalizedProjectName(listing.projectName)}`;
  const group = projectGroups.get(key) ?? [];
  group.push(listing);
  projectGroups.set(key, group);
}

const mergedProjects = [...projectGroups.values()].map((group) => {
  const preferred =
    group.find((listing) => listing.sourceKind === "official") ?? group[0];
  const typologies = group.flatMap((listing) =>
    listing.typologies.length ? listing.typologies : [projectTypology(listing)],
  );
  const uniqueTypologies = [...new Map(
    typologies.map((typology) => [
      `${typology.source}:${typology.areaM2}:${typology.bedrooms}:${typology.bathrooms}:${typology.priceCop}`,
      typology,
    ]),
  ).values()];
  const officialTypologies = uniqueTypologies.filter(
    (typology) => typology.sourceKind === "official" && typology.priceCop,
  );
  const representative = [
    ...(officialTypologies.length ? officialTypologies : uniqueTypologies),
  ]
    .filter((typology) => typology.priceCop)
    .sort((a, b) => a.priceCop - b.priceCop)[0];
  const evidence = group.map(evidenceFor);
  const officialEvidence = evidence.find(
    (entry) => entry.sourceKind === "official",
  );
  const mergedMaterial = {
    ...preferred,
    priceCop: representative?.priceCop ?? preferred.priceCop,
    areaM2: representative?.areaM2 ?? preferred.areaM2,
    bedrooms: representative?.bedrooms ?? preferred.bedrooms,
    bathrooms: representative?.bathrooms ?? preferred.bathrooms,
    parkingSpaces:
      representative?.parkingSpaces ?? preferred.parkingSpaces,
    pricePerM2:
      representative?.priceCop && representative?.areaM2
        ? Math.round(representative.priceCop / representative.areaM2)
        : preferred.pricePerM2,
    typologies: uniqueTypologies,
    evidence,
    sourceDifferences: sourceDifferences(officialEvidence, evidence),
  };
  return {
    ...mergedMaterial,
    fingerprint: sha({
      projectName: mergedMaterial.projectName,
      projectStatus: mergedMaterial.projectStatus,
      market: mergedMaterial.market,
      typologies: uniqueTypologies,
      evidence,
    }).slice(0, 16),
  };
});

listings = [...regularListings, ...mergedProjects];

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
  sourceRecords: eligibleRecords.length,
  publishedRecords: listings.length,
  excludedRecords: exclusions.length,
  approximateCoordinates: listings.filter(
    (listing) => listing.coordinatePrecision === "neighborhood_centroid",
  ).length,
  knownStratum: listings.filter((listing) => listing.stratum !== null).length,
  officialProjects: listings.filter(
    (listing) =>
      listing.resultType === "Proyecto" && listing.sourceKind === "official",
  ).length,
  sabanaProjects: listings.filter(
    (listing) => listing.resultType === "Proyecto" && listing.market === "sabana",
  ).length,
  apartmentTypes: listings.reduce(
    (count, listing) => count + (listing.typologies?.length ?? 0),
    0,
  ),
  sourceDifferences: listings.reduce(
    (count, listing) => count + (listing.sourceDifferences?.length ?? 0),
    0,
  ),
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
