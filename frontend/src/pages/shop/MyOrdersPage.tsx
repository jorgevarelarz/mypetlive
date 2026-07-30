import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { ORDER_STATUS_LABELS, myOrders } from '../../api/marketplace';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { formatPriceEur } from '../../utils/limits';

// Mis pedidos. Solo para quien tiene cuenta: un invitado llega a su pedido por
// el enlace con token del correo, que es lo único que lo identifica.

export default function MyOrdersPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['marketplace-my-orders'], queryFn: myOrders });
  const orders = data || [];

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 720, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: MPL.teal,
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
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: 0 }}>Mis pedidos</h1>
          <p style={{ color: MPL.muted, fontSize: 13, margin: 0 }}>Lo que has comprado en la tienda.</p>
        </div>
      </header>

      {isLoading && <p style={{ color: MPL.muted, fontSize: 13.5 }}>Cargando…</p>}
      {isError && <p style={{ color: MPL.coralDark, fontSize: 13.5 }}>No hemos podido cargar tus pedidos.</p>}

      {!isLoading && !isError && orders.length === 0 && (
        <div
          style={{
            border: `1px dashed ${MPL.border}`,
            borderRadius: 14,
            padding: 20,
            background: MPL.card,
            color: MPL.muted,
            fontSize: 13.5,
          }}
        >
          Todavía no has hecho ningún pedido.{' '}
          <Link to="/tienda" style={{ color: MPL.tealDark, fontWeight: 800 }}>
            Ir a la tienda
          </Link>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {orders.map(order => (
          <Link
            key={order._id}
            to={`/pedido/${order._id}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
              background: MPL.card,
              border: `1px solid ${MPL.border}`,
              borderRadius: 14,
              padding: 14,
              color: MPL.ink,
              textDecoration: 'none',
            }}
          >
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>{order.reference}</strong>
              <span style={{ color: MPL.muted, fontSize: 12.5 }}>
                {order.items.map(item => `${item.qty} × ${item.name}`).join(' · ')}
              </span>
              <span style={{ color: MPL.tealDark, fontSize: 12.5, fontWeight: 700 }}>
                {ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{formatPriceEur(order.totalEur)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
