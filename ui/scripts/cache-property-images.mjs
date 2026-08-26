#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const uiRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(uiRoot, "..");
const catalogPath = path.join(uiRoot, "public", "data", "catalog.json");
const rentalsCatalogPath = path.join(uiRoot, "public", "data", "rentals.json");
const imageDirectory = path.join(uiRoot, "public", "property-images");
const manifestPath = path.join(imageDirectory, "manifest.json");
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
  "metrocuadrado-bogota-rental-listings.json",
  "myhome-bogota-rental-listings.json",
];
const discoveredOfficialSourceNames = (await readdir(scrapeDirectory)).filter(
  (fileName) => /-bogota-sabana-projects\.json$/i.test(fileName),
);
const sourcePaths = [...new Set([
  ...standardSourceNames,
  ...discoveredOfficialSourceNames,
])].map((fileName) => path.join(scrapeDirectory, fileName));
const concurrency = 40;
const maximumSourceBytes = 30 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const limitArgument = process.argv
  .find((argument) => argument.startsWith("--limit="))
  ?.split("=")[1];
const limit = limitArgument ? Number(limitArgument) : Number.POSITIVE_INFINITY;

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function atomicJsonWrite(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function safeId(id) {
  return id.replace(/[^a-z0-9_-]+/gi, "-");
}

function sourceHash(url) {
  return createHash("sha256").update(url).digest("hex").slice(0, 10);
}

async function fetchImage(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
        headers: {
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "accept-language": "es-CO,es;q=0.9",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declaredSize = Number(response.headers.get("content-length"));
      if (declaredSize > maximumSourceBytes) {
        throw new Error(`source_too_large:${declaredSize}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maximumSourceBytes) {
        throw new Error(`source_too_large:${buffer.length}`);
      }
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    }
  }
  // Some Colombian media CDNs have certificate chains that the system client
  // accepts but Node's bundled CA set does not. Keep certificate validation on
  // and fall back to the system curl client instead of disabling TLS checks.
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "--fail",
        "--location",
        "--compressed",
        "--silent",
        "--show-error",
        "--max-time",
        "30",
        "--max-filesize",
        String(maximumSourceBytes),
        "--header",
        "accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "--user-agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36",
        url,
      ],
      { encoding: "buffer", maxBuffer: maximumSourceBytes },
    );
    return Buffer.from(stdout);
  } catch {
    throw lastError;
  }
}

async function writeVariant(buffer, destination, width, height) {
  const temporaryPath = `${destination}.tmp`;
  try {
    const info = await sharp(buffer)
      .rotate()
      .resize(width, height, {
        fit: "cover",
        position: "centre",
        withoutEnlargement: false,
      })
      .webp({ quality: 75, effort: 0 })
      .toFile(temporaryPath);
    await rename(temporaryPath, destination);
    return info.size;
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

await mkdir(imageDirectory, { recursive: true });

const [catalog, rentalsCatalog, ...sources] = await Promise.all([
  readJson(catalogPath),
  readJson(rentalsCatalogPath),
  ...sourcePaths.map((sourcePath) => readJson(sourcePath)),
]);
const sourceById = new Map();
for (const source of sources) {
  for (const record of source.records) sourceById.set(record.id, record);
}

const previousManifest = await readJson(manifestPath, {
  schemaVersion: 1,
  generatedAt: null,
  entries: {},
});
const now = new Date().toISOString();
const catalogs = [catalog, rentalsCatalog].filter(Boolean);
const currentListings = catalogs.flatMap((value) => value.listings);
const currentIds = new Set(currentListings.map((listing) => listing.id));
const entries = { ...previousManifest.entries };

for (const [id, entry] of Object.entries(entries)) {
  if (!currentIds.has(id) && entry.active !== false) {
    entries[id] = {
      ...entry,
      active: false,
      status: "archived",
      archivedAt: now,
    };
  }
}

const queue = currentListings
  .map((listing) => {
    const source = sourceById.get(listing.id);
    return {
      id: listing.id,
      source: source?.source ?? null,
      sourceUrl: source?.image_url ?? null,
    };
  })
  .slice(0, limit);

let processed = 0;
let downloaded = 0;
let resumed = 0;
let failed = 0;
let missingSource = 0;

async function processListing(listing) {
  const previous = entries[listing.id];
  if (!listing.sourceUrl) {
    missingSource += 1;
    entries[listing.id] = {
      ...previous,
      id: listing.id,
      source: listing.source,
      sourceUrl: null,
      active: true,
      status: "missing_source",
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
    return;
  }

  const stem = `${safeId(listing.id)}-${sourceHash(listing.sourceUrl)}`;
  const thumbnailFile = `${stem}-thumb.webp`;
  const detailFile = `${stem}-detail.webp`;
  const thumbnailPath = path.join(imageDirectory, thumbnailFile);
  const detailPath = path.join(imageDirectory, detailFile);
  const unchanged =
    previous?.sourceUrl === listing.sourceUrl &&
    previous?.status === "available" &&
    (await fileExists(thumbnailPath)) &&
    (await fileExists(detailPath));

  if (unchanged) {
    resumed += 1;
    entries[listing.id] = {
      ...previous,
      active: true,
      status: "available",
      lastSeenAt: now,
      archivedAt: null,
    };
    return;
  }

  try {
    const buffer = await fetchImage(listing.sourceUrl);
    const [thumbnailBytes, detailBytes] = await Promise.all([
      writeVariant(buffer, thumbnailPath, 320, 220),
      writeVariant(buffer, detailPath, 960, 720),
    ]);
    downloaded += 1;
    entries[listing.id] = {
      id: listing.id,
      source: listing.source,
      sourceUrl: listing.sourceUrl,
      active: true,
      status: "available",
      thumbnailPath: `/property-images/${thumbnailFile}`,
      detailPath: `/property-images/${detailFile}`,
      thumbnailBytes,
      detailBytes,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
      downloadedAt: now,
      archivedAt: null,
      error: null,
    };
  } catch (error) {
    failed += 1;
    entries[listing.id] = {
      ...previous,
      id: listing.id,
      source: listing.source,
      sourceUrl: listing.sourceUrl,
      active: true,
      status: "failed",
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
      lastAttemptAt: now,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function saveManifest() {
  const values = Object.values(entries);
  await atomicJsonWrite(manifestPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    settings: {
      thumbnail: { width: 320, height: 220, format: "webp", quality: 75 },
      detail: { width: 960, height: 720, format: "webp", quality: 75 },
      retention: "archive",
    },
    summary: {
      currentListings: currentIds.size,
      available: values.filter(
        (entry) => entry.active && entry.status === "available",
      ).length,
      failed: values.filter(
        (entry) => entry.active && entry.status === "failed",
      ).length,
      missingSource: values.filter(
        (entry) => entry.active && entry.status === "missing_source",
      ).length,
      archived: values.filter((entry) => entry.active === false).length,
    },
    entries,
  });
}

let pendingManifestSave = Promise.resolve();
function queueManifestSave() {
  pendingManifestSave = pendingManifestSave.then(() => saveManifest());
  return pendingManifestSave;
}

let cursor = 0;
async function worker() {
  while (cursor < queue.length) {
    const index = cursor;
    cursor += 1;
    await processListing(queue[index]);
    processed += 1;
    const completed = processed;
    if (completed % 100 === 0 || completed === queue.length) {
      await queueManifestSave();
      process.stdout.write(
        `${JSON.stringify({
          processed: completed,
          total: queue.length,
          downloaded,
          resumed,
          failed,
          missingSource,
        })}\n`,
      );
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()),
);
await queueManifestSave();

process.stdout.write(
  `${JSON.stringify(
    {
      manifestPath,
      processed,
      downloaded,
      resumed,
      failed,
      missingSource,
      archived: Object.values(entries).filter(
        (entry) => entry.active === false,
      ).length,
    },
    null,
    2,
  )}\n`,
);
