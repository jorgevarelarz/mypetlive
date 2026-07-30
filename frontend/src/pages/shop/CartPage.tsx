import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ShoppingCart, Trash2 } from 'lucide-react';
import { createCheckout, type ShippingAddress } from '../../api/marketplace';
import { useCart } from '../../hooks/useCart';
import { useAuth } from '../../context/AuthContext';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { formatPriceEur } from '../../utils/limits';

// Carrito y checkout en una sola pantalla.
//
// Se puede pagar **sin cuenta**: al invitado se le piden email y nombre, y a
// cambio recibe un enlace con token que es lo único que le da acceso al pedido.
// Los portes definitivos los pone el servidor al crear el pedido — aquí no se
// promete un total que después cambie.

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: `1px solid ${MPL.border}`,
  background: MPL.card,
  color: MPL.ink,
};

const CHECKOUT_ERRORS: Record<string, string> = {
  empty_cart: 'Tu carrito está vacío.',
  mixed_sellers: 'Ese carrito mezcla dos tiendas. Deja solo los productos de una.',
  out_of_stock: 'Alguien se ha adelantado: no queda stock suficiente. Ajusta las unidades.',
  product_unavailable: 'Uno de los productos ya no está a la venta. Quítalo del carrito.',
  address_incomplete: 'Faltan datos de la dirección de envío.',
  email_required: 'Necesitamos un email válido para mandarte el pedido.',
  name_required: 'Dinos a nombre de quién va el pedido.',
  order_too_large: 'Ese pedido supera el importe máximo. Divídelo en dos.',
  seller_payouts_not_ready: 'Esta tienda todavía no puede cobrar online. Estamos con ella para activarlo.',
  seller_unavailable: 'Esta tienda ya no está disponible.',
  payments_unavailable: 'Los pagos no están disponibles ahora mismo. Tu pedido queda guardado.',
  checkout_failed: 'No hemos podido abrir la pasarela de pago. Vuelve a intentarlo.',
};

export default function CartPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();
  const [submitting, setSubmitting] = React.useState(false);

  const [guest, setGuest] = React.useState({ email: '', name: '', phone: '' });
  const [address, setAddress] = React.useState<ShippingAddress>({
    line1: '',
    line2: '',
    city: '',
    postalCode: '',
    province: '',
    country: 'ES',
  });

  const setField = (key: keyof ShippingAddress) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setAddress(current => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.lines.length || submitting) return;
    setSubmitting(true);
    try {
      const result = await createCheckout({
        items: cart.lines.map(line => ({ productId: line.productId, qty: line.qty })),
        shippingAddress: address,
        ...(user ? {} : { email: guest.email, name: guest.name, phone: guest.phone || undefined }),
      });

      // El pedido existe ya en el servidor: el carrito local ha cumplido.
      cart.clear();
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      // Sin pasarela: el pedido queda pendiente y la persona puede consultarlo.
      const suffix = result.guestToken ? `?token=${result.guestToken}` : '';
      navigate(`/pedido/${result.orderId}${suffix}`);
    } catch (error: any) {
      const code = error?.response?.data?.error;
      const data = error?.response?.data;
      if (code === 'payments_unavailable' && data?.orderId) {
        // 503 con pedido creado: no es un fallo del usuario, es nuestro. El
        // pedido se guarda y se le lleva a verlo en vez de perder sus datos.
        cart.clear();
        const suffix = data.guestToken ? `?token=${data.guestToken}` : '';
        navigate(`/pedido/${data.orderId}${suffix}`);
        return;
      }
      toast.error(CHECKOUT_ERRORS[code] || 'No hemos podido crear el pedido. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!cart.lines.length) {
    return (
      <div style={{ display: 'grid', gap: 12, maxWidth: 620, margin: '0 auto' }}>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: 0 }}>Tu carrito</h1>
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
          Todavía no has añadido nada.
        </div>
        <Link to="/tienda" style={{ color: MPL.tealDark, fontWeight: 800 }}>
          Ir a la tienda
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 720, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: MPL.coral,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          <ShoppingCart size={22} />
        </span>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, margin: 0 }}>Tu carrito</h1>
          <p style={{ color: MPL.muted, fontSize: 13, margin: 0 }}>
            {cart.sellerName ? `Pedido de ${cart.sellerName}` : 'Pedido de MyPetLive'}
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: 10 }}>
        {cart.lines.map(line => (
          <div
            key={line.productId}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              background: MPL.card,
              border: `1px solid ${MPL.border}`,
              borderRadius: 14,
              padding: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                to={`/tienda/${line.productId}`}
                style={{ fontWeight: 700, fontSize: 14.5, color: MPL.ink, textDecoration: 'none' }}
              >
                {line.name}
              </Link>
              <div style={{ color: MPL.muted, fontSize: 12.5 }}>{formatPriceEur(line.priceEur)} / unidad</div>
            </div>
            <input
              type="number"
              min={1}
              max={20}
              value={line.qty}
              aria-label={`Unidades de ${line.name}`}
              onChange={event => cart.update(line.productId, Number(event.target.value))}
              style={{ ...inputStyle, width: 68 }}
            />
            <span style={{ fontWeight: 800, minWidth: 76, textAlign: 'right' }}>
              {formatPriceEur(line.priceEur * line.qty)}
            </span>
            <button
              type="button"
              onClick={() => cart.remove(line.productId)}
              aria-label={`Quitar ${line.name}`}
              style={{
                border: `1px solid ${MPL.border}`,
                background: MPL.card,
                borderRadius: 10,
                padding: 8,
                cursor: 'pointer',
                color: MPL.coralDark,
                lineHeight: 0,
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          background: MPL.panel,
          border: `1px solid ${MPL.border}`,
          borderRadius: 14,
          padding: '12px 14px',
        }}
      >
        <span style={{ fontWeight: 700 }}>Subtotal</span>
        <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800 }}>
          {formatPriceEur(cart.subtotalEur)}
        </span>
      </div>
      <p style={{ color: MPL.faint, fontSize: 12.5, margin: 0 }}>
        Los gastos de envío se calculan en el paso siguiente, según la tienda y el importe del pedido.
      </p>

      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        {!user && (
          <fieldset style={{ border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
            <legend style={{ fontWeight: 800, fontSize: 14, padding: '0 6px' }}>Tus datos</legend>
            <p style={{ color: MPL.muted, fontSize: 12.5, margin: 0 }}>
              No necesitas cuenta. Te mandaremos el pedido y su enlace de seguimiento a este correo.{' '}
              <Link to="/login" style={{ color: MPL.tealDark, fontWeight: 700 }}>
                Entrar con mi cuenta
              </Link>
            </p>
            <input
              type="email"
              required
              placeholder="Email"
              aria-label="Email"
              value={guest.email}
              onChange={event => setGuest(current => ({ ...current, email: event.target.value }))}
              style={inputStyle}
            />
            <input
              required
              placeholder="Nombre y apellidos"
              aria-label="Nombre y apellidos"
              value={guest.name}
              onChange={event => setGuest(current => ({ ...current, name: event.target.value }))}
              style={inputStyle}
            />
            <input
              placeholder="Teléfono (opcional, para la entrega)"
              aria-label="Teléfono"
              value={guest.phone}
              onChange={event => setGuest(current => ({ ...current, phone: event.target.value }))}
              style={inputStyle}
            />
          </fieldset>
        )}

        <fieldset style={{ border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
          <legend style={{ fontWeight: 800, fontSize: 14, padding: '0 6px' }}>Dirección de envío</legend>
          <input required placeholder="Calle y número" aria-label="Calle y número" value={address.line1} onChange={setField('line1')} style={inputStyle} />
          <input placeholder="Piso, puerta (opcional)" aria-label="Piso y puerta" value={address.line2} onChange={setField('line2')} style={inputStyle} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input required placeholder="Código postal" aria-label="Código postal" value={address.postalCode} onChange={setField('postalCode')} style={{ ...inputStyle, flex: '0 1 140px' }} />
            <input required placeholder="Ciudad" aria-label="Ciudad" value={address.city} onChange={setField('city')} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          </div>
          <input placeholder="Provincia (opcional)" aria-label="Provincia" value={address.province} onChange={setField('province')} style={inputStyle} />
        </fieldset>

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '13px 18px',
            borderRadius: 12,
            border: 'none',
            background: submitting ? MPL.faint : MPL.coral,
            color: '#fff',
            fontWeight: 800,
            fontSize: 15,
            cursor: submitting ? 'default' : 'pointer',
          }}
        >
          {submitting ? 'Creando el pedido…' : 'Ir a pagar'}
        </button>
      </form>
    </div>
  );
}
