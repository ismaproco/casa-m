#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(repositoryRoot, "scrapes", "constructora-capital-bogota-sabana-projects.json");
const origin = "https://www.constructoracapital.com";
const imageOrigin = `${origin}/web_datas/`;

const projects = [
  ["Florecer",207580000,42.56,46.29,38.88,41.55,"Bosa","bogota","/proyecto/2/bogota-y-alrededores/bosa/213/florecer","1657138459_florecer2.jpg"],
  ["Primavera",216940000,50.6,54.9,46.05,49.35,"Bosa","bogota","/proyecto/2/bogota-y-alrededores/bosa/205/primavera","1651246691_primavera.jpg"],
  ["Alborada",224670000,42.56,46.24,38.88,41.54,"Bosa","bogota","/proyecto/2/bogota-y-alrededores/bogota-bosa/255/alborada","1759440008_logo-alborada-alegra-capital.jpg"],
  ["Urbania Eco",225670000,39.86,40.67,35.46,35.46,"Fontibón","bogota","/proyecto/2/bogota-y-alrededores/fontibon/207/urbania-eco","1651249139_urbania-eco.jpg"],
  ["Acanto",240780000,50.6,55.37,46.06,49.57,"Bosa","bogota","/proyecto/2/bogota-y-alrededores/bosa/221/acanto","1684494452_logo-acanto.jpg"],
  ["Solare",245000000,50.7,50.7,45.78,45.78,"Zipaquirá","sabana","/proyecto/2/bogota-y-alrededores/zipaquira/208/solare","1651250441_solare.jpg"],
  ["Verdi",262100000,52.8,53.2,48.35,48.35,"Zipaquirá","sabana","/proyecto/2/bogota-y-alrededores/zipaquira/238/verdi","1728077695_verdi-digital-logo.jpg"],
  ["Urbania Terra",262310000,46.12,48.34,41.16,42.41,"Fontibón","bogota","/proyecto/2/bogota-y-alrededores/fontibon/236/urbania-terra","1724858363_urbania-terra.jpg"],
  ["Eskala",276739000,39.85,44.66,34.32,37.56,"Puente Aranda","bogota","/proyecto/2/bogota-y-alrededores/puente-aranda/229/eskala","1706039706_logo-ajustado.png"],
  ["Vivopark 2",280920000,44.32,46.74,40.28,43.21,"Fontibón","bogota","/proyecto/2/bogota-y-alrededores/bogota-fontibon/244/vivopark-2","1738868507_logo-vivopark2.jpg"],
  ["Vento",297740000,44.66,45.42,39.73,40.16,"Mosquera","sabana","/proyecto/2/bogota-y-alrededores/mosquera-cundinamarca/256/vento","1765661361_belari-mediosdigitales-vento.jpg"],
  ["Mistral",361230000,63.61,71.62,53.23,60.6,"Mosquera","sabana","/proyecto/2/bogota-y-alrededores/mosquera/233/mistral","1712420087_belari_mediosdigitales_mistral-01.jpg"],
  ["Lúmina",372140000,63.79,84.27,57.61,77.56,"Zipaquirá","sabana","/proyecto/2/bogota-y-alrededores/zipaquira/249/lumina","1757696767_alameda-lumina.jpg"],
  ["Pacifika",425100000,71.88,79.99,64.85,71.74,"Mosquera","sabana","/proyecto/2/bogota-y-alrededores/mosquera/200/pacifika","1644235125_pacf.jpg"],
  ["Centriko",585760000,65.8,82.89,59.22,74.64,"Hayuelos","bogota","/proyecto/2/bogota-y-alrededores/hayuelos/217/centriko","1664478717_aktivo-centriko_logo_mediosdigitales_centriko.jpg"],
  ["Nuvó",607100000,56.13,122.63,50.7,101.22,"Bogotá","bogota","/proyecto/2/bogota-y-alrededores/calle-169d-con-av.boyaca/254/nuvo","1759337820_logo-nuvo-fondo-blanco.jpg"],
  ["Laggo",649750000,95.24,111.32,87.15,96.47,"Mosquera","sabana","/proyecto/2/bogota-y-alrededores/mosquera-cundinamarca/251/laggo","1757188571_belari-mediosimpresos-laggo-01.jpg"],
  ["Select 68",721295210,61.66,115.39,56,88.59,"Nuevo Salitre","bogota","/proyecto/2/bogota-y-alrededores/nuevo-salitre/257/select-68","1777043364_logo-select68.jpg"],
  ["Element 142",797600000,58.77,93.2,52.56,77.74,"Bogotá","bogota","/proyecto/2/bogota-y-alrededores/calle-142-con-autopista-norte/243/element-142","1737736989_logo-element.png"],
];

const locations = {
  Bosa:[4.617,-74.19], Fontibón:[4.678,-74.141], "Puente Aranda":[4.62,-74.112], Hayuelos:[4.67,-74.133], "Nuevo Salitre":[4.651,-74.108], Bogotá:[4.711,-74.0721], Zipaquirá:[5.022,-74.0048], Mosquera:[4.7059,-74.2302],
};

const detailedTypologies = {
  Solare: [["Tipo A",245000000,50.7,45.78,3,2,1]],
  Verdi: [["Tipo A - 2 alcobas",262100000,52.8,48.35,2,2,1],["Tipo A - 3 alcobas",262100000,52.8,48.35,3,2,1]],
  "Lúmina": [["Tipo A",372140000,63.79,57.61,3,2,null],["Tipo B",425540000,79.79,67.32,3,2,null],["Tipo C",480250000,84.27,77.56,3,2,null]],
};

const slug = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const records = projects.map(([name,price,minArea,maxArea,minPrivate,maxPrivate,place,market,url,image]) => {
  const [latitude, longitude] = locations[place];
  const listingUrl = `${origin}${url}`;
  const rows = detailedTypologies[name] ?? [[`Área desde ${minArea} m²`,price,minArea,minPrivate,null,null,null]];
  const typologies = rows.map(([typeName,typePrice,area,privateArea,bedrooms,bathrooms,parking], index) => ({
    id: `${slug(name)}-${index + 1}`, name:typeName, price_cop:typePrice, area_m2:area, private_area_m2:privateArea,
    bedrooms, bathrooms, parking_spaces:parking, price_note:"Precio desde", description:null,
    source:"constructora-capital", source_name:"Constructora Capital", source_url:listingUrl, source_kind:"official",
  }));
  const representative = typologies[0];
  return {
    id:`CAPITAL-${slug(name)}`, source:"constructora-capital", source_name:"Constructora Capital", source_kind:"official",
    developer_name:"Constructora Capital", listing_url:listingUrl, title:name, result_type:"Proyecto", operation_type:"Venta",
    project_status:"En ventas", delivery_date:null, price_cop:representative.price_cop, area_m2:representative.area_m2,
    bedrooms:representative.bedrooms ?? 0, bathrooms:representative.bathrooms ?? 0, parking_spaces:representative.parking_spaces,
    stratum:null, latitude, longitude, coordinate_precision:"neighborhood_centroid", country:"Colombia",
    state:market === "bogota" ? "Bogotá D.C." : "Cundinamarca", city:market === "bogota" ? "Bogotá D.C." : place,
    municipality:market === "bogota" ? "Bogotá" : place, market, locality:market === "bogota" ? place : null,
    zone:place, neighborhood:place, address:null, image_url:`${imageOrigin}${image}`, typologies,
    area_range_m2:[minArea,maxArea], private_area_range_m2:[minPrivate,maxPrivate], data_gaps:[],
  };
});

const inactiveProjects = ["Acacia","Álamo","Arborea","Botanika","Caoba","Cedro","Cerezo","Citrino","Iconik 68","Puerta del Sol","Roble","Squadra Urbano","Teka","Torre Estación","Urbania Bio","Vivopark 1","Volare","Zéfiro"].map((name) => ({ name, developer_name:"Constructora Capital", reason:"totalmente_vendido" }));
const payload = {
  schema_version:1, source:"constructora-capital", source_name:"Constructora Capital",
  source_url:`${origin}/proyectos/2/bogota-y-alrededores`, source_kind:"official", geography:["Bogotá D.C.","Sabana de Bogotá"],
  collection_method:"browser_audit", audit_note:"39 tarjetas visibles: 19 proyectos residenciales activos, 18 totalmente vendidos y 2 usos no residenciales.",
  status:"completed", scraped_at:"2026-08-24T00:00:00.000Z", audited_at:"2026-08-24T00:00:00.000Z", record_count:records.length,
  inactive_projects:inactiveProjects, exclusions:[
    {name:"Torre Estación Centro Comercial",reason:"non_residential"},
    {name:"Meridiano Iconik",reason:"non_residential"},
  ], records,
};

await mkdir(path.dirname(outputPath), { recursive:true });
await writeFile(outputPath, `${JSON.stringify(payload,null,2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({outputPath,records:records.length,inactive:inactiveProjects.length},null,2)}\n`);
