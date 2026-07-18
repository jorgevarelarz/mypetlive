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
