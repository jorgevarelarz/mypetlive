import React from 'react';
import { Link } from 'react-router-dom';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, MPL_FONT_MONO, PawMark } from '../styles/mypetlive';

type Direction = {
  id: string;
  title: string;
  subtitle: string;
  bg: string;
  ink: string;
  primary: string;
  secondary: string;
  accent: string;
  radius: number;
  heading: string;
  body: string;
  typography: string;
  reason: string;
};

const directions: Direction[] = [
  {
    id: 'A',
    title: 'Refugio cálido',
    subtitle: 'Respeta la base actual',
    bg: '#F6F3EC',
    ink: '#3F4A3C',
    primary: '#1F6F6F',
    secondary: '#6A7B4F',
    accent: '#F2856D',
    radius: 16,
    heading: 'Encuentra a tu nuevo mejor amigo',
    body: 'Adopción responsable, simple y transparente.',
    typography: 'Hanken Grotesk',
    reason: 'La opción más continuista: cercana, cálida y profesional sin parecer infantil.',
  },
  {
    id: 'B',
    title: 'Confianza serena',
    subtitle: 'Evolución premium',
    bg: '#F4EFE7',
    ink: '#233028',
    primary: '#15534B',
    secondary: '#C9A24B',
    accent: '#E2784F',
    radius: 8,
    heading: 'Adoptar con cabeza y con corazón',
    body: 'Un proceso transparente, de principio a fin.',
    typography: 'Newsreader + Public Sans',
    reason: 'Más editorial y seria. Refuerza rigor, transparencia y confianza en procesos con datos.',
  },
  {
    id: 'C',
    title: 'Vivo y cercano',
    subtitle: 'Comunidad optimista',
    bg: '#FBF6EE',
    ink: '#2B3A33',
    primary: '#0E9C88',
    secondary: '#F3B44A',
    accent: '#FF7A59',
    radius: 22,
    heading: 'Tu nueva familia te está esperando',
    body: 'Adopta, cuida y suma impacto con cada paso.',
    typography: 'Bricolage Grotesque + Figtree',
    reason: 'Más joven y energética. Encaja con comunidad, gamificación y el sistema de Patitas.',
  },
];

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div>
      <div style={{ height: 46, borderRadius: 9, background: color, border: color === '#F6F3EC' || color === '#F4EFE7' || color === '#FBF6EE' ? '1px solid #e6e1d4' : 'none' }} />
      <div style={{ fontFamily: MPL_FONT_MONO, fontSize: 10, marginTop: 6, color: MPL.muted }}>{color}</div>
      <div style={{ fontSize: 10, color: MPL.faint }}>{label}</div>
    </div>
  );
}

function DirectionCard({ direction }: { direction: Direction }) {
  return (
    <article style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,55,40,.08),0 18px 36px -24px rgba(31,55,40,.28)' }}>
      <div style={{ background: direction.bg, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
          <span style={{ color: direction.primary, display: 'inline-flex' }}><PawMark size={26} /></span>
          <span style={{ fontFamily: direction.id === 'B' ? 'Newsreader, serif' : MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800, color: direction.ink }}>
            MyPet<span style={{ color: direction.accent }}>Live</span>
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 118px', gap: 18, alignItems: 'end' }}>
          <div>
            <h2 style={{ fontFamily: direction.id === 'B' ? 'Newsreader, serif' : MPL_FONT_DISPLAY, fontSize: 30, lineHeight: 1.04, fontWeight: 800, margin: '0 0 10px', color: direction.ink }}>
              {direction.heading}
            </h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.5, color: MPL.muted, margin: '0 0 16px' }}>{direction.body}</p>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ background: direction.accent, color: '#fff', fontSize: 13, fontWeight: 800, padding: '10px 18px', borderRadius: direction.radius }}>Adoptar</span>
              <span style={{ background: '#fff', color: direction.primary, border: `1.5px solid ${direction.primary}`, fontSize: 13, fontWeight: 800, padding: '9px 17px', borderRadius: direction.radius }}>Soy protectora</span>
            </div>
          </div>
          <div style={{ height: 128, borderRadius: direction.radius, background: '#e8e2d2', display: 'flex', alignItems: 'end', justifyContent: 'center', paddingBottom: 8, color: MPL.faint, fontFamily: MPL_FONT_MONO, fontSize: 9 }}>
            foto mascota
          </div>
        </div>
      </div>

      <div style={{ padding: 28 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800, marginBottom: 11 }}>Paleta</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 22 }}>
          <Swatch color={direction.primary} label="Principal" />
          <Swatch color={direction.secondary} label="Apoyo" />
          <Swatch color={direction.accent} label="Acción" />
          <Swatch color={direction.bg} label="Fondo" />
          <Swatch color={direction.ink} label="Tinta" />
        </div>

        <div style={{ fontSize: 11, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800, marginBottom: 11 }}>Tipografía</div>
        <div style={{ border: `1px solid ${MPL.border}`, borderRadius: direction.radius, padding: '16px 18px', marginBottom: 22 }}>
          <div style={{ fontFamily: direction.id === 'B' ? 'Newsreader, serif' : MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: direction.ink, lineHeight: 1.08 }}>
            {direction.typography}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: MPL.muted, marginTop: 7 }}>
            Titulares con personalidad y texto UI claro para formularios, estados y procesos.
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ background: '#fff', border: `1px solid ${MPL.border}`, color: direction.ink, fontSize: 11.5, fontWeight: 700, padding: '6px 12px', borderRadius: 999 }}>Perro · Pequeño</span>
          <span style={{ background: '#E2EEEC', color: MPL.tealDark, fontSize: 11.5, fontWeight: 800, padding: '6px 12px', borderRadius: 8 }}>Publicado</span>
          <span style={{ background: '#FBEFD4', color: MPL.goldDark, fontSize: 11.5, fontWeight: 800, padding: '6px 12px', borderRadius: 8 }}>En revisión</span>
          <span style={{ background: '#ECEFE2', color: MPL.oliveDark, fontSize: 11.5, fontWeight: 800, padding: '6px 12px', borderRadius: 8 }}>Aprobada</span>
        </div>

        <p style={{ fontSize: 13, lineHeight: 1.55, color: MPL.muted, margin: '22px 0 0', borderTop: `1px solid ${MPL.border}`, paddingTop: 16 }}>
          <strong style={{ color: direction.ink }}>Por qué.</strong> {direction.reason}
        </p>
      </div>
    </article>
  );
}

export default function MoodDirections() {
  return (
    <div style={{ fontFamily: MPL_FONT_BODY, background: '#e7e3da', color: MPL.ink, minHeight: '100vh' }}>
      <style>{`
        .mood-wrap{max-width:1180px;margin:0 auto;padding:56px 32px 80px;}
        .mood-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px;align-items:start;}
        @media (max-width: 980px){.mood-grid{grid-template-columns:1fr}.mood-wrap{padding:34px 18px 56px}}
        @media (max-width: 560px){.mood-grid article div[style*="grid-template-columns: 1fr 118px"]{grid-template-columns:1fr!important}}
      `}</style>
      <main className="mood-wrap">
        <Link to="/sistema" style={{ color: MPL.teal, fontWeight: 800, textDecoration: 'none' }}>Volver al sistema</Link>
        <header style={{ maxWidth: 760, marginTop: 26, marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, textTransform: 'uppercase', color: '#8a8472', fontWeight: 800, marginBottom: 16 }}>
            <span style={{ width: 26, height: 1, background: '#b7b1a0', display: 'inline-block' }} />
            MyPetLive · Dirección de marca
          </div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 46, lineHeight: 1.04, fontWeight: 800, margin: '0 0 16px' }}>
            Tres direcciones de mood y estilo
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: '#555b4c', margin: '0 0 22px' }}>
            Cada dirección parte de la misma personalidad: cálida, de confianza y profesional. La dirección elegida para la app actual es la A, evolucionada con la paleta oficial.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['Simple', 'Segura', 'Sostenible'].map(label => (
              <span key={label} style={{ fontSize: 13, fontWeight: 800, background: '#fff', border: '1px solid #d8d3c6', borderRadius: 999, padding: '7px 15px' }}>{label}</span>
            ))}
          </div>
        </header>
        <section className="mood-grid">
          {directions.map(direction => <DirectionCard key={direction.id} direction={direction} />)}
        </section>
      </main>
    </div>
  );
}
