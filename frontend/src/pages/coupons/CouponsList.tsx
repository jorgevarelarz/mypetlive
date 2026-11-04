import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Copy, Gift, Scissors, Shield, ShoppingBag, Star, Stethoscope, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { listCoupons, sponsorCoupon, Coupon } from '../../api/coupons';
import { getMyCode } from '../../api/patitas';
import { useAuthModal } from '../../context/AuthModalContext';
import SelectProtectoraModal from '../../components/protectora/SelectProtectoraModal';
import { type PreferredProtectora } from '../../utils/preferredProtectora';
import { useProtectoraBeneficiaria } from '../../hooks/useProtectoraBeneficiaria';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, MPL_FONT_MONO, PawMark } from '../../styles/mypetlive';
import MobileBottomNav from '../../components/MobileBottomNav';
import { CalcoCupCategorias, CalcoCupExplorar, CalcoCupPatitas, CalcoCupProtectora, CalcoCupTicket } from '../../components/icons/calcados';
import { isNativeApp } from '../../utils/native';
import { useAuth } from '../../context/AuthContext';

const categoryIcons: Record<string, React.ReactNode> = {
  store: <ShoppingBag size={20} />,
  vet: <Stethoscope size={20} />,
  grooming: <Scissors size={20} />,
  insurance: <Shield size={20} />,
};

function categoryLabel(type: string) {
  if (type === 'vet') return 'Veterinario';
  if (type === 'grooming') return 'Peluquería';
  if (type === 'insurance') return 'Seguros';
  return 'Tienda';
}

export default function CouponsList() {
  const { user } = useAuth();
  const { openAuth } = useAuthModal();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['coupons'], queryFn: listCoupons });

  // Un partner puede destacar sus propios cupones (o el admin cualquiera).
  const canSponsor = (coupon: Coupon) =>
    Boolean(user) && (user!.role === 'admin' || String(coupon.partnerId || '') === String((user as any)?._id || (user as any)?.id || ''));

  const sponsorMutation = useMutation({
    mutationFn: (couponId: string) => sponsorCoupon(couponId),
    onSuccess: result => {
      if (result.alreadyActive) {
        toast.success('Este cupón ya está destacado');
      } else if (result.configured && result.url) {
        window.location.href = result.url; // Stripe Checkout
        return;
      } else {
        toast.success(result.message || 'Placement marcado como pendiente; se activará al habilitar los pagos.');
      }
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'No se pudo destacar el cupón');
    },
  });
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  // La protectora que de verdad recibe las Patitas: la de la donación automática
  // del perfil (AUD-5). Si está desactivada, no se presenta ninguna como beneficiaria.
  const beneficiaria = useProtectoraBeneficiaria();
  const esFamilia = (user as any)?.role === 'tenant';
  const preferredProtectora = !esFamilia || beneficiaria.activa ? beneficiaria.protectora : null;
  const coupons = data?.items || [];
  const activeCoupons = coupons.filter(coupon => coupon.active !== false);
  const totalPatitas = useMemo(
    () => activeCoupons.reduce((acc, coupon) => acc + (Number(coupon.rewardPatitas) || 0), 0),
    [activeCoupons],
  );

  const setPreferredProtectora = (value: PreferredProtectora | null) => beneficiaria.elegir(value);

  // Se cierra solo si se guardó (AUD-6): si falla, sigue abierto para elegir otra.
  const handleProtectoraSelected = async (option: PreferredProtectora) => {
    if (await setPreferredProtectora(option)) setSelectorOpen(false);
  };

  // El cupón se canjea en caja: la tienda identifica al cliente por su código
  // personal y aplica el cupón. Sin sesión no hay a quién darle las Patitas,
  // así que antes de enseñar nada se pide entrar.
  const openCoupon = (coupon: Coupon) => {
    if (!user) {
      openAuth({ mode: 'login', message: 'Entra para canjear el cupón y sumar Patitas para tu protectora.' });
      return;
    }
    setSelected(coupon);
  };
  const myCodeQ = useQuery({ queryKey: ['patitas-my-code'], queryFn: getMyCode, enabled: Boolean(selected && user), staleTime: 60_000 });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard?.writeText(code);
    } catch {
      // Clipboard may be unavailable on non-secure local contexts.
    }
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, background: MPL.bg, color: MPL.ink, minHeight: '100vh' }}>
      <style>{`
        .coupon-wrap{max-width:1120px;margin:0 auto;padding:36px 32px 64px;}
        .coupon-hero{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:26px;align-items:start;margin-bottom:20px;}
        .coupon-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;}
        .coupon-card{transition:transform .18s ease, box-shadow .18s ease;}
        .coupon-card:hover{transform:translateY(-3px);box-shadow:0 1px 3px rgba(31,55,40,.06),0 18px 38px -24px rgba(31,55,40,.32)!important;}
        @media (max-width: 1279px){.coupon-hero{grid-template-columns:minmax(0,1fr)}.coupon-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width: 920px){.coupon-hero{grid-template-columns:minmax(0,1fr)}.coupon-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.coupon-wrap{padding:26px 16px 48px}}
        @media (max-width: 620px){.coupon-wrap{padding:22px 20px 96px!important}.coupon-tabs{display:none!important}.coupon-hero{gap:16px!important}.coupon-hero h1{font-size:24px!important}.coupon-hero p{font-size:13.5px!important}.coupon-grid{grid-template-columns:1fr}.ticket-feature{padding:14px!important;border-radius:16px!important;gap:13px!important;flex-wrap:wrap!important}.ticket-feature > div:nth-child(2){width:52px!important;height:52px!important}.ticket-feature h2{font-size:20px!important}.ticket-feature button{flex:1 1 100%!important}.coupon-card{border-radius:15px!important}.coupon-card > div:first-child{padding:14px!important}.coupon-card > div:last-child{padding:12px 14px!important}}
      `}</style>

      <main className="coupon-wrap">
        <div className="mpl-crumbs" style={{ fontSize: 13, color: MPL.faint, fontWeight: 700, marginBottom: 14 }}>Inicio / Mi panel / Cupones</div>

        {/* Maqueta «Cupones y ofertas» (2 nov 2026), a tamaño normal de iPhone. */}
        <section className="coupon-hero">
          <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px', alignItems: 'center', gap: 6 }}>
              <div>
                <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, lineHeight: '34px', fontWeight: 800, color: '#14231F', margin: '0 0 8px' }}>Cupones y ofertas</h1>
                <p style={{ fontSize: 15, lineHeight: '21px', color: '#4A524D', margin: 0 }}>
                  Beneficios de partners locales para cuidar de tu mascota. Cada cupón usado genera <strong style={{ color: '#A86A08' }}>Patitas</strong> para la protectora que elijas.
                </p>
              </div>
              <img src="/ilustraciones/cupones-cabecera.png" alt="" aria-hidden style={{ width: 140, height: 'auto', display: 'block' }} />
            </div>
            <button type="button" onClick={() => setSelectorOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, width: '100%', height: 56, padding: '0 16px', border: 0, borderRadius: 18, background: '#EBF3DF', color: '#17352D', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
              <CalcoCupProtectora size={26} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preferredProtectora ? preferredProtectora.name : 'Elige protectora beneficiaria'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0E5F5B', fontSize: 16.5, fontWeight: 800 }}>
                {preferredProtectora ? 'Cambiar' : 'Elegir'}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0E5F5B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
              </span>
            </button>
          </div>

          <div style={{ background: '#035650', borderRadius: 22, padding: '20px 18px', color: '#fff', position: 'relative', overflow: 'hidden', alignSelf: 'start' }}>
            <span aria-hidden style={{ position: 'absolute', right: -18, bottom: -26, color: 'rgba(255,255,255,.08)' }}><PawMark size={120} /></span>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr', gap: 12, alignItems: 'start' }}>
              {[
                { icono: <CalcoCupPatitas size={24} />, n: isError ? '—' : totalPatitas || 0, label: 'Patitas potenciales' },
                null,
                { icono: <CalcoCupTicket size={22} color="#FFFFFF" />, n: isError ? '—' : activeCoupons.length, label: 'Cupones activos' },
                null,
                { icono: <CalcoCupCategorias size={23} color="#FFFFFF" />, n: isError ? '—' : new Set(activeCoupons.map(c => c.partnerType || 'store')).size, label: 'Categorías' },
              ].map((x, i) => x ? (
                <div key={i} style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    {x.icono}
                    <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{x.n}</span>
                  </div>
                  <div style={{ fontSize: 14.5, lineHeight: '19px', color: 'rgba(255,255,255,.92)', marginTop: 8 }}>{x.label}</div>
                </div>
              ) : <span key={i} aria-hidden style={{ alignSelf: 'stretch', background: 'rgba(255,255,255,.22)' }} />)}
            </div>
          </div>
        </section>

        {activeCoupons[0] && (
          <section className="ticket-feature" style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 22, padding: '26px 28px', display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28, boxShadow: '0 1px 3px rgba(31,55,40,.06),0 10px 30px -22px rgba(31,55,40,.25)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: 5, alignSelf: 'stretch', background: MPL.coral, borderRadius: 999 }} />
            <div style={{ width: 72, height: 72, borderRadius: 18, background: MPL.coral100, color: MPL.coral, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Gift size={32} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ background: MPL.coral100, color: MPL.coralDark, fontSize: 11.5, fontWeight: 800, padding: '5px 11px', borderRadius: 7 }}>Destacado</span>
              <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: '10px 0 4px' }}>{activeCoupons[0].copy || activeCoupons[0].title}</h2>
              <div style={{ fontSize: 14, color: MPL.muted }}>
                {activeCoupons[0].description || 'Oferta especial de bienvenida'} · genera <strong style={{ color: MPL.goldDark }}>+{activeCoupons[0].rewardPatitas ?? 0} Patitas</strong>
              </div>
            </div>
            <button type="button" onClick={() => openCoupon(activeCoupons[0])} style={{ background: MPL.coral, color: '#fff', fontSize: 15, fontWeight: 800, padding: '14px 26px', border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' }}>
              Canjear
            </button>
          </section>
        )}

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando cupones...</div>
        ) : isError ? (
          // Un fallo de carga no es «no hay cupones» (AUD-3).
          <div role="alert" style={{ background: MPL.coral100, border: `1px solid ${MPL.coral}`, borderRadius: 22, padding: '20px', fontSize: 15, color: MPL.coralDark }}>
            No hemos podido cargar los cupones, por eso las cifras de arriba salen con «—».{' '}
            <button type="button" onClick={() => refetch()} style={{ border: 0, background: 'none', padding: 0, color: MPL.tealDark, font: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}>Reintentar</button>
          </div>
        ) : activeCoupons.length === 0 ? (
          <div style={{ display: 'grid', justifyItems: 'center', gap: 14, textAlign: 'center', background: '#FEFEFE', border: '1px solid #EEE9E1', borderRadius: 22, padding: '22px 20px 24px', boxShadow: '0 8px 22px -16px rgba(60,45,30,.3)' }}>
            <img src="/ilustraciones/cupones-vacio.png" alt="" aria-hidden style={{ width: 140, height: 'auto' }} />
            <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 21, fontWeight: 800, color: '#14231F' }}>Aún no hay cupones activos.</div>
            <a href="/tienda" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 50, padding: '0 24px', border: '1.5px solid #1C6B3A', borderRadius: 16, color: '#1C6B3A', fontSize: 16.5, fontWeight: 800, textDecoration: 'none' }}>
              <CalcoCupExplorar size={21} />
              Explorar ofertas
            </a>
          </div>
        ) : (
          <div className="coupon-grid">
            {activeCoupons.map(coupon => {
              const type = coupon.partnerType || 'store';
              const copyText = coupon.copy || coupon.title;
              return (
                <article key={coupon._id} className="coupon-card" style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 1px 3px rgba(31,55,40,.06),0 8px 24px -18px rgba(31,55,40,.22)', position: 'relative' }}>
                  <div style={{ padding: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                      <span style={{ width: 44, height: 44, borderRadius: 14, background: MPL.teal100, color: MPL.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {categoryIcons[type] || categoryIcons.store}
                      </span>
                      <div>
                        <div style={{ fontSize: 12, color: MPL.faint }}>{categoryLabel(type)}</div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{coupon.partner?.name || 'Partner local'}</div>
                      </div>
                    </div>
                    <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 8 }}>{coupon.discount}</div>
                    <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, lineHeight: 1.1, fontWeight: 800, margin: '0 0 8px' }}>{copyText}</h2>
                    <p style={{ fontSize: 13.5, color: MPL.muted, lineHeight: 1.45, minHeight: 42, margin: 0 }}>{coupon.description}</p>
                  </div>
                  <div style={{ borderTop: `1.5px dashed ${MPL.border}`, padding: '15px 22px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: MPL.goldDark }}>
                      <PawMark size={15} color={MPL.gold} />
                      +{coupon.rewardPatitas ?? 0}
                    </span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {canSponsor(coupon) && !isNativeApp() && (
                        coupon.sponsored && coupon.sponsorshipStatus === 'active' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: MPL.goldDark }}>
                            <Star size={14} fill={MPL.gold} color={MPL.gold} /> Destacado
                          </span>
                        ) : (
                          <button type="button" onClick={() => sponsorMutation.mutate(coupon._id)} disabled={sponsorMutation.isPending} title="Destacar este cupón (9,99€)" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff', color: MPL.goldDark, fontSize: 12.5, fontWeight: 800, padding: '9px 12px', border: `1.5px solid ${MPL.gold}`, borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                            <Star size={14} color={MPL.gold} />
                            {sponsorMutation.isPending ? '…' : 'Destacar'}
                          </button>
                        )
                      )}
                      <button type="button" onClick={() => openCoupon(coupon)} style={{ background: MPL.teal, color: '#fff', fontSize: 13.5, fontWeight: 800, padding: '10px 18px', border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Canjear
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section style={{ marginTop: 18, background: '#FDF3E1', borderRadius: 22, padding: 18, display: 'grid', gridTemplateColumns: '96px 1px minmax(0, 1fr)', alignItems: 'center', gap: 16 }}>
          <img src="/ilustraciones/cupones-bolsa.png" alt="" aria-hidden style={{ width: 96, height: 'auto' }} />
          <span aria-hidden style={{ alignSelf: 'stretch', background: '#EADCC4' }} />
          <p style={{ fontSize: 15, lineHeight: '21px', color: '#3D4340', margin: 0 }}>
            Cada compra validada reparte valor de forma transparente: tú ahorras, el partner gana un cliente y una parte se convierte en <strong style={{ color: '#A86A08' }}>Patitas para tu protectora.</strong>
          </p>
        </section>
      </main>

      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(31,55,40,.42)', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 390, background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 70px -34px rgba(31,55,40,.62)' }}>
            {/* El aspa iba en blanco sobre un círculo blanco al 20% encima del
                coral: 2,6:1 de contraste, por debajo del mínimo de 3:1 para un
                control, y en un móvil a plena luz no se veía. Círculo blanco
                sólido con el aspa en coral oscuro: 4,7:1. */}
            <div style={{ background: MPL.coral, padding: '26px 28px 22px', color: '#fff', position: 'relative' }}>
              <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar cupón" style={{ padding: 0, position: 'absolute', top: 16, right: 16, width: 34, height: 34, borderRadius: 999, border: 'none', background: '#fff', color: MPL.coralDark, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(31,55,40,.2)' }}>
                <X size={18} strokeWidth={2.5} />
              </button>
              {/* Hueco para el aspa: si no, un texto largo se le mete por debajo. */}
              <div style={{ paddingRight: 34 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: .82, marginBottom: 8 }}>{categoryLabel(selected.partnerType)}</div>
                <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, lineHeight: 1.05 }}>{selected.copy || selected.title}</div>
              </div>
            </div>
            <div style={{ padding: '24px 28px 28px', textAlign: 'center' }}>
              <p style={{ fontSize: 13.5, color: MPL.muted, margin: '0 0 18px', lineHeight: 1.5 }}>{selected.description}</p>
              {/* QR y código personales: es lo que lee la tienda en caja. Antes
                  aquí había un dibujo con forma de QR que no servía para nada. */}
              <div style={{ width: 172, height: 172, margin: '0 auto 14px', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 14, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {myCodeQ.data ? (
                  <QRCodeSVG value={myCodeQ.data.token} size={142} bgColor="#ffffff" fgColor={MPL.ink} />
                ) : (
                  <span style={{ fontSize: 13, color: MPL.muted }}>{myCodeQ.isError ? 'No se pudo cargar tu código' : 'Cargando tu código…'}</span>
                )}
              </div>
              {myCodeQ.data && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: MPL.bg, border: '1.5px dashed #C7C1B1', borderRadius: 12, padding: '12px 18px', marginBottom: 10 }}>
                  <span style={{ fontFamily: MPL_FONT_MONO, fontWeight: 800, fontSize: 18, letterSpacing: 2, color: MPL.ink }}>{myCodeQ.data.code}</span>
                  <button type="button" onClick={() => copyCode(myCodeQ.data!.code)} style={{ border: 0, background: 'none', color: MPL.teal, cursor: 'pointer', padding: 0, display: 'inline-flex' }} aria-label="Copiar código">
                    <Copy size={15} />
                  </button>
                </div>
              )}
              <p style={{ fontSize: 13, color: MPL.muted, margin: '0 0 6px' }}>Enséñalo en caja para aplicar el cupón.</p>
              {selected.targetAnimalCode && (
                <p style={{ fontSize: 13, color: MPL.muted, margin: '0 0 6px' }}>Es para tu mascota <strong style={{ fontFamily: MPL_FONT_MONO, color: MPL.ink }}>{selected.targetAnimalCode}</strong>.</p>
              )}
              <div style={{ height: 12 }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: MPL.gold100, borderRadius: 12, padding: 11 }}>
                <PawMark size={18} color={MPL.gold} />
                <span style={{ fontSize: 13, fontWeight: 800, color: MPL.goldDark }}>Generará +{selected.rewardPatitas ?? 0} Patitas</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <SelectProtectoraModal
        open={selectorOpen}
        selectedId={preferredProtectora?.id}
        onClose={() => setSelectorOpen(false)}
        onConfirm={handleProtectoraSelected}
      />
      {!user && <MobileBottomNav />}
    </div>
  );
}
