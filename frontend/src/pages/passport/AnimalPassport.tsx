import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { PawPrint, MapPin, ShieldCheck, Stethoscope, Heart, Tag } from 'lucide-react';
import { getAnimalPassport } from '../../api/animals';
import { offersForAnimal } from '../../api/offers';
import { usePageMeta } from '../../utils/usePageMeta';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, MPL_FONT_MONO, speciesLabel, sizeLabel, sexLabel } from '../../styles/mypetlive';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };

export default function AnimalPassport() {
  const { code = '' } = useParams();
  const normalized = code.trim().toUpperCase();

  const passQ = useQuery({ queryKey: ['passport', normalized], queryFn: () => getAnimalPassport(normalized), enabled: !!normalized, retry: false });
  const offersQ = useQuery({ queryKey: ['offers-animal', normalized], queryFn: () => offersForAnimal(normalized), enabled: !!normalized, retry: false });

  const p = passQ.data;
  usePageMeta({
    title: p ? `${p.name} · Pasaporte MyPetLive (${p.code})` : 'Pasaporte · MyPetLive',
    description: p ? `${speciesLabel(p.species)} · ${p.age || ''} · pasaporte digital en MyPetLive` : 'Pasaporte digital de mascota',
    image: p?.images?.[0],
  });

  const passportUrl = typeof window !== 'undefined' ? window.location.href : '';
  const offers = offersQ.data?.items || [];

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, background: MPL.bg, color: MPL.ink, minHeight: '100vh' }}>
      <header style={{ borderBottom: `1px solid ${MPL.border}`, background: '#fff' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Link to="/" style={{ textDecoration: 'none', color: MPL.ink, display: 'flex', alignItems: 'center', gap: 9 }}>
            <PawPrint size={22} color={MPL.teal} />
            <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800 }}>MyPet<span style={{ color: MPL.coral }}>Live</span></span>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px 60px', display: 'grid', gap: 16 }}>
        {passQ.isLoading ? (
          <div style={{ color: MPL.faint }}>Cargando pasaporte…</div>
        ) : !p ? (
          <div style={card}>
            <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: 0 }}>Pasaporte no encontrado</h1>
            <p style={{ color: MPL.muted }}>No existe ningún animal con el código <strong>{normalized}</strong>.</p>
            <Link to="/animals" style={{ color: MPL.teal, fontWeight: 800 }}>Ver animales en adopción →</Link>
          </div>
        ) : (
          <>
            {/* Se ha perdido. Va lo primero y en rojo porque esta página, cuando
                de verdad se usa, la abre alguien que tiene al animal delante y
                el móvil en la mano: lo demás puede esperar a después del aviso. */}
            {p.lost?.isLost && (
              <div style={{ ...card, borderColor: MPL.coral, background: '#FFF4F1' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: MPL.coralDark, fontWeight: 800 }}>
                  <MapPin size={18} /> {p.name} se ha perdido
                </div>
                {p.lost.area && <div style={{ marginTop: 8, fontSize: 15 }}>Se perdió por <strong>{p.lost.area}</strong>.</div>}
                {p.lost.notes && <div style={{ marginTop: 4, color: MPL.muted, fontSize: 14.5 }}>{p.lost.notes}</div>}
                {p.lost.contact ? (
                  <div style={{ marginTop: 12, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ fontSize: 12.5, color: MPL.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      Avisa a su familia
                    </div>
                    <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, marginTop: 4 }}>
                      {p.lost.contactName ? `${p.lost.contactName} · ` : ''}{p.lost.contact}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 14.5, color: MPL.muted }}>
                    Su familia no ha dejado un teléfono aquí. Avísala desde el formulario de esta misma página.
                  </div>
                )}
              </div>
            )}

            {/* Hero */}
            <div style={{ ...card, display: 'grid', gridTemplateColumns: 'minmax(0,260px) 1fr', gap: 20, alignItems: 'center' }} className="passport-hero">
              <div style={{ aspectRatio: '1', borderRadius: 16, overflow: 'hidden', background: MPL.teal100 }}>
                {p.images?.[0]
                  ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.teal }}><PawPrint size={64} /></div>}
              </div>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: MPL.ink, color: '#fff', borderRadius: 999, padding: '5px 12px', fontFamily: MPL_FONT_MONO, fontWeight: 800, letterSpacing: 1 }}>
                  <ShieldCheck size={14} /> {p.code}
                </div>
                <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 38, fontWeight: 800, margin: '10px 0 4px' }}>{p.name}</h1>
                <div style={{ color: MPL.muted, fontSize: 15 }}>
                  {[speciesLabel(p.species), p.breed, p.sex ? sexLabel(p.sex) : null, p.size ? sizeLabel(p.size) : null, p.age].filter(Boolean).join(' · ')}
                </div>
                {p.personality?.length ? (
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                    {p.personality.map(t => <span key={t} style={{ background: MPL.olive100, color: MPL.oliveDark, borderRadius: 999, padding: '4px 11px', fontSize: 12.5, fontWeight: 800 }}>{t}</span>)}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Procedencia + salud + QR */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
              {/* Una protectora es una organización y su nombre y ciudad son
                  públicos; una familia no. De ahí que aquí solo salga el nombre
                  de pila, sin ciudad: lo justo para saber a quién se llama. */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: MPL.teal, fontWeight: 800, marginBottom: 8 }}>
                  {p.provenance ? <><MapPin size={17} /> Procedencia</> : <><Heart size={17} /> Su familia</>}
                </div>
                <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, fontWeight: 800 }}>
                  {p.provenance?.shelterName || p.family?.name || 'Registrado por su familia'}
                </div>
                {p.provenance?.city && <div style={{ color: MPL.muted, fontSize: 14 }}>{p.provenance.city}</div>}
              </div>
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: MPL.teal, fontWeight: 800, marginBottom: 8 }}><Stethoscope size={17} /> Salud</div>
                <div style={{ fontSize: 14, color: MPL.muted }}>{p.health.vetVisits} visitas veterinarias</div>
                <div style={{ fontSize: 14, color: MPL.muted }}>{p.health.healthMilestones} hitos de salud</div>
              </div>
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: 8 }}>
                  <QRCodeSVG value={passportUrl} size={92} bgColor="#ffffff" fgColor={MPL.ink} />
                </div>
                <div style={{ fontSize: 12.5, color: MPL.muted, fontWeight: 700 }}>Escanea o comparte este pasaporte</div>
              </div>
            </div>

            {/* Ofertas personalizadas */}
            {offers.length > 0 && (
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Tag size={18} color={MPL.coralDark} />
                  <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: 0 }}>Ofertas para {p.name}</h2>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {offers.map(o => (
                    <div key={o._id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '11px 14px' }}>
                      <Tag size={16} color={MPL.coralDark} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{o.title} {o.sponsored && <span style={{ fontSize: 11, color: MPL.gold, fontWeight: 800 }}>· Destacado</span>}</div>
                        <div style={{ fontSize: 12.5, color: MPL.faint }}>{o.discount}{o.partner?.name ? ` · ${o.partner.name}` : ''}</div>
                      </div>
                      {o.exact && <span style={{ fontSize: 11, fontWeight: 800, color: MPL.tealDark, background: MPL.teal100, borderRadius: 999, padding: '3px 9px' }}>Para {p.code}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Línea de tiempo */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Heart size={18} color={MPL.teal} />
                <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, margin: 0 }}>Su historia</h2>
              </div>
              {p.timeline.length === 0 ? (
                <div style={{ color: MPL.faint, fontSize: 13.5 }}>Sin eventos registrados.</div>
              ) : (
                <div style={{ display: 'grid', gap: 0 }}>
                  {p.timeline.map((t, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: 14 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ width: 11, height: 11, borderRadius: 999, background: MPL.teal, flex: 'none', marginTop: 4 }} />
                        {i < p.timeline.length - 1 && <span style={{ width: 2, flex: 1, background: MPL.border, marginTop: 2 }} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{t.title}{t.detail ? <span style={{ color: MPL.muted, fontWeight: 600 }}> · {t.detail}</span> : null}</div>
                        <div style={{ fontSize: 12, color: MPL.faint }}>{t.at ? new Date(t.at).toLocaleDateString() : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <style>{`@media (max-width: 620px){ .passport-hero{grid-template-columns:1fr!important} }`}</style>
    </div>
  );
}
