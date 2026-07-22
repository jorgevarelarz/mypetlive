import { api as client } from './client';

export type ShelterMetrics = {
  adopciones: {
    total: number;
    esteMes: number;
    solicitudesTotales: number;
    conversionPct: number | null;
    diasMediosProceso: number | null;
  };
  donaciones: { totalEur: number; numero: number; esteMesEur: number; esteMesNumero: number };
  patitas: { recibidas: number; canjeadas: number; canjeadasEur: number };
};

export type PartnerMetrics = {
  cupones: { total: number; usados: number; usadosEsteMes: number };
  clientes: { unicos: number };
  patitas: { recibidas: number; valorEur: number };
  ventas: { numero: number; totalEur: number; comisionEur: number; esteMesNumero: number; esteMesEur: number };
};

export async function getShelterMetrics() {
  const { data } = await client.get('/api/protectoras/me/metrics');
  return data as ShelterMetrics;
}

// Descarga el CSV con la sesión autenticada y dispara el guardado en el navegador.
export async function downloadShelterMetricsCsv() {
  const { data } = await client.get('/api/protectoras/me/metrics?format=csv', { responseType: 'blob' });
  const url = URL.createObjectURL(data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'metricas-protectora.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getPartnerMetrics() {
  const { data } = await client.get('/api/partners/me/metrics');
  return data as PartnerMetrics;
}

// KPIs internos de plataforma (solo admin).
export type PlatformMetrics = {
  usuarios: { total: number; nuevosEsteMes: number; adoptantes: number; protectoras: number; vets: number; tiendas: number };
  animales: { total: number; publicados: number };
  solicitudes: {
    total: number;
    esteMes: number;
    adopcionesTotal: number;
    adopcionesEsteMes: number;
    conversionPct: number | null;
    diasMediosProceso: number | null;
  };
  cupones: { usados: number; usadosEsteMes: number };
  gmv: {
    totalEur: number;
    esteMesEur: number;
    ventasEur: number;
    ventasEsteMesEur: number;
    ventasNumero: number;
    comisionVentasEur: number;
    donacionesEur: number;
    donacionesEsteMesEur: number;
    donacionesNumero: number;
  };
  patitas: { emitidas: number; donadas: number; canjeadas: number; canjeadasEur: number };
};

export async function getPlatformMetrics() {
  const { data } = await client.get('/api/admin/metrics');
  return data as PlatformMetrics;
}

export async function downloadPlatformMetricsCsv() {
  const { data } = await client.get('/api/admin/metrics?format=csv', { responseType: 'blob' });
  const url = URL.createObjectURL(data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kpis-plataforma.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
