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
  "solusi-bogota-listings.json",
  "ciencuadras-bogota-projects.json",
  "arquitectura-concreto-bogota-sabana-projects.json",
  "cusezar-bogota-sabana-projects.json",
  "constructora-capital-bogota-sabana-projects.json",
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
const developerCatalogPath = path.join(outputDirectory, "developers.json");
const developerAuditPath = path.join(
  scrapeDirectory,
  "colombia-top-100-developers.json",
);
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
  const warnings = [
    ...(Array.isArray(record.data_gaps) ? record.data_gaps : []),
  ];
  if (
    record.price_cop !== null &&
    record.price_cop !== undefined &&
    (record.price_cop < 50_000_000 || record.price_cop > 20_000_000_000)
  ) {
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
let developerAudit = null;
try {
  developerAudit = JSON.parse(await readFile(developerAuditPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
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
        solusi: "Solusi",
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
    priceCop: nullableNumber(record.price_cop) ?? 0,
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
    .replace(/\b(proyecto|apartamentos?|oficinas?|etapa\s+\d+)\b/g, " ")
    .replace(/\btorres?\s*[a-z0-9-]*\b/g, " ")
    .replace(/\by\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const projectNameStopWords = new Set([
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
]);

function projectNameTokens(value) {
  return [...new Set(
    normalizedProjectName(value)
      .split(/\s+/)
      .filter((token) => token && !projectNameStopWords.has(token)),
  )].sort();
}

function normalizedDeveloperName(value) {
  const ignored = new Set([
    "a",
    "bogota",
    "colombia",
    "constructora",
    "constructor",
    "construcciones",
    "s",
    "sa",
    "sas",
  ]);
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !ignored.has(token))
    .join(" ");
}

const inactiveProjects = sources.flatMap(({ fileName, data }) =>
  (data.inactive_projects ?? []).map((project) => ({
    fileName,
    name: normalizedProjectName(project.name),
    developerName: normalizedDeveloperName(project.developer_name),
    reason: project.reason ?? "inactive_on_official_site",
  })),
);

listings = listings.filter((listing) => {
  if (listing.resultType !== "Proyecto" || listing.sourceKind === "official") {
    return true;
  }
  const name = normalizedProjectName(listing.projectName);
  const developerName = normalizedDeveloperName(listing.developerName);
  const inactive = inactiveProjects.find(
    (project) =>
      project.name === name &&
      project.developerName &&
      (!developerName || project.developerName === developerName),
  );
  if (!inactive) return true;
  exclusions.push({
    id: listing.id,
    reasons: [inactive.reason],
    officialSource: inactive.fileName,
  });
  return false;
});

function sameProjectGeography(left, right) {
  if (left.market !== right.market) return false;
  return left.market !== "sabana" || left.municipality === right.municipality;
}

function sameProjectDeveloper(left, right) {
  const leftDeveloper = normalizedDeveloperName(left.developerName);
  const rightDeveloper = normalizedDeveloperName(right.developerName);
  return Boolean(
    leftDeveloper &&
      rightDeveloper &&
      leftDeveloper === rightDeveloper,
  );
}

function isTokenSubset(smaller, larger) {
  const largerSet = new Set(larger);
  return smaller.length > 0 && smaller.every((token) => largerSet.has(token));
}

function shouldMergeProjects(left, right) {
  if (!sameProjectGeography(left, right)) return false;
  if (normalizedProjectName(left.projectName) === normalizedProjectName(right.projectName)) {
    return true;
  }
  if (!sameProjectDeveloper(left, right)) return false;

  const leftTokens = projectNameTokens(left.projectName);
  const rightTokens = projectNameTokens(right.projectName);
  if (leftTokens.join(" ") === rightTokens.join(" ")) return true;

  const hasOfficialRecord =
    left.sourceKind === "official" || right.sourceKind === "official";
  if (!hasOfficialRecord) return false;
  return leftTokens.length <= rightTokens.length
    ? isTokenSubset(leftTokens, rightTokens)
    : isTokenSubset(rightTokens, leftTokens);
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
    priceCop: listing.priceCop > 0 ? listing.priceCop : null,
    areaM2: listing.areaM2,
    bedrooms: listing.bedrooms > 0 ? listing.bedrooms : null,
    bathrooms: listing.bathrooms > 0 ? listing.bathrooms : null,
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

const regularListings = [];
const projectListings = [];
for (const listing of listings) {
  if (listing.resultType !== "Proyecto") {
    regularListings.push(listing);
    continue;
  }
  projectListings.push(listing);
}

const projectParents = projectListings.map((_, index) => index);
function findProjectParent(index) {
  if (projectParents[index] !== index) {
    projectParents[index] = findProjectParent(projectParents[index]);
  }
  return projectParents[index];
}
function joinProjectGroups(leftIndex, rightIndex) {
  const leftParent = findProjectParent(leftIndex);
  const rightParent = findProjectParent(rightIndex);
  if (leftParent !== rightParent) projectParents[rightParent] = leftParent;
}
for (let leftIndex = 0; leftIndex < projectListings.length; leftIndex += 1) {
  for (
    let rightIndex = leftIndex + 1;
    rightIndex < projectListings.length;
    rightIndex += 1
  ) {
    if (shouldMergeProjects(projectListings[leftIndex], projectListings[rightIndex])) {
      joinProjectGroups(leftIndex, rightIndex);
    }
  }
}
const projectGroups = new Map();
for (let index = 0; index < projectListings.length; index += 1) {
  const parent = findProjectParent(index);
  const group = projectGroups.get(parent) ?? [];
  group.push(projectListings[index]);
  projectGroups.set(parent, group);
}

const mergedProjects = [...projectGroups.values()].map((group) => {
  const preferred =
    group.find((listing) => listing.sourceKind === "official") ?? group[0];
  const bestLocation =
    group.find(
      (listing) =>
        listing.sourceKind === "official" &&
        listing.coordinatePrecision === "listing",
    ) ??
    group.find((listing) => listing.coordinatePrecision === "listing") ??
    preferred;
  const typologies = group.flatMap((listing) =>
    listing.typologies.length
      ? listing.typologies
      : listing.areaM2 || listing.priceCop > 0
        ? [projectTypology(listing)]
        : [],
  );
  const uniqueTypologies = [...new Map(
    typologies.map((typology) => [
      `${typology.source}:${normalizedProjectName(typology.name)}:${typology.areaM2}:${typology.bedrooms}:${typology.bathrooms}:${typology.priceCop}`,
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
    latitude: bestLocation.latitude,
    longitude: bestLocation.longitude,
    coordinatePrecision: bestLocation.coordinatePrecision,
    projectStatus:
      preferred.projectStatus === "En ventas"
        ? group.find(
            (listing) =>
              listing.projectStatus && listing.projectStatus !== "En ventas",
          )?.projectStatus ?? preferred.projectStatus
        : preferred.projectStatus,
    deliveryDate:
      preferred.deliveryDate ??
      group.find((listing) => listing.deliveryDate)?.deliveryDate ??
      null,
    priceCop: representative?.priceCop ?? preferred.priceCop,
    areaM2: representative?.areaM2 ?? preferred.areaM2,
    bedrooms:
      representative?.bedrooms ??
      group.find((listing) => listing.bedrooms > 0)?.bedrooms ??
      preferred.bedrooms,
    bathrooms:
      representative?.bathrooms ??
      group.find((listing) => listing.bathrooms > 0)?.bathrooms ??
      preferred.bathrooms,
    parkingSpaces:
      representative?.parkingSpaces ?? preferred.parkingSpaces,
    pricePerM2:
      representative?.priceCop && representative?.areaM2
        ? Math.round(representative.priceCop / representative.areaM2)
        : preferred.pricePerM2,
    typologies: uniqueTypologies,
    evidence,
    sourceDifferences: sourceDifferences(officialEvidence, evidence),
    dataWarnings: [...new Set(group.flatMap((listing) => listing.dataWarnings))]
      .filter(
        (warning) =>
          !(representative &&
            (warning === "missing_apartment_typologies" ||
              warning === "missing_price")),
      ),
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
  topDevelopersAudited: developerAudit?.developers?.length ?? 0,
  topDevelopersWithRegionalProjects:
    developerAudit?.developers?.filter(
      (developer) => developer.bogota_sabana_project_count > 0,
    ).length ?? 0,
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
  deduplication: {
    inputProjectRecords: projectListings.length,
    publishedProjects: mergedProjects.length,
    mergedRecords: projectListings.length - mergedProjects.length,
    crossSourceGroups: [...projectGroups.values()].filter(
      (group) => new Set(group.map((listing) => listing.source)).size > 1,
    ).length,
    officialPreferredGroups: [...projectGroups.values()].filter(
      (group) =>
        group.length > 1 &&
        group.some((listing) => listing.sourceKind === "official"),
    ).length,
  },
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
  developerAudit: developerAudit
    ? {
        fileName: path.basename(developerAuditPath),
        source: developerAudit.source,
        collectedAt: developerAudit.collected_at,
        nationalInventory: developerAudit.national_inventory_count,
        canonicalDevelopers: developerAudit.canonical_developer_count,
        topDevelopers: developerAudit.developers.length,
      }
    : null,
};

const publicDeveloperAudit = developerAudit
  ? {
      schemaVersion: 1,
      publishedAt,
      source: developerAudit.source,
      collectedAt: developerAudit.collected_at,
      nationalInventoryUrl: developerAudit.national_inventory_url,
      nationalInventoryCount: developerAudit.national_inventory_count,
      canonicalDeveloperCount: developerAudit.canonical_developer_count,
      methodology: developerAudit.methodology,
      developers: developerAudit.developers,
    }
  : {
      schemaVersion: 1,
      publishedAt,
      source: null,
      developers: [],
    };

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(catalogPath, `${JSON.stringify(catalog)}\n`, "utf8"),
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(
    developerCatalogPath,
    `${JSON.stringify(publicDeveloperAudit, null, 2)}\n`,
    "utf8",
  ),
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
