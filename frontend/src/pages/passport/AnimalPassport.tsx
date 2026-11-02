import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { PawPrint, MapPin, Heart, Tag } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getAnimalPassport } from '../../api/animals';
import { offersForAnimal } from '../../api/offers';
import { usePageMeta } from '../../utils/usePageMeta';
import BackButton from '../../components/BackButton';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, speciesLabel, sizeLabel, sexLabel, moodLabel } from '../../styles/mypetlive';
import {
  CalcoLogoHuella, CalcoPanelUbicacion, CalcoPasBotiquin, CalcoPasChipCaracter, CalcoPasChipEdad, CalcoPasChipHuella, CalcoPasChipMacho,
  CalcoPasChipTamano, CalcoPasCompartir, CalcoPasCorazon, CalcoPasDesparasitacion, CalcoPasDestellos, CalcoPasEscudo, CalcoPasFamilia,
  CalcoPasHistoria, CalcoPasHuella, CalcoPasPerro, CalcoPasPulso, CalcoPasRegistro, CalcoPasSalud, CalcoPasVacuna,
} from '../../components/icons/calcados';
import { webUrl, shareLink } from '../../utils/native';
import MemorialMural from '../../components/memorial/MemorialMural';
import SightingForm from '../../components/passport/SightingForm';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };

// Maqueta del pasaporte (2 nov 2026): tarjetas crema con sombra suave, títulos con remate.
const PAS = {
  verde: '#0E5F5B',
  serif: "'Fraunces', Georgia, 'Times New Roman', serif",
  tarjeta: { background: '#FFFCF8', borderRadius: 24, boxShadow: '0 1px 2px rgba(60,45,30,.05), 0 8px 22px -14px rgba(60,45,30,.35)', border: '1px solid #F1EBE2' } as React.CSSProperties,
  titulo: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontFamily: "'Fraunces', Georgia, serif", fontSize: 19, fontWeight: 700, color: '#17352D' } as React.CSSProperties,
};

function Chip({ icono, naranja, children }: { icono: React.ReactNode; naranja?: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px 0 10px', borderRadius: 999, whiteSpace: 'nowrap',
      background: naranja ? '#FDE3C7' : '#DCEBE3', color: naranja ? '#7A3A12' : '#17352D', fontSize: 14, fontWeight: 700,
    }}>
      {icono}{children}
    </span>
  );
}

/** Icono de cada entrada de la historia, en su cuadrito naranja. */
function iconoHistoria(t: { type: string; kind?: string }) {
  if (t.kind === 'vaccine') return <CalcoPasVacuna size={27} />;
  if (t.kind === 'deworming') return <CalcoPasDesparasitacion size={26} />;
  if (t.type === 'vet' || t.type === 'health') return <CalcoPasSalud size={24} color="#C95F1E" />;
  if (t.type === 'lost' || t.type === 'sighting') return <MapPin size={21} color="#C95F1E" />;
  if (t.type === 'adopted') return <Heart size={21} color="#C95F1E" />;
  return <CalcoPasRegistro size={27} />;
}

export default function AnimalPassport() {
  const { code = '' } = useParams();
  const normalized = code.trim().toUpperCase();

  const passQ = useQuery({ queryKey: ['passport', normalized], queryFn: () => getAnimalPassport(normalized), enabled: !!normalized, retry: false });
  const p = passQ.data;
  const memorial = p?.memorial?.active ? p.memorial : null;
  // Nada de ofertas en el mural de una mascota que ha fallecido.
  const offersQ = useQuery({ queryKey: ['offers-animal', normalized], queryFn: () => offersForAnimal(normalized), enabled: !!normalized && !!p && !memorial, retry: false });

  usePageMeta({
    title: memorial && p ? `En memoria de ${p.name} · MyPetLive` : p ? `${p.name} · Pasaporte MyPetLive (${p.code})` : 'Pasaporte · MyPetLive',
    description: memorial && p ? (memorial.epitaph || `El mural de ${p.name}`) : p ? `${speciesLabel(p.species)} · ${p.age || ''} · pasaporte digital en MyPetLive` : 'Pasaporte digital de mascota',
    image: p?.images?.[0],
  });

  // Siempre la dirección pública: en la app window.location es capacitor://localhost
  // y un QR con eso no abre nada al escanearlo.
  const passportUrl = webUrl(`/p/${encodeURIComponent(normalized)}`);
  const offers = offersQ.data?.items || [];
  const compartir = async () => {
    if (!p) return;
    const ok = await shareLink({
      title: `Pasaporte de ${p.name}`,
      text: `El pasaporte de ${p.name} (${p.code}) en MyPetLive`,
      path: `/p/${encodeURIComponent(normalized)}`,
      onCopied: () => toast.success('Enlace del pasaporte copiado'),
    });
    if (!ok) toast.error('No se ha podido compartir');
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, background: '#F8F4EC', color: MPL.ink, minHeight: '100vh' }}>
      <header className="safe-top" style={{ background: '#F8F4EC' }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9 }}>
          <BackButton style={{ color: MPL.ink, marginLeft: -6 }} />
          <Link to="/" style={{ textDecoration: 'none', color: MPL.ink, display: 'flex', alignItems: 'center', gap: 9 }}>
            <CalcoLogoHuella size={24} />
            <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 21, fontWeight: 800, color: '#17352D' }}>MyPet<span style={{ color: '#D2552F' }}>Live</span></span>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '6px 14px 48px', display: 'grid', gap: 14 }}>
        {passQ.isLoading ? (
          <div style={{ color: MPL.faint }}>Cargando pasaporte…</div>
        ) : !p ? (
          <div style={card}>
            <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: 0 }}>Pasaporte no encontrado</h1>
            <p style={{ color: MPL.muted }}>No existe ningún animal con el código <strong>{normalized}</strong>.</p>
            <Link to="/animals" style={{ color: MPL.teal, fontWeight: 800 }}>Ver animales en adopción →</Link>
          </div>
        ) : memorial ? (
          <MemorialMural code={p.code} name={p.name} image={p.images?.[0]} memorial={memorial} />
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
                    Su familia no ha dejado un teléfono aquí. Avísala con el formulario de aquí abajo.
                  </div>
                )}
                {/* También con teléfono: la ubicación exacta le sirve más que una llamada. */}
                <SightingForm code={p.code} name={p.name} />
              </div>
            )}

            {/* Ficha calcada de la maqueta del pasaporte (2 nov 2026), a tamaño normal
                de iPhone (las medidas de la maqueta, tal cual, quedaban pequeñas). */}
            <div style={{ display: 'grid' }}>
              <div style={{ position: 'relative', aspectRatio: '855 / 430', borderRadius: 26, overflow: 'hidden', background: '#EFE8DC' }}>
                {p.images?.[0]
                  ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: PAS.verde }}><PawPrint size={64} /></div>}
              </div>
              {/* En la maqueta los chips van a la derecha del nombre; a tamaño normal no
                  caben y se apilaban uno por línea, así que van debajo, a todo el ancho. */}
              <div style={{ ...PAS.tarjeta, position: 'relative', margin: '-44px 8px 0', padding: '16px 16px 16px 18px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 1px auto', columnGap: 16, rowGap: 14, alignItems: 'center' }}>
                <div style={{ display: 'grid', justifyItems: 'start', gap: 8, minWidth: 0 }}>
                  <h1 style={{ margin: 0, fontFamily: PAS.serif, fontSize: 38, lineHeight: '42px', fontWeight: 700, color: '#17352D', wordBreak: 'break-word' }}>{p.name}</h1>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#17352D', color: '#FFFFFF', borderRadius: 999, padding: '6px 13px 6px 10px', fontFamily: MPL_FONT_BODY, fontSize: 14, fontWeight: 800, letterSpacing: 0.8, whiteSpace: 'nowrap' }}>
                    <CalcoPasEscudo size={17} color="#FFFFFF" /> {p.code}
                  </span>
                </div>
                <span aria-hidden style={{ alignSelf: 'stretch', background: '#E2DACD' }} />
                <CalcoPasPerro size={58} style={{ marginRight: 6 }} />
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {speciesLabel(p.species) && <Chip icono={<CalcoPasChipHuella size={17} />}>{speciesLabel(p.species)}</Chip>}
                  {p.sex && <Chip icono={p.sex === 'male' ? <CalcoPasChipMacho size={17} /> : <span style={{ fontSize: 15, lineHeight: '14px', fontWeight: 700 }}>♀</span>}>{sexLabel(p.sex)}</Chip>}
                  {p.size && <Chip icono={<CalcoPasChipTamano size={17} />}>{sizeLabel(p.size)}</Chip>}
                  {p.age && <Chip icono={<CalcoPasChipEdad size={17} />}>{p.age}</Chip>}
                  {p.mood && <Chip naranja icono={<CalcoPasChipCaracter size={17} />}>{moodLabel(p.mood)}</Chip>}
                  {(p.personality || []).map(t => <Chip key={t} naranja icono={<CalcoPasChipCaracter size={17} />}>{t}</Chip>)}
                </div>
              </div>
            </div>

            {/* Su familia (o procedencia) y salud */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              {/* Una protectora es una organización y su nombre y ciudad son
                  públicos; una familia no. De ahí que aquí solo salga el nombre
                  de pila, sin ciudad: lo justo para saber a quién se llama. */}
              <div style={{ ...PAS.tarjeta, position: 'relative', overflow: 'hidden', padding: '16px 16px 18px', minHeight: 116 }}>
                <span aria-hidden style={{ position: 'absolute', right: -26, bottom: -30, width: 120, height: 70, borderRadius: '60% 40% 0 0', background: '#DCE9E1', transform: 'rotate(-14deg)' }} />
                <h2 style={PAS.titulo}>{p.provenance ? <><CalcoPanelUbicacion size={20} color="#17352D" /> Procedencia</> : <><CalcoPasFamilia size={22} /> Su familia</>}</h2>
                <div style={{ position: 'relative', marginTop: 10, fontFamily: MPL_FONT_BODY, fontSize: 20, fontWeight: 800, color: '#1E2A27', wordBreak: 'break-word' }}>
                  {p.provenance?.shelterName || p.family?.name || 'Su familia'}
                </div>
                {p.provenance?.city && <div style={{ position: 'relative', color: '#4A524D', fontSize: 14 }}>{p.provenance.city}</div>}
                {!p.provenance && <CalcoPasCorazon size={36} style={{ position: 'absolute', right: 14, bottom: 12 }} />}
              </div>
              <div style={{ ...PAS.tarjeta, position: 'relative', overflow: 'hidden', padding: '16px 14px 18px' }}>
                <span aria-hidden style={{ position: 'absolute', right: -22, top: -26, width: 70, height: 60, borderRadius: '0 0 0 70%', background: '#DCE9E1' }} />
                <h2 style={PAS.titulo}><CalcoPasSalud size={22} /> Salud</h2>
                <div style={{ display: 'grid', gap: 7, marginTop: 10, fontSize: 14.5, color: '#2A322E' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalcoPasBotiquin size={19} /> {p.health.vetVisits} {p.health.vetVisits === 1 ? 'visita veterinaria' : 'visitas veterinarias'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalcoPasPulso size={19} /> {p.health.healthMilestones} {p.health.healthMilestones === 1 ? 'hito de salud' : 'hitos de salud'}</span>
                </div>
              </div>
            </div>

            {/* QR */}
            <div style={{ ...PAS.tarjeta, position: 'relative', overflow: 'hidden', padding: '16px 14px 16px 18px', display: 'grid', gridTemplateColumns: 'auto 1px minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
              <span aria-hidden style={{ position: 'absolute', right: -40, bottom: -46, width: 230, height: 92, borderRadius: '70% 30% 0 0', background: '#DCE9E1', transform: 'rotate(-10deg)' }} />
              <CalcoPasHuella size={22} color="#FFFFFF" style={{ position: 'absolute', right: 16, bottom: 10 }} />
              <span style={{ position: 'relative' }}>
                <CalcoPasDestellos size={16} style={{ position: 'absolute', left: -14, top: -12 }} />
                <span style={{ display: 'block', background: '#FFFFFF', border: '1.5px solid #D9E6E0', borderRadius: 12, padding: 7 }}>
                  <QRCodeSVG value={passportUrl} size={80} bgColor="#ffffff" fgColor="#17352D" />
                </span>
              </span>
              <span aria-hidden style={{ alignSelf: 'stretch', margin: '8px 0', background: '#E2DACD' }} />
              <span style={{ position: 'relative', fontFamily: MPL_FONT_BODY, fontSize: 15.5, lineHeight: '21px', fontWeight: 800, color: '#17352D' }}>Escanea o comparte este pasaporte</span>
              <button type="button" onClick={compartir} aria-label="Compartir el pasaporte"
                style={{ position: 'relative', width: 42, height: 42, borderRadius: 12, border: 0, background: '#DCE9E1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', alignSelf: 'start', marginTop: 4 }}>
                <CalcoPasCompartir size={21} />
              </button>
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

            {/* Su historia */}
            <div style={{ ...PAS.tarjeta, padding: '18px 16px 8px 18px' }}>
              <h2 style={{ ...PAS.titulo, fontSize: 23, gap: 10 }}><CalcoPasHistoria size={26} /> Su historia</h2>
              {p.timeline.length === 0 ? (
                <div style={{ color: '#5E6460', fontSize: 14, margin: '12px 0 10px' }}>Sin eventos registrados.</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
                  {p.timeline.map((t, i) => (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) 40px', columnGap: 12, paddingBottom: 14 }}>
                      <span aria-hidden style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 3, top: 5, width: 12, height: 12, borderRadius: 999, background: '#0E6E62' }} />
                        {i < p.timeline.length - 1 && <span style={{ position: 'absolute', left: 8, top: 19, bottom: -12, width: 2, background: '#CFE0D8' }} />}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 15, lineHeight: '21px', color: '#1E2A27' }}>
                          <strong style={{ fontWeight: 800 }}>{t.title}</strong>{t.detail ? <span style={{ color: '#3D4340' }}> · {t.detail}</span> : null}
                        </span>
                        <span style={{ display: 'block', fontSize: 13.5, color: '#6B716C', marginTop: 2 }}>{t.at ? new Date(t.at).toLocaleDateString('es-ES') : ''}</span>
                      </span>
                      <span aria-hidden style={{ width: 40, height: 40, borderRadius: 11, background: '#FCE7D6', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {iconoHistoria(t)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>

    </div>
  );
}
