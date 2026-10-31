import { api as client } from './client';

// Liquidación mensual de comisiones de partners (admin).
export type AdminSettlementRow = {
  partnerId: string;
  partnerName: string | null;
  sales: number;
  amountEur: number;
  commissionEur: number;
  status: 'pending' | 'invoiced' | 'paid';
  breakdown: { pending: number; invoiced: number; paid: number };
  invoiceRef: string | null;
};

export type AdminSettlements = {
  period: string;
  items: AdminSettlementRow[];
  totals: { partners: number; amountEur: number; commissionEur: number };
};

export async function getAdminSettlements(period: string) {
  const { data } = await client.get('/api/admin/sales/settlements', { params: { period } });
  return data as AdminSettlements;
}

export async function markSettlement(partnerId: string, period: string, action: 'invoice' | 'pay', invoiceRef?: string) {
  const { data } = await client.post(`/api/admin/sales/settlements/${partnerId}/${period}`, { action, invoiceRef });
  return data as { ok: boolean; updated: number; statement: AdminSettlementRow | null };
}

// Descarga el CSV con la sesión autenticada y dispara el guardado en el navegador.
export async function downloadAdminSettlementsCsv(period: string) {
  const { data } = await client.get('/api/admin/sales/settlements', {
    params: { period, format: 'csv' },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `liquidacion-${period}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
