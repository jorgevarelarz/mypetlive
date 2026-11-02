import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { IconoInicio } from './icons/mplIcons';
import { CalcoNavBuscar, CalcoNavCupones, CalcoNavInicio, CalcoNavMensajes, CalcoNavPerfil } from './icons/calcados';
import { M } from './pet/maqueta';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import { MPL, MPL_FONT_BODY } from '../styles/mypetlive';

const items = [
  { label: 'Inicio', to: '/', icon: CalcoNavInicio },
  { label: 'Compañeros', to: '/animals', icon: CalcoNavBuscar },
  // Ocupa el sitio de Favoritos, que sigue en Compañeros (botón «Favoritos»).
  { label: 'Mensajes', to: '/mensajes', icon: CalcoNavMensajes },
  { label: 'Cupones', to: '/coupons', icon: CalcoNavCupones },
  { label: 'Perfil', to: '/profile', icon: CalcoNavPerfil },
];

export default function MobileBottomNav() {
  const unread = useUnreadMessages();
  // El inicio con sesión vive en /home y «Mi mascota» cuelga de él: «Inicio» se marca en los dos.
  const { pathname } = useLocation();
  const inicio = pathname === '/' || pathname.startsWith('/home') || pathname.startsWith('/pet');
  return (
    <nav
      aria-label="Navegación móvil"
      className="mpl-mobile-bottom"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 35,
        display: 'none',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 2,
        // Maqueta: barra de 55 con esquinas de 22; la pestaña activa en una píldora de 54 × 38.
        padding: '4px 10px calc(8px + env(safe-area-inset-bottom))',
        background: '#fff',
        borderTop: `1px solid ${MPL.border}`,
        borderRadius: '22px 22px 0 0',
        boxShadow: '0 -10px 30px -18px rgba(31,55,40,.30)',
        fontFamily: M.letra,
        letterSpacing: 0,
      }}
    >
      <style>{`
        @media (max-width: 720px){.mpl-mobile-bottom{display:flex!important}}
      `}</style>
      {items.map(item => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive: activa }) => {
              const isActive = item.to === '/' ? inicio : activa;
              return ({
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              // Pestaña activa en una píldora (propuesta del 2 nov 2026).
              flex: '0 0 auto',
              width: 64,
              height: 38,
              margin: '0 auto',
              padding: 0,
              borderRadius: 14,
              background: isActive ? '#DCEBE6' : 'transparent',
              transition: 'background-color .3s ease, color .3s ease',
              color: isActive ? M.verdeBoton : '#4E4C49',
              textDecoration: 'none',
              fontSize: 9.5,
              lineHeight: 1,
              gap: 3,
              fontWeight: isActive ? 700 : 500,
            });
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              {item.to === '/' && !inicio ? <IconoInicio size={19} strokeWidth={1.7} color="#6E6C69" /> : <Icon size={17} color={(item.to === '/' ? inicio : pathname.startsWith(item.to)) ? M.verdeBoton : '#6E6C69'} />}
              {item.to === '/mensajes' && unread > 0 && (
                <span aria-label={`${unread} sin leer`} style={{ position: 'absolute', top: -6, left: 15, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: MPL.coral, color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid #fff', lineHeight: 1 }}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
