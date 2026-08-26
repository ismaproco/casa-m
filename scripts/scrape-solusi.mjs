#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(repositoryRoot, "scrapes", "solusi-bogota-listings.json");
const origin = "https://www.solusi.com.co";
const searchParameters = "status=venta&tipo-de-inmueble=Apartamento&city=bogota";
const sourceUrl = `${origin}/venta-y-renta-de-inmuebles/?${searchParameters}`;
const bogotaCentroid = { latitude: 4.711, longitude: -74.0721 };
const neighborhoodAliases = {
  "Santa Ana Oriental": "Santa Ana, Usaquén",
  "Bosques del Marques": "Bosque de Pinos, Usaquén",
  "Calleja Baja": "La Calleja, Usaquén",
};
const detailConcurrency = 5;

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&nbsp;", " ")
    .replaceAll("&hellip;", "…")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#8211;", "–")
    .replaceAll("&#8212;", "—")
    .replaceAll("&#039;", "'");
}

function textContent(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function numberFrom(value) {
  const match = textContent(value).replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function priceFrom(value) {
  const match = textContent(value).match(/\$\s*([\d.,]+)/);
  return match ? Number(match[1].replace(/\D/g, "")) : null;
}

function validBogotaCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= 4.45 && latitude <= 4.85 && longitude >= -74.25 && longitude <= -73.95;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "CasaMapaLocalCatalog/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const html = await response.text();
  if (/cf-chl-|just a moment|verify you are human|access denied/i.test(html)) {
    throw new Error(`anti_bot:${url}`);
  }
  return html;
}

function neighborhoodFromTitle(title) {
  return title.split(/\s*[–—-]\s*/).map((part) => part.trim()).filter(Boolean).at(-1) ?? null;
}

function parseCards(html) {
  const sections = html.split('<div class="ere-item-wrap">').slice(1);
  return sections.flatMap((section) => {
    const card = section.split('<div class="ere-item-wrap">')[0];
    const listingUrl = card.match(/<a class="property-link" href="([^"]+)"/i)?.[1];
    const title = textContent(card.match(/<h2 class="property-title">([\s\S]*?)<\/h2>/i)?.[1]);
    const sourceId = card.match(/data-property-id="(\d+)"/i)?.[1];
    if (!listingUrl || !title || !sourceId) return [];
    const address = textContent(card.match(/class="property-location[^>]*title="([^"]*)"/i)?.[1]);
    return [{
      sourceId,
      listingUrl,
      title,
      address,
      neighborhood: neighborhoodFromTitle(title),
      priceCop: priceFrom(card.match(/class="property-price[^>]*>([\s\S]*?)<\/span>/i)?.[1]),
      areaM2: numberFrom(card.match(/class="[^\"]*property-area[^\"]*"[\s\S]*?ere__lpi-value">([\s\S]*?)<\/span>/i)?.[1]),
      bedrooms: numberFrom(card.match(/class="[^\"]*property-bedrooms[^\"]*"[\s\S]*?ere__lpi-value">([\s\S]*?)<\/span>/i)?.[1]),
      bathrooms: numberFrom(card.match(/class="[^\"]*property-bathrooms[^\"]*"[\s\S]*?ere__lpi-value">([\s\S]*?)<\/span>/i)?.[1]),
      imageUrl: card.match(/<img[^>]+src="(https:[^"]+)"/i)?.[1] ?? null,
      rawCard: textContent(card.match(/<div class="property-inner">([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ?? card.slice(0, 5_000)),
    }];
  });
}

function detailValue(html, className) {
  return textContent(html.match(new RegExp(`class="${className}">([\\s\\S]*?)<\\/span>`, "i"))?.[1]);
}

function parseDetail(card, html) {
  const sourceCode = detailValue(html, "ere__property-identity") || card.sourceId;
  const priceCop = priceFrom(detailValue(html, "property-price ere__loop-property-price")) ?? card.priceCop;
  const areaM2 = numberFrom(detailValue(html, "ere__property-size")) ??
    numberFrom(detailValue(html, "ere__property-land-size")) ?? card.areaM2;
  const bedrooms = numberFrom(detailValue(html, "ere__property-bedrooms")) ?? card.bedrooms;
  const bathrooms = numberFrom(detailValue(html, "ere__property-bathrooms")) ?? card.bathrooms;
  const parkingSpaces = numberFrom(detailValue(html, "ere__property-garage"));
  const stratum = numberFrom(html.match(/Estrato\s*([1-6])/i)?.[1]);
  const imageUrl = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] ?? card.imageUrl;
  if (!priceCop) throw new Error(`missing_price:${card.listingUrl}`);
  if (!areaM2) throw new Error(`missing_area:${card.listingUrl}`);
  if (!Number.isFinite(bedrooms)) throw new Error(`missing_bedrooms:${card.listingUrl}`);
  return { ...card, sourceCode, priceCop, areaM2, bedrooms, bathrooms: bathrooms ?? 0, parkingSpaces, stratum, imageUrl };
}

async function geocodeQuery(query) {
  const params = new URLSearchParams({
    q: `${query}, Bogotá, Colombia`,
    format: "jsonv2",
    limit: "5",
    countrycodes: "co",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "user-agent": "CasaMapaLocalCatalog/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`geocoder_${response.status}`);
  const results = await response.json();
  const match = results.find((result) => validBogotaCoordinate(Number(result.lat), Number(result.lon)));
  return match ? { latitude: Number(match.lat), longitude: Number(match.lon), displayName: match.display_name } : null;
}

const firstHtml = await fetchHtml(sourceUrl);
const pageCount = Math.max(1, ...[...firstHtml.matchAll(/\/page\/(\d+)\//g)].map((match) => Number(match[1])));
const pageHtml = [firstHtml];
for (let page = 2; page <= pageCount; page += 1) {
  pageHtml.push(await fetchHtml(`${origin}/venta-y-renta-de-inmuebles/page/${page}/?${searchParameters}`));
}
const cards = [...new Map(pageHtml.flatMap(parseCards).map((card) => [card.listingUrl, card])).values()];

const detailed = new Array(cards.length);
const exclusions = [];
let cursor = 0;
async function detailWorker() {
  while (cursor < cards.length) {
    const index = cursor++;
    try {
      detailed[index] = parseDetail(cards[index], await fetchHtml(cards[index].listingUrl));
    } catch (error) {
      exclusions.push({ url: cards[index].listingUrl, title: cards[index].title, reason: String(error) });
    }
  }
}
await Promise.all(Array.from({ length: detailConcurrency }, detailWorker));

const neighborhoods = [...new Set(detailed.filter(Boolean).map((record) => record.neighborhood).filter(Boolean))].sort();
const coordinates = new Map();
for (const neighborhood of neighborhoods) {
  const sample = detailed.find((record) => record?.neighborhood === neighborhood);
  try {
    let geocode = await geocodeQuery(neighborhood);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    if (!geocode && sample?.address) {
      geocode = await geocodeQuery(sample.address);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
    if (!geocode && neighborhoodAliases[neighborhood]) {
      geocode = await geocodeQuery(neighborhoodAliases[neighborhood]);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
    }
    coordinates.set(neighborhood, geocode);
  } catch (error) {
    coordinates.set(neighborhood, null);
  }
}

const records = detailed.filter(Boolean).map((record) => {
  const geocode = coordinates.get(record.neighborhood) ?? null;
  return {
    id: `SOLUSI-${record.sourceId}`,
    source: "solusi",
    source_name: "Solusi",
    source_id: record.sourceCode,
    result_type: "Inmueble",
    operation_type: "Venta",
    title: record.title,
    neighborhood: record.neighborhood,
    locality: null,
    zone: null,
    city: "Bogotá D.C.",
    price_cop: record.priceCop,
    area_m2: record.areaM2,
    bedrooms: record.bedrooms,
    bathrooms: record.bathrooms,
    parking_spaces: record.parkingSpaces,
    stratum: record.stratum && record.stratum >= 1 && record.stratum <= 6 ? record.stratum : null,
    listing_url: record.listingUrl,
    image_url: record.imageUrl,
    latitude: geocode?.latitude ?? bogotaCentroid.latitude,
    longitude: geocode?.longitude ?? bogotaCentroid.longitude,
    coordinate_precision: "neighborhood_centroid",
    coordinate_source: geocode ? "openstreetmap_nominatim" : "bogota_centroid_fallback",
    geocoder_display_name: geocode?.displayName ?? null,
    address: record.address,
    raw_card: record.rawCard,
    data_gaps: geocode ? [] : ["missing_neighborhood_coordinate"],
  };
});

const payload = {
  schema_version: 1,
  source: "solusi",
  source_name: "Solusi",
  source_url: sourceUrl,
  operation: "sale",
  property_type: "Apartamento",
  city: "Bogotá D.C.",
  status: "completed",
  scraped_at: new Date().toISOString(),
  page_count: pageCount,
  card_count: cards.length,
  record_count: records.length,
  exclusion_count: exclusions.length,
  geocoded_neighborhood_count: [...coordinates.values()].filter(Boolean).length,
  fallback_neighborhood_count: [...coordinates.values()].filter((value) => !value).length,
  records,
  exclusions,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, pages: pageCount, cards: cards.length, records: records.length, exclusions: exclusions.length, geocoded: payload.geocoded_neighborhood_count, fallbacks: payload.fallback_neighborhood_count }, null, 2)}\n`);
