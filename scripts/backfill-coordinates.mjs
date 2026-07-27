#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join(ROOT, "scrapes", "ready-for-coordinates.json");
const DEFAULT_OUTPUT = path.join(ROOT, "scrapes", "coordinate-backfill-results.json");
const DEFAULT_CSV = path.join(ROOT, "scrapes", "coordinate-backfill-results.csv");
const MASTER = path.join(ROOT, "scrapes", "listings-master.json");

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
const concurrency = Math.max(1, Number.parseInt(option("--concurrency", "4"), 10));
const applyToMaster = hasFlag("--apply");

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
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
    "coordinate_status",
    "latitude",
    "longitude",
    "listing_url",
    "resolved_url",
    "http_status",
    "scraped_at",
    "error",
  ];
  const lines = [
    columns.join(","),
    ...records.map((record) =>
      columns.map((column) => csvCell(record[column])).join(","),
    ),
  ];
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  await writeFile(tempPath, `${lines.join("\n")}\n`, "utf8");
  await rename(tempPath, filePath);
}

function extractCoordinates(html) {
  const patterns = [
    /coordinates\\?":\s*\{\\?"lon\\?":\s*(-?\d+(?:\.\d+)?),\\?"lat\\?":\s*(-?\d+(?:\.\d+)?)/i,
    /coordinates\\?":\s*\{\\?"lat\\?":\s*(-?\d+(?:\.\d+)?),\\?"lon\\?":\s*(-?\d+(?:\.\d+)?)/i,
  ];

  const lonThenLat = html.match(patterns[0]);
  if (lonThenLat) {
    return {
      longitude: Number(lonThenLat[1]),
      latitude: Number(lonThenLat[2]),
    };
  }

  const latThenLon = html.match(patterns[1]);
  if (latThenLon) {
    return {
      latitude: Number(latThenLon[1]),
      longitude: Number(latThenLon[2]),
    };
  }

  return null;
}

function isPlausibleBogotaCoordinate({ latitude, longitude }) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 3 &&
    latitude <= 6 &&
    longitude >= -76 &&
    longitude <= -72
  );
}

async function fetchListing(record) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(record.listing_url, {
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
      const coordinates = extractCoordinates(html);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (!coordinates) {
        throw new Error("coordinates_not_found");
      }
      if (!isPlausibleBogotaCoordinate(coordinates)) {
        throw new Error(
          `coordinates_out_of_bounds:${coordinates.latitude},${coordinates.longitude}`,
        );
      }

      return {
        ...record,
        coordinate_status: "found",
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        resolved_url: response.url,
        http_status: response.status,
        scraped_at: new Date().toISOString(),
        error: null,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(500 * 2 ** (attempt - 1));
    }
  }

  return {
    ...record,
    coordinate_status: "failed",
    latitude: null,
    longitude: null,
    resolved_url: null,
    http_status: null,
    scraped_at: new Date().toISOString(),
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function buildPayload(records, requested) {
  const found = records.filter(
    (record) => record.coordinate_status === "found",
  ).length;
  return {
    generated_at: new Date().toISOString(),
    purpose:
      "Coordinate backfill results extracted from Metrocuadrado listing page data.",
    summary: {
      requested,
      processed: records.length,
      found,
      failed: records.length - found,
      remaining: Math.max(0, requested - records.length),
    },
    records,
  };
}

async function checkpoint(records, requested) {
  await writeJsonAtomic(outputPath, buildPayload(records, requested));
  await writeCsvAtomic(csvPath, records);
}

async function applyResultsToMaster(results) {
  const successful = new Map(
    results
      .filter((record) => record.coordinate_status === "found")
      .map((record) => [record.listing_id, record]),
  );
  const master = await readJson(MASTER);
  let updated = 0;

  master.records = master.records.map((record) => {
    const result = successful.get(record.listing_id);
    if (!result) return record;
    updated += 1;
    return {
      ...record,
      listing_url: result.resolved_url || result.listing_url,
      latitude: result.latitude,
      longitude: result.longitude,
      coordinate_source: "metrocuadrado_listing_page",
      coordinates_scraped_at: result.scraped_at,
    };
  });
  master.updated_at = new Date().toISOString();
  await writeJsonAtomic(MASTER, master);
  return updated;
}

const input = await readJson(inputPath);
const sourceRecords = Array.isArray(input) ? input : input.records;
if (!Array.isArray(sourceRecords)) {
  throw new Error(`Input has no records array: ${inputPath}`);
}

const selected = (limit > 0 ? sourceRecords.slice(0, limit) : sourceRecords).filter(
  (record) => record.listing_url,
);

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
  return !prior || prior.coordinate_status !== "found";
});

let cursor = 0;
async function worker() {
  while (cursor < pending.length) {
    const index = cursor;
    cursor += 1;
    const record = pending[index];
    const result = await fetchListing(record);
    resultsById.set(record.listing_id, result);
    const ordered = selected
      .map((item) => resultsById.get(item.listing_id))
      .filter(Boolean);
    await checkpoint(ordered, selected.length);
    process.stdout.write(
      `[${ordered.length}/${selected.length}] ${record.listing_id}: ${result.coordinate_status}` +
        (result.error ? ` (${result.error})` : "") +
        "\n",
    );
    await sleep(200);
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, pending.length || 1) }, () =>
    worker(),
  ),
);

const finalRecords = selected
  .map((record) => resultsById.get(record.listing_id))
  .filter(Boolean);
await checkpoint(finalRecords, selected.length);

if (applyToMaster) {
  const updated = await applyResultsToMaster(finalRecords);
  process.stdout.write(`Applied ${updated} coordinate records to ${MASTER}\n`);
}

const finalPayload = buildPayload(finalRecords, selected.length);
process.stdout.write(`${JSON.stringify(finalPayload.summary)}\n`);
