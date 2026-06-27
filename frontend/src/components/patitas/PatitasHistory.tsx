import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Gift, Ticket, Store, HandHeart } from 'lucide-react';
import type { PatitaTxn } from '../../api/patitas';
import { MPL, MPL_FONT_MONO } from '../../styles/mypetlive';

// Describe un movimiento desde la perspectiva del usuario/protectora "me".
function describe(t: PatitaTxn, meId: string) {
  if (t.type === 'earn') {
    const via = t.source === 'coupon' ? 'Cupón' : t.source === 'visit' ? 'Visita a tienda' : 'Generación';
    return { sign: 1, icon: t.source === 'coupon' ? Ticket : Store, title: `${via}`, sub: t.partner?.name ? `en ${t.partner.name}` : t.concept || '' };
  }
  if (t.type === 'donate') {
    if (String(t.shelter?.id) === meId) {
      return { sign: 1, icon: HandHeart, title: 'Donación recibida', sub: t.user?.name ? `de ${t.user.name}` : t.concept || '' };
    }
    return { sign: -1, icon: Gift, title: 'Donación de Patitas', sub: t.shelter?.name ? `a ${t.shelter.name}` : t.concept || '' };
  }
  // redeem
  return { sign: -1, icon: ArrowUpRight, title: 'Canje', sub: t.partner?.name ? `en ${t.partner.name}` : t.concept || '' };
}

export default function PatitasHistory({ items, meId, emptyText }: { items: PatitaTxn[]; meId: string; emptyText?: string }) {
  if (!items.length) {
    return <div style={{ color: MPL.faint, fontSize: 13.5, padding: '14px 2px' }}>{emptyText || 'Sin movimientos todavía.'}</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {items.map(t => {
        const d = describe(t, meId);
        const Icon = d.icon;
        const positive = d.sign > 0;
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: `1px solid ${MPL.border}`, borderRadius: 12, background: '#fff' }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: positive ? MPL.olive100 : MPL.coral100, color: positive ? MPL.oliveDark : MPL.coralDark }}>
              <Icon size={16} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: MPL.ink }}>{d.title}</div>
              <div style={{ fontSize: 12, color: MPL.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {d.sub}
                {t.code ? <span style={{ fontFamily: MPL_FONT_MONO, marginLeft: 6 }}>· {t.code}</span> : null}
              </div>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: positive ? MPL.oliveDark : MPL.coralDark }}>
                {positive ? '+' : '−'}{t.amount} 🐾
              </div>
              <div style={{ fontSize: 11, color: MPL.faint }}>
                {t.valueEur != null ? `${t.valueEur.toFixed(2)} €` : new Date(t.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: positive ? MPL.oliveDark : MPL.coralDark }}>
              {positive ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
