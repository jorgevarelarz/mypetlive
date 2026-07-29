import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { adminListAdoptions, setAdoptionStatus, ADOPTION_STATUS_LABEL, type AdoptionShelterStatus } from '../../api/adoptions';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark, statusLabel } from '../../styles/mypetlive';

const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: MPL.muted, fontWeight: 700 };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 14, color: MPL.ink, borderTop: `1px solid ${MPL.border}` };

// Estados que el admin puede fijar a mano (los mismos que la protectora).
const ADMIN_STATUSES: AdoptionShelterStatus[] = ['en_revision', 'info_adicional', 'cita_propuesta', 'preaprobada', 'aprobada', 'rechazada', 'cancelada'];
// Estados con efectos definitivos: piden confirmación.
const FINAL_STATUSES = new Set<AdoptionShelterStatus>(['aprobada', 'rechazada', 'cancelada']);

// El servidor topa `limit` en 50 (adoption.controller.listAll): pedir 200
// devolvía 50 en silencio y el contador de la cabecera mentía.
const PAGE_SIZE = 50;

export default function AdminAdoptionsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-adoptions', page],
    queryFn: () => adminListAdoptions({ page, limit: PAGE_SIZE }),
  });
  const items = data?.items || [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdoptionShelterStatus }) => setAdoptionStatus(id, status),
    onSuccess: () => {
      toast.success('Estado actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-adoptions'] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || 'No se pudo actualizar el estado'),
  });

  const changeStatus = (id: string, status: AdoptionShelterStatus) => {
    if (FINAL_STATUSES.has(status)) {
      const label = ADOPTION_STATUS_LABEL[status];
      if (!window.confirm(`¿Marcar esta adopción como "${label}"? ${status === 'aprobada' ? 'La mascota pasará a ser del adoptante.' : ''}`)) return;
    }
    statusMutation.mutate({ id, status });
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: MPL.olive }}>
          <PawMark size={24} />
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, color: MPL.ink, margin: 0 }}>Adopciones</h1>
          {/* El total lo dice el servidor; antes se pintaba items.length, que
              con el tope de 50 se quedaba clavado en "50" hubiera lo que hubiera. */}
          {!isError && <span style={{ fontSize: 13, color: MPL.muted }}>{isLoading ? '…' : total}</span>}
        </header>

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando…</div>
        ) : isError ? (
          <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 18, display: 'grid', gap: 8, justifyItems: 'start' }}>
            <div style={{ fontWeight: 800 }}>No hemos podido cargar las adopciones.</div>
            <div style={{ color: MPL.muted, fontSize: 14 }}>Puede ser un problema de conexión. No des por hecho que no hay solicitudes.</div>
            <button onClick={() => refetch()} style={{ border: `1px solid ${MPL.border}`, background: '#fff', borderRadius: 10, padding: '8px 16px', fontFamily: MPL_FONT_BODY, fontWeight: 800, color: MPL.tealDark, cursor: 'pointer' }}>Reintentar</button>
          </div>
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
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => (
                  <tr key={it._id || it.id}>
                    <td style={{ ...td, fontSize: 12, color: MPL.faint }}>{(it._id || it.id || '').toString().slice(-6)}</td>
                    {/* Antes aquí iban los ObjectId crudos: dos columnas de hex
                        con las que el admin no podía hacer nada. */}
                    <td style={td}>
                      {it.animal ? (
                        <>
                          {it.animal.name}
                          {it.animal.code && <span style={{ color: MPL.faint, fontSize: 12 }}> · {it.animal.code}</span>}
                        </>
                      ) : <span style={{ color: MPL.faint, fontSize: 13 }}>animal borrado</span>}
                    </td>
                    <td style={td}>
                      {it.adopter ? (
                        <>
                          {it.adopter.name}
                          {it.adopter.email && <div style={{ color: MPL.faint, fontSize: 12 }}>{it.adopter.email}</div>}
                        </>
                      ) : <span style={{ color: MPL.faint, fontSize: 13 }}>usuario borrado</span>}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: MPL.tealDark, background: MPL.teal100, borderRadius: 999, padding: '2px 8px' }}>
                        {statusLabel(it.status)}
                      </span>
                    </td>
                    <td style={{ ...td, color: MPL.muted, fontSize: 13 }}>{it.createdAt ? new Date(it.createdAt).toLocaleDateString() : ''}</td>
                    <td style={td}>
                      <select
                        value=""
                        disabled={statusMutation.isPending}
                        onChange={e => { const v = e.target.value as AdoptionShelterStatus; if (v) changeStatus(String(it._id || it.id), v); e.target.value = ''; }}
                        style={{ border: `1px solid ${MPL.border}`, borderRadius: 9, padding: '6px 10px', fontFamily: MPL_FONT_BODY, fontSize: 13, color: MPL.ink, background: '#fff' }}
                      >
                        <option value="">Cambiar estado…</option>
                        {ADMIN_STATUSES.filter(s => s !== it.status).map(s => (
                          <option key={s} value={s}>{ADOPTION_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && !isError && totalPages > 1 && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ border: `1px solid ${MPL.border}`, background: '#fff', borderRadius: 10, padding: '9px 14px', fontFamily: MPL_FONT_BODY, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? .5 : 1 }}>Anterior</button>
            <span style={{ fontSize: 13, color: MPL.muted }}>Página {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              style={{ border: `1px solid ${MPL.border}`, background: '#fff', borderRadius: 10, padding: '9px 14px', fontFamily: MPL_FONT_BODY, cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? .5 : 1 }}>Siguiente</button>
          </div>
        )}
      </div>
    </div>
  );
}
