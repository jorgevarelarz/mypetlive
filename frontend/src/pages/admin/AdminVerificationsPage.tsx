import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { api as client } from '../../api/client';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

type Row = {
  userId: string;
  status: string;
  verificationLevel?: string;
  legalName?: string;
  nif?: string;
  autonomousCommunity?: string;
  associationRegistryNumber?: string;
  animalProtectionRegistryNumber?: string;
  zoologicalCenterNumber?: string;
  representativeName?: string;
  representativeRole?: string;
  documents?: { type: string; fileUrl: string }[];
  notes?: string;
  updatedAt?: string;
  user?: { name?: string; email?: string; role?: string } | null;
};

const LEVELS = [
  { value: 'association', label: 'Asociación (puede publicar)' },
  { value: 'animal_protection_entity', label: 'Entidad de protección animal (publica + donaciones)' },
  { value: 'authorized_center', label: 'Centro autorizado (publica + donaciones)' },
];

const DOC_LABEL: Record<string, string> = {
  nif: 'NIF',
  association_registry: 'Reg. asociaciones',
  animal_protection_registry: 'Reg. protección animal',
  zoological_center: 'Núcleo zoológico',
  other: 'Otro',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  verified: 'Verificada',
  rejected: 'Rechazada',
  unverified: 'Sin enviar',
};

function VerificationCard({ row, onDone }: { row: Row; onDone: () => void }) {
  const [level, setLevel] = useState('animal_protection_entity');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      await client.post(`/api/verification/${row.userId}/approve`, { verificationLevel: level });
      toast.success(`Verificada: ${row.legalName || row.user?.name || row.userId}`);
      onDone();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'No se pudo aprobar');
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!notes.trim()) {
      toast.error('Indica el motivo del rechazo (se muestra a la protectora)');
      return;
    }
    setBusy(true);
    try {
      await client.post(`/api/verification/${row.userId}/reject`, { notes: notes.trim() });
      toast.success('Rechazada con motivo');
      onDone();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'No se pudo rechazar');
    } finally {
      setBusy(false);
    }
  };

  const fact = (label: string, value?: string) =>
    value ? (
      <div style={{ fontSize: 13.5 }}>
        <span style={{ color: MPL.muted }}>{label}: </span>
        <b>{value}</b>
      </div>
    ) : null;

  return (
    <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 18, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontWeight: 800, fontSize: 18 }}>
            {row.legalName || row.user?.name || 'Protectora sin nombre'}
          </div>
          <div style={{ color: MPL.muted, fontSize: 13 }}>
            {row.user?.email || row.userId}
            {row.updatedAt ? ` · ${new Date(row.updatedAt).toLocaleDateString('es-ES')}` : ''}
          </div>
        </div>
        <span style={{ alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 800, borderRadius: 999, padding: '5px 12px', background: row.status === 'pending' ? MPL.gold100 : row.status === 'verified' ? '#EAF7EF' : '#F8EAEA', color: row.status === 'pending' ? MPL.goldDark : row.status === 'verified' ? '#276749' : '#8F2F2F' }}>
          {STATUS_LABEL[row.status] || row.status}
        </span>
      </div>

      <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {fact('NIF', row.nif)}
        {fact('CCAA', row.autonomousCommunity)}
        {fact('Reg. asociaciones', row.associationRegistryNumber)}
        {fact('Reg. protección animal', row.animalProtectionRegistryNumber)}
        {fact('Núcleo zoológico', row.zoologicalCenterNumber)}
        {fact('Representante', row.representativeName ? `${row.representativeName}${row.representativeRole ? ` (${row.representativeRole})` : ''}` : undefined)}
      </div>

      {(row.documents?.length || 0) > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {row.documents!.map((doc, i) => (
            <a key={`${doc.fileUrl}-${i}`} href={doc.fileUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: 12.5, fontWeight: 700, border: `1px solid ${MPL.border}`, borderRadius: 999, padding: '5px 12px', color: MPL.tealDark, textDecoration: 'none' }}>
              📄 {DOC_LABEL[doc.type] || doc.type}
            </a>
          ))}
        </div>
      )}

      {row.status === 'pending' && (
        <div style={{ display: 'grid', gap: 10, borderTop: `1px solid ${MPL.border}`, paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={level} onChange={e => setLevel(e.target.value)}
              style={{ border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '9px 10px', fontSize: 13.5 }}>
              {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <button type="button" onClick={approve} disabled={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.teal, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              <ShieldCheck size={16} /> Aprobar
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Motivo del rechazo…"
              style={{ flex: 1, minWidth: 220, border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '9px 12px', fontSize: 13.5 }} />
            <button type="button" onClick={reject} disabled={busy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', color: '#8F2F2F', border: '1px solid #C05656', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              <ShieldX size={16} /> Rechazar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminVerificationsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'pending' | 'all'>('pending');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-verifications', status],
    queryFn: async () => {
      const { data } = await client.get(`/api/verification/pending`, { params: { status } });
      return data as { items: Row[] };
    },
  });

  const items = data?.items || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-verifications'] });

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gap: 16, color: MPL.ink }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, margin: 0 }}>Verificaciones de protectoras</h1>
          <p style={{ color: MPL.muted, margin: '4px 0 0', fontSize: 14 }}>
            Aprueba el nivel según la documentación: publicar exige verificación; las donaciones, nivel de entidad de protección o centro autorizado.
          </p>
        </div>
        <select value={status} onChange={e => setStatus(e.target.value as 'pending' | 'all')}
          style={{ border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '9px 10px', fontSize: 13.5 }}>
          <option value="pending">Pendientes</option>
          <option value="all">Todas</option>
        </select>
      </header>

      {isLoading ? (
        <div style={{ color: MPL.muted }}>Cargando…</div>
      ) : items.length === 0 ? (
        <div style={{ color: MPL.muted, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 24, textAlign: 'center' }}>
          No hay verificaciones {status === 'pending' ? 'pendientes' : ''} 🎉
        </div>
      ) : (
        items.map(row => <VerificationCard key={row.userId} row={row} onDone={refresh} />)
      )}
    </div>
  );
}
