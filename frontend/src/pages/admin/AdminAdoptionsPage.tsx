import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminListAdoptions } from '../../api/adoptions';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark, statusLabel } from '../../styles/mypetlive';

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: MPL.muted, fontWeight: 700 };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14, color: MPL.ink, borderTop: `1px solid ${MPL.border}` };

export default function AdminAdoptionsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-adoptions'], queryFn: () => adminListAdoptions({ page: 1, limit: 200 }) });
  const items = data?.items || [];

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: MPL.olive }}>
          <PawMark size={24} />
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, color: MPL.ink, margin: 0 }}>Adopciones</h1>
          <span style={{ fontSize: 13, color: MPL.muted }}>{items.length}</span>
        </header>

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando…</div>
        ) : items.length === 0 ? (
          <div style={{ color: MPL.muted }}>Sin solicitudes de adopción.</div>
        ) : (
          <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: MPL.panel }}>
                <tr>
                  <th style={th}>ID</th>
                  <th style={th}>Animal</th>
                  <th style={th}>Adoptante</th>
                  <th style={th}>Estado</th>
                  <th style={th}>Creado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => (
                  <tr key={it._id || it.id}>
                    <td style={{ ...td, fontSize: 12, color: MPL.faint }}>{(it._id || it.id || '').toString().slice(-6)}</td>
                    <td style={td}>{it.animalId}</td>
                    <td style={td}>{it.adopterId}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: MPL.tealDark, background: MPL.teal100, borderRadius: 999, padding: '2px 8px' }}>
                        {statusLabel(it.status)}
                      </span>
                    </td>
                    <td style={{ ...td, color: MPL.muted, fontSize: 13 }}>{it.createdAt ? new Date(it.createdAt).toLocaleDateString() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
