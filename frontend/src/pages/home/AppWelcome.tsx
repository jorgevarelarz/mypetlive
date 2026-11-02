import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalcoBienvCorazonMano, CalcoBienvFlecha, CalcoBienvHuellas } from '../../components/icons/calcados';
import { M } from '../../components/pet/maqueta';
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
    icon: CalcoBienvHuellas,
    tint: '#DDEDEA',
    dibujo: '/ilustraciones/bienv-perro-gato.png',
    title: 'Ya tengo mascota',
    desc: 'Su ficha, vacunas, cuidados del día y modo perdido.',
  },
  {
    key: 'adoptar',
    to: '/animals',
    icon: CalcoBienvCorazonMano,
    tint: '#FDE5DD',
    dibujo: '/ilustraciones/bienv-cachorro.png',
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

      {/* Medidas de la maqueta «¿Por dónde empezamos?» (2 nov 2026), iPhone de 390. */}
      <section style={{ padding: '18px 12px 4px', fontFamily: M.letra, letterSpacing: 0 }}>
        <h1 style={{ fontFamily: M.titulos, fontSize: 28.5, lineHeight: '32px', fontWeight: 700, color: '#26302B', margin: '0 8px 7px' }}>
          ¿Por dónde empezamos?
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: '20px', color: '#5A5F5B', margin: '0 8px 30px' }}>
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
                  position: 'relative', display: 'grid', gridTemplateColumns: '51px minmax(0, 1fr)', alignItems: 'center', columnGap: 9,
                  minHeight: 119, padding: '0 124px 0 10px', overflow: 'hidden',
                  background: '#FFFFFF', border: '1px solid #EEE8DF', borderRadius: 18,
                  color: M.tinta, textDecoration: 'none', boxShadow: M.sombra,
                }}
              >
                <span style={{ width: 51, height: 51, borderRadius: 12, background: p.tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={27} />
                </span>
                <span style={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
                  <span style={{ display: 'block', fontFamily: M.titulos, fontSize: 16.5, lineHeight: '20px', fontWeight: 700, color: '#26302B', marginBottom: 6 }}>{p.title}</span>
                  <span style={{ display: 'block', fontSize: 11, lineHeight: '15px', color: '#4F5551' }}>{p.desc}</span>
                </span>
                <img src={p.dibujo} alt="" aria-hidden style={{ position: 'absolute', right: 20, bottom: 1, width: p.key === 'mascota' ? 104 : 111, height: 'auto', display: 'block' }} />
                <CalcoBienvFlecha size={12} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)' }} />
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
