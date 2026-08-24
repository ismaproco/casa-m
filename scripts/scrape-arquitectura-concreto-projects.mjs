#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputPath = path.join(
  repositoryRoot,
  "scrapes",
  "arquitectura-concreto-bogota-sabana-projects.json",
);
const origin = "https://arquitecturayconcreto.com";
const indexUrl = `${origin}/page-data/proyectos/cundinamarca/page-data.json`;

const sabanaMunicipalities = new Set([
  "bojacá",
  "cajicá",
  "chía",
  "cota",
  "el rosal",
  "facatativá",
  "funza",
  "gachancipá",
  "la calera",
  "madrid",
  "mosquera",
  "nemocón",
  "sibaté",
  "soacha",
  "sopó",
  "subachoque",
  "tabio",
  "tenjo",
  "tocancipá",
  "zipacón",
  "zipaquirá",
]);

const marketCentroids = {
  bogota: { latitude: 4.711, longitude: -74.0721 },
};

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("es");
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "CasaMapa/1.0 catalog collector" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function visit(value, callback) {
  if (Array.isArray(value)) {
    for (const entry of value) visit(entry, callback);
    return;
  }
  if (!value || typeof value !== "object") return;
  callback(value);
  for (const entry of Object.values(value)) visit(entry, callback);
}

function detailDataUrl(slug) {
  const pathname = new URL(slug, origin).pathname.replace(/^\/+|\/+$/g, "");
  return `${origin}/page-data/${pathname}/page-data.json`;
}

function mapStatus(status) {
  const value = normalize(status);
  if (value.includes("lanzamiento")) return "Lanzamiento";
  if (value.includes("preventa") || value.includes("sobre plano"))
    return "Sobre planos";
  if (value.includes("construccion")) return "En construcción";
  if (value.includes("entrega inmediata")) return "Entrega inmediata";
  if (value.includes("venta")) return "En ventas";
  return null;
}

function marketFor(location) {
  const normalized = normalize(location);
  if (normalized === "bogota" || normalized === "bogota d.c.") {
    return "bogota";
  }
  for (const municipality of sabanaMunicipalities) {
    if (normalized === normalize(municipality)) return "sabana";
  }
  return null;
}

function isBogotaRegionCoordinate(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 4.25 &&
    latitude <= 5.25 &&
    longitude >= -74.85 &&
    longitude <= -73.65
  );
}

function firstImageUrl(context) {
  const url = context.images?.find((image) => image?.file?.url)?.file?.url;
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

function collectTypologies(context, listingUrl) {
  const groups = [
    ...(context.extensinDeCampos?.plotsSpecificationsEvolutivos ?? []),
    ...(context.plotsSpecifications ?? []),
  ];
  const entries = [];
  visit(groups, (candidate) => {
    if (
      !Object.hasOwn(candidate, "area") &&
      !Object.hasOwn(candidate, "roomsAmount") &&
      !Object.hasOwn(candidate, "price")
    ) {
      return;
    }
    const price = Number(candidate.price);
    const area = Number(candidate.area);
    const privateArea = Number(candidate.privateArea);
    const bedrooms = Number(candidate.roomsAmount);
    const bathrooms = Number(candidate.bathroomAmount);
    const parking = Number(candidate.parkingLotAmount);
    if (!Number.isFinite(area) || area <= 0) return;
    entries.push({
      id: String(candidate.id ?? `${area}-${bedrooms}-${price}`),
      name: candidate.contentfulTitle
        ? `${candidate.contentfulTitle} m²`
        : `${area} m²`,
      area_m2: area,
      private_area_m2:
        Number.isFinite(privateArea) && privateArea > 0 ? privateArea : null,
      bedrooms: Number.isFinite(bedrooms) && bedrooms >= 0 ? bedrooms : null,
      bathrooms:
        Number.isFinite(bathrooms) && bathrooms >= 0 ? bathrooms : null,
      parking_spaces:
        Number.isFinite(parking) && parking >= 0 ? parking : null,
      price_cop: Number.isFinite(price) && price > 0 ? price : null,
      price_note: candidate.priceNote ?? null,
      description: candidate.specifications?.specifications ?? null,
      source: "arquitectura-y-concreto",
      source_name: "Arquitectura y Concreto",
      source_url: listingUrl,
      source_kind: "official",
    });
  });
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}

const index = await getJson(indexUrl);
const candidates = new Map();
visit(index.result?.pageContext?.projects, (candidate) => {
  if (
    typeof candidate.slug === "string" &&
    candidate.stateLocation?.contentfulparent?.name === "Cundinamarca" &&
    normalize(candidate.type?.name).includes("apartamento")
  ) {
    candidates.set(candidate.slug, candidate);
  }
});

const records = [];
const exclusions = [];
for (const [slug, summary] of [...candidates].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const listingUrl = new URL(slug, origin).href;
  try {
    const detail = await getJson(detailDataUrl(slug));
    const context = detail.result?.pageContext ?? summary;
    const municipality = context.stateLocation?.name ?? null;
    const market = marketFor(municipality);
    const projectStatus = mapStatus(context.status);
    let latitude = Number(context.latLon?.lat);
    let longitude = Number(context.latLon?.lon);
    let coordinatePrecision = "listing";
    if (
      market === "bogota" &&
      !isBogotaRegionCoordinate(latitude, longitude)
    ) {
      ({ latitude, longitude } = marketCentroids.bogota);
      coordinatePrecision = "neighborhood_centroid";
    }
    const typologies = collectTypologies(context, listingUrl);
    const pricedTypologies = typologies.filter((entry) => entry.price_cop);
    const representative =
      [...pricedTypologies].sort((a, b) => a.price_cop - b.price_cop)[0] ??
      typologies[0];
    const reasons = [];
    if (!market) reasons.push("outside_bogota_sabana");
    if (!projectStatus) reasons.push("inactive_or_unknown_status");
    if (!isBogotaRegionCoordinate(latitude, longitude))
      reasons.push("invalid_region_coordinate");
    if (context.hidden) reasons.push("hidden_project");
    if (reasons.length) {
      exclusions.push({ name: context.name ?? summary.name, url: listingUrl, reasons });
      continue;
    }

    records.push({
      id: `AYC-${context.projectId ?? normalize(context.name).replace(/[^a-z0-9]+/g, "-")}`,
      source: "arquitectura-y-concreto",
      source_name: "Arquitectura y Concreto",
      source_kind: "official",
      developer_name: "Arquitectura y Concreto",
      listing_url: listingUrl,
      title: context.name,
      result_type: "Proyecto",
      operation_type: "Venta",
      project_status: projectStatus,
      project_status_raw: context.status,
      delivery_date: null,
      price_cop: representative?.price_cop ?? null,
      area_m2: representative?.area_m2 ?? null,
      bedrooms: representative?.bedrooms ?? 0,
      bathrooms: representative?.bathrooms ?? 0,
      parking_spaces: representative?.parking_spaces ?? null,
      stratum: null,
      latitude,
      longitude,
      coordinate_precision: coordinatePrecision,
      country: "Colombia",
      state: municipality === "Bogotá" ? "Bogotá D.C." : "Cundinamarca",
      city: municipality === "Bogotá" ? "Bogotá D.C." : municipality,
      municipality,
      market,
      locality: null,
      zone: null,
      neighborhood: context.businessRoomAddress ?? municipality,
      address: context.businessRoomAddress ?? null,
      image_url: firstImageUrl(context),
      typologies,
      data_gaps: [
        ...(!representative ? ["missing_apartment_typologies"] : []),
        ...(!representative?.price_cop ? ["missing_price"] : []),
      ],
    });
  } catch (error) {
    exclusions.push({ name: summary.name, url: listingUrl, reasons: [String(error)] });
  }
}

const payload = {
  schema_version: 1,
  source: "arquitectura-y-concreto",
  source_name: "Arquitectura y Concreto",
  source_url: "https://arquitecturayconcreto.com/proyectos/cundinamarca/",
  source_kind: "official",
  geography: ["Bogotá D.C.", "Sabana de Bogotá"],
  status: "completed",
  scraped_at: new Date().toISOString(),
  record_count: records.length,
  exclusion_count: exclusions.length,
  records,
  exclusions,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({ outputPath, records: records.length, exclusions: exclusions.length }, null, 2)}\n`,
);
