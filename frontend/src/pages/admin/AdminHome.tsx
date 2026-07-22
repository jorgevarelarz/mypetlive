import React from 'react';
import { Link } from 'react-router-dom';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark } from '../../styles/mypetlive';

const LINKS: Array<{ to: string; label: string; desc: string; accent: string }> = [
  { to: '/admin/users', label: 'Usuarios', desc: 'Adoptantes, protectoras y partners', accent: MPL.teal },
  { to: '/admin/animals', label: 'Animales', desc: 'Fichas publicadas en la plataforma', accent: MPL.coral },
  { to: '/admin/adoptions', label: 'Adopciones', desc: 'Solicitudes y su estado', accent: MPL.olive },
  { to: '/admin/coupons', label: 'Cupones', desc: 'Crea y gestiona cupones de partners', accent: MPL.gold },
  { to: '/admin/settlements', label: 'Liquidaciones', desc: 'Comisiones de partners mes a mes', accent: MPL.olive },
  { to: '/admin/reports', label: 'Reportes', desc: 'Métricas del ecosistema', accent: MPL.teal },
];

export default function AdminHome() {
  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 22 }}>
        <header style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: MPL.teal }}>
            <PawMark size={24} />
            <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: MPL.ink, margin: 0 }}>Panel de administración</h1>
          </div>
          <p style={{ color: MPL.muted, margin: 0, fontSize: 14 }}>Modera la plataforma y revisa el ecosistema MyPetLive.</p>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              style={{ display: 'block', textDecoration: 'none', background: MPL.card, border: `1px solid ${MPL.border}`, borderLeft: `4px solid ${l.accent}`, borderRadius: 16, padding: 18, color: MPL.ink }}
            >
              <div style={{ fontFamily: MPL_FONT_DISPLAY, fontWeight: 800, fontSize: 17 }}>{l.label}</div>
              <div style={{ fontSize: 13, color: MPL.muted, marginTop: 4 }}>{l.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
