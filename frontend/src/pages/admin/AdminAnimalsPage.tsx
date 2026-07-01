import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { searchAnimals, updateAnimalStatus, type AnimalStatus } from '../../api/animals';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark, speciesLabel, sexLabel, sizeLabel, statusLabel } from '../../styles/mypetlive';

const STATUS_COLORS: Record<string, string> = {
  publicado: MPL.olive,
  reservado: MPL.gold,
  adoptado: MPL.teal,
  borrador: MPL.faint,
};

const ANIMAL_STATUSES: AnimalStatus[] = ['borrador', 'publicado', 'reservado', 'preadoptado', 'adoptado', 'no_disponible', 'archivado'];

export default function AdminAnimalsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-animals'], queryFn: () => searchAnimals({ limit: 200, page: 1, sort: 'createdAt', dir: 'desc' }) });
  const items = useMemo(() => data?.items || [], [data]);
  const [status, setStatus] = useState('');

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: AnimalStatus }) => updateAnimalStatus(id, next),
    onSuccess: () => {
      toast.success('Estado del animal actualizado');
      queryClient.invalidateQueries({ queryKey: ['admin-animals'] });
    },
    onError: (error: any) => toast.error(error?.response?.data?.error || 'No se pudo actualizar el estado'),
  });

  const changeStatus = (id: string, next: AnimalStatus) => {
    if (next === 'adoptado' && !window.confirm('¿Marcar como adoptado? Esto cierra la disponibilidad del animal.')) return;
    statusMutation.mutate({ id, next });
  };

  const statuses = useMemo(() => Array.from(new Set(items.map((a: any) => a.status).filter(Boolean))), [items]);
  const filtered = status ? items.filter((a: any) => a.status === status) : items;

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: MPL.coral }}>
            <PawMark size={24} />
            <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, color: MPL.ink, margin: 0 }}>Animales</h1>
            <span style={{ fontSize: 13, color: MPL.muted }}>{filtered.length} de {items.length}</span>
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '8px 12px', fontFamily: MPL_FONT_BODY, color: MPL.ink, background: '#fff' }}
          >
            <option value="">Todos los estados</option>
            {statuses.map((s: any) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </header>

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: MPL.muted }}>No hay animales para ese filtro.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {filtered.map((a: any) => (
              <div key={a._id || a.id} style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ aspectRatio: '16 / 10', background: MPL.panel, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {Array.isArray(a.images) && a.images[0]
                    ? <img src={a.images[0]} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: MPL.faint, fontSize: 13 }}>Sin imagen</span>}
                </div>
                <div style={{ padding: 12, display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: MPL_FONT_DISPLAY, fontWeight: 800, fontSize: 16 }}>{a.name}</span>
                    {a.status && (
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#fff', background: STATUS_COLORS[a.status] || MPL.faint, borderRadius: 999, padding: '2px 8px' }}>
                        {statusLabel(a.status)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: MPL.muted }}>{speciesLabel(a.species)}{a.breed ? ` · ${a.breed}` : ''}</div>
                  <div style={{ fontSize: 12, color: MPL.faint }}>{sexLabel(a.sex)} · {sizeLabel(a.size)}</div>
                  <select
                    value=""
                    disabled={statusMutation.isPending}
                    onChange={e => { const v = e.target.value as AnimalStatus; if (v) changeStatus(String(a._id || a.id), v); e.target.value = ''; }}
                    style={{ marginTop: 4, border: `1px solid ${MPL.border}`, borderRadius: 9, padding: '6px 10px', fontFamily: MPL_FONT_BODY, fontSize: 12.5, color: MPL.ink, background: '#fff' }}
                  >
                    <option value="">Cambiar estado…</option>
                    {ANIMAL_STATUSES.filter(s => s !== a.status).map(s => (
                      <option key={s} value={s}>{statusLabel(s)}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
