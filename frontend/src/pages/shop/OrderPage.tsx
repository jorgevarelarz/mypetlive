import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Truck } from 'lucide-react';
import { ORDER_STATUS_LABELS, getOrder } from '../../api/marketplace';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { formatPriceEur } from '../../utils/limits';

// Detalle del pedido. Es la pantalla de vuelta de Stripe y el enlace que va en
// todos los correos, así que tiene que funcionar sin sesión: el invitado entra
// con el token de la URL, que es su única credencial.

export default function OrderPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') || undefined;
  const cancelado = params.get('cancelado') === '1';

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['marketplace-order', id, token],
    queryFn: () => getOrder(id, token),
    enabled: !!id,
    // Stripe redirige antes de que llegue su propio webhook: sin refresco, el
    // pedido se queda en "pendiente de pago" a la vista de quien acaba de pagar.
    refetchInterval: query => (query.state.data?.status === 'pending_payment' ? 3000 : false),
  });

  if (isLoading) return <p style={{ color: MPL.muted, fontSize: 13.5 }}>Cargando tu pedido…</p>;
  if (isError || !order) {
    return (
      <div style={{ display: 'grid', gap: 10, maxWidth: 560, margin: '0 auto' }}>
        <p style={{ color: MPL.coralDark, fontSize: 13.5 }}>
          No hemos podido abrir este pedido. Si compraste sin cuenta, entra desde el enlace del correo: lleva el
          código que da acceso.
        </p>
        <Link to="/tienda" style={{ color: MPL.tealDark, fontWeight: 800 }}>
          Volver a la tienda
        </Link>
      </div>
    );
  }

  const pagado = order.status !== 'pending_payment' && order.status !== 'cancelled';

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 640, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: pagado ? MPL.olive : MPL.gold,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <Package size={22} />
        </span>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 23, fontWeight: 800, margin: 0 }}>
            Pedido {order.reference}
          </h1>
          <p style={{ color: MPL.muted, fontSize: 13, margin: 0 }}>{ORDER_STATUS_LABELS[order.status]}</p>
        </div>
      </header>

      {cancelado && order.status === 'pending_payment' && (
        <div
          style={{
            border: `1px solid ${MPL.gold}`,
            background: MPL.gold100,
            borderRadius: 14,
            padding: 14,
            fontSize: 13.5,
          }}
        >
          Has salido del pago sin terminarlo. El pedido sigue guardado: escríbenos si quieres retomarlo.
        </div>
      )}

      {order.status === 'pending_payment' && !cancelado && (
        <div
          style={{
            border: `1px solid ${MPL.border}`,
            background: MPL.panel,
            borderRadius: 14,
            padding: 14,
            fontSize: 13.5,
            color: MPL.muted,
          }}
        >
          Estamos confirmando el pago con el banco. Esta página se actualiza sola en unos segundos.
        </div>
      )}

      {order.tracking?.code && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            border: `1px solid ${MPL.border}`,
            background: MPL.card,
            borderRadius: 14,
            padding: 14,
            fontSize: 13.5,
          }}
        >
          <Truck size={18} color={MPL.tealDark} />
          <span>
            {order.tracking.carrier ? `${order.tracking.carrier} · ` : ''}
            <strong>{order.tracking.code}</strong>
          </span>
        </div>
      )}

      <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
        {order.items.map(item => (
          <div key={item.productId} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
            <span>
              {item.qty} × {item.name}
            </span>
            <span style={{ fontWeight: 700 }}>{formatPriceEur(item.priceEur * item.qty)}</span>
          </div>
        ))}
        <hr style={{ border: 0, borderTop: `1px solid ${MPL.border}`, margin: '2px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: MPL.muted }}>
          <span>Subtotal</span>
          <span>{formatPriceEur(order.subtotalEur)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: MPL.muted }}>
          <span>Envío</span>
          <span>{order.shippingEur === 0 ? 'Gratis' : formatPriceEur(order.shippingEur)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 800 }}>Total</span>
          <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800 }}>
            {formatPriceEur(order.totalEur)}
          </span>
        </div>
      </div>

      <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 14, fontSize: 13.5, display: 'grid', gap: 4 }}>
        <strong>Envío a</strong>
        <span style={{ color: MPL.muted }}>
          {order.buyer.name}
          <br />
          {order.shippingAddress.line1}
          {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
          <br />
          {order.shippingAddress.postalCode} {order.shippingAddress.city}
          {order.shippingAddress.province ? ` (${order.shippingAddress.province})` : ''}
        </span>
      </div>

      <Link to="/tienda" style={{ color: MPL.tealDark, fontWeight: 800, fontSize: 13.5 }}>
        Seguir comprando
      </Link>
    </div>
  );
}
