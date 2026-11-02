/**
 * Geolocalización aproximada sin servicios externos: código postal o nombre de municipio
 * → coordenadas, a partir de src/data/geo-es.json (GeoNames, CC BY 4.0; se regenera con
 * scripts/geo/generar-geo-es.mjs). Sirve para ordenar los animales por cercanía.
 */
import fs from 'fs';
import path from 'path';

export type Punto = { lat: number; lng: number };
export type Lugar = Punto & { etiqueta: string };

type Datos = { cp: Record<string, [number, number]>; nombres: Record<string, [number, number, string]> };
let datos: Datos | null = null;

function cargar(): Datos {
  if (datos) return datos;
  const candidatos = [
    path.join(__dirname, '..', 'data', 'geo-es.json'),
    path.join(process.cwd(), 'src', 'data', 'geo-es.json'),
  ];
  const ruta = candidatos.find(r => fs.existsSync(r));
  datos = ruta ? JSON.parse(fs.readFileSync(ruta, 'utf8')) : { cp: {}, nombres: {} };
  return datos!;
}

const ARTICULOS = new Set(['a', 'o', 'as', 'os', 'la', 'el', 'las', 'los', 'les', 'els', 'l', 's']);

/** Misma normalización que el generador: minúsculas, sin tildes ni artículo inicial. */
export function normalizarLugar(texto: string): string {
  let t = String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  t = t.replace(/['’`]/g, ' ').replace(/[^a-z0-9ñ, ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*), *([a-z]+)$/);
  if (m && ARTICULOS.has(m[2])) t = `${m[2]} ${m[1]}`;
  t = t.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const palabras = t.split(' ');
  while (palabras.length > 1 && ARTICULOS.has(palabras[0])) palabras.shift();
  return palabras.join(' ');
}

/**
 * «15172», «Oleiros», «A Coruña», «Oleiros (A Coruña)», «Perillo, Oleiros»… → coordenadas.
 * Primero el código postal; después el texto entero y luego cada trozo separado por
 * coma o paréntesis, de más largo a más corto. null si no se reconoce.
 */
export function geolocalizar(texto?: string | null, codigoPostal?: string | null): Lugar | null {
  const d = cargar();
  const cps = [codigoPostal, texto].map(v => String(v || '').match(/\b(\d{5})\b/)?.[1]).filter(Boolean) as string[];
  for (const cp of cps) {
    const p = d.cp[cp];
    if (p) return { lat: p[0], lng: p[1], etiqueta: cp };
  }
  const bruto = String(texto || '').replace(/\b\d{5}\b/g, ' ').trim();
  if (!bruto) return null;
  const trozos = [bruto, ...bruto.split(/[,()/]+/)].map(normalizarLugar).filter(Boolean);
  for (const t of trozos) {
    const n = d.nombres[t];
    if (n) return { lat: n[0], lng: n[1], etiqueta: n[2] };
  }
  return null;
}

/** Distancia en km sobre la esfera (haversine). */
export function distanciaKm(a: Punto, b: Punto): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
