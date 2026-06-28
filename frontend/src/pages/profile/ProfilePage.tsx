import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import ProBadge from '../../components/ui/ProBadge';
import api from '../../api/client';
import { uploadImage } from '../../api/uploads';
import { getShelterConnectStatus, createShelterConnectLink, ConnectStatus } from '../../api/connect';
import type { UserProfile } from '../../api/auth';
import PatitasUserPanel from '../../components/patitas/PatitasUserPanel';
import PatitasShelterPanel from '../../components/patitas/PatitasShelterPanel';
import PatitasPartnerPanel from '../../components/patitas/PatitasPartnerPanel';
import VetHealthPanel from '../../components/vet/VetHealthPanel';
import VetAppointmentsPanel from '../../components/vet/VetAppointmentsPanel';
import BookVetAppointment from '../../components/vet/BookVetAppointment';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

const roleLabel: Record<string, string> = {
  tenant: 'Adoptante',
  landlord: 'Protectora',
  admin: 'Administración',
  store: 'Tienda',
  vet: 'Veterinario',
  pro: 'Profesional',
};

const inputStyle: React.CSSProperties = {
  border: `1.5px solid ${MPL.border}`,
  borderRadius: 12,
  padding: '11px 13px',
  font: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  background: '#fff',
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontWeight: 800, fontSize: 14 }}>
      {label}
      {children}
      {hint && <span style={{ color: MPL.faint, fontSize: 12, fontWeight: 600 }}>{hint}</span>}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 }}>
      <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: '0 0 16px' }}>{title}</h2>
      <div style={{ display: 'grid', gap: 14 }}>{children}</div>
    </div>
  );
}

type FormState = {
  name: string;
  email: string;
  avatarUrl: string;
  phone: string;
  bio: string;
  firstName: string;
  lastName: string;
  age: string;
  occupation: string;
  housingType: '' | 'casa' | 'piso';
  orgName: string;
  website: string;
  address: { street: string; city: string; postalCode: string; region: string; country: string };
  vet: { licenseNumber: string; specialties: string[]; services: string[]; schedule: string; emergency24h: boolean };
};

const VET_SPECIALTIES = ['Felina', 'Canina', 'Exóticos', 'Cirugía', 'Dermatología', 'Traumatología', 'Oftalmología', 'Etología'];
const VET_SERVICES = ['Vacunación', 'Desparasitación', 'Cirugía', 'Urgencias', 'Análisis', 'Microchip', 'Peluquería', 'Hospitalización'];

function initForm(user: any): FormState {
  const p: UserProfile = user?.profile || {};
  const a = p.address || {};
  return {
    name: user?.name || '',
    email: user?.email || '',
    avatarUrl: p.avatarUrl || '',
    phone: p.phone || '',
    bio: p.bio || '',
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    age: p.age != null ? String(p.age) : '',
    occupation: p.occupation || '',
    housingType: (p.housingType as any) || '',
    orgName: p.orgName || '',
    website: p.website || '',
    address: {
      street: a.street || '',
      city: a.city || '',
      postalCode: a.postalCode || '',
      region: a.region || '',
      country: a.country || 'España',
    },
    vet: {
      licenseNumber: p.vet?.licenseNumber || '',
      specialties: p.vet?.specialties || [],
      services: p.vet?.services || [],
      schedule: p.vet?.schedule || '',
      emergency24h: Boolean(p.vet?.emergency24h),
    },
  };
}

// ---- Sección de cobro de donaciones (solo protectora) ----------------------
function DonationPayout() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const s = await getShelterConnectStatus();
      setStatus(s);
      setUnavailable(false);
    } catch (e: any) {
      if (e?.response?.status === 503) setUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    setLinking(true);
    try {
      const { url } = await createShelterConnectLink();
      window.location.href = url;
    } catch (e: any) {
      if (e?.response?.status === 503) {
        setUnavailable(true);
        toast.error('Los pagos aún no están disponibles');
      } else {
        toast.error(e?.response?.data?.error || 'No se pudo iniciar la configuración');
      }
      setLinking(false);
    }
  };

  const ready = status?.connected && status?.charges_enabled;
  const pending = status?.connected && !status?.charges_enabled;

  return (
    <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 }}>
      <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: '0 0 6px' }}>Cobro de donaciones</h2>
      <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 16px' }}>
        Las donaciones llegan <strong>directamente a tu cuenta</strong>. MyPetLive solo retiene una pequeña comisión de gestión.
        El número de cuenta lo introduces de forma segura en Stripe durante la verificación.
      </p>

      {loading ? (
        <div style={{ color: MPL.faint }}>Comprobando estado…</div>
      ) : unavailable ? (
        <div style={{ background: MPL.gold100, color: MPL.goldDark, borderRadius: 12, padding: 14, fontSize: 13.5, fontWeight: 700 }}>
          El cobro de donaciones se activará muy pronto. Vuelve más adelante para conectar tu cuenta.
        </div>
      ) : ready ? (
        <div style={{ background: MPL.olive100, color: MPL.oliveDark, borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 800 }}>
          ✓ Cuenta de cobro lista. Ya puedes recibir donaciones.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {pending && (
            <div style={{ background: MPL.gold100, color: MPL.goldDark, borderRadius: 12, padding: 14, fontSize: 13.5, fontWeight: 700 }}>
              Verificación pendiente. Completa los datos en Stripe para empezar a cobrar.
            </div>
          )}
          <button
            type="button"
            onClick={connect}
            disabled={linking}
            style={{ justifySelf: 'start', background: MPL.teal, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: linking ? .7 : 1 }}
          >
            {linking ? 'Abriendo…' : pending ? 'Continuar verificación' : 'Configurar cuenta de cobro'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState<FormState>(() => initForm(user));
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Reinicia el formulario si cambia el usuario (p.ej. tras volver del onboarding de Stripe)
  useEffect(() => { setForm(initForm(user)); }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = user?.role;
  const isPerson = role === 'tenant' || role === 'pro' || role === 'admin';
  const isOrg = role === 'landlord' || role === 'store' || role === 'vet';
  const isTenantPro = role === 'tenant' && user?.tenantPro?.status === 'verified';

  const set = (key: keyof FormState, value: any) => setForm(f => ({ ...f, [key]: value }));
  const setAddr = (key: keyof FormState['address'], value: string) =>
    setForm(f => ({ ...f, address: { ...f.address, [key]: value } }));

  const onPickPhoto = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      set('avatarUrl', url);
      toast.success('Foto subida');
    } catch {
      toast.error('No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?._id) throw new Error('missing_user');
      const profile: UserProfile = {
        avatarUrl: form.avatarUrl,
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        address: {
          street: form.address.street.trim(),
          city: form.address.city.trim(),
          postalCode: form.address.postalCode.trim(),
          region: form.address.region.trim(),
          country: form.address.country.trim(),
        },
      };
      if (isPerson) {
        profile.firstName = form.firstName.trim();
        profile.lastName = form.lastName.trim();
        profile.age = form.age ? Number(form.age) : undefined;
        profile.occupation = form.occupation.trim();
        profile.housingType = form.housingType || undefined;
      }
      if (isOrg) {
        profile.orgName = form.orgName.trim();
        profile.website = form.website.trim();
      }
      if (role === 'vet') {
        profile.vet = {
          licenseNumber: form.vet.licenseNumber.trim(),
          specialties: form.vet.specialties,
          services: form.vet.services,
          schedule: form.vet.schedule.trim(),
          emergency24h: form.vet.emergency24h,
        };
      }
      const payload = { name: form.name.trim(), email: form.email.trim().toLowerCase(), profile };
      const { data } = await api.patch(`/api/users/${user._id}`, payload);
      return data;
    },
    onSuccess: updated => {
      updateUser(updated);
      toast.success('Perfil actualizado');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'No se pudo guardar el perfil');
    },
  });

  const initials = useMemo(() => {
    const base = isOrg ? form.orgName || form.name : `${form.firstName} ${form.lastName}`.trim() || form.name;
    return (base || form.email || '?').trim().slice(0, 1).toUpperCase();
  }, [isOrg, form.orgName, form.name, form.firstName, form.lastName, form.email]);

  if (!user) {
    return <div style={{ padding: 24 }}>Inicia sesión para ver tu perfil.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 24, padding: 24 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Perfil y cuenta</h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0' }}>Completa tu información para operar en MyPetLive.</p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Foto + identidad */}
          <Card title={isOrg ? 'Identidad' : 'Datos personales'}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ width: 76, height: 76, borderRadius: '50%', overflow: 'hidden', background: MPL.teal100, color: MPL.tealDark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, flex: 'none' }}>
                {form.avatarUrl ? (
                  <img src={form.avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  initials
                )}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onPickPhoto(e.target.files?.[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '9px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: MPL.ink }}>
                  {uploading ? 'Subiendo…' : form.avatarUrl ? 'Cambiar foto' : 'Subir foto'}
                </button>
                {form.avatarUrl && (
                  <button type="button" onClick={() => set('avatarUrl', '')} style={{ background: 'none', border: 0, color: MPL.faint, font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', justifySelf: 'start', padding: 0 }}>
                    Quitar
                  </button>
                )}
              </div>
            </div>

            {isOrg && (
              <Field label={role === 'store' ? 'Nombre de la tienda' : 'Nombre de la protectora'}>
                <input value={form.orgName} onChange={e => set('orgName', e.target.value)} style={inputStyle} />
              </Field>
            )}

            {isPerson && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Nombre"><input value={form.firstName} onChange={e => set('firstName', e.target.value)} style={inputStyle} /></Field>
                <Field label="Apellidos"><input value={form.lastName} onChange={e => set('lastName', e.target.value)} style={inputStyle} /></Field>
              </div>
            )}

            <Field label="Nombre público / de cuenta" hint="Cómo se te identifica en la plataforma">
              <input value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Teléfono">
              <input value={form.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} placeholder="+34 ___ ___ ___" />
            </Field>

            {isPerson && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Edad">
                  <input type="number" min={0} max={120} value={form.age} onChange={e => set('age', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="¿Dónde vives?">
                  <select value={form.housingType} onChange={e => set('housingType', e.target.value)} style={inputStyle}>
                    <option value="">Sin especificar</option>
                    <option value="casa">Casa</option>
                    <option value="piso">Piso</option>
                  </select>
                </Field>
              </div>
            )}
            {isPerson && (
              <Field label="Ocupación / trabajo">
                <input value={form.occupation} onChange={e => set('occupation', e.target.value)} style={inputStyle} />
              </Field>
            )}
            {isOrg && (
              <Field label="Sitio web">
                <input value={form.website} onChange={e => set('website', e.target.value)} style={inputStyle} placeholder="https://" />
              </Field>
            )}
            <Field label={isOrg ? 'Sobre la organización' : 'Sobre ti'} hint="Cuéntanos brevemente (máx. 1000 caracteres)">
              <textarea value={form.bio} maxLength={1000} onChange={e => set('bio', e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
            </Field>
          </Card>

          {/* Dirección */}
          <Card title="Dirección">
            <Field label="Calle y número">
              <input value={form.address.street} onChange={e => setAddr('street', e.target.value)} style={inputStyle} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Ciudad"><input value={form.address.city} onChange={e => setAddr('city', e.target.value)} style={inputStyle} /></Field>
              <Field label="Código postal"><input value={form.address.postalCode} onChange={e => setAddr('postalCode', e.target.value)} style={inputStyle} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Provincia / región"><input value={form.address.region} onChange={e => setAddr('region', e.target.value)} style={inputStyle} /></Field>
              <Field label="País"><input value={form.address.country} onChange={e => setAddr('country', e.target.value)} style={inputStyle} /></Field>
            </div>
          </Card>

          {/* Ficha profesional (veterinario) */}
          {role === 'vet' && (
            <Card title="Ficha de la clínica veterinaria">
              <Field label="Nº de colegiado" hint="Identificador profesional / colegiado del veterinario">
                <input value={form.vet.licenseNumber} onChange={e => set('vet', { ...form.vet, licenseNumber: e.target.value })} style={inputStyle} placeholder="Ej. COLVET-12345" />
              </Field>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>Especialidades</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {VET_SPECIALTIES.map(s => {
                    const active = form.vet.specialties.includes(s);
                    return (
                      <button key={s} type="button"
                        onClick={() => set('vet', { ...form.vet, specialties: active ? form.vet.specialties.filter(x => x !== s) : [...form.vet.specialties, s] })}
                        style={{ padding: '7px 13px', borderRadius: 999, border: `1.5px solid ${active ? MPL.teal : MPL.border}`, background: active ? MPL.teal : '#fff', color: active ? '#fff' : MPL.ink, font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>Servicios</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {VET_SERVICES.map(s => {
                    const active = form.vet.services.includes(s);
                    return (
                      <button key={s} type="button"
                        onClick={() => set('vet', { ...form.vet, services: active ? form.vet.services.filter(x => x !== s) : [...form.vet.services, s] })}
                        style={{ padding: '7px 13px', borderRadius: 999, border: `1.5px solid ${active ? MPL.coral : MPL.border}`, background: active ? MPL.coral : '#fff', color: active ? '#fff' : MPL.ink, font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Horario de atención" hint="Texto libre, ej. L-V 9:00–14:00 y 17:00–20:00">
                <textarea value={form.vet.schedule} maxLength={300} onChange={e => set('vet', { ...form.vet, schedule: e.target.value })} style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} />
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, fontSize: 14 }}>
                <input type="checkbox" checked={form.vet.emergency24h} onChange={e => set('vet', { ...form.vet, emergency24h: e.target.checked })} />
                Urgencias 24 h
              </label>
            </Card>
          )}

          {/* Cobro de donaciones (protectora) */}
          {role === 'landlord' && <DonationPayout />}

          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.email.trim()}
            style={{ justifySelf: 'start', background: MPL.coral, color: '#fff', border: 0, borderRadius: 13, padding: '13px 22px', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: saveMutation.isPending ? .7 : 1 }}
          >
            {saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>

        <aside style={{ display: 'grid', gap: 16, alignSelf: 'start' }}>
          <div style={{ background: MPL.teal, color: '#fff', borderRadius: 18, padding: 22 }}>
            <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', fontWeight: 800 }}>Rol</div>
            <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, marginTop: 8 }}>{roleLabel[user.role] || user.role}</div>
            <div style={{ marginTop: 16, color: 'rgba(255,255,255,.82)', fontSize: 14, wordBreak: 'break-word' }}>{user.email}</div>
            {isTenantPro && (
              <div style={{ marginTop: 18, background: '#fff', color: MPL.ink, borderRadius: 14, padding: 12 }}>
                <ProBadge maxRent={user?.tenantPro?.maxRent} />
              </div>
            )}
          </div>

          {role === 'vet' && (() => {
            const steps = [
              { ok: !!form.vet.licenseNumber.trim(), label: 'Nº de colegiado' },
              { ok: form.vet.specialties.length > 0, label: 'Especialidades' },
              { ok: form.vet.services.length > 0, label: 'Servicios' },
              { ok: !!form.address.city.trim(), label: 'Ciudad' },
            ];
            const done = steps.filter(s => s.ok).length;
            if (done === steps.length) return null;
            return (
              <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 18 }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Completa tu ficha ({done}/{steps.length})</div>
                <p style={{ color: MPL.faint, fontSize: 12.5, margin: '0 0 10px' }}>Una ficha completa da más confianza a adoptantes y protectoras.</p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {steps.map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: s.ok ? MPL.oliveDark : MPL.muted }}>
                      <span>{s.ok ? '✓' : '○'}</span>{s.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </aside>
      </section>

      {role === 'vet' && (
        <section style={{ display: 'grid', gap: 14 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: 0 }}>Atención veterinaria 🩺</h2>
          <VetHealthPanel />
          <VetAppointmentsPanel />
        </section>
      )}

      {role === 'tenant' && (
        <section style={{ display: 'grid', gap: 14 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: 0 }}>Veterinario 🩺</h2>
          <BookVetAppointment />
        </section>
      )}

      <section style={{ display: 'grid', gap: 14 }}>
        <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: 0 }}>Patitas 🐾</h2>
        {role === 'tenant' && <PatitasUserPanel />}
        {role === 'landlord' && <PatitasShelterPanel />}
        {(role === 'store' || role === 'vet') && <PatitasPartnerPanel />}
      </section>
    </div>
  );
}
