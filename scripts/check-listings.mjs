#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SCRAPES = path.join(ROOT, "scrapes");
const MASTER = path.join(SCRAPES, "listings-master.json");
const OUTPUT = path.join(SCRAPES, "listing-check-results.json");
const CSV = path.join(SCRAPES, "listing-check-results.csv");

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const concurrency = Math.max(
  1,
  Number.parseInt(option("--concurrency", "8"), 10),
);

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
    "check_status",
    "publication_status",
    "http_status",
    "listing_url",
    "resolved_url",
    "identity_match",
    "criteria_match",
    "checked_at",
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

function extractPublicationStatus(html) {
  return (
    html.match(/publicationStatus\\?":\\?"([^"\\]+)/i)?.[1] ||
    html.match(/"publicationStatus"\s*:\s*"([^"]+)"/i)?.[1] ||
    null
  );
}

function criteriaMatch(record) {
  const city = String(record.city || "").toLocaleLowerCase("es");
  const propertyType = String(
    record.property_type || record.result_type || "",
  ).toLocaleLowerCase("es");
  return (
    Number(record.bedrooms) >= 3 &&
    city.includes("bogot") &&
    (propertyType.includes("apartamento") ||
      record.result_type === "Proyecto" ||
      record.result_type === "Inmueble")
  );
}

async function checkListing(record) {
  const checkedAt = new Date().toISOString();
  const localCriteriaMatch = criteriaMatch(record);
  if (!record.listing_url) {
    return {
      listing_id: record.listing_id,
      check_status: "missing_url",
      publication_status: null,
      http_status: null,
      listing_url: null,
      resolved_url: null,
      identity_match: false,
      criteria_match: localCriteriaMatch,
      checked_at: checkedAt,
      error: "listing_url_missing_after_discovery",
    };
  }

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
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < 3
      ) {
        throw new Error(`transient_http_${response.status}`);
      }
      const identityMatch = html.includes(record.listing_id);
      const publicationStatus = extractPublicationStatus(html);
      const unavailableText =
        /no encontramos|inmueble no disponible|publicaci[oó]n no disponible/i.test(
          html,
        );
      const live = response.ok && identityMatch && !unavailableText;

      return {
        listing_id: record.listing_id,
        check_status: live ? "live" : "unavailable",
        publication_status: publicationStatus,
        http_status: response.status,
        listing_url: record.listing_url,
        resolved_url: response.url,
        identity_match: identityMatch,
        criteria_match: localCriteriaMatch,
        checked_at: new Date().toISOString(),
        error: live
          ? null
          : !response.ok
            ? `HTTP ${response.status}`
            : unavailableText
              ? "page_reports_unavailable"
              : "listing_identity_not_found",
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(500 * 2 ** (attempt - 1));
    }
  }

  return {
    listing_id: record.listing_id,
    check_status: "request_failed",
    publication_status: null,
    http_status: null,
    listing_url: record.listing_url,
    resolved_url: null,
    identity_match: false,
    criteria_match: localCriteriaMatch,
    checked_at: new Date().toISOString(),
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

function buildPayload(records, total) {
  const count = (status) =>
    records.filter((record) => record.check_status === status).length;
  const publicationStatuses = records.reduce((counts, record) => {
    if (record.publication_status) {
      counts[record.publication_status] =
        (counts[record.publication_status] || 0) + 1;
    }
    return counts;
  }, {});
  return {
    generated_at: new Date().toISOString(),
    purpose:
      "Fresh availability, identity, and local-criteria validation for every master listing.",
    summary: {
      total,
      processed: records.length,
      live: count("live"),
      unavailable: count("unavailable"),
      missing_url: count("missing_url"),
      request_failed: count("request_failed"),
      criteria_mismatches: records.filter((record) => !record.criteria_match)
        .length,
      publication_statuses: publicationStatuses,
      remaining: Math.max(0, total - records.length),
    },
    records,
  };
}

async function checkpoint(records, total) {
  await writeJsonAtomic(OUTPUT, buildPayload(records, total));
  await writeCsvAtomic(CSV, records);
}

const master = await readJson(MASTER);
const records = master.records;
const resultsById = new Map();
let cursor = 0;
let completed = 0;

async function worker() {
  while (cursor < records.length) {
    const index = cursor;
    cursor += 1;
    const record = records[index];
    const result = await checkListing(record);
    resultsById.set(record.listing_id, result);
    completed += 1;

    if (
      completed % 50 === 0 ||
      !["live", "missing_url"].includes(result.check_status)
    ) {
      process.stdout.write(
        `[${completed}/${records.length}] ${record.listing_id}: ${result.check_status}` +
          (result.error ? ` (${result.error})` : "") +
          "\n",
      );
    }

    if (completed % 100 === 0) {
      const ordered = records
        .map((item) => resultsById.get(item.listing_id))
        .filter(Boolean);
      await checkpoint(ordered, records.length);
    }
    await sleep(120);
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, records.length) }, () => worker()),
);

const finalRecords = records
  .map((record) => resultsById.get(record.listing_id))
  .filter(Boolean);
await checkpoint(finalRecords, records.length);

const resultById = new Map(
  finalRecords.map((record) => [record.listing_id, record]),
);
master.records = master.records.map((record) => {
  const result = resultById.get(record.listing_id);
  return {
    ...record,
    listing_check_status: result.check_status,
    listing_checked_at: result.checked_at,
    publication_status: result.publication_status,
    listing_http_status: result.http_status,
  };
});
master.updated_at = new Date().toISOString();
await writeJsonAtomic(MASTER, master);

process.stdout.write(
  `${JSON.stringify(buildPayload(finalRecords, records.length).summary)}\n`,
);
