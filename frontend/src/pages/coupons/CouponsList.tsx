import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Gift, Scissors, Shield, ShoppingBag, Stethoscope, X } from 'lucide-react';
import { listCoupons, Coupon } from '../../api/coupons';
import SelectProtectoraModal from '../../components/protectora/SelectProtectoraModal';
import { loadPreferredProtectora, savePreferredProtectora, type PreferredProtectora } from '../../utils/preferredProtectora';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, MPL_FONT_MONO, PawMark } from '../../styles/mypetlive';

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
  const { data, isLoading } = useQuery({ queryKey: ['coupons'], queryFn: listCoupons });
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [preferredProtectora, setPreferredProtectoraState] = useState<PreferredProtectora | null>(() => loadPreferredProtectora());
  const coupons = data?.items || [];
  const activeCoupons = coupons.filter(coupon => coupon.active !== false);
  const totalPatitas = useMemo(
    () => activeCoupons.reduce((acc, coupon) => acc + (Number(coupon.bonusPatitas) || 40), 0),
    [activeCoupons],
  );

  const setPreferredProtectora = (value: PreferredProtectora | null) => {
    setPreferredProtectoraState(value);
    savePreferredProtectora(value);
  };

  const handleProtectoraSelected = (option: PreferredProtectora) => {
    setPreferredProtectora(option);
    setSelectorOpen(false);
  };

  const copyCode = async (coupon: Coupon) => {
    const code = coupon.targetAnimalCode || coupon._id.slice(-6).toUpperCase();
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
        .coupon-hero{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:26px;align-items:stretch;margin-bottom:32px;}
        .coupon-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;}
        .coupon-card{transition:transform .18s ease, box-shadow .18s ease;}
        .coupon-card:hover{transform:translateY(-3px);box-shadow:0 1px 3px rgba(31,55,40,.06),0 18px 38px -24px rgba(31,55,40,.32)!important;}
        @media (max-width: 920px){.coupon-hero{grid-template-columns:1fr}.coupon-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.coupon-wrap{padding:26px 16px 48px}}
        @media (max-width: 620px){.coupon-grid{grid-template-columns:1fr}.ticket-feature{display:grid!important}.ticket-feature button{width:100%}}
      `}</style>

      <main className="coupon-wrap">
        <div style={{ fontSize: 13, color: MPL.faint, fontWeight: 700, marginBottom: 14 }}>Inicio / Mi panel / Cupones</div>
        <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${MPL.border}`, marginBottom: 30, overflowX: 'auto' }}>
          {['Resumen', 'Mis solicitudes', 'Favoritos', 'Mis mascotas', 'Cupones', 'Patitas'].map(tab => (
            <span key={tab} style={{ fontSize: 14.5, fontWeight: tab === 'Cupones' ? 800 : 700, color: tab === 'Cupones' ? MPL.teal : MPL.muted, padding: '12px 16px', borderBottom: tab === 'Cupones' ? `2.5px solid ${MPL.teal}` : '2.5px solid transparent', whiteSpace: 'nowrap' }}>
              {tab}
            </span>
          ))}
        </div>

        <section className="coupon-hero">
          <div>
            <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 38, fontWeight: 800, margin: '0 0 8px' }}>Cupones y ofertas</h1>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: MPL.muted, margin: 0, maxWidth: 520 }}>
              Beneficios de partners locales para cuidar de tu mascota. Cada cupón usado genera <strong style={{ color: MPL.goldDark }}>Patitas</strong> para la protectora que elijas.
            </p>
            <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.olive100, color: MPL.oliveDark, borderRadius: 999, padding: '9px 14px', fontSize: 13, fontWeight: 800 }}>
              {preferredProtectora ? `Protectora: ${preferredProtectora.name}` : 'Elige protectora beneficiaria'}
              <button type="button" onClick={() => setSelectorOpen(true)} style={{ border: 0, background: 'none', color: MPL.teal, font: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 }}>
                {preferredProtectora ? 'Cambiar' : 'Elegir'}
              </button>
            </div>
          </div>

          <div style={{ background: MPL.teal, borderRadius: 22, padding: 24, color: '#fff', position: 'relative', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', right: -26, bottom: -30, color: 'rgba(255,255,255,.08)' }}><PawMark size={150} /></span>
            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <PawMark size={22} color="#F6D78A" />
                  <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{totalPatitas || 0}</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 5 }}>Patitas potenciales</div>
              </div>
              <div>
                <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{activeCoupons.length}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 5 }}>cupones activos</div>
              </div>
              <div>
                <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>3</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.75)', marginTop: 5 }}>categorías</div>
              </div>
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
                {activeCoupons[0].description || 'Oferta especial de bienvenida'} · genera <strong style={{ color: MPL.goldDark }}>+{activeCoupons[0].bonusPatitas || 40} Patitas</strong>
              </div>
            </div>
            <button type="button" onClick={() => setSelected(activeCoupons[0])} style={{ background: MPL.coral, color: '#fff', fontSize: 15, fontWeight: 800, padding: '14px 26px', border: 'none', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', flex: 'none' }}>
              Canjear
            </button>
          </section>
        )}

        {isLoading ? (
          <div style={{ color: MPL.muted }}>Cargando cupones...</div>
        ) : activeCoupons.length === 0 ? (
          <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 20, padding: 24, color: MPL.muted }}>Aún no hay cupones activos.</div>
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
                      +{coupon.bonusPatitas || 40}
                    </span>
                    <button type="button" onClick={() => setSelected(coupon)} style={{ background: MPL.teal, color: '#fff', fontSize: 13.5, fontWeight: 800, padding: '10px 18px', border: 'none', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Canjear
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section style={{ marginTop: 32, background: MPL.panel, border: `1px solid ${MPL.border}`, borderRadius: 18, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <PawMark size={30} color={MPL.gold} />
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5d6450', margin: 0 }}>
            Cada compra validada reparte valor de forma transparente: tú ahorras, el partner gana un cliente y una parte se convierte en <strong style={{ color: MPL.goldDark }}>Patitas para tu protectora</strong>.
          </p>
        </section>
      </main>

      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(31,55,40,.42)', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 390, background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 24px 70px -34px rgba(31,55,40,.62)' }}>
            <div style={{ background: MPL.coral, padding: '26px 28px 22px', color: '#fff', position: 'relative' }}>
              <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar cupón" style={{ position: 'absolute', top: 18, right: 18, width: 32, height: 32, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.2)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: .82, marginBottom: 8 }}>{categoryLabel(selected.partnerType)}</div>
              <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, lineHeight: 1.05 }}>{selected.copy || selected.title}</div>
            </div>
            <div style={{ padding: '24px 28px 28px', textAlign: 'center' }}>
              <p style={{ fontSize: 13.5, color: MPL.muted, margin: '0 0 18px', lineHeight: 1.5 }}>{selected.description}</p>
              <div style={{ width: 172, height: 172, margin: '0 auto 18px', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 16, background: '#fff' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: 6, backgroundImage: `repeating-linear-gradient(0deg,${MPL.ink} 0 4px,transparent 4px 8px),repeating-linear-gradient(90deg,${MPL.ink} 0 4px,transparent 4px 8px)`, backgroundSize: '8px 8px' }} />
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: MPL.bg, border: '1.5px dashed #C7C1B1', borderRadius: 12, padding: '12px 18px', marginBottom: 18 }}>
                <span style={{ fontFamily: MPL_FONT_MONO, fontWeight: 800, fontSize: 16, color: MPL.ink }}>{selected.targetAnimalCode || selected._id.slice(-6).toUpperCase()}</span>
                <button type="button" onClick={() => copyCode(selected)} style={{ border: 0, background: 'none', color: MPL.teal, cursor: 'pointer', padding: 0, display: 'inline-flex' }} aria-label="Copiar código">
                  <Copy size={15} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: MPL.gold100, borderRadius: 12, padding: 11 }}>
                <PawMark size={18} color={MPL.gold} />
                <span style={{ fontSize: 13, fontWeight: 800, color: MPL.goldDark }}>Generará +{selected.bonusPatitas || 40} Patitas</span>
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
    </div>
  );
}
