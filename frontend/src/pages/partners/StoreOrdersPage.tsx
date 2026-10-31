import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Truck } from 'lucide-react';
import { ORDER_STATUS_LABELS, markShipped, sellerOrders, type Order } from '../../api/marketplace';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { formatPriceEur } from '../../utils/limits';

// Pedidos que la tienda tiene que preparar.
//
// Solo aparecen los pagados: un pedido sin pagar no es trabajo, es una
// intención, y ponerlo aquí haría que alguien empaquetara algo que nadie ha
// comprado. Lo filtra el servidor.

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 10,
  border: `1px solid ${MPL.border}`,
  background: MPL.card,
  color: MPL.ink,
};

function ShipForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const [carrier, setCarrier] = React.useState('');
  const [code, setCode] = React.useState('');

  const mutation = useMutation({
    mutationFn: () => markShipped(order._id, { carrier: carrier.trim(), code: code.trim() }),
    onSuccess: () => {
      toast.success('Pedido marcado como enviado. Avisamos al comprador.');
      onDone();
    },
    onError: (error: any) => {
      const code2 = error?.response?.data?.error;
      toast.error(
        code2 === 'not_payable_state'
          ? 'Este pedido ya no está en un estado que se pueda enviar.'
          : 'No hemos podido marcar el envío.',
      );
    },
  });

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        placeholder="Transportista"
        aria-label="Transportista"
        value={carrier}
        onChange={event => setCarrier(event.target.value)}
        style={{ ...inputStyle, flex: '0 1 150px' }}
      />
      <input
        placeholder="Nº de seguimiento"
        aria-label="Número de seguimiento"
        value={code}
        onChange={event => setCode(event.target.value)}
        style={{ ...inputStyle, flex: '0 1 190px' }}
      />
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        style={{
          padding: '9px 14px',
          borderRadius: 10,
          border: 'none',
          background: MPL.teal,
          color: '#fff',
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        {mutation.isPending ? 'Guardando…' : 'Marcar enviado'}
      </button>
    </div>
  );
}

export default function StoreOrdersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['marketplace-seller-orders'],
    queryFn: sellerOrders,
  });
  const orders = data || [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['marketplace-seller-orders'] });

  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 820, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: MPL.olive,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <Truck size={22} />
        </span>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 25, fontWeight: 800, margin: 0 }}>
            Pedidos por preparar
          </h1>
          <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
            Ya cobrados. Prepara el paquete y deja aquí el seguimiento.
          </p>
        </div>
      </header>

      {isLoading && <p style={{ color: MPL.muted, fontSize: 13.5 }}>Cargando…</p>}
      {isError && <p style={{ color: MPL.coralDark, fontSize: 13.5 }}>No hemos podido cargar los pedidos.</p>}

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
          No tienes pedidos pendientes ahora mismo.
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {orders.map(order => (
          <div
            key={order._id}
            style={{
              background: MPL.card,
              border: `1px solid ${MPL.border}`,
              borderRadius: 14,
              padding: 14,
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 15 }}>{order.reference}</strong>
                <span style={{ color: MPL.tealDark, fontSize: 12.5, fontWeight: 700 }}>
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800 }}>{formatPriceEur(order.totalEur)}</div>
                {/* La comisión se ve aquí y no en una factura al final del mes:
                    saber qué queda para la tienda es parte del pedido. */}
                {order.commissionEur > 0 && (
                  <div style={{ color: MPL.faint, fontSize: 12 }}>
                    Comisión {formatPriceEur(order.commissionEur)} ({order.commissionPct}%)
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 2, fontSize: 13.5 }}>
              {order.items.map(item => (
                <span key={item.productId}>
                  {item.qty} × {item.name}
                </span>
              ))}
            </div>

            <div style={{ fontSize: 13, color: MPL.muted }}>
              {order.buyer.name} · {order.shippingAddress.line1}
              {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''} ·{' '}
              {order.shippingAddress.postalCode} {order.shippingAddress.city}
              {order.buyer.phone ? ` · ${order.buyer.phone}` : ''}
            </div>

            {order.status === 'paid' ? (
              <ShipForm order={order} onDone={invalidate} />
            ) : (
              order.tracking?.code && (
                <span style={{ fontSize: 13, color: MPL.muted }}>
                  Enviado con {order.tracking.carrier || 'transportista'} · {order.tracking.code}
                </span>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
