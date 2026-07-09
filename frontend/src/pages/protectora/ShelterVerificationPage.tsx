import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ShieldCheck, ShieldAlert, Clock3, FileUp, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getMyVerification,
  submitVerification,
  type VerificationDocument,
  type VerificationDocumentType,
} from '../../api/verification';
import { uploadImage } from '../../api/uploads';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

const CCAA = [
  'Andalucía', 'Aragón', 'Asturias', 'Baleares', 'Canarias', 'Cantabria',
  'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Comunidad Valenciana',
  'Extremadura', 'Galicia', 'La Rioja', 'Madrid', 'Murcia', 'Navarra',
  'País Vasco', 'Ceuta', 'Melilla',
];

const DOC_TYPES: { value: VerificationDocumentType; label: string }[] = [
  { value: 'nif', label: 'Tarjeta NIF de la entidad' },
  { value: 'association_registry', label: 'Registro de asociaciones' },
  { value: 'animal_protection_registry', label: 'Registro de protección animal' },
  { value: 'zoological_center', label: 'Núcleo zoológico' },
  { value: 'other', label: 'Otro documento' },
];

const docLabel = (type: string) => DOC_TYPES.find(d => d.value === type)?.label || type;

const LEVEL_LABEL: Record<string, string> = {
  association: 'Asociación',
  animal_protection_entity: 'Entidad de protección animal',
  authorized_center: 'Centro autorizado',
};

const inputStyle: React.CSSProperties = {
  border: `1px solid ${MPL.border}`,
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14.5,
  width: '100%',
  background: '#fff',
  color: MPL.ink,
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: MPL.ink }}>
        {label}{required && <span style={{ color: MPL.coral }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function StatusBanner({ status, level, notes }: { status: string; level?: string; notes?: string }) {
  if (status === 'verified') {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#EAF7EF', border: '1px solid #2F855A', borderRadius: 14, padding: '14px 18px', color: '#276749' }}>
        <ShieldCheck size={22} />
        <div>
          <div style={{ fontWeight: 800 }}>Protectora verificada</div>
          <div style={{ fontSize: 13.5 }}>
            {level && LEVEL_LABEL[level] ? `Nivel: ${LEVEL_LABEL[level]}. ` : ''}
            Ya puedes publicar animales{level === 'animal_protection_entity' || level === 'authorized_center' ? ' y recibir donaciones' : ''}.
          </div>
        </div>
      </div>
    );
  }
  if (status === 'pending') {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: MPL.gold100, border: `1px solid ${MPL.gold}`, borderRadius: 14, padding: '14px 18px', color: MPL.goldDark }}>
        <Clock3 size={22} />
        <div>
          <div style={{ fontWeight: 800 }}>Verificación en revisión</div>
          <div style={{ fontSize: 13.5 }}>Nuestro equipo está revisando tu documentación. Te avisaremos por email. Puedes corregir y reenviar los datos si lo necesitas.</div>
        </div>
      </div>
    );
  }
  if (status === 'rejected') {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#F8EAEA', border: '1px solid #C05656', borderRadius: 14, padding: '14px 18px', color: '#8F2F2F' }}>
        <ShieldAlert size={22} />
        <div>
          <div style={{ fontWeight: 800 }}>Verificación rechazada</div>
          <div style={{ fontSize: 13.5 }}>{notes || 'Revisa los datos y vuelve a enviarla.'}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: MPL.coral100, border: `1px solid ${MPL.coral}`, borderRadius: 14, padding: '14px 18px', color: MPL.coralDark }}>
      <ShieldAlert size={22} />
      <div>
        <div style={{ fontWeight: 800 }}>Tu protectora aún no está verificada</div>
        <div style={{ fontSize: 13.5 }}>Para publicar animales necesitamos comprobar que sois una entidad real. Solo te llevará unos minutos.</div>
      </div>
    </div>
  );
}

export default function ShelterVerificationPage() {
  const { user } = useAuth();
  const meId = String(user?._id || '');
  const qc = useQueryClient();

  const { data: verification, isLoading } = useQuery({
    queryKey: ['my-verification', meId],
    queryFn: () => getMyVerification(meId),
    enabled: !!meId,
  });

  const [form, setForm] = useState({
    legalName: '',
    nif: '',
    autonomousCommunity: '',
    associationRegistryNumber: '',
    animalProtectionRegistryNumber: '',
    zoologicalCenterNumber: '',
    representativeName: '',
    representativeRole: '',
  });
  const [documents, setDocuments] = useState<VerificationDocument[]>([]);
  const [docType, setDocType] = useState<VerificationDocumentType>('nif');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill una sola vez con lo ya enviado (reenvíos tras un rechazo).
  if (!prefilled && verification && verification.status !== 'unverified') {
    setForm(prev => ({
      ...prev,
      legalName: verification.legalName || '',
      nif: verification.nif || '',
      autonomousCommunity: verification.autonomousCommunity || '',
      associationRegistryNumber: verification.associationRegistryNumber || '',
      animalProtectionRegistryNumber: verification.animalProtectionRegistryNumber || '',
      zoologicalCenterNumber: verification.zoologicalCenterNumber || '',
      representativeName: verification.representativeName || '',
      representativeRole: verification.representativeRole || '',
    }));
    setDocuments(verification.documents || []);
    setPrefilled(true);
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const addDocument = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      setDocuments(prev => [...prev, { type: docType, fileUrl: url, status: 'pending' }]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'No se pudo subir el documento');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.legalName.trim() || !form.nif.trim() || !form.autonomousCommunity || !form.representativeName.trim()) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    if (!documents.length) {
      toast.error('Adjunta al menos un documento (p. ej. la tarjeta NIF)');
      return;
    }
    setSending(true);
    try {
      await submitVerification(meId, { ...form, documents });
      toast.success('Verificación enviada. La revisaremos lo antes posible.');
      qc.invalidateQueries({ queryKey: ['my-verification', meId] });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'No se pudo enviar la verificación');
    } finally {
      setSending(false);
    }
  };

  const status = verification?.status || 'unverified';
  const isVerified = status === 'verified';

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gap: 18, color: MPL.ink }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: 0 }}>
          Verificación de la protectora
        </h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0', fontSize: 14.5 }}>
          Los datos legales de tu entidad nos permiten activar la publicación de animales y las donaciones.
        </p>
      </header>

      {isLoading ? (
        <div style={{ color: MPL.muted }}>Cargando estado…</div>
      ) : (
        <StatusBanner status={status} level={verification?.verificationLevel} notes={verification?.notes} />
      )}

      {!isVerified && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 16, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 19, fontWeight: 800, margin: 0 }}>Datos de la entidad</h2>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Field label="Nombre legal" required>
              <input style={inputStyle} value={form.legalName} onChange={set('legalName')} placeholder="Asociación Protectora…" />
            </Field>
            <Field label="NIF" required>
              <input style={inputStyle} value={form.nif} onChange={set('nif')} placeholder="G12345678" />
            </Field>
            <Field label="Comunidad autónoma" required>
              <select style={inputStyle} value={form.autonomousCommunity} onChange={set('autonomousCommunity')}>
                <option value="">Selecciona…</option>
                {CCAA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Nº registro de asociaciones">
              <input style={inputStyle} value={form.associationRegistryNumber} onChange={set('associationRegistryNumber')} />
            </Field>
            <Field label="Nº registro de protección animal">
              <input style={inputStyle} value={form.animalProtectionRegistryNumber} onChange={set('animalProtectionRegistryNumber')} />
            </Field>
            <Field label="Nº de núcleo zoológico">
              <input style={inputStyle} value={form.zoologicalCenterNumber} onChange={set('zoologicalCenterNumber')} />
            </Field>
            <Field label="Persona representante" required>
              <input style={inputStyle} value={form.representativeName} onChange={set('representativeName')} placeholder="Nombre y apellidos" />
            </Field>
            <Field label="Cargo">
              <input style={inputStyle} value={form.representativeRole} onChange={set('representativeRole')} placeholder="Presidencia, secretaría…" />
            </Field>
          </div>

          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 19, fontWeight: 800, margin: '6px 0 0' }}>Documentación</h2>
          <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
            Sube foto o PDF de al menos un documento oficial. El registro de protección animal o el núcleo
            zoológico habilitan además recibir donaciones.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select style={{ ...inputStyle, width: 'auto' }} value={docType} onChange={e => setDocType(e.target.value as VerificationDocumentType)}>
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.teal, color: '#fff', borderRadius: 10, padding: '10px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
              <FileUp size={16} /> {uploading ? 'Subiendo…' : 'Subir documento'}
              <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} disabled={uploading}
                onChange={e => { addDocument(e.target.files?.[0]); e.currentTarget.value = ''; }} />
            </label>
          </div>
          {documents.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {documents.map((doc, i) => (
                <li key={`${doc.fileUrl}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 13.5 }}>
                  <span style={{ fontWeight: 700 }}>{docLabel(doc.type)}</span>
                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ color: MPL.tealDark }}>ver archivo</a>
                  <button type="button" onClick={() => setDocuments(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#8F2F2F', cursor: 'pointer', display: 'inline-flex' }}
                    aria-label="Quitar documento">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <button type="submit" disabled={sending || uploading}
              style={{ background: MPL.coral, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 26px', fontWeight: 800, fontSize: 15, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
              {sending ? 'Enviando…' : status === 'pending' ? 'Reenviar verificación' : 'Enviar verificación'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
