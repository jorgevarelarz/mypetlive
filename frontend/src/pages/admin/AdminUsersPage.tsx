import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark } from '../../styles/mypetlive';

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos los roles' },
  { value: 'tenant', label: 'Adoptante' },
  { value: 'landlord', label: 'Protectora' },
  { value: 'store', label: 'Partner · tienda' },
  { value: 'vet', label: 'Partner · veterinaria' },
  { value: 'admin', label: 'Admin' },
];
const ROLE_LABEL: Record<string, string> = { tenant: 'Adoptante', landlord: 'Protectora', store: 'Tienda', vet: 'Veterinaria', admin: 'Admin' };

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: MPL.muted, fontWeight: 700 };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14, color: MPL.ink, borderTop: `1px solid ${MPL.border}` };
const ctrl: React.CSSProperties = { border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '9px 12px', fontFamily: MPL_FONT_BODY, color: MPL.ink, background: '#fff' };

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading } = useQuery({
    queryKey: ['admin/users', { q, role, page, limit: pageSize }],
    queryFn: async () => {
      setError(null);
      const { data } = await api.get('/api/users', { params: { q, role, page, limit: pageSize } });
      return data as { items: any[]; total: number; page: number; limit: number };
    },
  });
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.limit || pageSize)));
  const pageItems = data?.items || [];

  const exportCsv = () => {
    const rows = pageItems.map((u: any) => ({ email: u.email, role: u.role, createdAt: u.createdAt }));
    const header = 'email,role,createdAt\n';
    const body = rows.map(r => [r.email, r.role, r.createdAt ? String(r.createdAt) : ''].join(',')).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `users_page_${data?.page || 1}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 16 }}>
        <header style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: MPL.teal }}>
          <PawMark size={24} />
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, color: MPL.ink, margin: 0 }}>Usuarios</h1>
          {typeof data?.total === 'number' && <span style={{ fontSize: 13, color: MPL.muted }}>{data.total}</span>}
        </header>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="Buscar por email o rol…" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} style={{ ...ctrl, width: 320, maxWidth: '100%' }} />
          <select value={role} onChange={e => { setRole(e.target.value); setPage(1); }} style={ctrl}>
            {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={exportCsv} style={{ ...ctrl, cursor: 'pointer', fontWeight: 700, color: MPL.tealDark, background: MPL.teal100, borderColor: MPL.teal100 }}>Exportar CSV</button>
        </div>

        {error && <div style={{ color: MPL.coralDark }}>{error}</div>}

        <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: MPL.panel }}>
              <tr>
                <th style={th}>Email</th>
                <th style={th}>Rol</th>
                <th style={th}>Creado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={3} style={{ ...td, color: MPL.muted }}>Cargando…</td></tr>
              ) : pageItems.length === 0 ? (
                <tr><td colSpan={3} style={{ ...td, color: MPL.muted }}>No hay usuarios para esos filtros.</td></tr>
              ) : pageItems.map((u: any) => (
                <tr key={u._id}>
                  <td style={td}>{u.email}</td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: MPL.tealDark, background: MPL.teal100, borderRadius: 999, padding: '2px 8px' }}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td style={{ ...td, color: MPL.muted, fontSize: 13 }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ ...ctrl, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>Anterior</button>
          <span style={{ fontSize: 13, color: MPL.muted }}>Página {data?.page || page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ ...ctrl, cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}
