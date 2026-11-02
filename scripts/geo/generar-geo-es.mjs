// Genera src/data/geo-es.json: coordenadas de cada código postal y de cada municipio o
// localidad de España, para ordenar los animales por cercanía sin llamar a servicios externos.
//
//   curl -O https://download.geonames.org/export/zip/ES.zip && unzip ES.zip
//   node scripts/geo/generar-geo-es.mjs ES.txt
//
// Datos: GeoNames (https://www.geonames.org), licencia CC BY 4.0.
// La normalización tiene que ser la misma que `normalizarLugar` de src/utils/geo.ts.
import fs from 'node:fs';
import path from 'node:path';

const ARTICULOS = new Set(['a', 'o', 'as', 'os', 'la', 'el', 'las', 'los', 'les', 'els', 'l', 's']);
export function normalizarLugar(texto) {
  let t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/['’`]/g, ' ').replace(/[^a-z0-9ñ, ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // «Coruña, A» → «A Coruña»
  const m = t.match(/^(.*), *([a-z]+)$/);
  if (m && ARTICULOS.has(m[2])) t = `${m[2]} ${m[1]}`;
  t = t.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const palabras = t.split(' ');
  while (palabras.length > 1 && ARTICULOS.has(palabras[0])) palabras.shift();
  return palabras.join(' ');
}

const origen = process.argv[2];
if (!origen) { console.error('uso: node generar-geo-es.mjs ES.txt'); process.exit(1); }
const filas = fs.readFileSync(origen, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t'));

const r3 = n => Math.round(n * 1000) / 1000;
// Mediana y no media: GeoNames rellena algunos códigos con una coordenada de relleno de la
// provincia (en A Coruña, 10 de 25 filas apuntan a Ourense) y la media se iría con ellas.
const mediana = xs => { const o = [...xs].sort((a, b) => a - b); const k = o.length >> 1; return o.length % 2 ? o[k] : (o[k - 1] + o[k]) / 2; };
const media = pts => [r3(mediana(pts.map(p => p[0]))), r3(mediana(pts.map(p => p[1])))];

const porCp = new Map();
// nombre normalizado → municipio (código) → { puntos, etiqueta }
const porNombre = new Map();
// Nombres bilingües («Donostia-San Sebastian», «Castellón de la Plana/Castelló de la Pla»):
// cada mitad también vale como nombre del mismo sitio.
const variantes = nombre => {
  const v = new Set([nombre]);
  for (const parte of nombre.split('/')) v.add(parte);
  for (const parte of [...v]) {
    const trozos = parte.split('-');
    if (trozos.length === 2 && trozos.every(t => t.trim().length >= 4)) trozos.forEach(t => v.add(t));
  }
  return [...v];
};
const anotar = (nombre, clave, etiqueta, punto) => {
  for (const variante of variantes(nombre)) anotarUno(variante, clave, etiqueta, punto);
};
const anotarUno = (nombre, clave, etiqueta, punto) => {
  const n = normalizarLugar(nombre);
  if (!n) return;
  if (!porNombre.has(n)) porNombre.set(n, new Map());
  const m = porNombre.get(n);
  if (!m.has(clave)) m.set(clave, { puntos: [], etiqueta });
  m.get(clave).puntos.push(punto);
};
for (const f of filas) {
  const [, cp, lugar, , , provincia, , municipio, codMunicipio, lat, lng] = f;
  const punto = [Number(lat), Number(lng)];
  if (!Number.isFinite(punto[0]) || !Number.isFinite(punto[1])) continue;
  if (!porCp.has(cp)) porCp.set(cp, []);
  porCp.get(cp).push(punto);
  const clave = `${provincia}|${codMunicipio || municipio}`;
  anotar(lugar, `${clave}|${lugar}`, `${lugar} (${provincia})`, punto);
  if (municipio) anotar(municipio, clave, `${municipio} (${provincia})`, punto);
}

const cp = {};
for (const [k, pts] of porCp) cp[k] = media(pts);
// Si un nombre se repite (hay varias «Coruña», «San Pedro»…), gana el sitio con más
// códigos postales: es el más poblado y el que casi siempre quiere decir la gente.
const nombres = {};
for (const [n, sitios] of porNombre) {
  const mejor = [...sitios.values()].sort((a, b) => b.puntos.length - a.puntos.length)[0];
  nombres[n] = [...media(mejor.puntos), mejor.etiqueta];
}
// Formas de uso corriente que GeoNames no trae con ese nombre.
const ALIAS = { palma: 'palma de mallorca', castellon: 'castellon de la plana', castello: 'castello de la plana',
  orense: 'ourense', gerona: 'girona', lerida: 'lleida', 'san sebastian': 'donostia', sangenjo: 'sanxenxo', elche: 'elche elx' };
for (const [alias, destino] of Object.entries(ALIAS)) if (nombres[destino]) nombres[alias] = nombres[destino];
const salida = path.join(path.dirname(new URL(import.meta.url).pathname), '../../src/data/geo-es.json');
fs.writeFileSync(salida, JSON.stringify({ fuente: 'GeoNames (www.geonames.org), CC BY 4.0', cp, nombres }));
console.log(`${Object.keys(cp).length} códigos postales y ${Object.keys(nombres).length} nombres → ${salida}`);
