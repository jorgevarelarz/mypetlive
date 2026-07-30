import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, Truck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { CATEGORY_LABELS, getProduct } from '../../api/marketplace';
import { useCart } from '../../hooks/useCart';
import { MPL, MPL_FONT_DISPLAY, speciesLabel } from '../../styles/mypetlive';
import { formatPriceEur } from '../../utils/limits';

// Ficha de producto. Los portes y quién vende salen aquí y no solo en el
// carrito: enterarse del envío al final es la primera causa de carrito
// abandonado, y saber quién factura es un derecho del comprador.

export default function ProductPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const [qty, setQty] = React.useState(1);
  const [conflict, setConflict] = React.useState(false);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['marketplace-product', id],
    queryFn: () => getProduct(id),
    enabled: !!id,
  });

  if (isLoading) return <p style={{ color: MPL.muted, fontSize: 13.5 }}>Cargando producto…</p>;
  if (isError || !product) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <p style={{ color: MPL.coralDark, fontSize: 13.5 }}>Este producto ya no está disponible.</p>
        <Link to="/tienda" style={{ color: MPL.tealDark, fontWeight: 800 }}>
          Volver a la tienda
        </Link>
      </div>
    );
  }

  const sellerName = product.seller?.name || 'MyPetLive';
  const agotado = product.stock <= 0;
  const maxQty = Math.min(20, Math.max(1, product.stock));

  const add = () => {
    const result = cart.add(product, qty);
    if (!result.ok) {
      // No se tira el carrito de otra tienda sin preguntar: es trabajo que la
      // persona ya había hecho.
      setConflict(true);
      return;
    }
    toast.success(`${product.name} añadido al carrito`);
  };

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 900, margin: '0 auto' }}>
      <Link to="/tienda" style={{ color: MPL.tealDark, fontWeight: 700, fontSize: 13.5 }}>
        ← Volver a la tienda
      </Link>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div
          style={{
            aspectRatio: '1 / 1',
            borderRadius: 16,
            background: MPL.panel,
            border: `1px solid ${MPL.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <ShoppingBag size={40} color={MPL.faint} />
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ color: MPL.muted, fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase' }}>
              {CATEGORY_LABELS[product.category] || 'Otros'}
            </span>
            <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 25, fontWeight: 800, margin: 0 }}>
              {product.name}
            </h1>
            <span style={{ color: MPL.muted, fontSize: 13 }}>
              Vende {sellerName}
              {product.seller?.city ? ` · ${product.seller.city}` : ''}
            </span>
          </div>

          <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800 }}>
            {formatPriceEur(product.priceEur)}
          </span>

          {product.species.length > 0 && (
            <span style={{ color: MPL.muted, fontSize: 13 }}>
              Para {product.species.map(speciesLabel).join(' y ')}
            </span>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: MPL.muted,
              fontSize: 13,
              background: MPL.panel,
              border: `1px solid ${MPL.border}`,
              borderRadius: 12,
              padding: '10px 12px',
            }}
          >
            <Truck size={16} />
            {product.shippingEur === 0
              ? 'Envío gratis con este pedido'
              : `Envío ${formatPriceEur(product.shippingEur ?? 0)}`}
          </div>

          {agotado ? (
            <p style={{ color: MPL.coralDark, fontSize: 13.5, fontWeight: 700, margin: 0 }}>
              Agotado ahora mismo. Vuelve a mirar en unos días.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                Unidades
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  value={qty}
                  onChange={event => setQty(Math.max(1, Math.min(maxQty, Number(event.target.value) || 1)))}
                  style={{
                    width: 72,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: `1px solid ${MPL.border}`,
                    background: MPL.card,
                    color: MPL.ink,
                  }}
                />
              </label>
              <button
                type="button"
                onClick={add}
                style={{
                  padding: '11px 18px',
                  borderRadius: 12,
                  border: 'none',
                  background: MPL.coral,
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Añadir al carrito
              </button>
            </div>
          )}

          {product.stock > 0 && product.stock <= 3 && (
            <span style={{ color: MPL.coralDark, fontSize: 12.5, fontWeight: 700 }}>
              Solo quedan {product.stock}
            </span>
          )}

          {product.description && (
            <p style={{ color: MPL.ink, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line', margin: 0 }}>
              {product.description}
            </p>
          )}
        </div>
      </div>

      {conflict && (
        <div
          style={{
            border: `1px solid ${MPL.coral}`,
            background: MPL.coral100,
            borderRadius: 14,
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <strong style={{ fontSize: 14 }}>Tu carrito es de {cart.sellerName || 'otra tienda'}</strong>
          <p style={{ margin: 0, fontSize: 13.5, color: MPL.ink }}>
            Cada pedido va de una sola tienda: son dos paquetes, dos portes y dos responsables. Puedes terminar
            el pedido que tienes o empezar uno nuevo con este producto.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate('/carrito')}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: `1px solid ${MPL.border}`,
                background: MPL.card,
                color: MPL.ink,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Ver mi carrito
            </button>
            <button
              type="button"
              onClick={() => {
                cart.replace(product, qty);
                setConflict(false);
                toast.success('Carrito nuevo con este producto');
              }}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: 'none',
                background: MPL.coral,
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Empezar de cero con este
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
