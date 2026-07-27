#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCRAPES = path.join(ROOT, "scrapes");
const MASTER = path.join(SCRAPES, "listings-master.json");
const ENRICHMENT = path.join(SCRAPES, "enrichment-needed.json");
const OUTPUT = path.join(SCRAPES, "coordinate-fallback-results.json");
const CSV = path.join(SCRAPES, "coordinate-fallback-results.csv");

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function temporaryPath(filePath) {
  return `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = temporaryPath(filePath);
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

function csvCell(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsvAtomic(filePath, records) {
  const columns = [
    "listing_id",
    "neighborhood",
    "latitude",
    "longitude",
    "coordinate_precision",
    "coordinate_source",
    "geocoder_display_name",
    "geocoded_at",
    "error",
  ];
  const lines = [
    columns.join(","),
    ...records.map((record) =>
      columns.map((column) => csvCell(record[column])).join(","),
    ),
  ];
  const tempPath = temporaryPath(filePath);
  await writeFile(tempPath, `${lines.join("\n")}\n`, "utf8");
  await rename(tempPath, filePath);
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

const coordinateOverrides = new Map(
  [
    [
      "santa barbara central",
      {
        latitude: 4.69986,
        longitude: -74.03313,
        displayName:
          "Santa Bárbara Central, Localidad Usaquén, Bogotá, Colombia",
        osmType: "nearby_features_centroid",
        osmId: null,
      },
    ],
    [
      "el nogal",
      {
        latitude: 4.6603208,
        longitude: -74.0535638,
        displayName:
          "El Nogal, Localidad Chapinero, Bogotá, Colombia",
        osmType: "neighbourhood",
        osmId: null,
      },
    ],
    [
      "chico virrey",
      {
        latitude: 4.674301,
        longitude: -74.0567866,
        displayName:
          "Parque El Virrey, Localidad Chapinero, Bogotá, Colombia",
        osmType: "park",
        osmId: null,
      },
    ],
    [
      "refugio del chico",
      {
        latitude: 4.6657382,
        longitude: -74.0480715,
        displayName:
          "UPZ El Refugio, Localidad Chapinero, Bogotá, Colombia",
        osmType: "administrative",
        osmId: null,
      },
    ],
    [
      "nuevo techo",
      {
        latitude: 4.6267635,
        longitude: -74.1473492,
        displayName: "Techo, Localidad Kennedy, Bogotá, Colombia",
        osmType: "neighbourhood",
        osmId: null,
      },
    ],
  ].map(([name, value]) => [name, value]),
);

async function geocodeNeighborhood(neighborhood) {
  const override = coordinateOverrides.get(neighborhood.toLocaleLowerCase("es"));
  if (override) return override;

  const params = new URLSearchParams({
    q: `${neighborhood}, Bogotá, Colombia`,
    format: "jsonv2",
    limit: "5",
    countrycodes: "co",
    viewbox: "-74.3,4.9,-73.9,4.4",
    bounded: "1",
    addressdetails: "1",
  });
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      signal: AbortSignal.timeout(30_000),
      headers: {
        accept: "application/json",
        "accept-language": "es-CO,es;q=0.9",
        "user-agent":
          "casa-listing-coordinate-backfill/1.0 (local data quality task)",
      },
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const candidates = await response.json();
  const match = candidates.find((candidate) =>
    isBogotaCoordinate(Number(candidate.lat), Number(candidate.lon)),
  );
  if (!match) throw new Error("neighborhood_not_geocoded");
  return {
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    displayName: match.display_name,
    osmType: match.osm_type,
    osmId: match.osm_id,
  };
}

const master = await readJson(MASTER);
const missing = master.records.filter(
  (record) =>
    !Number.isFinite(record.latitude) ||
    !Number.isFinite(record.longitude) ||
    record.coordinate_precision === "neighborhood_centroid" ||
    !isBogotaCoordinate(record.latitude, record.longitude),
);
const neighborhoods = [
  ...new Set(missing.map((record) => record.neighborhood).filter(Boolean)),
];
const geocodedByNeighborhood = new Map();

for (let index = 0; index < neighborhoods.length; index += 1) {
  const neighborhood = neighborhoods[index];
  try {
    const result = await geocodeNeighborhood(neighborhood);
    geocodedByNeighborhood.set(neighborhood, { ...result, error: null });
    process.stdout.write(
      `[${index + 1}/${neighborhoods.length}] ${neighborhood}: ${result.latitude},${result.longitude}\n`,
    );
  } catch (error) {
    geocodedByNeighborhood.set(neighborhood, {
      latitude: null,
      longitude: null,
      displayName: null,
      error: error instanceof Error ? error.message : String(error),
    });
    process.stdout.write(
      `[${index + 1}/${neighborhoods.length}] ${neighborhood}: failed\n`,
    );
  }
  if (index < neighborhoods.length - 1) await sleep(1_100);
}

const geocodedAt = new Date().toISOString();
const results = missing.map((record) => {
  const geocode = geocodedByNeighborhood.get(record.neighborhood);
  return {
    listing_id: record.listing_id,
    neighborhood: record.neighborhood,
    latitude: geocode?.latitude ?? null,
    longitude: geocode?.longitude ?? null,
    coordinate_precision: geocode?.latitude ? "neighborhood_centroid" : null,
    coordinate_source: geocode?.latitude
      ? "openstreetmap_nominatim"
      : null,
    geocoder_display_name: geocode?.displayName ?? null,
    geocoded_at: geocodedAt,
    error: geocode ? geocode.error : "missing_neighborhood",
  };
});

const resultById = new Map(
  results
    .filter(
      (result) =>
        Number.isFinite(result.latitude) && Number.isFinite(result.longitude),
    )
    .map((result) => [result.listing_id, result]),
);

master.records = master.records.map((record) => {
  const result = resultById.get(record.listing_id);
  if (!result) return record;
  return {
    ...record,
    latitude: result.latitude,
    longitude: result.longitude,
    coordinate_source: result.coordinate_source,
    coordinate_precision: result.coordinate_precision,
    coordinate_fallback_reason: "listing_page_coordinates_missing_or_invalid",
    coordinates_scraped_at: result.geocoded_at,
    geocoder_display_name: result.geocoder_display_name,
  };
});
master.updated_at = geocodedAt;
await writeJsonAtomic(MASTER, master);

const enrichment = await readJson(ENRICHMENT);
const masterById = new Map(
  master.records.map((record) => [record.listing_id, record]),
);
enrichment.records = enrichment.records.map((record) => {
  const current = masterById.get(record.listing_id);
  if (!current) return record;
  const hasCoordinates =
    Number.isFinite(current.latitude) && Number.isFinite(current.longitude);
  return {
    ...record,
    latitude: hasCoordinates ? current.latitude : null,
    longitude: hasCoordinates ? current.longitude : null,
    coordinate_precision: current.coordinate_precision || "listing",
    coordinate_source: current.coordinate_source || null,
    needs_coordinates: !hasCoordinates,
  };
});
enrichment.generated_at = geocodedAt;
enrichment.summary.needs_coordinates = enrichment.records.filter(
  (record) => record.needs_coordinates,
).length;
await writeJsonAtomic(ENRICHMENT, enrichment);

const found = results.filter((result) => !result.error).length;
await writeJsonAtomic(OUTPUT, {
  generated_at: geocodedAt,
  purpose:
    "Neighborhood-centroid fallback for listings without usable page coordinates.",
  summary: {
    requested: missing.length,
    found,
    failed: missing.length - found,
  },
  records: results,
});
await writeCsvAtomic(CSV, results);

process.stdout.write(
  `${JSON.stringify({ requested: missing.length, found, failed: missing.length - found })}\n`,
);
