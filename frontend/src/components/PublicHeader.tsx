import React from 'react';
import { Link } from 'react-router-dom';
import { LogOut, UserRound } from 'lucide-react';
import { useAuthModal } from '../context/AuthModalContext';
import { useAuth } from '../context/AuthContext';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark } from '../styles/mypetlive';

export default function PublicHeader() {
  const { openAuth } = useAuthModal();
  const { user, logout } = useAuth();
  const panelPath = user?.role === 'tenant'
    ? '/home'
    : user?.role === 'landlord'
      ? '/landlord'
      : user?.role === 'admin'
        ? '/admin'
        : user?.role === 'store' || user?.role === 'vet'
          ? '/partner'
          : '/profile';

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: 'rgba(246,243,236,.86)',
        backdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${MPL.border}`,
      }}
    >
      <style>{`
        .public-header a{color:inherit;text-decoration:none;}
        .public-header-link:hover{color:${MPL.teal}!important;}
        .public-header-cta:hover{filter:brightness(1.05);}
        @media (max-width: 900px){
          .public-header-nav{display:none!important;}
          .public-header-topbar{width:100vw!important;max-width:100vw!important;padding:14px 20px!important;overflow:hidden;}
        }
        @media (max-width: 520px){
          .public-header-login{display:none!important;}
          .public-header-topbar{position:relative;}
          .public-header-cta{position:absolute;right:20px;display:inline-flex!important;padding:10px 16px!important;}
        }
      `}</style>
      <div
        className="public-header public-header-topbar"
        style={{
          maxWidth: 1180,
          width: '100%',
          boxSizing: 'border-box',
          margin: '0 auto',
          padding: '15px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: MPL_FONT_BODY,
          color: MPL.ink,
        }}
      >
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 9 }} aria-label="MyPetLive inicio">
          <span style={{ color: MPL.teal, display: 'inline-flex' }}>
            <PawMark size={24} />
          </span>
          <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800 }}>
            MyPet<span style={{ color: MPL.coral }}>Live</span>
          </span>
        </Link>
        <div
          className="public-header-nav"
          style={{ display: 'flex', gap: 28, fontSize: 14.5, fontWeight: 600, color: MPL.muted, alignItems: 'center' }}
        >
          <Link className="public-header-link" to="/animals">Adoptar</Link>
          <Link className="public-header-link" to="/#como">Cómo funciona</Link>
          <Link className="public-header-link" to="/#impacto">Impacto</Link>
          <button
            className="public-header-link"
            onClick={() => openAuth({ mode: 'register', message: 'Crea tu cuenta de protectora.' })}
            style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', color: MPL.muted }}
          >
            Protectoras
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {user ? (
            <>
              <Link className="public-header-login" to={panelPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14.5, fontWeight: 700 }}>
                <span style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: MPL.teal100, color: MPL.teal }}>
                  <UserRound size={17} />
                </span>
                <span>{user.name || 'Mi panel'}</span>
              </Link>
              <button type="button" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 12, border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.muted, cursor: 'pointer' }}>
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <>
              <button
                className="public-header-link public-header-login"
                onClick={() => openAuth({ mode: 'login' })}
                style={{ background: 'none', border: 'none', font: 'inherit', cursor: 'pointer', fontSize: 14.5, fontWeight: 600, color: MPL.ink }}
              >
                Entrar
              </button>
              <Link
                className="public-header-cta"
                to="/animals"
                style={{
                  background: MPL.coral,
                  color: '#fff',
                  fontSize: 14.5,
                  fontWeight: 700,
                  padding: '11px 22px',
                  borderRadius: 14,
                  boxShadow: '0 6px 16px -8px rgba(232,101,74,.7)',
                }}
              >
                Adoptar
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
