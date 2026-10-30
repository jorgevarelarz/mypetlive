import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, MessageCircle, Search, Ticket, User } from 'lucide-react';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import { MPL, MPL_FONT_BODY } from '../styles/mypetlive';

const items = [
  { label: 'Inicio', to: '/', icon: Home },
  { label: 'Compañeros', to: '/animals', icon: Search },
  // Ocupa el sitio de Favoritos, que sigue en Compañeros (botón «Favoritos»).
  { label: 'Mensajes', to: '/mensajes', icon: MessageCircle },
  { label: 'Cupones', to: '/coupons', icon: Ticket },
  { label: 'Perfil', to: '/profile', icon: User },
];

export default function MobileBottomNav() {
  const unread = useUnreadMessages();
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
        padding: '12px 12px calc(14px + env(safe-area-inset-bottom))',
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
              gap: 5,
              color: isActive ? MPL.teal : MPL.faint,
              textDecoration: 'none',
              fontSize: 11.5,
              lineHeight: 1,
              fontWeight: isActive ? 800 : 700,
            })}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon size={25} strokeWidth={2.1} />
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
