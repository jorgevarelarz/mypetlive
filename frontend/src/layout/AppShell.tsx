import React, { useEffect, useState } from 'react';
import { Outlet, Link, NavLink, useLocation } from 'react-router-dom';
import {
  Home, PawPrint, Heart, Ticket, Gift, User, Users, FileText,
  Settings, ClipboardList, Circle, Menu, X, QrCode, RefreshCw, LogOut, MessageCircle, CalendarDays, HouseHeart,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { useAuthModal } from '../context/AuthModalContext';
import { navItemsForRole, generalItemsForRole, resolvePath, withRehomeItem, type NavItem } from './navItems';
import { getRehomeStatus } from '../api/rehome';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import Brand from '../components/Brand';
import MobileBottomNav from '../components/MobileBottomNav';
import { useUnreadMessages } from '../hooks/useUnreadMessages';
import { getMyCode, getMyPatitas } from '../api/patitas';
import { useQuery } from '@tanstack/react-query';
import { BrandWordmark, MPL, PawMark } from '../styles/mypetlive';
import { isNativeApp } from '../utils/native';

type IconType = React.ComponentType<{ size?: number; strokeWidth?: number }>;
const iconFor: Record<string, IconType> = {
  '/home': Home, '/landlord': Home, '/admin': Home, '/partner': Home, '/pro': Home,
  '/animals': PawPrint, '/landlord/animals': PawPrint, '/admin/animals': PawPrint, '/pet': PawPrint,
  '/adoptions/mine': Heart, '/landlord/adoptions': Heart, '/admin/adoptions': Heart,
  '/coupons': Ticket, '/admin/coupons': Ticket,
  '/donate': Gift,
  '/profile': User, '/admin/users': Users,
  '/admin/reports': FileText, '/admin/settings': Settings, '/ajustes': Settings,
  '/landlord/questionnaire': ClipboardList,
  '/mensajes': MessageCircle,
  '/citas': CalendarDays,
  '/buscar-casa': HouseHeart,
};

/**
 * Menú lateral (escritorio y drawer móvil) con «Buscar casa» si el admin ha
 * activado al adoptante. Comparte la queryKey de RehomeEntry: una sola petición.
 */
function useSideItems(role?: string): NavItem[] {
  const q = useQuery({ queryKey: ['rehome-status'], queryFn: getRehomeStatus, enabled: role === 'tenant', staleTime: 5 * 60_000 });
  return withRehomeItem(navItemsForRole(role), role === 'tenant' && q.data === true);
}

// Rutas "home" de cada rol: solo se marcan activas en coincidencia exacta (no en sus hijas)
const INDEX_PATHS = new Set(['/home', '/landlord', '/admin', '/partner', '/pro']);

function NavRow({ to, label, badge }: { to: string; label: string; badge?: React.ReactNode }) {
  const Icon = iconFor[to] || Circle;
  return (
    <NavLink
      to={to}
      end={INDEX_PATHS.has(to)}
      className="flex items-center gap-3 transition-colors"
      style={({ isActive }) => ({
        padding: '11px 12px',
        borderRadius: 12,
        fontSize: 14.5,
        fontWeight: 800,
        textDecoration: 'none',
        background: isActive ? MPL.teal100 : 'transparent',
        color: isActive ? MPL.tealDark : MPL.muted,
      })}
    >
      <Icon size={18} strokeWidth={2} />
      <span className="flex-1">{label}</span>
      {badge}
    </NavLink>
  );
}


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
  const unread = useUnreadMessages();
  const [menuOpen, setMenuOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [myCode, setMyCode] = useState<{ token: string; code: string } | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const role = user?.role as 'tenant' | 'landlord' | 'pro' | 'admin' | 'store' | 'vet' | undefined;
  const generalItems = generalItemsForRole(role);
  // El drawer móvil replica el menú lateral de la web: misma regla, misma función.
  const drawerItems = useSideItems(role);
  // En la cabecera solo lo que NO está ya en el menú lateral: al adoptante
  // le repetía las nueve entradas; a protectoras y partners les deja los
  // enlaces públicos (Compañeros, Tienda…) que su menú no tiene.
  const sideTargets = new Set(drawerItems.map(resolvePath));
  const headerItems = generalItems.filter(item => !sideTargets.has(resolvePath(item)));

  const loadCode = async () => {
    setLoadingCode(true);
    try { setMyCode(await getMyCode()); } catch {} finally { setLoadingCode(false); }
  };
  const openQr = () => { setQrOpen(true); loadCode(); };

  // Con un overlay abierto: bloquea el scroll del fondo y cierra con Escape.
  useEffect(() => {
    const anyOverlay = menuOpen || qrOpen;
    document.body.style.overflow = anyOverlay ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); setQrOpen(false); } };
    if (anyOverlay) window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [menuOpen, qrOpen]);
  const { data: patitasData } = useQuery({
    queryKey: ['patitas-me'],
    queryFn: getMyPatitas,
    enabled: user?.role === 'tenant',
    staleTime: 60_000,
  });
  const patitas = patitasData?.available;
  const roleHome = user?.role === 'tenant' ? '/home'
    : user?.role === 'landlord' ? '/landlord'
    : user?.role === 'pro' ? '/pro'
    : user?.role === 'admin' ? '/admin'
    : user?.role === 'store' || user?.role === 'vet' ? '/partner'
    : '/';
  return (
    <>
    <header
      className="sticky top-0 z-20 backdrop-blur safe-top"
      style={{ background: 'rgba(246, 243, 236, 0.95)', borderBottom: '1px solid #E7E1D5' }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3"
        style={{ color: '#3F4A3C' }}
      >
        {/* Misma marca y disposición que PublicHeader: al pasar de la
            portada o el catálogo a cupones/perfil la cabecera no cambia. */}
        <Link to={roleHome} aria-label="MyPetLive — inicio" style={{ textDecoration: 'none' }}><BrandWordmark /></Link>

        <nav className="hidden lg:flex items-center gap-2 text-sm">
          {headerItems.map((item: NavItem) => {
            const target = resolvePath(item);
            return (
              <NavLink
                key={target}
                to={target}
                className={({ isActive }) => `px-2 py-1 rounded ${isActive ? 'bg-[#F4EFE7]' : ''}`}
              >
                {item.label}
                {target === '/mensajes' && unread > 0 && (
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
          {/* Saldo de Patitas a la vista; el detalle está en el perfil. */}
          {user?.role === 'tenant' && (
            <Link
              to="/patitas"
              aria-label={`${patitas ?? 0} Patitas disponibles`}
              title="Tus Patitas"
              style={{ height: 40, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 12, border: `1px solid ${MPL.border}`, background: MPL.gold100, color: MPL.goldDark, fontWeight: 800, fontSize: 15, textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}
            >
              <PawMark size={18} color={MPL.gold} />
              {patitas === undefined ? '…' : patitas.toLocaleString('es-ES')}
            </Link>
          )}
          {user && (
            <button
              className="md:hidden inline-flex items-center justify-center"
              style={{ padding: 8, borderRadius: 10 }}
              onClick={openQr}
              aria-label="Mostrar mi código QR"
            >
              <QrCode size={21} strokeWidth={2.2} />
            </button>
          )}
          {!user ? (
            <>
              <button onClick={() => openAuth({ mode: 'login' })} style={{ background: 'none', border: 'none', padding: '8px 4px', font: 'inherit', fontSize: 14.5, fontWeight: 600, color: MPL.ink, cursor: 'pointer' }}>Entrar</button>
              <button
                onClick={() => openAuth({ mode: 'register' })}
                className="hidden md:inline-flex px-3 py-1.5 rounded font-medium"
                style={{ background: '#6A7B4F', color: '#fff' }}
              >
                Crear cuenta
              </button>
            </>
          ) : (
            // Quién eres ya lo dice la tarjeta del menú lateral; aquí solo salir.
            <button
              type="button"
              onClick={logout}
              className="hidden lg:grid"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              style={{ padding: 0, width: 40, height: 40, placeItems: 'center', borderRadius: 12, border: `1px solid ${MPL.border}`, background: '#fff', color: MPL.muted, cursor: 'pointer' }}
            >
              <LogOut size={17} />
            </button>
          )}
          {/* Menú en cajón hasta que cabe el menú lateral (lg), a la derecha como
              en PublicHeader. En la app y sin sesión sobra: la barra inferior
              ya lleva a todo. */}
          {(user || !isNativeApp()) && <button
            className="lg:hidden inline-flex items-center justify-center"
            style={{ width: 40, height: 40, padding: 0, flexShrink: 0, border: `1px solid ${MPL.border}`, borderRadius: 12, background: '#fff', color: MPL.ink }}
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label="Abrir menú"
          >
            <Menu size={22} strokeWidth={2.2} />
          </button>}
        </div>
      </div>

    </header>

    {/* Overlays fuera del <header>: su backdrop-blur crearía un containing block
        para position:fixed y los dejaría atrapados en sus 56px de alto. */}
      {/* Fondo del drawer móvil */}
      <div
        className="lg:hidden fixed inset-0 z-40 transition-opacity duration-200"
        style={{ background: 'rgba(63,74,60,0.4)', opacity: menuOpen ? 1 : 0, pointerEvents: menuOpen ? 'auto' : 'none' }}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer lateral móvil: mismos iconos y filas que el menú de la web (NavRow) */}
      <aside
        id="mobile-menu"
        // En la app el cajón empieza bajo la barra de estado (ver .safe-top en index.css).
        className="lg:hidden fixed top-0 bottom-0 left-0 z-50 flex flex-col transition-transform duration-200"
        style={{
          width: 280,
          maxWidth: '84vw',
          background: '#FFFFFF',
          borderRight: `1px solid ${MPL.border}`,
          transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)',
          boxShadow: menuOpen ? '0 10px 40px rgba(0,0,0,0.18)' : 'none',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
      >
        <div className="flex items-center justify-between" style={{ padding: '12px 14px', borderBottom: `1px solid ${MPL.border}` }}>
          <Link to={roleHome} aria-label="MyPetLive — inicio" onClick={() => setMenuOpen(false)}><Brand size={18} /></Link>
          <button
            className="inline-flex items-center justify-center"
            style={{ padding: 8, borderRadius: 10 }}
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>
        {role && <div className="text-xs uppercase tracking-wide" style={{ color: MPL.faint, padding: '12px 16px 0' }}>{labelFor[role] || role}</div>}
        <nav className="grid gap-1.5 p-3 overflow-y-auto" onClick={() => setMenuOpen(false)}>
          {drawerItems.map((item: NavItem) => {
            const target = resolvePath(item);
            const badge =
              target === '/mensajes' && unread > 0 ? (
                <span
                  className="inline-flex items-center justify-center rounded-full text-[10px] px-2 py-0.5"
                  style={{ background: MPL.teal, color: '#fff' }}
                >
                  {unread}
                </span>
              ) : undefined;
            return <NavRow key={target} to={target} label={item.label} badge={badge} />;
          })}
        </nav>
        {user && role && (
          <div className="mt-auto p-3">
            <div style={{ background: MPL.bg, borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: MPL.teal, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <PawMark size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: MPL.ink }}>
                  {user.name || labelFor[role] || 'Cuenta'}
                </div>
                <div style={{ fontSize: 11.5, color: MPL.faint }}>{labelFor[role] || role}</div>
              </div>
            </div>
            {/* En móvil era el único sitio sin forma de cerrar sesión. */}
            <button
              type="button"
              onClick={() => { setMenuOpen(false); logout(); }}
              className="flex items-center gap-3 w-full"
              style={{ marginTop: 8, padding: '11px 12px', borderRadius: 12, border: 0, background: 'transparent', font: 'inherit', fontSize: 14.5, fontWeight: 800, color: MPL.muted, cursor: 'pointer' }}
            >
              <LogOut size={18} strokeWidth={2} />
              Cerrar sesión
            </button>
          </div>
        )}
      </aside>

      {/* Modal del QR de identificación (código Patitas del usuario) */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(63,74,60,0.45)' }}
          onClick={() => setQrOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Mi código QR"
        >
          <div
            style={{ background: '#fff', borderRadius: 20, padding: 20, width: '100%', maxWidth: 340, textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: MPL.ink }}>Mi código</div>
              <button
                className="inline-flex items-center justify-center"
                style={{ padding: 6, borderRadius: 10 }}
                onClick={() => setQrOpen(false)}
                aria-label="Cerrar"
              >
                <X size={19} strokeWidth={2.2} />
              </button>
            </div>
            {loadingCode ? (
              <div style={{ padding: '48px 0', color: MPL.muted, fontSize: 14 }}>Generando…</div>
            ) : myCode ? (
              <>
                <div style={{ display: 'inline-block', background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 14 }}>
                  <QRCodeSVG value={myCode.token} size={180} bgColor="#ffffff" fgColor={MPL.ink} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: MPL.faint, fontWeight: 800 }}>Código manual</div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 2, color: MPL.ink }}>{myCode.code}</div>
                </div>
                <p style={{ color: MPL.muted, fontSize: 12.5, margin: '10px 0 12px' }}>
                  Enséñalo en una tienda o veterinario asociado para identificarte. Caduca a los 10 minutos.
                </p>
                <button
                  type="button"
                  onClick={loadCode}
                  className="inline-flex items-center justify-center gap-2"
                  style={{ background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '9px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: MPL.ink }}
                >
                  <RefreshCw size={15} /> Regenerar
                </button>
              </>
            ) : (
              <div style={{ padding: '38px 0', color: MPL.muted, fontSize: 14 }}>
                No se pudo generar el código.{' '}
                <button type="button" onClick={loadCode} style={{ font: 'inherit', fontWeight: 800, color: MPL.tealDark, border: 0, background: 'none', cursor: 'pointer' }}>Reintentar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SideNav() {
  const { user } = useAuth();
  const unread = useUnreadMessages();
  const role = user?.role as 'tenant' | 'landlord' | 'pro' | 'admin' | 'store' | 'vet' | undefined;
  const items = useSideItems(role);
  return (
    <aside className="hidden lg:flex w-60 shrink-0">
      <div
        className="flex flex-col w-full border rounded-2xl shadow-sm overflow-hidden"
        style={{ borderColor: MPL.border, background: '#FFFFFF' }}
      >
        <nav className="grid gap-1.5 p-3">
          {items.map((item: NavItem) => {
            const target = resolvePath(item);
            const badge =
              target === '/mensajes' && unread > 0 ? (
                <span
                  className="inline-flex items-center justify-center rounded-full text-[10px] px-2 py-0.5"
                  style={{ background: MPL.teal, color: '#fff' }}
                >
                  {unread}
                </span>
              ) : undefined;
            return <NavRow key={target} to={target} label={item.label} badge={badge} />;
          })}
        </nav>
        {user && role && (
          <div className="mt-auto p-3">
            <div style={{ background: MPL.bg, borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: MPL.teal, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <PawMark size={17} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: MPL.ink }}>
                  {user.name || labelFor[role] || 'Cuenta'}
                </div>
                <div style={{ fontSize: 11.5, color: MPL.faint }}>{labelFor[role] || role}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function LegalLinks() {
  return (
    <footer
      className="app-legal-footer"
      style={{
        borderTop: '1px solid rgba(63,74,60,.12)',
        marginTop: 32,
        padding: '20px 16px 28px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 16,
        justifyContent: 'center',
        fontSize: 13,
        color: '#6B7566',
      }}
    >
      <Link to="/legal/legal-notice">Aviso legal</Link>
      <Link to="/legal/privacy">Privacidad</Link>
      <Link to="/legal/terms">Términos</Link>
      <Link to="/legal/cookies">Cookies</Link>
    </footer>
  );
}

export default function AppShell() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isPublicCatalog = pathname === '/animals';
  const hasAnimalDetailCta = /^\/animals\/[^/]+$/.test(pathname);
  const isFavoritesPage = pathname === '/me/favorites' || pathname === '/me/alerts';
  // Los textos legales tienen que ser alcanzables desde cualquier página
  // pública, no solo desde la portada.
  const isPublicAnimalPage = isPublicCatalog || hasAnimalDetailCta || isFavoritesPage;
  const showMobileBottomNav = user?.role === 'tenant' && !isPublicAnimalPage;

  return (
    <div className="min-h-screen" style={{ background: '#F6F3EC', color: '#3F4A3C' }}>
      {!isPublicAnimalPage && <Header />}
      {isPublicAnimalPage ? (
        <>
          <Outlet />
          <LegalLinks />
        </>
      ) : (
        // En móvil el margen de arriba va dentro de <main>, que es lo que se
        // desplaza: en el contenedor (overflow hidden) dejaba una franja fija
        // de 24px bajo la cabecera que cortaba el contenido al bajar.
        <div className="app-shell-body mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 md:py-6 flex gap-6 h-[calc(100vh-56px)] overflow-hidden">
          <SideNav />
          <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden pr-2 pt-6 pb-24 md:pt-0 md:pb-0">
            {!pathname.startsWith('/mensajes') && !pathname.startsWith('/contratos') && !pathname.startsWith('/acogida') && !pathname.startsWith('/buscar-casa/encontrado') && <div className="mpl-crumbs"><Breadcrumbs /></div>}
            <Outlet />
          </main>
        </div>
      )}
      {showMobileBottomNav && <MobileBottomNav />}
    </div>
  );
}
