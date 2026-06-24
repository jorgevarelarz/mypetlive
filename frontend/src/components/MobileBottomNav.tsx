import React from 'react';
import { NavLink } from 'react-router-dom';
import { Heart, Home, Search, Ticket, User } from 'lucide-react';
import { MPL, MPL_FONT_BODY } from '../styles/mypetlive';

const items = [
  { label: 'Inicio', to: '/', icon: Home },
  { label: 'Compañeros', to: '/animals', icon: Search },
  { label: 'Cupones', to: '/coupons', icon: Ticket },
  { label: 'Favoritos', to: '/me/favorites', icon: Heart },
  { label: 'Perfil', to: '/profile', icon: User },
];

export default function MobileBottomNav() {
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
        padding: '10px 18px calc(12px + env(safe-area-inset-bottom))',
        background: '#fff',
        borderTop: `1px solid ${MPL.border}`,
        boxShadow: '0 -12px 30px -24px rgba(31,55,40,.35)',
        fontFamily: MPL_FONT_BODY,
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
            style={({ isActive }) => ({
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color: isActive ? MPL.teal : MPL.faint,
              textDecoration: 'none',
              fontSize: 10,
              lineHeight: 1,
              fontWeight: isActive ? 800 : 700,
            })}
          >
            <Icon size={20} strokeWidth={2.2} />
            <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
