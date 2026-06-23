import React, { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Brand from "../Brand";

type NavItemProps = {
  to: string;
  children: React.ReactNode;
};

function NavItem({ to, children }: NavItemProps) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link
      to={to}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        textDecoration: "none",
        display: 'block',
        fontWeight: active ? 700 : 500,
        background: active ? '#eef2ff' : 'transparent',
        color: active ? '#1e293b' : '#0f172a',
      }}
    >
      {children}
    </Link>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={{ display: 'grid', gridTemplateRows: '56px 1fr', minHeight: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid #eee' }}>
        <button
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen(v => !v)}
          style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '6px 10px' }}
        >
          ☰
        </button>
        <Link to="/" aria-label="MyPetLive — inicio"><Brand size={18} /></Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {!user && <NavItem to="/login">Entrar</NavItem>}
          {user && (
            <>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{user.email} · {user.role}</span>
              <button onClick={logout}>Salir</button>
            </>
          )}
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: sidebarOpen ? '240px 1fr' : '0 1fr', transition: 'grid-template-columns .2s ease' }}>
        <aside style={{
          borderRight: sidebarOpen ? '1px solid #eee' : 'none',
          overflow: 'hidden',
          padding: sidebarOpen ? 12 : 0,
        }}>
          {sidebarOpen && (
            <nav style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, opacity: .6, padding: '4px 8px' }}>Inicio</div>
              <NavItem to="/animals">Explorar animales</NavItem>
              <div style={{ fontSize: 12, opacity: .6, padding: '4px 8px' }}>General</div>
              <NavItem to="/animals">Animales</NavItem>
              <NavItem to="/coupons">Cupones</NavItem>
              {user?.role === 'tenant' && <NavItem to="/adoptions/mine">Mis adopciones</NavItem>}
              {user?.role === 'landlord' && (
                <>
                  <div style={{ fontSize: 12, opacity: .6, padding: '8px 8px 4px' }}>Protectora</div>
                  <NavItem to="/landlord">Panel</NavItem>
                  <NavItem to="/landlord/animals">Mis animales</NavItem>
                  <NavItem to="/landlord/adoptions">Solicitudes</NavItem>
                </>
              )}
              {user?.role === 'pro' && (
                <>
                  <div style={{ fontSize: 12, opacity: .6, padding: '8px 8px 4px' }}>Profesional</div>
                  <NavItem to="/partner">Panel partner</NavItem>
                  <NavItem to="/coupons">Cupones</NavItem>
                </>
              )}
              {user?.role === 'admin' && (
                <>
                  <div style={{ fontSize: 12, opacity: .6, padding: '8px 8px 4px' }}>Administración</div>
                  <NavItem to="/admin">Panel admin</NavItem>
                  <NavItem to="/admin/animals">Animales</NavItem>
                </>
              )}
            </nav>
          )}
        </aside>
        <main style={{ padding: 16 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
