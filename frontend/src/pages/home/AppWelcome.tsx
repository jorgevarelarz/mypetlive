import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, HeartHandshake, PawPrint } from 'lucide-react';
import { searchAnimals } from '../../api/animals';
import { toAbsoluteUrl } from '../../utils/media';
import MobileBottomNav from '../../components/MobileBottomNav';
import PublicHeader from '../../components/PublicHeader';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, speciesLabel } from '../../styles/mypetlive';

// Inicio de la app (iOS/Android) para quien no tiene sesión. La portada web
// (Landing) es una página de marketing: cabecera con menú, alta de
// protectoras, pasos y pie legal, que dentro de la app sobran. Aquí solo hay
// dos caminos, y el primero es el que de verdad usa la gente: registrar a su
// propia mascota (pasaporte y cuidados), no adoptar.

const PATHS = [
  {
    key: 'mascota',
    to: '/register?redirect=/pet',
    icon: PawPrint,
    tint: MPL.teal100,
    color: MPL.teal,
    title: 'Ya tengo mascota',
    desc: 'Su ficha, vacunas, cuidados del día y modo perdido.',
  },
  {
    key: 'adoptar',
    to: '/animals',
    icon: HeartHandshake,
    tint: MPL.coral100,
    color: MPL.coral,
    title: 'Quiero adoptar',
    desc: 'Animales de protectoras verificadas, sin crear cuenta.',
  },
];

export default function AppWelcome() {
  const { data } = useQuery({
    queryKey: ['landing-featured'],
    queryFn: () => searchAnimals({ limit: 8, page: 1, sort: 'createdAt', dir: 'desc' }),
    staleTime: 60_000,
  });
  // Sin foto la tarjeta se queda en un hueco gris: mejor no enseñarla.
  const pets = (data?.items || []).filter((p: any) => Array.isArray(p.images) && p.images[0]).slice(0, 6);

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', paddingBottom: 90 }}>
      <PublicHeader />

      <section style={{ padding: '16px 20px 4px' }}>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 6px' }}>
          ¿Por dónde empezamos?
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.45, color: MPL.muted, margin: '0 0 16px' }}>
          Lleva al día los cuidados de tu mascota o encuentra a la que está por llegar.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          {PATHS.map(p => {
            const Icon = p.icon;
            return (
              <Link
                key={p.key}
                to={p.to}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                  background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18,
                  color: MPL.ink, textDecoration: 'none',
                  boxShadow: '0 1px 3px rgba(31,55,40,.05)',
                }}
              >
                <span style={{ width: 48, height: 48, borderRadius: 14, background: p.tint, color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon size={24} strokeWidth={2.2} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: MPL_FONT_DISPLAY, fontSize: 19, fontWeight: 800, marginBottom: 3 }}>{p.title}</span>
                  <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.45, color: MPL.muted }}>{p.desc}</span>
                </span>
                <ChevronRight size={20} color={MPL.faint} style={{ flex: 'none' }} />
              </Link>
            );
          })}
        </div>
      </section>

      {pets.length > 0 && (
        <section style={{ padding: '22px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 21, fontWeight: 800, margin: 0 }}>Buscan hogar</h2>
            <Link to="/animals" style={{ fontSize: 14, fontWeight: 700, color: MPL.teal, textDecoration: 'none' }}>Ver todos</Link>
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 20px 6px', scrollSnapType: 'x proximity', scrollPaddingLeft: 20 }}>
            {pets.map((p: any) => {
              const meta = [speciesLabel(p.species), p.city].filter(Boolean).join(' · ');
              return (
                <Link
                  key={p._id || p.id}
                  to={`/animals/${p._id || p.id}`}
                  style={{ width: 132, minWidth: 132, scrollSnapAlign: 'start', color: MPL.ink, textDecoration: 'none' }}
                >
                  <img
                    src={toAbsoluteUrl(p.images[0])}
                    alt={p.name}
                    loading="lazy"
                    style={{ display: 'block', width: 132, height: 132, objectFit: 'cover', borderRadius: 16, background: MPL.panel }}
                  />
                  <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 17, fontWeight: 800, margin: '8px 0 1px' }}>{p.name}</div>
                  <div style={{ fontSize: 12.5, color: MPL.muted }}>{meta}</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}


      <MobileBottomNav />
    </div>
  );
}
