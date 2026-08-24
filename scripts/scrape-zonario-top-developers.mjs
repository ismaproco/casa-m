#!/usr/bin/env node

import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const scrapeDirectory = path.join(repositoryRoot, "scrapes");
const developerOutputPath = path.join(
  scrapeDirectory,
  "colombia-top-100-developers.json",
);
const projectOutputPath = path.join(
  scrapeDirectory,
  "zonario-bogota-sabana-projects.json",
);
const inventoryUrl = "https://www.zonario.co/api/proyectos-listado";
const inventoryPageUrl = "https://www.zonario.co/proyectos-de-vivienda";
const rankingUrl =
  "https://www.lanota.com/index.php/CONFIDENCIAS/ranking-2025-lideres-edificacion-urbana-de-colombia.html";
const camacolUrl =
  "https://camacol.co/sites/default/files/24.10.25_PPT_Congreso%20Colombiano%20de%20la%20Construcci%C3%B3n%202025_BQUILLAv2_compressed.pdf";
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138 Safari/537.36";

const sabanaCities = new Set([
  "Cajicá",
  "Chía",
  "Cota",
  "La Calera",
  "Madrid",
  "Mosquera",
  "Zipaquirá",
]);

const cityCentroids = {
  Bogotá: [4.65, -74.1],
  Cajicá: [4.9186, -74.0279],
  Chía: [4.8619, -74.0587],
  Cota: [4.8094, -74.098],
  "La Calera": [4.7207, -73.969],
  Madrid: [4.7324, -74.264],
  Mosquera: [4.7078, -74.232],
  Zipaquirá: [5.022, -74.0048],
};

const localityCentroids = {
  "antonio narino": [4.588, -74.1],
  "barrios unidos": [4.669, -74.074],
  bosa: [4.621, -74.19],
  chapinero: [4.653, -74.062],
  "ciudad bolivar": [4.506, -74.153],
  engativa: [4.707, -74.107],
  fontibon: [4.678, -74.141],
  kennedy: [4.626, -74.157],
  "la candelaria": [4.596, -74.073],
  "los martires": [4.604, -74.091],
  otras: [4.65, -74.1],
  "puente aranda": [4.617, -74.111],
  "rafael uribe uribe": [4.565, -74.116],
  "san cristobal": [4.565, -74.083],
  "santa fe": [4.596, -74.073],
  suba: [4.741, -74.084],
  teusaquillo: [4.646, -74.093],
  tunjuelito: [4.578, -74.131],
  usaquen: [4.748, -74.032],
  usme: [4.477, -74.126],
};

const canonicalRules = [
  [/\bAMARILO\b/, "Amarilo"],
  [/\bMARVAL\b/, "Marval"],
  [/\b(?:CONSTRUCTORA )?BOLIVAR\b/, "Constructora Bolívar"],
  [/^(?:CONSTRUCTORA )?CAPITAL(?: BOGOTA| MEDELLIN)?$/, "Constructora Capital"],
  [/\b(?:CONSTRUCCIONES )?BUEN ?VIVIR\b/, "Construcciones Buen Vivir"],
  [/\bARQUITECTURA Y CONCRETO\b/, "Arquitectura y Concreto"],
  [/\bCONSTRUCTORA COLPATRIA\b|^COLPATRIA$/, "Constructora Colpatria"],
  [/\bCONSTRUCTORA LAS GALIAS\b/, "Constructora Las Galias"],
  [/\bCONINSA(?: Y RAMON H| RAMON H)?\b/, "Coninsa Ramón H"],
  [/\bCONSTRUCTORA CONCONCRETO\b|^CONCONCRETO$/, "Conconcreto"],
  [/\bURBANIZADORA SANTA FE DE BOGOTA URBANSA\b|^URBANSA$/, "Urbansa"],
  [/\bCUSEZAR\b/, "Cusezar"],
  [/\bPRODESA\b/, "Prodesa"],
  [/\bAREA CUADRADA\b/, "Área Cuadrada"],
  [/\bGRUPO EMPRESARIAL OIKOS\b|^OIKOS$/, "Grupo Empresarial Oikos"],
  [/\bCOMPENSAR\b/, "Compensar"],
  [/\bLONDONO GOMEZ\b/, "Londoño Gómez"],
  [/\bCONALTURA\b/, "Conaltura"],
  [/\bCONSTRUCTORA CONTEX\b/, "Constructora Contex"],
  [/\bBIENES (?:Y|&) BIENES\b/, "Bienes y Bienes"],
  [/\bCONSTRUCTORA EL CASTILLO\b|^EL CASTILLO$/, "Constructora El Castillo"],
  [/\bCFC ?& ?A\b/, "CFC & A Construcciones"],
  [/\bINGEURBE\b/, "Ingeurbe"],
  [/\bINACAR\b/, "Inacar"],
  [/\bUMBRAL\b/, "Umbral Propiedad Raíz"],
  [/\bEME PROPIEDAD RAIZ\b/, "EME Propiedad Raíz"],
  [/\bPACTAR\b/, "Pactar"],
  [/\bASCENSO\b/, "Ascenso"],
  [/\bBEMSA\b/, "Bemsa"],
  [/\bCORASA\b/, "Corasa"],
];

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleUpperCase("es")
    .replace(/&AMP;/g, "&")
    .replace(/[^A-Z0-9&]+/g, " ")
    .replace(/\b(?:S A S|SAS|S A|SA|LTDA|BIC)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return value
    .toLocaleLowerCase("es")
    .replace(/(^|[\s&-])\p{L}/gu, (letter) => letter.toLocaleUpperCase("es"));
}

function canonicalDeveloper(value) {
  const key = normalized(value);
  if (!key || key === "NO DISPONIBLE") return null;
  for (const [pattern, name] of canonicalRules) {
    if (pattern.test(key)) return { key: normalized(name), name };
  }
  return { key, name: titleCase(key) };
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validPrice(value) {
  const number = numeric(value);
  return number !== null && number >= 50_000_000 && number <= 20_000_000_000
    ? number
    : null;
}

function validArea(value) {
  const number = numeric(value);
  return number !== null && number > 0 && number <= 1_000 ? number : null;
}

function status(value) {
  const key = normalized(value);
  if (key === "EN CONSTRUCCION") return "En construcción";
  if (key === "SOBRE PLANOS") return "Sobre planos";
  if (key === "ENTREGA INMEDIATA") return "Entrega inmediata";
  return "Proyecto nuevo";
}

function coordinates(project) {
  if (project.ciudad === "Bogotá") {
    return localityCentroids[normalized(project.localidad).toLocaleLowerCase("es")] ??
      cityCentroids.Bogotá;
  }
  return cityCentroids[project.ciudad];
}

function isRegional(project) {
  return project.ciudad === "Bogotá" || sabanaCities.has(project.ciudad);
}

function typologiesFor(project) {
  const seen = new Set();
  return (project.tipologias_detalle ?? []).flatMap((typology, index) => {
    const area = validArea(typology.area);
    const price = validPrice(typology.precio);
    if (!area || !price) return [];
    const bedrooms = numeric(typology.habitaciones);
    const key = `${area}:${price}:${bedrooms}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      id: `ZONARIO-${project.id}-${index + 1}`,
      name: bedrooms === null ? `${area} m²` : `${area} m² · ${bedrooms} hab.`,
      area_m2: area,
      private_area_m2: null,
      bedrooms,
      bathrooms: null,
      parking_spaces: null,
      price_cop: price,
      price_note: "Precio publicado por Zonario",
      description: project.vis || null,
      source: "zonario",
      source_name: "Zonario",
      source_url: new URL(project.href, "https://www.zonario.co").href,
      source_kind: "portal",
    }];
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const text = await response.text();
  if (/captcha|verify you are human|cf-chl-/i.test(text)) {
    throw new Error(`anti_bot:${url}`);
  }
  return JSON.parse(text);
}

async function atomicWrite(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

const collectedAt = new Date().toISOString();
const inventory = await fetchJson(inventoryUrl);
if (!Array.isArray(inventory) || inventory.length < 1_000) {
  throw new Error(`unexpected_inventory_size:${inventory?.length}`);
}

const groups = new Map();
const unattributedProjects = [];
for (const project of inventory) {
  const developer = canonicalDeveloper(project.constructora);
  if (!developer) {
    unattributedProjects.push(project.id);
    continue;
  }
  const group = groups.get(developer.key) ?? {
    key: developer.key,
    name: developer.name,
    aliases: new Map(),
    projects: [],
  };
  group.aliases.set(
    project.constructora,
    (group.aliases.get(project.constructora) ?? 0) + 1,
  );
  group.projects.push(project);
  groups.set(developer.key, group);
}

const topDevelopers = [...groups.values()]
  .sort((a, b) =>
    b.projects.length - a.projects.length || a.name.localeCompare(b.name, "es"),
  )
  .slice(0, 100)
  .map((group, index) => {
    const regionalProjects = group.projects.filter(isRegional);
    return {
      rank: index + 1,
      name: group.name,
      aliases: [...group.aliases.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
        .map(([name, project_count]) => ({ name, project_count })),
      national_project_count: group.projects.length,
      bogota_sabana_project_count: regionalProjects.length,
      bogota_project_count: regionalProjects.filter((project) => project.ciudad === "Bogotá").length,
      sabana_project_count: regionalProjects.filter((project) => sabanaCities.has(project.ciudad)).length,
      municipalities: [...new Set(regionalProjects.map((project) => project.ciudad))].sort(),
      project_ids: regionalProjects.map((project) => project.id).sort(),
      audit_result: regionalProjects.length ? "projects_found" : "no_regional_projects_found",
    };
  });

const topDeveloperKeys = new Set(
  topDevelopers.map((developer) => normalized(developer.name)),
);
const records = [];
const exclusions = [];
for (const project of inventory.filter(isRegional)) {
  const developer = canonicalDeveloper(project.constructora);
  if (!developer || !topDeveloperKeys.has(developer.key)) {
    exclusions.push({
      id: project.id,
      developer_name: developer?.name ?? null,
      reason: developer ? "developer_outside_top_100" : "missing_developer",
    });
    continue;
  }
  const typologies = typologiesFor(project);
  const price = typologies.length
    ? Math.min(...typologies.map((typology) => typology.price_cop))
    : validPrice(project.precio_min);
  const area = typologies.length
    ? Math.min(...typologies.map((typology) => typology.area_m2))
    : validArea(project.area_min);
  if (!price || !area) {
    exclusions.push({
      id: project.id,
      developer_name: developer.name,
      reason: !price ? "missing_or_invalid_price" : "missing_or_invalid_area",
    });
    continue;
  }
  const [latitude, longitude] = coordinates(project) ?? [];
  if (!latitude || !longitude) {
    exclusions.push({
      id: project.id,
      developer_name: developer.name,
      reason: "missing_regional_centroid",
    });
    continue;
  }
  const knownBedrooms = typologies
    .map((typology) => typology.bedrooms)
    .filter((value) => value !== null);
  records.push({
    id: `ZONARIO-${project.id}`,
    source: "zonario",
    source_name: "Zonario",
    source_kind: "portal",
    developer_name: developer.name,
    listing_url: new URL(project.href, "https://www.zonario.co").href,
    title: project.nombre,
    result_type: "Proyecto",
    operation_type: "Venta",
    project_status: status(project.estado),
    delivery_date: project.entrega || null,
    price_cop: price,
    area_m2: area,
    bedrooms: knownBedrooms.length ? Math.min(...knownBedrooms) : 0,
    bathrooms: 0,
    parking_spaces: null,
    stratum: null,
    latitude,
    longitude,
    coordinate_precision: "neighborhood_centroid",
    country: "Colombia",
    state: project.ciudad === "Bogotá" ? "Bogotá D.C." : "Cundinamarca",
    city: project.ciudad === "Bogotá" ? "Bogotá D.C." : project.ciudad,
    municipality: project.ciudad === "Bogotá" ? "Bogotá" : project.ciudad,
    market: project.ciudad === "Bogotá" ? "bogota" : "sabana",
    locality: project.localidad || null,
    zone: project.zona || null,
    neighborhood: project.barrio || null,
    address: null,
    image_url: null,
    typologies: typologies.length
      ? typologies
      : [{
          id: `ZONARIO-${project.id}-summary`,
          name: `${area} m²`,
          area_m2: area,
          private_area_m2: null,
          bedrooms: null,
          bathrooms: null,
          parking_spaces: null,
          price_cop: price,
          price_note: "Precio mínimo publicado por Zonario",
          description: project.vis || null,
          source: "zonario",
          source_name: "Zonario",
          source_url: new URL(project.href, "https://www.zonario.co").href,
          source_kind: "portal",
        }],
  });
}

const methodology = {
  definition:
    "Top 100 grupos constructores/promotores por cantidad de proyectos activos en el inventario nacional de Zonario, después de normalizar razones sociales y alias regionales.",
  scope:
    "Bogotá D.C. y municipios de Sabana presentes en el inventario: Cajicá, Chía, Cota, La Calera, Madrid, Mosquera y Zipaquirá.",
  official_precedence:
    "Zonario se conserva como evidencia de portal; las fichas oficiales existentes mantienen prioridad al fusionar proyectos.",
  sources: [
    { name: "Zonario — inventario nacional", url: inventoryPageUrl },
    { name: "La Nota — ranking 2025 de edificación urbana", url: rankingUrl },
    { name: "Camacol — constructoras vinculadas a Mi Casa en Bogotá", url: camacolUrl },
  ],
};

const developerAudit = {
  schema_version: 1,
  source: "zonario",
  collected_at: collectedAt,
  national_inventory_url: inventoryUrl,
  national_inventory_count: inventory.length,
  canonical_developer_count: groups.size,
  unattributed_project_count: unattributedProjects.length,
  methodology,
  developers: topDevelopers,
};
const projectAudit = {
  schema_version: 1,
  source: "zonario",
  source_name: "Zonario",
  source_kind: "portal",
  scraped_at: collectedAt,
  collection_method: "Public national project inventory API",
  source_url: inventoryPageUrl,
  inventory_url: inventoryUrl,
  methodology,
  top_developer_count: topDevelopers.length,
  audited_developers_with_projects: topDevelopers.filter(
    (developer) => developer.bogota_sabana_project_count > 0,
  ).length,
  audited_developers_without_projects: topDevelopers.filter(
    (developer) => developer.bogota_sabana_project_count === 0,
  ).length,
  record_count: records.length,
  exclusion_count: exclusions.length,
  records,
  exclusions,
};

await mkdir(scrapeDirectory, { recursive: true });
await Promise.all([
  atomicWrite(developerOutputPath, developerAudit),
  atomicWrite(projectOutputPath, projectAudit),
]);

process.stdout.write(`${JSON.stringify({
  developerOutputPath,
  projectOutputPath,
  nationalInventory: inventory.length,
  canonicalDevelopers: groups.size,
  topDevelopers: topDevelopers.length,
  developersWithRegionalProjects: projectAudit.audited_developers_with_projects,
  developersWithoutRegionalProjects: projectAudit.audited_developers_without_projects,
  regionalRecords: records.length,
  exclusions: exclusions.length,
}, null, 2)}\n`);
