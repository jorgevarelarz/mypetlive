import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Stethoscope, Syringe, ShieldPlus, Search, PawPrint } from 'lucide-react';
import { getAnimalPassport, addHealthRecord, type HealthCategory } from '../../api/animals';
import { MPL, MPL_FONT_DISPLAY, MPL_FONT_MONO } from '../../styles/mypetlive';

const CATEGORIES: Array<{ value: HealthCategory; label: string }> = [
  { value: 'visit', label: 'Visita / consulta' },
  { value: 'vaccine', label: 'Vacuna' },
  { value: 'deworming', label: 'Desparasitación' },
  { value: 'checkup', label: 'Revisión' },
  { value: 'surgery', label: 'Cirugía' },
  { value: 'test', label: 'Prueba / analítica' },
  { value: 'other', label: 'Otro' },
];

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const inputStyle: React.CSSProperties = { border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' };

export default function VetHealthPanel() {
  const queryClient = useQueryClient();
  const [codeInput, setCodeInput] = useState('');
  const [activeCode, setActiveCode] = useState('');
  const [category, setCategory] = useState<HealthCategory>('visit');
  const [note, setNote] = useState('');
  const [treatment, setTreatment] = useState('');
  const [date, setDate] = useState('');

  const passportQ = useQuery({
    queryKey: ['passport', activeCode],
    queryFn: () => getAnimalPassport(activeCode),
    enabled: !!activeCode,
    retry: false,
  });

  const lookup = () => {
    const c = codeInput.trim().toUpperCase();
    if (!c) return;
    setActiveCode(c);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCode) throw new Error('missing_code');
      if (!note.trim()) throw new Error('note_required');
      return addHealthRecord(activeCode, {
        category,
        note: note.trim(),
        treatment: treatment.trim() || undefined,
        date: date || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Registro clínico añadido al pasaporte');
      setNote('');
      setTreatment('');
      setDate('');
      queryClient.invalidateQueries({ queryKey: ['passport', activeCode] });
    },
    onError: (e: any) => {
      const code = e?.response?.data?.error;
      if (code === 'not_found') toast.error('No existe ningún animal con ese código');
      else if (code === 'note_required' || e?.message === 'note_required') toast.error('Describe el registro');
      else toast.error('No se pudo guardar el registro');
    },
  });

  const p = passportQ.data;
  const notFound = activeCode && !passportQ.isLoading && !p;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, background: MPL.teal100, color: MPL.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Stethoscope size={20} />
        </span>
        <div>
          <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: 0 }}>Historial clínico</h3>
          <p style={{ color: MPL.faint, fontSize: 13, margin: 0 }}>Busca un animal por su código y registra una visita o un hito de salud.</p>
        </div>
      </div>

      {/* Buscar por código */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={codeInput}
          onChange={e => setCodeInput(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
          placeholder="Código del animal (ej. LUNA-715)"
          style={{ ...inputStyle, flex: 1, minWidth: 200, fontFamily: MPL_FONT_MONO, letterSpacing: 1 }}
        />
        <button
          type="button"
          onClick={lookup}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: MPL.teal, color: '#fff', border: 0, borderRadius: 12, padding: '0 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}
        >
          <Search size={16} /> Buscar
        </button>
      </div>

      {passportQ.isLoading && <div style={{ color: MPL.faint, marginTop: 14 }}>Buscando…</div>}
      {notFound && (
        <div style={{ marginTop: 14, background: MPL.coral100 || '#FCE9E4', color: MPL.coralDark, borderRadius: 12, padding: 12, fontSize: 13.5, fontWeight: 700 }}>
          No existe ningún animal con el código <strong>{activeCode}</strong>.
        </div>
      )}

      {p && (
        <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
          {/* Ficha del animal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: MPL.bg, borderRadius: 14, padding: 14 }}>
            <div style={{ width: 54, height: 54, borderRadius: 12, overflow: 'hidden', background: MPL.teal100, color: MPL.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              {p.images?.[0] ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PawPrint size={26} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, fontWeight: 800 }}>{p.name} <span style={{ fontFamily: MPL_FONT_MONO, fontSize: 12, color: MPL.muted }}>{p.code}</span></div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: MPL.muted, marginTop: 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Stethoscope size={13} /> {p.health.vetVisits} visitas</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><ShieldPlus size={13} /> {p.health.healthMilestones} hitos de salud</span>
              </div>
            </div>
          </div>

          {/* Formulario de registro */}
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Tipo de registro
              <select value={category} onChange={e => setCategory(e.target.value as HealthCategory)} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
              Descripción
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={category === 'vaccine' ? 'Ej. Vacuna trivalente, lote ...' : 'Ej. Revisión general, sin incidencias'}
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
                Tratamiento (opcional)
                <input value={treatment} onChange={e => setTreatment(e.target.value)} style={inputStyle} placeholder="Medicación, pauta…" />
              </label>
              <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
                Fecha
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              </label>
            </div>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !note.trim()}
              style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.coral, color: '#fff', border: 0, borderRadius: 13, padding: '12px 20px', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: saveMutation.isPending ? .7 : 1 }}
            >
              <Syringe size={16} /> {saveMutation.isPending ? 'Guardando…' : 'Añadir al pasaporte'}
            </button>
          </div>

          {/* Línea de tiempo actual */}
          {p.timeline.length > 0 && (
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: MPL.muted, marginBottom: 8 }}>Historial reciente</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[...p.timeline].reverse().slice(0, 6).map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${MPL.bg}`, paddingBottom: 7, fontSize: 13 }}>
                    <span><strong>{t.title}</strong>{t.detail ? <span style={{ color: MPL.muted }}> · {t.detail}</span> : null}</span>
                    <span style={{ color: MPL.faint, flex: 'none' }}>{t.at ? new Date(t.at).toLocaleDateString() : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
