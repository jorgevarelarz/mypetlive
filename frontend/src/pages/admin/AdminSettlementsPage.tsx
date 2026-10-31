import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import {
  getAdminSettlements,
  markSettlement,
  downloadAdminSettlementsCsv,
  type AdminSettlementRow,
} from '../../api/settlements';

// Liquidación mensual de comisiones: el admin factura y marca como pagado el
// extracto de cada partner (avanza Sale.settlementStatus del mes elegido).

const STATUS: Record<AdminSettlementRow['status'], { label: string; bg: string; color: string }> = {
  pending: { label: 'Pendiente', bg: MPL.gold100, color: MPL.goldDark },
  invoiced: { label: 'Facturado', bg: '#eef3fb', color: '#31589e' },
  paid: { label: 'Pagado', bg: MPL.olive100, color: MPL.oliveDark },
};

function currentPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

const btn: React.CSSProperties = {
  background: '#fff',
  border: `1.5px solid ${MPL.border}`,
  borderRadius: 11,
  padding: '8px 13px',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
};

export default function AdminSettlementsPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-settlements', period], queryFn: () => getAdminSettlements(period) });

  const mark = async (row: AdminSettlementRow, action: 'invoice' | 'pay') => {
    let invoiceRef: string | undefined;
    if (action === 'invoice') {
      const suggested = row.invoiceRef || `LIQ-${period}-`;
      const answer = window.prompt('Referencia de la factura (opcional):', suggested);
      if (answer === null) return; // canceló
      invoiceRef = answer.trim() || undefined;
    }
    setBusy(row.partnerId + action);
    try {
      const res = await markSettlement(row.partnerId, period, action, invoiceRef);
      toast.success(action === 'invoice' ? `Facturadas ${res.updated} ventas` : `Marcadas como pagadas ${res.updated} ventas`);
      qc.invalidateQueries({ queryKey: ['admin-settlements'] });
    } catch {
      toast.error('No se pudo actualizar la liquidación');
    } finally {
      setBusy(null);
    }
  };

  const items = q.data?.items || [];
  const totals = q.data?.totals;

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, margin: 0 }}>Liquidaciones de partners</h1>
            <p style={{ color: MPL.muted, margin: '6px 0 0', fontSize: 14 }}>
              Comisión de plataforma por ventas de cada partner, mes a mes: factura y marca los pagos.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="month"
              value={period}
              onChange={e => e.target.value && setPeriod(e.target.value)}
              style={{ border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '8px 12px', font: 'inherit', background: '#fff' }}
            />
            <button
              type="button"
              style={btn}
              disabled={!items.length}
              onClick={() => downloadAdminSettlementsCsv(period).catch(() => toast.error('No se pudo descargar el CSV'))}
            >
              Descargar CSV
            </button>
          </div>
        </header>

        {totals && (
          <div style={{ color: MPL.muted, fontSize: 13.5 }}>
            {totals.partners} partners · base {totals.amountEur.toFixed(2)} € · comisión <strong style={{ color: MPL.ink }}>{totals.commissionEur.toFixed(2)} €</strong>
          </div>
        )}

        <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 6, overflowX: 'auto' }}>
          {q.isLoading ? (
            <div style={{ padding: 18, color: MPL.faint }}>Cargando…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 18, color: MPL.faint }}>Sin ventas en este mes.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: MPL.muted, fontSize: 12.5 }}>
                  <th style={{ padding: '10px 12px' }}>Partner</th>
                  <th style={{ padding: '10px 12px' }}>Ventas</th>
                  <th style={{ padding: '10px 12px' }}>Base</th>
                  <th style={{ padding: '10px 12px' }}>Comisión</th>
                  <th style={{ padding: '10px 12px' }}>Estado</th>
                  <th style={{ padding: '10px 12px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => {
                  const badge = STATUS[row.status];
                  return (
                    <tr key={row.partnerId} style={{ borderTop: `1px solid ${MPL.border}` }}>
                      <td style={{ padding: '12px', fontWeight: 700 }}>{row.partnerName || row.partnerId}</td>
                      <td style={{ padding: '12px' }}>{row.sales}</td>
                      <td style={{ padding: '12px' }}>{row.amountEur.toFixed(2)} €</td>
                      <td style={{ padding: '12px', fontWeight: 800 }}>{row.commissionEur.toFixed(2)} €</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ background: badge.bg, color: badge.color, borderRadius: 999, padding: '4px 12px', fontSize: 12.5, fontWeight: 800 }}>
                          {badge.label}
                        </span>
                        {row.invoiceRef && <div style={{ color: MPL.faint, fontSize: 12, marginTop: 4 }}>{row.invoiceRef}</div>}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {row.breakdown.pending > 0 && (
                            <button type="button" style={btn} disabled={busy !== null} onClick={() => mark(row, 'invoice')}>
                              {busy === row.partnerId + 'invoice' ? '…' : 'Facturar'}
                            </button>
                          )}
                          {row.status !== 'paid' && (
                            <button
                              type="button"
                              style={{ ...btn, background: MPL.teal, borderColor: MPL.teal, color: '#fff' }}
                              disabled={busy !== null}
                              onClick={() => mark(row, 'pay')}
                            >
                              {busy === row.partnerId + 'pay' ? '…' : 'Marcar pagado'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
