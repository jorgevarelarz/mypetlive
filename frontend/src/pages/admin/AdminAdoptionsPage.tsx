import React from 'react';
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

export default function AdminAdoptionsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-adoptions'], queryFn: () => adminListAdoptions({ page: 1, limit: 200 }) });
  const items = data?.items || [];

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
                  <th style={th}>Acciones</th>
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
      </div>
    </div>
  );
}
