#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputPath = path.join(repositoryRoot, "scrapes", "cusezar-bogota-sabana-projects.json");
const indexUrl = "https://cusezar.com/home-proyectos/";
const centroids = {
  bogota: { latitude: 4.711, longitude: -74.0721 },
  sabana: { latitude: 4.7207, longitude: -73.9698 },
};

function decode(value) {
  return String(value ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function text(value) {
  return decode(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value) {
  let normalized = String(value ?? "").replace(/[^0-9,.-]/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  } else if (normalized.includes(",")) {
    const parts = normalized.split(",");
    normalized = parts.length === 2 && parts[1].length <= 2
      ? `${parts[0]}.${parts[1]}`
      : parts.join("");
  } else if (normalized.includes(".")) {
    const parts = normalized.split(".");
    normalized = parts.length === 2 && parts[1].length <= 2
      ? normalized
      : parts.join("");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function slug(value) {
  return String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function getHtml(url) {
  const response = await fetch(url, { headers: { "user-agent": "CasaMapa/1.0 catalog collector" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function statusFor(value) {
  const normalized = text(value).toLowerCase();
  if (normalized.includes("sobre planos")) return "Sobre planos";
  if (normalized.includes("construcción") || normalized.includes("construccion")) return "En construcción";
  if (normalized.includes("listo para entrega")) return "Entrega inmediata";
  return "En ventas";
}

function typologiesFrom(html, listingUrl) {
  return html.split(/<div class="typology\s[^>]*>/i).slice(1).flatMap((section, index) => {
    const name = text(section.match(/<strong[^>]*>\s*Tipo\s*<span>([\s\S]*?)<\/span>/i)?.[1]);
    const price = number(section.match(/typology__price[^>]*>([\s\S]*?)<\/p>/i)?.[1]);
    const bedrooms = number(section.match(/([0-9]+)\s*Alcobas?/i)?.[1]);
    const bathrooms = number(section.match(/([0-9]+)\s*Baños?/i)?.[1]);
    const area = number(section.match(/class="constructedArea"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const privateArea = number(section.match(/class="privateArea"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    if (!area) return [];
    return [{
      id: `${slug(name || String(area))}-${index + 1}`,
      name: name ? `Tipo ${name}` : `${area} m²`,
      area_m2: area,
      private_area_m2: privateArea,
      bedrooms,
      bathrooms,
      parking_spaces: null,
      price_cop: price,
      price_note: price ? "Precio de referencia desde" : null,
      description: null,
      source: "cusezar",
      source_name: "Cusezar",
      source_url: listingUrl,
      source_kind: "official",
    }];
  });
}

const indexHtml = await getHtml(indexUrl);
const cards = indexHtml.match(/<article class="project-card[\s\S]*?<\/article>/gi) ?? [];
const records = [];
const exclusions = [];

for (const card of cards) {
  const propsRaw = card.match(/data-gtm-props="([^"]+)"/i)?.[1];
  const listingUrl = card.match(/<a href="(https:\/\/cusezar\.com\/proyectos\/[^"]+)"/i)?.[1];
  if (!propsRaw || !listingUrl) continue;
  const props = JSON.parse(decode(propsRaw));
  props.event_action = String(props.event_action).trim();
  const location = `${props.zona ?? ""} ${props.direccion ?? ""}`;
  const regional = /bogot[aá]|la calera/i.test(location);
  if (!regional) continue;
  const market = /la calera/i.test(location) ? "sabana" : "bogota";
  const municipality = market === "sabana" ? "La Calera" : "Bogotá";
  try {
    const detailHtml = await getHtml(listingUrl);
    const typologies = typologiesFrom(detailHtml, listingUrl);
    const representative = [...typologies].filter((entry) => entry.price_cop).sort((a, b) => a.price_cop - b.price_cop)[0] ?? typologies[0];
    const imageUrl = card.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? null;
    const projectStatus = statusFor(card.match(/class="button--term-payment[^>]*title="([^"]+)"/i)?.[1]);
    records.push({
      id: `CUSEZAR-${slug(props.event_action)}`,
      source: "cusezar",
      source_name: "Cusezar",
      source_kind: "official",
      developer_name: "Cusezar",
      listing_url: listingUrl,
      title: props.event_action,
      result_type: "Proyecto",
      operation_type: "Venta",
      project_status: projectStatus,
      delivery_date: null,
      price_cop: representative?.price_cop ?? number(props.precio),
      area_m2: representative?.area_m2 ?? number(props.area_inmueble?.split(/a|hasta/i)[0]),
      bedrooms: representative?.bedrooms ?? 0,
      bathrooms: representative?.bathrooms ?? 0,
      parking_spaces: representative?.parking_spaces ?? null,
      stratum: null,
      ...centroids[market],
      coordinate_precision: "neighborhood_centroid",
      country: "Colombia",
      state: market === "bogota" ? "Bogotá D.C." : "Cundinamarca",
      city: market === "bogota" ? "Bogotá D.C." : municipality,
      municipality,
      market,
      locality: null,
      zone: props.zona ?? null,
      neighborhood: props.zona ?? municipality,
      address: props.direccion ?? null,
      image_url: imageUrl,
      typologies,
      data_gaps: [
        ...(!typologies.length ? ["missing_apartment_typologies"] : []),
        ...(!(representative?.price_cop ?? number(props.precio)) ? ["missing_price"] : []),
      ],
    });
  } catch (error) {
    exclusions.push({ name: props.event_action, url: listingUrl, reasons: [String(error)] });
  }
}

const inactiveProjects = ["Picabia", "Strata", "Tessera"].map((name) => ({
  name,
  developer_name: "Cusezar",
  reason: "not_in_current_official_portfolio",
}));
const payload = {
  schema_version: 1,
  source: "cusezar",
  source_name: "Cusezar",
  source_url: indexUrl,
  source_kind: "official",
  geography: ["Bogotá D.C.", "Sabana de Bogotá"],
  status: "completed",
  scraped_at: new Date().toISOString(),
  record_count: records.length,
  inactive_projects: inactiveProjects,
  exclusion_count: exclusions.length,
  records,
  exclusions,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, records: records.length, inactive: inactiveProjects.length, exclusions: exclusions.length }, null, 2)}\n`);
