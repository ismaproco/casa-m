#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCRAPES = path.join(ROOT, "scrapes");
const DEFAULT_INPUT = path.join(SCRAPES, "needs-listing-url.json");
const DEFAULT_OUTPUT = path.join(SCRAPES, "url-discovery-results.json");
const DEFAULT_CSV = path.join(SCRAPES, "url-discovery-results.csv");
const DISCOVERED_JSON = path.join(SCRAPES, "discovered-listing-urls.json");
const DISCOVERED_CSV = path.join(SCRAPES, "discovered-listing-urls.csv");
const MASTER = path.join(SCRAPES, "listings-master.json");
const ENRICHMENT = path.join(SCRAPES, "enrichment-needed.json");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const hasFlag = (name) => args.includes(name);

const inputPath = path.resolve(option("--input", DEFAULT_INPUT));
const outputPath = path.resolve(option("--output", DEFAULT_OUTPUT));
const csvPath = path.resolve(option("--csv", DEFAULT_CSV));
const limit = Number.parseInt(option("--limit", "0"), 10);
const concurrency = Math.max(1, Number.parseInt(option("--concurrency", "6"), 10));
const applyResults = hasFlag("--apply");
const mergeWithPrior = hasFlag("--merge");

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
    "discovery_status",
    "listing_url",
    "latitude",
    "longitude",
    "http_status",
    "discovered_at",
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

function extractCanonicalUrl(html) {
  const canonical =
    html.match(
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i,
    )?.[1] ||
    html.match(
      /<link\s+href=["']([^"']+)["']\s+rel=["']canonical["']/i,
    )?.[1];
  return canonical?.replaceAll("&amp;", "&") || null;
}

function extractDetailUrl(html) {
  const detailPath =
    html.match(/urlDetail\\?":\\?"([^"\\]+)/i)?.[1] ||
    html.match(/"urlDetail"\s*:\s*"([^"]+)"/i)?.[1];
  if (!detailPath) return null;
  try {
    return new URL(detailPath, "https://www.metrocuadrado.com").href;
  } catch {
    return null;
  }
}

function extractCoordinates(html) {
  const lonThenLat = html.match(
    /coordinates\\?":\s*\{\\?"lon\\?":\s*(-?\d+(?:\.\d+)?),\\?"lat\\?":\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (lonThenLat) {
    return {
      longitude: Number(lonThenLat[1]),
      latitude: Number(lonThenLat[2]),
    };
  }

  const latThenLon = html.match(
    /coordinates\\?":\s*\{\\?"lat\\?":\s*(-?\d+(?:\.\d+)?),\\?"lon\\?":\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (latThenLon) {
    return {
      latitude: Number(latThenLon[1]),
      longitude: Number(latThenLon[2]),
    };
  }
  return null;
}

function isPlausibleBogotaCoordinate(coordinates) {
  return (
    coordinates &&
    Number.isFinite(coordinates.latitude) &&
    Number.isFinite(coordinates.longitude) &&
    coordinates.latitude >= 3 &&
    coordinates.latitude <= 6 &&
    coordinates.longitude >= -76 &&
    coordinates.longitude <= -72
  );
}

function canonicalMatchesListing(canonicalUrl, listingId) {
  if (!canonicalUrl) return false;
  try {
    const url = new URL(canonicalUrl);
    return (
      url.hostname.endsWith("metrocuadrado.com") &&
      decodeURIComponent(url.pathname).split("/").filter(Boolean).at(-1) ===
        listingId
    );
  } catch {
    return false;
  }
}

async function discover(record) {
  const isProject =
    record.result_type === "Proyecto" || /-C\d/i.test(record.listing_id);
  const route = isProject ? "proyecto" : "inmueble";
  const probeUrl = `https://www.metrocuadrado.com/${route}/x/${encodeURIComponent(
    record.listing_id,
  )}`;
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(probeUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "es-CO,es;q=0.9,en;q=0.7",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        },
      });
      const html = await response.text();
      const detailUrl = extractDetailUrl(html);
      const listingUrl =
        detailUrl && canonicalMatchesListing(detailUrl, record.listing_id)
          ? detailUrl
          : extractCanonicalUrl(html);
      const coordinates = extractCoordinates(html);

      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          return {
            ...record,
            discovery_status: "not_found",
            listing_url: null,
            latitude: null,
            longitude: null,
            http_status: response.status,
            discovered_at: new Date().toISOString(),
            error: `HTTP ${response.status}`,
          };
        }
        throw new Error(`HTTP ${response.status}`);
      }

      if (!canonicalMatchesListing(listingUrl, record.listing_id)) {
        return {
          ...record,
          discovery_status: "not_found",
          listing_url: null,
          latitude: null,
          longitude: null,
          http_status: response.status,
          discovered_at: new Date().toISOString(),
          error: "canonical_url_not_found_or_mismatched",
        };
      }

      return {
        ...record,
        discovery_status: isPlausibleBogotaCoordinate(coordinates)
          ? "discovered"
          : "discovered_no_coordinates",
        listing_url: listingUrl,
        latitude: isPlausibleBogotaCoordinate(coordinates)
          ? coordinates.latitude
          : null,
        longitude: isPlausibleBogotaCoordinate(coordinates)
          ? coordinates.longitude
          : null,
        http_status: response.status,
        discovered_at: new Date().toISOString(),
        error:
          coordinates && !isPlausibleBogotaCoordinate(coordinates)
            ? `coordinates_out_of_bounds:${coordinates.latitude},${coordinates.longitude}`
            : coordinates
              ? null
              : "coordinates_not_found",
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(600 * 2 ** (attempt - 1));
    }
  }

  return {
    ...record,
    discovery_status: "failed",
    listing_url: null,
    latitude: null,
    longitude: null,
    http_status: null,
    discovered_at: new Date().toISOString(),
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function buildPayload(records, requested) {
  const count = (status) =>
    records.filter((record) => record.discovery_status === status).length;
  const discovered =
    count("discovered") + count("discovered_no_coordinates");
  return {
    generated_at: new Date().toISOString(),
    purpose:
      "Canonical listing URL discovery through Metrocuadrado's ID-resolving detail route.",
    summary: {
      requested,
      processed: records.length,
      discovered,
      with_coordinates: count("discovered"),
      without_coordinates: count("discovered_no_coordinates"),
      not_found: count("not_found"),
      failed: count("failed"),
      remaining: Math.max(0, requested - records.length),
    },
    records,
  };
}

async function checkpoint(records, requested) {
  await writeJsonAtomic(outputPath, buildPayload(records, requested));
  await writeCsvAtomic(csvPath, records);
}

function successfulRecords(records) {
  return records.filter((record) =>
    ["discovered", "discovered_no_coordinates"].includes(
      record.discovery_status,
    ),
  );
}

async function writeDerivedQueues(results) {
  const discovered = successfulRecords(results);
  const unresolved = results.filter(
    (record) => !["discovered", "discovered_no_coordinates"].includes(
      record.discovery_status,
    ),
  );

  await writeJsonAtomic(DISCOVERED_JSON, {
    generated_at: new Date().toISOString(),
    purpose: "Listings whose canonical Metrocuadrado URLs were discovered.",
    summary: {
      discovered: discovered.length,
      with_coordinates: discovered.filter(
        (record) => record.discovery_status === "discovered",
      ).length,
    },
    records: discovered,
  });
  await writeCsvAtomic(DISCOVERED_CSV, discovered);

  await writeJsonAtomic(inputPath, {
    generated_at: new Date().toISOString(),
    purpose:
      "Listings still requiring URL discovery after the Metrocuadrado ID-route pass.",
    summary: {
      total_needing_url: unresolved.length,
      not_found: unresolved.filter(
        (record) => record.discovery_status === "not_found",
      ).length,
      failed: unresolved.filter(
        (record) => record.discovery_status === "failed",
      ).length,
    },
    records: unresolved,
  });
}

async function applyToDatasets(results) {
  const successful = new Map(
    successfulRecords(results).map((record) => [record.listing_id, record]),
  );

  const master = await readJson(MASTER);
  let masterUpdated = 0;
  master.records = master.records.map((record) => {
    const result = successful.get(record.listing_id);
    if (!result) return record;
    masterUpdated += 1;
    return {
      ...record,
      listing_url: result.listing_url,
      ...(Number.isFinite(result.latitude)
        ? {
            latitude: result.latitude,
            longitude: result.longitude,
            coordinate_source: "metrocuadrado_listing_page",
            coordinates_scraped_at: result.discovered_at,
          }
        : {}),
      listing_url_source: "metrocuadrado_id_route",
      listing_url_discovered_at: result.discovered_at,
    };
  });
  master.updated_at = new Date().toISOString();
  await writeJsonAtomic(MASTER, master);

  const masterById = new Map(
    master.records.map((record) => [record.listing_id, record]),
  );
  const enrichment = await readJson(ENRICHMENT);
  enrichment.records = enrichment.records.map((record) => {
    const current = masterById.get(record.listing_id);
    if (!current) return record;
    const hasCoordinates =
      Number.isFinite(current.latitude) && Number.isFinite(current.longitude);
    return {
      ...record,
      listing_url: current.listing_url || record.listing_url,
      latitude: hasCoordinates ? current.latitude : null,
      longitude: hasCoordinates ? current.longitude : null,
      needs_coordinates: !hasCoordinates,
      ...(current.listing_url_source === "metrocuadrado_id_route"
        ? {
            url_status: "discovered",
            url_source: "metrocuadrado_id_route",
          }
        : {}),
    };
  });
  const urlStatusCounts = enrichment.records.reduce((counts, record) => {
    counts[record.url_status] = (counts[record.url_status] || 0) + 1;
    return counts;
  }, {});
  enrichment.generated_at = new Date().toISOString();
  enrichment.summary = {
    total: enrichment.records.length,
    needs_coordinates: enrichment.records.filter(
      (record) => record.needs_coordinates,
    ).length,
    ...Object.fromEntries(
      Object.entries(urlStatusCounts).map(([status, count]) => [
        `url_${status}`,
        count,
      ]),
    ),
  };
  await writeJsonAtomic(ENRICHMENT, enrichment);

  return masterUpdated;
}

const input = await readJson(inputPath);
const sourceRecords = Array.isArray(input) ? input : input.records;
if (!Array.isArray(sourceRecords)) {
  throw new Error(`Input has no records array: ${inputPath}`);
}

const selected = (
  limit > 0 ? sourceRecords.slice(0, limit) : sourceRecords
).filter((record) => record.listing_id);

let priorRecords = [];
try {
  const prior = await readJson(outputPath);
  priorRecords = Array.isArray(prior) ? prior : prior.records || [];
} catch {
  // A missing checkpoint is the normal first-run case.
}

const resultsById = new Map(
  priorRecords.map((record) => [record.listing_id, record]),
);
const pending = selected.filter((record) => {
  const prior = resultsById.get(record.listing_id);
  return (
    !prior ||
    !["discovered", "discovered_no_coordinates"].includes(prior.discovery_status)
  );
});

function mergeSelectedIntoPrior() {
  if (!mergeWithPrior) {
    return selected
      .map((record) => resultsById.get(record.listing_id))
      .filter(Boolean);
  }
  const selectedIds = new Set(selected.map((record) => record.listing_id));
  return [
    ...priorRecords
      .filter((record) => !selectedIds.has(record.listing_id))
      .map((record) => resultsById.get(record.listing_id) || record),
    ...selected
      .map((record) => resultsById.get(record.listing_id))
      .filter(Boolean),
  ];
}

let cursor = 0;
let completedSinceStart = 0;
async function worker() {
  while (cursor < pending.length) {
    const index = cursor;
    cursor += 1;
    const record = pending[index];
    const result = await discover(record);
    resultsById.set(record.listing_id, result);
    completedSinceStart += 1;
    const ordered = mergeSelectedIntoPrior();
    if (completedSinceStart % 10 === 0) {
      await checkpoint(ordered, ordered.length);
    }
    process.stdout.write(
      `[${completedSinceStart}/${pending.length}] ${record.listing_id}: ${result.discovery_status}` +
        (result.error ? ` (${result.error})` : "") +
        "\n",
    );
    await sleep(150);
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, pending.length || 1) }, () =>
    worker(),
  ),
);

const finalRecords = mergeSelectedIntoPrior();
await checkpoint(finalRecords, finalRecords.length);

if (applyResults && limit === 0) {
  const updated = await applyToDatasets(finalRecords);
  await writeDerivedQueues(finalRecords);
  process.stdout.write(`Applied ${updated} discovered URLs to master datasets.\n`);
} else if (applyResults && limit > 0) {
  process.stdout.write(
    "Skipped dataset application because --limit was used; results remain checkpointed.\n",
  );
}

process.stdout.write(`${JSON.stringify(buildPayload(finalRecords, finalRecords.length).summary)}\n`);
