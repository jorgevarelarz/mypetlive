import React from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { addHealthRecord, deleteHealthRecord, updateHealthRecord, type HealthCategory } from '../../api/animals';
import { healthCategoryLabel } from '../../styles/mypetlive';
import { M } from './maqueta';
import { useDialog } from '../../hooks/useDialog';

// Corregir o borrar una entrada del historial de salud (2 nov 2026). Se abre al
// tocar la entrada en «Mi mascota». Lo que apuntó la clínica solo se enseña: la
// familia no puede cambiarlo (el servidor tampoco lo deja, error `vet_record`).

const OPCIONES: HealthCategory[] = ['vaccine', 'deworming', 'medication', 'checkup', 'test', 'surgery', 'other'];
// Lo que el servidor programa solo si no se pone fecha (ver DEFAULT_REPEAT_MONTHS).
const REPITE: Partial<Record<HealthCategory, string>> = { vaccine: 'Si lo dejas vacío, te avisaremos dentro de un año.', deworming: 'Si lo dejas vacío, te avisaremos dentro de tres meses.' };
const aFecha = (v?: string | Date | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const CAMPO: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1px solid #E4DED3', padding: '0 12px', font: 'inherit', fontSize: 16, background: '#fff', color: M.tinta };

type Entrada = { _id?: string; type: string; notes?: string; date?: string; nextDueAt?: string | null; byRole?: string };

/**
 * Sin `entry` es «apuntar uno nuevo» (desde «Registra un cuidado», con `tipoInicial`);
 * con `entry`, corregirlo o borrarlo.
 */
export default function HealthEntrySheet({ code, entry: entrada, petName, onClose, onChanged, tipoInicial, soyClinica }: {
  code: string;
  entry?: Entrada | null;
  petName: string;
  onClose: () => void;
  onChanged: () => void;
  tipoInicial?: HealthCategory;
  /** El veterinario que apuntó la entrada: él sí la corrige (AUD-2). */
  soyClinica?: boolean;
}) {
  const nueva = !entrada;
  const entry: Entrada = entrada || { type: tipoInicial || 'vaccine', date: new Date().toISOString() };
  const deClinica = entry.byRole === 'vet' && !soyClinica;
  const dialogo = useDialog<HTMLDivElement>(onClose);
  const [tipo, setTipo] = React.useState<HealthCategory>((OPCIONES.includes(entry.type as HealthCategory) ? entry.type : 'other') as HealthCategory);
  const [nota, setNota] = React.useState(entry.notes || '');
  const [fecha, setFecha] = React.useState(aFecha(entry.date));
  const [proxima, setProxima] = React.useState(aFecha(entry.nextDueAt));
  // «Quitar aviso» al apuntar algo nuevo: sin esto, vacía = el intervalo por defecto
  // del servidor y el aviso se programaba igual (AUD-2).
  const [sinAviso, setSinAviso] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const hoy = new Date().toISOString().slice(0, 10);

  const mensaje = (e: any) => {
    const code = e?.response?.data?.error;
    return ({
      vet_record: 'Esto lo apuntó la clínica: pídeles a ellos que lo corrijan.',
      note_required: 'Escribe qué le habéis hecho.',
      next_due_in_past: 'La próxima fecha tiene que ser a partir de mañana.',
      date_in_future: 'La fecha no puede ser futura.',
      entry_not_found: 'Esta entrada ya no existe. Actualizamos la ficha.',
    } as Record<string, string>)[code] || 'No se ha podido guardar. Inténtalo de nuevo.';
  };

  const crear = useMutation({
    mutationFn: () => addHealthRecord(code, {
      category: tipo,
      note: nota.trim(),
      date: fecha ? new Date(`${fecha}T12:00:00`).toISOString() : undefined,
      // Vacío: que decida el servidor (vacuna al año, desparasitación a los 3 meses); lo demás, sin aviso.
      nextDueAt: proxima ? new Date(`${proxima}T09:00:00`).toISOString() : (REPITE[tipo] && !sinAviso ? undefined : null),
    }),
    onSuccess: res => { toast.success(res.nextDueAt ? 'Apuntado. Te avisaremos cuando toque.' : 'Apuntado en el pasaporte'); onChanged(); onClose(); },
    onError: (e: any) => setError(mensaje(e)),
  });
  const guardar = useMutation({
    // Solo lo que ha cambiado (AUD-2): reenviar la próxima fecha sin tocarla
    // rearmaba el aviso o fallaba si ya había vencido.
    mutationFn: () => {
      const cambios: Parameters<typeof updateHealthRecord>[2] = {};
      if (tipo !== entry.type) cambios.category = tipo;
      if (nota.trim() !== (entry.notes || '')) cambios.note = nota.trim();
      if (fecha && fecha !== aFecha(entry.date)) cambios.date = new Date(`${fecha}T12:00:00`).toISOString();
      if (proxima !== aFecha(entry.nextDueAt)) cambios.nextDueAt = proxima ? new Date(`${proxima}T09:00:00`).toISOString() : null;
      return updateHealthRecord(code, String(entry._id), cambios);
    },
    onSuccess: () => { toast.success('Corregido en el pasaporte'); onChanged(); onClose(); },
    onError: (e: any) => { setError(mensaje(e)); if (e?.response?.data?.error === 'entry_not_found') onChanged(); },
  });
  const borrar = useMutation({
    mutationFn: () => deleteHealthRecord(code, String(entry._id)),
    onSuccess: () => { toast.success('Borrado del pasaporte'); onChanged(); onClose(); },
    onError: (e: any) => setError(mensaje(e)),
  });
  const ocupado = guardar.isPending || borrar.isPending || crear.isPending;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={nueva ? 'Apuntar un cuidado' : 'Corregir entrada de salud'} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,30,25,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div ref={dialogo} tabIndex={-1} onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, maxHeight: '92dvh', overflowY: 'auto', boxSizing: 'border-box', background: '#FFFDFA', borderRadius: '24px 24px 0 0', padding: '14px 18px calc(18px + env(safe-area-inset-bottom))', fontFamily: M.letra, color: M.tinta }}>
        <span aria-hidden style={{ display: 'block', width: 44, height: 5, borderRadius: 99, background: '#D9D6CF', margin: '0 auto 14px' }} />
        <h2 style={{ margin: '0 0 4px', fontFamily: M.titulos, fontSize: 20, fontWeight: 800 }}>
          {deClinica ? healthCategoryLabel(entry.type) : nueva ? 'Apuntar un cuidado' : 'Corregir'}
        </h2>
        {deClinica ? (
          <>
            <p style={{ margin: '6px 0 4px', fontSize: 15, lineHeight: '21px' }}>{entry.notes}</p>
            <p style={{ margin: '0 0 14px', fontSize: 14, color: M.gris }}>{entry.date ? new Date(entry.date).toLocaleDateString('es-ES') : ''}</p>
            <p style={{ margin: '0 0 16px', fontSize: 14.5, lineHeight: '20px', color: '#3D4340', background: '#F2EEE6', borderRadius: 12, padding: '10px 12px' }}>
              Esto lo apuntó la clínica, así que no se puede cambiar desde aquí. Si hay un error, pídeles que lo corrijan.
            </p>
            <button type="button" onClick={onClose} style={{ width: '100%', height: 50, borderRadius: 14, border: '1px solid #E4DED3', background: '#fff', font: 'inherit', fontSize: 16, fontWeight: 700 }}>Cerrar</button>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#3D4340' }}>
              Qué le habéis hecho
              <select value={tipo} onChange={e => setTipo(e.target.value as HealthCategory)} style={CAMPO}>
                {OPCIONES.map(o => <option key={o} value={o}>{healthCategoryLabel(o)}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#3D4340' }}>
              Detalle
              <input value={nota} maxLength={500} onChange={e => setNota(e.target.value)} style={CAMPO} placeholder={tipo === 'vaccine' ? 'Rabia, polivalente…' : tipo === 'deworming' ? 'Interna, pipeta…' : tipo === 'medication' ? 'Antibiótico 7 días, antiinflamatorio…' : 'Qué le habéis hecho'} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#3D4340', minWidth: 0 }}>
                Fecha
                <input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} style={CAMPO} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 14, color: '#3D4340', minWidth: 0 }}>
                Próxima
                <input type="date" value={proxima} min={manana} onChange={e => { setProxima(e.target.value); setSinAviso(false); }} style={CAMPO} />
              </label>
            </div>
            <span style={{ fontSize: 13, color: M.gris, marginTop: -4 }}>
              {proxima ? 'Te avisaremos una semana antes.' : nueva && REPITE[tipo] && !sinAviso ? REPITE[tipo] : 'Sin próxima fecha no te avisaremos.'}
              {!proxima && nueva && REPITE[tipo] && !sinAviso && <button type="button" onClick={() => setSinAviso(true)} style={{ marginLeft: 8, border: 0, background: 'none', padding: 0, color: M.verdeBoton, font: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>Quitar aviso</button>}
              {proxima && <button type="button" onClick={() => setProxima('')} style={{ marginLeft: 8, border: 0, background: 'none', padding: 0, color: M.verdeBoton, font: 'inherit', fontWeight: 700, textDecoration: 'underline' }}>Quitar aviso</button>}
            </span>
            {error && <p style={{ margin: 0, fontSize: 14, color: '#B3261E' }}>{error}</p>}
            <button type="button" disabled={ocupado || !nota.trim()} onClick={() => { setError(null); (nueva ? crear : guardar).mutate(); }}
              style={{ height: 52, borderRadius: 14, border: 0, background: M.verdeBoton, color: '#fff', font: 'inherit', fontSize: 16.5, fontWeight: 800, opacity: ocupado || !nota.trim() ? 0.6 : 1 }}>
              {guardar.isPending || crear.isPending ? 'Guardando…' : nueva ? 'Apuntar en el pasaporte' : 'Guardar cambios'}
            </button>
            {!nueva && <button type="button" disabled={ocupado}
              onClick={() => { if (window.confirm(`¿Borrar «${healthCategoryLabel(entry.type)}${entry.notes ? ` · ${entry.notes}` : ''}» del pasaporte de ${petName}? También se cancela su aviso.`)) { setError(null); borrar.mutate(); } }}
              style={{ height: 48, borderRadius: 14, border: '1.5px solid #E8C4B8', background: '#fff', color: '#B3261E', font: 'inherit', fontSize: 16, fontWeight: 700 }}>
              {borrar.isPending ? 'Borrando…' : 'Borrar'}
            </button>}
            <button type="button" onClick={onClose} disabled={ocupado} style={{ height: 44, border: 0, background: 'none', color: M.gris, font: 'inherit', fontSize: 15 }}>Cancelar</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
