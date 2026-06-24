import React, { useEffect, useState } from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import navConfig from '../config/nav.config.json';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import Brand from '../components/Brand';
import MobileBottomNav from '../components/MobileBottomNav';
import { listConversations } from '../api/chat';

type NavItem = { label: string; path?: string; to?: string };

const getGeneralItems = (role?: string): NavItem[] => {
  const config: any = navConfig;
  if (role === 'tenant' && Array.isArray(config.tenantGeneral)) return config.tenantGeneral as NavItem[];
  return (config.general || []) as NavItem[];
};

const resolvePath = (item: NavItem) => item.path || item.to || '#';

const labelFor: Record<string, string> = {
  tenant: 'Adoptante',
  landlord: 'Protectora',
  pro: 'Profesional',
  admin: 'Administración',
  store: 'Tienda',
  vet: 'Veterinario',
};

function Header() {
  const { user, logout } = useAuth();
  const { openAuth } = useAuthModal();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const role = user?.role as 'tenant' | 'landlord' | 'pro' | 'admin' | 'store' | 'vet' | undefined;
  const generalItems = getGeneralItems(role);
  const showInbox = generalItems.some(item => item.path === '/inbox');
  useEffect(() => {
    let timer: any;
    const load = async () => {
      try {
        if (!user?._id || !showInbox) { setUnread(0); return; }
        const list = await listConversations({ page: 1, limit: 50 });
        const total = list.reduce((acc: number, c: any) => acc + (c?.unread?.[user._id] || 0), 0);
        setUnread(total);
      } catch {}
    };
    load();
    if (showInbox) {
      timer = setInterval(load, 30_000);
      return () => clearInterval(timer);
    }
    return () => {};
  }, [user?._id, showInbox]);
  const roleHome = user?.role === 'tenant' ? '/home'
    : user?.role === 'landlord' ? '/landlord'
    : user?.role === 'pro' ? '/pro'
    : user?.role === 'admin' ? '/admin'
    : user?.role === 'store' || user?.role === 'vet' ? '/partner'
    : '/';
  return (
    <header
      className="sticky top-0 z-20 backdrop-blur"
      style={{ background: 'rgba(246, 243, 236, 0.95)', borderBottom: '1px solid #E7E1D5' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3"
        style={{ color: '#3F4A3C' }}
      >
        <Link to={roleHome} aria-label="MyPetLive — inicio"><Brand size={19} /></Link>

        {/* Menú compacto en móviles */}
        <button
          className="md:hidden text-sm"
          style={{ padding: '8px 14px' }}
          onClick={() => setMenuOpen(v => !v)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          Menú
        </button>

        <nav className="hidden md:flex items-center gap-2 text-sm">
          {generalItems.map((item: NavItem) => {
            const target = resolvePath(item);
            return (
              <NavLink
                key={target}
                to={target}
                className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'bg-[#F4EFE7]' : ''}`}
              >
                {item.label}
                {target === '/inbox' && unread > 0 && (
                  <span
                    className="ml-1 inline-flex items-center justify-center rounded-full text-[10px] px-2 py-0.5"
                    style={{ background: '#E5DACC', color: '#3F4A3C' }}
                  >
                    {unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {!user ? (
            <>
              <button onClick={() => openAuth({ mode: 'login' })} className="px-3 py-1.5 rounded">Entrar</button>
              <button
                onClick={() => openAuth({ mode: 'register' })}
                className="px-3 py-1.5 rounded font-medium"
                style={{ background: '#6A7B4F', color: '#fff' }}
              >
                Crear cuenta
              </button>
            </>
          ) : (
            <>
              <span className="hidden sm:inline" style={{ color: '#7A8273' }}>{user.email} · {labelFor[user.role] || user.role}</span>
              <button onClick={logout} className="px-3 py-1.5 rounded">Salir</button>
            </>
          )}
        </div>
      </div>

      {/* Panel de menú móvil */}
      {menuOpen && (
        <div
          id="mobile-menu"
          className="md:hidden z-30 border-t"
          style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: '#7A8273' }}>General</div>
            <div className="flex flex-wrap gap-2">
              {generalItems.map((item: NavItem) => {
                const target = resolvePath(item);
                return (
                  <NavLink
                    key={target}
                    to={target}
                    className={({isActive})=>
                      `px-3 py-1.5 rounded border ${isActive ? 'border-[#BEB6A6] bg-[#F4EFE7]' : 'border-transparent'}`
                    }
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                    {target === '/inbox' && user && unread > 0 && (
                      <span
                        className="ml-2 inline-flex items-center justify-center rounded-full text-[10px] px-2 py-0.5"
                        style={{ background: '#E5DACC', color: '#3F4A3C' }}
                      >
                        {unread}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>

            {role && (navConfig as any)[role] && (
              <>
                <div className="text-xs uppercase tracking-wide mt-4 mb-2" style={{ color: '#7A8273' }}>{labelFor[role]}</div>
                <div className="flex flex-wrap gap-2">
                  {((navConfig as any)[role] as any[]).map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({isActive})=>
                        `px-3 py-1.5 rounded border ${isActive ? 'border-[#BEB6A6] bg-[#F4EFE7]' : 'border-transparent'}`
                      }
                      onClick={() => setMenuOpen(false)}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function SideNav() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const role = user?.role as 'tenant' | 'landlord' | 'pro' | 'admin' | 'store' | 'vet' | undefined;
  const generalItems = getGeneralItems(role);
  const showInbox = generalItems.some(item => item.path === '/inbox');
  useEffect(() => {
    let timer: any;
    const load = async () => {
      try {
        if (!user?._id || !showInbox) { setUnread(0); return; }
        const list = await listConversations({ page: 1, limit: 50 });
        const total = list.reduce((acc: number, c: any) => acc + (c?.unread?.[user._id] || 0), 0);
        setUnread(total);
      } catch {}
    };
    load();
    if (showInbox) {
      timer = setInterval(load, 30_000);
      return () => clearInterval(timer);
    }
    return () => {};
  }, [user?._id, showInbox]);
  return (
    <aside className="hidden lg:block w-60 shrink-0">
      <div
        className="sticky top-16 p-3 border rounded"
        style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}
      >
        <div className="text-xs uppercase tracking-wide px-2 mb-2" style={{ color: '#7A8273' }}>General</div>
        <div className="grid gap-1">
          {generalItems.map((item: NavItem) => {
            const target = resolvePath(item);
            return (
              <NavLink
                key={target}
                className={({isActive})=>
                  `px-2 py-1.5 rounded ${isActive ? 'bg-[#F4EFE7]' : ''}`
                }
                to={target}
              >
                {item.label}
                {target === '/inbox' && unread > 0 && (
                  <span
                    className="ml-2 inline-flex items-center justify-center rounded-full text-[10px] px-2 py-0.5"
                    style={{ background: '#E5DACC', color: '#3F4A3C' }}
                  >
                    {unread}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
        {role && (navConfig as any)[role] && (
          <>
            <div className="text-xs uppercase tracking-wide px-2 mt-4 mb-2" style={{ color: '#7A8273' }}>{labelFor[role]}</div>
            <div className="grid gap-1">
              {((navConfig as any)[role] as any[]).map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({isActive})=>`px-2 py-1.5 rounded ${isActive ? 'bg-[#F4EFE7]' : ''}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isPublicCatalog = pathname === '/animals';
  const hasAnimalDetailCta = /^\/animals\/[^/]+$/.test(pathname);
  const isFavoritesPage = pathname === '/me/favorites' || pathname === '/me/alerts';
  const isPublicAnimalPage = isPublicCatalog || hasAnimalDetailCta || isFavoritesPage;
  const showMobileBottomNav = user?.role === 'tenant' && !isPublicAnimalPage;

  return (
    <div className="min-h-screen" style={{ background: '#F6F3EC', color: '#3F4A3C' }}>
      {!isPublicAnimalPage && <Header />}
      {isPublicAnimalPage ? (
        <Outlet />
      ) : (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex gap-6 h-[calc(100vh-56px)] overflow-hidden">
          <SideNav />
          <main className="flex-1 min-w-0 h-full overflow-y-auto pr-2 pb-24 md:pb-0">
            <Breadcrumbs />
            <Outlet />
          </main>
        </div>
      )}
      {showMobileBottomNav && <MobileBottomNav />}
    </div>
  );
}
