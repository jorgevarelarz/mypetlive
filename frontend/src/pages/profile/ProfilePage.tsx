import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalcoPerAdoptar, CalcoPerCamara, CalcoPerDatos, CalcoPerEmail, CalcoPerGuardar, CalcoPerNombre, CalcoPerSubir, CalcoPerTelefono } from '../../components/icons/calcados';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { uploadImage } from '../../api/uploads';
import { getShelterConnectStatus, createShelterConnectLink, ConnectStatus } from '../../api/connect';
import type { UserProfile } from '../../api/auth';
import PatitasUserPanel from '../../components/patitas/PatitasUserPanel';
import PatitasShelterPanel from '../../components/patitas/PatitasShelterPanel';
import PatitasPartnerPanel from '../../components/patitas/PatitasPartnerPanel';
import VetHealthPanel from '../../components/vet/VetHealthPanel';
import VetOffersPanel from '../../components/vet/VetOffersPanel';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import DeleteAccountPanel from '../../components/account/DeleteAccountPanel';
import { openPaymentPage } from '../../utils/native';

const inputStyle: React.CSSProperties = {
  minHeight: 52,
  border: '1px solid #DCD6CB',
  borderRadius: 14,
  padding: '12px 16px',
  font: 'inherit',
  fontSize: 16,
  fontWeight: 400,
  color: '#14231F',
  width: '100%',
  boxSizing: 'border-box',
  background: '#fff',
};

// Maqueta «Perfil y cuenta» (2 nov 2026), a tamaño normal de iPhone. Vale para
// todos los perfiles: la familia, la protectora, la tienda y el veterinario.
function Field({ label, children, hint, icono, extra }: { label: string; children: React.ReactNode; hint?: string; icono?: React.ReactNode; extra?: string }) {
  return (
    <label style={{ display: 'grid', gap: 8, fontWeight: 800, fontSize: 16, color: '#1E2A27' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icono}{label}{extra && <span style={{ fontWeight: 500 }}>{extra}</span>}
      </span>
      {children}
      {hint && <span style={{ color: '#5E6460', fontSize: 13.5, lineHeight: '19px', fontWeight: 400 }}>{hint}</span>}
    </label>
  );
}

function Card({ title, children, icono }: { title: string; children: React.ReactNode; icono?: React.ReactNode }) {
  return (
    <div style={{ background: '#FEFEFE', border: '1px solid #EEE9E1', borderRadius: 24, padding: '18px 18px 20px', boxShadow: '0 8px 22px -16px rgba(60,45,30,.3)' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800, color: '#17352D', margin: '0 0 18px' }}>
        {icono && <span style={{ width: 52, height: 52, borderRadius: 14, background: '#DDEEE8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icono}</span>}
        {title}
      </h2>
      <div style={{ display: 'grid', gap: 16 }}>{children}</div>
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
  itemCatalog: { name: string; priceEur: string }[];
  vet: {
    licenseNumber: string;
    specialties: string[];
    services: string[];
    serviceCatalog: { name: string; priceEur: string; pricingType: 'fijo' | 'variable' }[];
    schedule: string;
    agenda: { dias: number[]; horas: string[] };
    emergency24h: boolean;
  };
};

// Agenda de reservas del veterinario: lo que ve la familia como huecos en «Citas».
// La de por defecto es la misma que usa el servidor (utils/vetAgenda.ts).
const AGENDA_POR_DEFECTO = { dias: [1, 2, 3, 4, 5], horas: ['10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00'] };
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const HORAS_AGENDA = Array.from({ length: 27 }, (_, i) => `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // mismo tope que multer en upload.routes.ts

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
    itemCatalog: (p.itemCatalog || []).map(it => ({
      name: it.name || '',
      priceEur: it.priceEur != null ? String(it.priceEur) : '',
    })),
    vet: {
      licenseNumber: p.vet?.licenseNumber || '',
      specialties: p.vet?.specialties || [],
      services: p.vet?.services || [],
      serviceCatalog: (p.vet?.serviceCatalog || []).map(s => ({
        name: s.name || '',
        priceEur: s.priceEur != null ? String(s.priceEur) : '',
        pricingType: s.pricingType === 'fijo' ? 'fijo' : 'variable',
      })),
      schedule: p.vet?.schedule || '',
      agenda: p.vet?.agenda?.dias?.length && p.vet?.agenda?.horas?.length ? p.vet.agenda : AGENDA_POR_DEFECTO,
      emergency24h: Boolean(p.vet?.emergency24h),
    },
  };
}

// ---- Sección de cobro de donaciones (solo protectora) ----------------------
function DonationPayout() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [linking, setLinking] = useState(false);

  // Todo error que no sea el 503 de "pagos aún no disponibles" hay que decirlo:
  // si se traga, `status` se queda null y se ofrece "Configurar cuenta de cobro"
  // a una protectora que ya la tiene lista, invitándola a rehacer el KYC.
  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const s = await getShelterConnectStatus();
      setStatus(s);
      setUnavailable(false);
    } catch (e: any) {
      if (e?.response?.status === 503) setUnavailable(true);
      else setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const connect = async () => {
    setLinking(true);
    try {
      const { url } = await createShelterConnectLink();
      await openPaymentPage(url, () => { setLinking(false); void load(); });
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
      ) : failed ? (
        <div style={{ background: MPL.bg, borderRadius: 12, padding: 14, display: 'grid', gap: 8, justifyItems: 'start' }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>No hemos podido comprobar tu cuenta de cobro.</div>
          <div style={{ color: MPL.muted, fontSize: 13.5 }}>Puede ser un problema de conexión. No rehagas la verificación sin comprobarlo.</div>
          <button type="button" onClick={load} style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 11, padding: '8px 16px', font: 'inherit', fontSize: 13, fontWeight: 800, color: MPL.tealDark, cursor: 'pointer' }}>
            Reintentar
          </button>
        </div>
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

  const set = (key: keyof FormState, value: any) => setForm(f => ({ ...f, [key]: value }));
  const setAddr = (key: keyof FormState['address'], value: string) =>
    setForm(f => ({ ...f, address: { ...f.address, [key]: value } }));

  const onPickPhoto = async (file?: File) => {
    if (!file) return;
    // Mismos límites que multer (upload.routes.ts): así el error se ve antes de
    // subir 10 MB para nada, y con el mismo criterio que el alta de mascota.
    if (!file.type.startsWith('image/')) {
      toast.error('Ese archivo no es una imagen. Sube un JPG o un PNG.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('La imagen supera los 10 MB. Prueba con una más ligera.');
      return;
    }
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
      if (role === 'store' || role === 'vet') {
        profile.itemCatalog = form.itemCatalog
          .filter(it => it.name.trim())
          .map(it => {
            const price = Number(it.priceEur.replace(',', '.'));
            return {
              name: it.name.trim(),
              priceEur: it.priceEur !== '' && Number.isFinite(price) && price >= 0 ? price : undefined,
            };
          });
      }
      if (role === 'vet') {
        profile.vet = {
          licenseNumber: form.vet.licenseNumber.trim(),
          specialties: form.vet.specialties,
          services: form.vet.services,
          serviceCatalog: form.vet.serviceCatalog
            .filter(s => s.name.trim())
            .map(s => {
              const price = Number(s.priceEur.replace(',', '.'));
              return {
                name: s.name.trim(),
                priceEur: s.priceEur !== '' && Number.isFinite(price) && price >= 0 ? price : undefined,
                pricingType: s.pricingType,
              };
            }),
          schedule: form.vet.schedule.trim(),
          agenda: form.vet.agenda,
          emergency24h: form.vet.emergency24h,
        };
      }
      const payload = { name: form.name.trim(), email: form.email.trim().toLowerCase(), profile };
      const { data } = await api.patch(`/api/users/${user._id}`, payload);
      return data;
    },
    onSuccess: updated => {
      updateUser(updated);
      // El email no cambia al guardar: hay que confirmarlo en la dirección nueva.
      // Sin decirlo aquí, el formulario mostraría el correo nuevo y la cuenta
      // seguiría usando el viejo, que es la peor combinación posible.
      if (updated?.emailChangePending) {
        setForm(f => ({ ...f, email: updated.email }));
        toast.success('Perfil actualizado. Te hemos enviado un correo a la dirección nueva: tu email no cambiará hasta que lo confirmes ahí.', { duration: 9000 });
      } else {
        toast.success('Perfil actualizado');
      }
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
    <div style={{ display: 'grid', gap: 20, padding: 'clamp(4px, 2vw, 24px) 0', position: 'relative' }}>
      <header style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', alignItems: 'end', gap: 4, maxWidth: 720, marginBottom: -26 }}>
        <div style={{ paddingBottom: 34 }}>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, lineHeight: '34px', fontWeight: 800, color: '#14231F', margin: 0 }}>Perfil y cuenta</h1>
          <p style={{ color: '#4A524D', fontSize: 15, lineHeight: '21px', margin: '6px 0 0' }}>
            {isOrg ? 'Completa tu información para operar en MyPetLive.' : 'Solo lo básico. Lo demás te lo pedimos cuando haga falta.'}
          </p>
        </div>
        <img src="/ilustraciones/perfil-cabecera.png" alt="" aria-hidden style={{ width: 150, height: 'auto', display: 'block', position: 'relative', zIndex: 0 }} />
      </header>

      {/* La columna lateral solo existe para la ficha del veterinario; sin ella
          el formulario ocupa todo el ancho en lugar de dejar un hueco. */}
      <section className={role === 'vet' ? 'profile-grid' : undefined} style={role === 'vet' ? undefined : { display: 'grid', gap: 16, maxWidth: 720 }}>
        <div style={{ display: 'grid', gap: 16 }}>
          {/* Foto + identidad */}
          <div style={{ position: 'relative', zIndex: 1 }}>
          <Card title={isOrg ? 'Identidad' : 'Datos personales'} icono={<CalcoPerDatos size={24} />}>
            <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Cambiar la foto"
                style={{ position: 'relative', width: 96, height: 96, padding: 0, border: 0, borderRadius: '50%', background: '#DCEFEA', color: '#0E5F5B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MPL_FONT_DISPLAY, fontSize: 40, fontWeight: 800, flex: 'none', cursor: 'pointer' }}>
                <span style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {form.avatarUrl ? (
                    <img src={form.avatarUrl} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    initials
                  )}
                </span>
                <span aria-hidden style={{ position: 'absolute', right: -4, bottom: -2, width: 34, height: 34, borderRadius: '50%', background: '#0E5F5B', border: '2px solid #FEFEFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CalcoPerCamara size={15} color="#FFFFFF" />
                </span>
              </button>
              <div style={{ display: 'grid', gap: 6 }}>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onPickPhoto(e.target.files?.[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 48, background: '#fff', border: '1.5px solid #B9CBC4', borderRadius: 14, padding: '0 18px', font: 'inherit', fontSize: 16, fontWeight: 800, cursor: 'pointer', color: '#14231F' }}>
                  <CalcoPerSubir size={20} />
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

            {/* Una persona tiene un solo nombre que rellenar. Nombre, apellidos y
                «nombre público» eran tres casillas para lo mismo; firstName y
                lastName siguen en el formulario y se guardan como estaban. */}
            <Field label={isOrg ? 'Nombre público / de cuenta' : 'Nombre'} icono={<CalcoPerNombre size={20} />} hint={isOrg ? 'Cómo se te identifica en la plataforma' : undefined}>
              <input value={form.name} onChange={e => set('name', e.target.value)} style={inputStyle} placeholder="Tu nombre" />
            </Field>
            <Field label="Email" icono={<CalcoPerEmail size={17} />} hint="Es la dirección con la que inicias sesión. Si la cambias, te enviaremos un correo a la nueva dirección para confirmarla; hasta entonces seguirás entrando con la actual.">
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} style={{ ...inputStyle, fontWeight: 700 }} />
            </Field>
            <Field label="Teléfono" extra={isOrg ? undefined : ' (opcional)'} icono={<CalcoPerTelefono size={20} />} hint={isOrg ? undefined : 'Para que te localicen si alguien encuentra a tu mascota perdida.'}>
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} placeholder="+34 600 000 000" />
            </Field>

            {isOrg && (
              <Field label="Sitio web">
                <input value={form.website} onChange={e => set('website', e.target.value)} style={inputStyle} placeholder="https://" />
              </Field>
            )}
            {isOrg && (
              <Field label="Sobre la organización" hint="Cuéntanos brevemente (máx. 1000 caracteres)">
                <textarea value={form.bio} maxLength={1000} onChange={e => set('bio', e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
              </Field>
            )}

            {/* Lo que ve la protectora en una solicitud (edad, ciudad, sobre ti):
                solo le sirve a quien va a adoptar, así que va plegado. La
                dirección completa no se pide aquí: el carrito la pide al
                comprar. Vivienda y ocupación no las lee nadie y ya no se piden
                (lo que hubiera guardado se conserva). */}
            {isPerson && (
              <details className="perfil-adoptar" style={{ borderTop: '1px solid #ECE8E0', paddingTop: 16 }} open={Boolean(form.age || form.address.city || form.bio)}>
                <summary style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 12, height: 54, padding: '0 16px', borderRadius: 14, background: '#EEF5EF', fontWeight: 800, fontSize: 16, color: '#14231F' }}>
                  <CalcoPerAdoptar size={22} />
                  <span style={{ flex: 1 }}>Si vas a adoptar <span style={{ fontWeight: 500 }}>(opcional)</span></span>
                  <svg className="perfil-adoptar-flecha" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14231F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
                </summary>
                <p style={{ color: MPL.faint, fontSize: 12.5, margin: '6px 0 12px' }}>
                  La protectora lo verá cuando le envíes una solicitud.
                </p>
                <div style={{ display: 'grid', gap: 14 }}>
                  <div className="field-duo">
                    <Field label="Edad">
                      <input type="number" min={0} max={120} value={form.age} onChange={e => set('age', e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="Ciudad">
                      <input value={form.address.city} onChange={e => setAddr('city', e.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                  <Field label="Sobre ti" hint="Tu casa, tu día a día, otros animales… (máx. 1000 caracteres)">
                    <textarea value={form.bio} maxLength={1000} onChange={e => set('bio', e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
                  </Field>
                </div>
              </details>
            )}
          </Card>
          </div>

          {/* Dirección: la de una persona se pide en el carrito, al comprar. */}
          {isOrg && (
          <Card title="Dirección">
            <Field label="Calle y número">
              <input value={form.address.street} onChange={e => setAddr('street', e.target.value)} style={inputStyle} />
            </Field>
            <div className="field-duo">
              <Field label="Ciudad"><input value={form.address.city} onChange={e => setAddr('city', e.target.value)} style={inputStyle} /></Field>
              <Field label="Código postal"><input value={form.address.postalCode} onChange={e => setAddr('postalCode', e.target.value)} style={inputStyle} /></Field>
            </div>
            <div className="field-duo">
              <Field label="Provincia / región"><input value={form.address.region} onChange={e => setAddr('region', e.target.value)} style={inputStyle} /></Field>
              <Field label="País"><input value={form.address.country} onChange={e => setAddr('country', e.target.value)} style={inputStyle} /></Field>
            </div>
          </Card>
          )}

          {/* Catálogo de productos (tienda/vet): quick-add en caja sin teclear cada venta */}
          {(role === 'store' || role === 'vet') && (
            <Card title="Catálogo de productos">
              <p style={{ color: MPL.faint, fontSize: 12.5, margin: 0 }}>
                Guarda tus productos habituales para añadirlos con un toque al registrar una venta en Caja, sin escribir el nombre y el precio cada vez.
              </p>
              {form.itemCatalog.map((item, i) => {
                const update = (patch: Partial<typeof item>) =>
                  set('itemCatalog', form.itemCatalog.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <div key={i} className="item-catalog-row">
                    <input value={item.name} onChange={e => update({ name: e.target.value })} maxLength={100} style={inputStyle} placeholder="Ej. Pienso cachorro 3kg" />
                    <input type="number" min={0} step="0.01" value={item.priceEur} onChange={e => update({ priceEur: e.target.value })} style={inputStyle} placeholder="€" />
                    <button type="button" aria-label="Quitar producto"
                      onClick={() => set('itemCatalog', form.itemCatalog.filter((_, j) => j !== i))}
                      style={{ border: `1.5px solid ${MPL.border}`, background: '#fff', borderRadius: 10, padding: '8px 0', cursor: 'pointer', color: MPL.coralDark, fontWeight: 800 }}>
                      ×
                    </button>
                  </div>
                );
              })}
              <button type="button"
                onClick={() => set('itemCatalog', [...form.itemCatalog, { name: '', priceEur: '' }])}
                disabled={form.itemCatalog.length >= 60}
                style={{ justifySelf: 'start', border: `1.5px dashed ${MPL.teal}`, background: '#fff', color: MPL.teal, borderRadius: 11, padding: '8px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                + Añadir producto
              </button>
            </Card>
          )}

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
              <div style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>Servicios con precio</span>
                <p style={{ color: MPL.faint, fontSize: 12.5, margin: 0 }}>
                  Precio fijo (consulta, vacuna, revisión…) o bajo presupuesto. Se muestran a los dueños al pedir cita. Todavía no se cobra online.
                </p>
                {form.vet.serviceCatalog.map((item, i) => {
                  const update = (patch: Partial<typeof item>) =>
                    set('vet', { ...form.vet, serviceCatalog: form.vet.serviceCatalog.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                  return (
                    <div key={i} className="vet-svc-row">
                      <input value={item.name} onChange={e => update({ name: e.target.value })} maxLength={80} style={inputStyle} placeholder="Ej. Consulta general" />
                      <input
                        type="number" min={0} step="0.5" value={item.priceEur}
                        onChange={e => update({ priceEur: e.target.value })}
                        style={inputStyle} placeholder="€"
                        title={item.pricingType === 'variable' ? 'Opcional: precio orientativo' : 'Precio en euros'}
                      />
                      <select value={item.pricingType} onChange={e => update({ pricingType: e.target.value as 'fijo' | 'variable' })} style={inputStyle}>
                        <option value="fijo">Precio fijo</option>
                        <option value="variable">Presupuesto</option>
                      </select>
                      <button type="button" aria-label="Quitar servicio"
                        onClick={() => set('vet', { ...form.vet, serviceCatalog: form.vet.serviceCatalog.filter((_, j) => j !== i) })}
                        style={{ border: `1.5px solid ${MPL.border}`, background: '#fff', borderRadius: 10, padding: '8px 0', cursor: 'pointer', color: MPL.coralDark, fontWeight: 800 }}>
                        ×
                      </button>
                    </div>
                  );
                })}
                <button type="button"
                  onClick={() => set('vet', { ...form.vet, serviceCatalog: [...form.vet.serviceCatalog, { name: '', priceEur: '', pricingType: 'fijo' }] })}
                  disabled={form.vet.serviceCatalog.length >= 30}
                  style={{ justifySelf: 'start', border: `1.5px dashed ${MPL.teal}`, background: '#fff', color: MPL.teal, borderRadius: 11, padding: '8px 14px', font: 'inherit', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                  + Añadir servicio
                </button>
              </div>
              <Field label="Horario de atención" hint="Texto libre, ej. L-V 9:00–14:00 y 17:00–20:00">
                <textarea value={form.vet.schedule} maxLength={300} onChange={e => set('vet', { ...form.vet, schedule: e.target.value })} style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} />
              </Field>
              <Field label="Citas desde MyPetLive" hint="Los días y horas que las familias ven libres al reservar. Lo que ya está pedido no sale.">
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DIAS_SEMANA.map((d, i) => {
                      const n = i + 1;
                      const on = form.vet.agenda.dias.includes(n);
                      return (
                        <button key={d} type="button" aria-pressed={on}
                          onClick={() => {
                            const dias = on ? form.vet.agenda.dias.filter(x => x !== n) : [...form.vet.agenda.dias, n].sort();
                            if (dias.length) set('vet', { ...form.vet, agenda: { ...form.vet.agenda, dias } });
                          }}
                          style={{ width: 40, height: 40, borderRadius: 10, border: `1.5px solid ${on ? MPL.teal : MPL.border}`, background: on ? MPL.teal100 : '#fff', color: on ? MPL.tealDark : MPL.ink, fontWeight: 800, cursor: 'pointer' }}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}>
                    {HORAS_AGENDA.map(h => {
                      const on = form.vet.agenda.horas.includes(h);
                      return (
                        <button key={h} type="button" aria-pressed={on}
                          onClick={() => {
                            const horas = on ? form.vet.agenda.horas.filter(x => x !== h) : [...form.vet.agenda.horas, h].sort();
                            if (horas.length) set('vet', { ...form.vet, agenda: { ...form.vet.agenda, horas } });
                          }}
                          style={{ height: 36, borderRadius: 999, border: `1.5px solid ${on ? MPL.teal : MPL.border}`, background: on ? MPL.teal100 : '#fff', color: on ? MPL.tealDark : MPL.ink, fontWeight: on ? 800 : 600, fontSize: 13.5, cursor: 'pointer' }}>
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>
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
            // Guardar mientras la foto sube descartaba la foto en silencio: el
            // PATCH sale con el avatarUrl viejo. Mismo arreglo que en /pet.
            disabled={saveMutation.isPending || uploading || !form.email.trim()}
            style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: 'min(100%, 300px)', height: 54, background: '#0E5F5B', color: '#fff', border: 0, borderRadius: 14, padding: '0 22px', font: 'inherit', fontSize: 17, fontWeight: 800, cursor: 'pointer', opacity: saveMutation.isPending || uploading ? .7 : 1 }}
          >
            <CalcoPerGuardar size={20} color="#FFFFFF" />
            {uploading ? 'Subiendo foto…' : saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>

        {role === 'vet' && (
        <aside style={{ display: 'grid', gap: 16, alignSelf: 'start' }}>
          {(() => {
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
        )}
      </section>

      {role === 'vet' && (
        <section style={{ display: 'grid', gap: 14 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: 0 }}>Atención veterinaria 🩺</h2>
          <VetHealthPanel />
          <VetOffersPanel />
        </section>
      )}

      {/* El adoptante tiene sus Patitas en la cabecera (/patitas). Protectora,
          tienda y veterinario no: su panel vive aquí. */}
      {(role === 'landlord' || role === 'store' || role === 'vet') && (
        <section style={{ display: 'grid', gap: 14 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: 0 }}>Patitas 🐾</h2>
          {role === 'landlord' && <PatitasShelterPanel />}
          {(role === 'store' || role === 'vet') && <PatitasPartnerPanel />}
        </section>
      )}

      <DeleteAccountPanel />
      {/* Huellas y colina de la maqueta, abajo a la derecha (debajo de los botones, sin taparlos). */}
      <img src="/ilustraciones/perfil-pie.png" alt="" aria-hidden style={{ justifySelf: 'end', width: 130, height: 'auto', marginTop: -24, marginRight: -12, pointerEvents: 'none' }} />
      <style>{`.perfil-adoptar > summary::-webkit-details-marker{display:none}.perfil-adoptar[open] .perfil-adoptar-flecha{transform:rotate(180deg)}`}</style>
    </div>
  );
}
