import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const scrapeDirectory = path.join(repositoryRoot, "scrapes");
const baselinePath = path.join(scrapeDirectory, "fincaraiz-listings.json");
const outputPath = path.join(
  scrapeDirectory,
  "fincaraiz-stratified-listings.json",
);
const csvOutputPath = path.join(
  scrapeDirectory,
  "fincaraiz-stratified-listings.csv",
);

async function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, value);
  await rename(temporaryPath, filePath);
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const partitionFileNames = (await readdir(scrapeDirectory))
  .filter((fileName) =>
    /^fincaraiz-estrato-\d+(?:-price-(?:none|\d+)-(?:none|\d+))?-listings\.json$/.test(
      fileName,
    ),
  )
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const inputPaths = [
  baselinePath,
  ...partitionFileNames.map((fileName) =>
    path.join(scrapeDirectory, fileName),
  ),
];
const recordsById = new Map();
const inputs = [];

for (const inputPath of inputPaths) {
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  inputs.push({
    file: path.basename(inputPath),
    source_url: input.source_url,
    reported_total: input.reported_total,
    records_count: input.records_count,
  });
  for (const record of input.records) {
    const previous = recordsById.get(record.id);
    if (
      !previous ||
      (record.source_stratum !== undefined &&
        previous.source_stratum === undefined)
    ) {
      recordsById.set(record.id, record);
    }
  }
}

const records = [...recordsById.values()].sort((a, b) =>
  a.id.localeCompare(b.id),
);
const withCoordinates = records.filter(
  (record) => record.latitude !== null && record.longitude !== null,
).length;
const withListingUrls = records.filter(
  (record) => record.listing_url !== null,
).length;
const cityCounts = Object.entries(
  records.reduce((counts, record) => {
    const city = record.city ?? "Unknown";
    counts[city] = (counts[city] ?? 0) + 1;
    return counts;
  }, {}),
).sort((a, b) => b[1] - a[1]);
const stratumCounts = Object.entries(
  records.reduce((counts, record) => {
    const stratum = record.source_stratum ?? record.stratum ?? "Unknown";
    counts[stratum] = (counts[stratum] ?? 0) + 1;
    return counts;
  }, {}),
).sort((a, b) => Number(a[0]) - Number(b[0]));

const output = {
  schema_version: 1,
  source: "fincaraiz",
  source_url:
    "https://www.fincaraiz.com.co/venta/apartamentos/3-o-mas-habitaciones",
  scraped_at: new Date().toISOString(),
  collection_strategy: "baseline plus estrato partitions",
  inputs,
  records_count: records.length,
  records_with_listing_urls: withListingUrls,
  records_with_coordinates: withCoordinates,
  city_counts: Object.fromEntries(cityCounts),
  source_stratum_counts: Object.fromEntries(stratumCounts),
  records,
};

await atomicWrite(outputPath, `${JSON.stringify(output)}\n`);

const csvFields = [
  "id",
  "source_id",
  "listing_url",
  "title",
  "price_cop",
  "area_m2",
  "price_per_m2",
  "bedrooms",
  "bathrooms",
  "parking_spaces",
  "stratum",
  "source_stratum",
  "latitude",
  "longitude",
  "state",
  "city",
  "locality",
  "zone",
  "neighborhood",
  "owner_name",
  "image_url",
  "created_at",
  "updated_at",
];
await atomicWrite(
  csvOutputPath,
  `${[
    csvFields.join(","),
    ...records.map((record) =>
      csvFields.map((field) => csvCell(record[field])).join(","),
    ),
  ].join("\n")}\n`,
);

console.log(
  JSON.stringify({
    outputPath,
    csvOutputPath,
    inputFiles: inputPaths.length,
    records: records.length,
    withListingUrls,
    withCoordinates,
    topCities: cityCounts.slice(0, 10),
    stratumCounts,
  }),
);
