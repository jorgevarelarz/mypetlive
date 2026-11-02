import React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bone, ChevronDown, Ellipsis, ShoppingBag, ShoppingCart, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { IconoCuenco, IconoHuella, IconoPaseo, IconoSalud } from '../../components/icons/mplIcons';
import { PawGlyph, PET_COLORS, Sparkle } from '../../components/pet/petArt';
import {
  CATEGORY_LABELS,
  PRODUCT_CATEGORIES,
  listProducts,
  type Product,
} from '../../api/marketplace';
import { useCart } from '../../hooks/useCart';
import { MPL, MPL_FONT_DISPLAY, speciesLabel } from '../../styles/mypetlive';
import { formatPriceEur } from '../../utils/limits';

// Catálogo del marketplace.
//
// Público sin sesión a propósito: un catálogo detrás de un login no lo ve nadie
// que no sea ya cliente. La cuenta se pide (y ni eso) al pagar.

// Tarjeta de producto (maqueta de la tienda, 2 nov 2026): foto arriba, nombre,
// categoría en etiqueta, precio y botón de carrito. La foto es la que sube la tienda.
function ProductCard({ product }: { product: Product }) {
  const nav = useNavigate();
  const { add } = useCart();
  const agotado = product.stock <= 0;
  const alCarrito = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const result = add(product, 1);
    if (!result.ok) {
      // El carrito es de otra tienda: la ficha pregunta antes de vaciarlo.
      nav(`/tienda/${product.id}`);
      return;
    }
    toast.success(`${product.name} añadido al carrito`);
  };
  return (
    <Link
      to={`/tienda/${product.id}`}
      style={{
        display: 'grid', gridTemplateRows: 'auto 1fr', background: '#FFFFFF', border: `1px solid ${PET_COLORS.border}`,
        borderRadius: 18, overflow: 'hidden', color: PET_COLORS.ink, textDecoration: 'none',
        boxShadow: '0 1px 3px rgba(31,55,40,.05), 0 10px 24px -18px rgba(31,55,40,.25)',
      }}
    >
      <div style={{ aspectRatio: '4 / 3', background: '#F3ECE2', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {product.images[0] ? (
          <img src={product.images[0]} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <ShoppingBag size={30} color={MPL.faint} />
        )}
      </div>
      <div style={{ display: 'grid', gap: 6, padding: '10px 12px 12px', alignContent: 'start' }}>
        <span style={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.2 }}>{product.name}</span>
        <span style={{ justifySelf: 'start', background: '#F1ECE3', color: PET_COLORS.muted, borderRadius: 999, padding: '2px 10px', fontSize: 12.5 }}>
          {CATEGORY_LABELS[product.category] || 'Otros'}
        </span>
        {/* Quién vende importa: es quien factura y a quien se le reclama. */}
        <span style={{ color: MPL.faint, fontSize: 12 }}>
          {product.seller ? product.seller.name : 'MyPetLive'}
          {product.stock > 0 && product.stock <= 3 ? ` · quedan ${product.stock}` : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>{formatPriceEur(product.priceEur)}</span>
          <button
            type="button"
            onClick={alCarrito}
            disabled={agotado}
            aria-label={agotado ? 'Agotado' : `Añadir ${product.name} al carrito`}
            style={{ width: 46, height: 40, borderRadius: 12, border: 0, background: agotado ? '#C9D2C4' : PET_COLORS.teal, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: agotado ? 'default' : 'pointer', flexShrink: 0 }}
          >
            <ShoppingCart size={19} />
          </button>
        </div>
      </div>
    </Link>
  );
}

// Fila de categorías con icono. «Destacados» es todo el catálogo; «Más» abre el resto.
const CHIPS: Array<{ value: string; label: string; icon: React.ReactNode }> = [
  { value: '', label: 'Destacados', icon: <IconoHuella size={28} color="currentColor" /> },
  { value: 'comida', label: 'Comida', icon: <IconoCuenco size={28} color="currentColor" /> },
  { value: 'juguetes', label: 'Juguetes', icon: <Bone size={26} strokeWidth={1.7} /> },
  { value: 'accesorios', label: 'Paseo', icon: <IconoPaseo size={28} color="currentColor" /> },
  { value: 'salud', label: 'Salud', icon: <IconoSalud size={28} color="currentColor" /> },
];

export default function StorePage() {
  const [params, setParams] = useSearchParams();
  const { count } = useCart();

  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const species = params.get('species') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = React.useState(q);
  const [masAbierto, setMasAbierto] = React.useState(false);
  React.useEffect(() => setSearch(q), [q]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Cambiar un filtro y quedarse en la página 4 es la forma más fácil de ver
    // un catálogo vacío y creer que no hay nada.
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['marketplace-products', { q, category, species, page }],
    queryFn: () => listProducts({ q, category, species, page }),
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const limit = data?.limit || 24;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1080, margin: '0 auto' }}>
      <style>{`
        .tienda-chips { scrollbar-width: none; }
        .tienda-chips::-webkit-scrollbar { display: none; }
        .tienda-select { appearance: none; -webkit-appearance: none; }
      `}</style>

      {/* Cabecera con el perro y el gato a la derecha (maqueta del 2 nov 2026). */}
      <header style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 150px', alignItems: 'center', gap: 8, minHeight: 170 }}>
        <div style={{ display: 'grid', gap: 12, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ width: 46, height: 46, borderRadius: 14, background: '#14614F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', marginTop: 4 }}>
              <ShoppingBag size={24} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, lineHeight: 1.05, fontWeight: 800, margin: 0, color: PET_COLORS.ink }}>Tienda</h1>
              <p style={{ color: PET_COLORS.muted, fontSize: 13.5, lineHeight: 1.35, margin: '4px 0 0' }}>
                Lo que necesita tu mascota, de tiendas de la red. Cada compra deja Patitas para las protectoras.
              </p>
            </div>
          </div>
          <Link
            to="/carrito"
            style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 8, background: count ? PET_COLORS.coral : '#F8EEDC', color: count ? '#fff' : PET_COLORS.ink, border: `1px solid ${count ? PET_COLORS.coral : '#EFDFC2'}`, borderRadius: 14, padding: '10px 16px', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}
          >
            <ShoppingCart size={19} />
            {count ? `Carrito (${count})` : 'Carrito'}
          </Link>
        </div>
        <div aria-hidden style={{ position: 'relative', alignSelf: 'stretch' }}>
          <img src="/ilustraciones/tienda-perro-gato.jpg" alt="" style={{ position: 'absolute', right: -4, bottom: 0, width: 168, borderRadius: '0 0 18px 0', display: 'block' }} />
        </div>
      </header>

      <form
        onSubmit={event => {
          event.preventDefault();
          setParam('q', search.trim());
        }}
        style={{ display: 'grid', gap: 10 }}
      >
        <div style={{ position: 'relative' }}>
          <Search size={20} color={PET_COLORS.ink} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar pienso, juguetes, transportines…"
            aria-label="Buscar productos"
            style={{ width: '100%', height: 50, padding: '0 14px 0 46px', borderRadius: 16, border: `1px solid ${PET_COLORS.border}`, background: '#FFFFFF', color: PET_COLORS.ink, fontSize: 15, boxShadow: '0 4px 14px -10px rgba(31,55,40,.25)' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          {[
            { value: category, key: 'category', label: 'Categoría', options: [['', 'Todas las categorías'], ...PRODUCT_CATEGORIES.map(v => [v, CATEGORY_LABELS[v]])] },
            { value: species, key: 'species', label: 'Especie', options: [['', 'Perros y gatos'], ['dog', 'Perro'], ['cat', 'Gato']] },
          ].map(sel => (
            <label key={sel.key} style={{ position: 'relative', display: 'block' }}>
              <span className="sr-only">{sel.label}</span>
              <select
                className="tienda-select"
                value={sel.value}
                onChange={event => setParam(sel.key, event.target.value)}
                aria-label={sel.label}
                style={{ width: '100%', height: 48, padding: '0 38px 0 16px', borderRadius: 14, border: `1px solid ${PET_COLORS.border}`, background: '#FFFFFF', color: PET_COLORS.ink, fontSize: 15 }}
              >
                {sel.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <ChevronDown size={18} color={PET_COLORS.ink} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </label>
          ))}
        </div>
      </form>

      {/* Categorías con icono; se desliza de lado si no caben. */}
      <div className="tienda-chips" style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -16px', padding: '2px 16px 4px' }}>
        {[...CHIPS, ...(masAbierto ? PRODUCT_CATEGORIES.filter(c => !CHIPS.some(x => x.value === c)).map(c => ({ value: c, label: CATEGORY_LABELS[c], icon: <PawGlyph size={24} /> })) : [])].map(chip => {
          const activo = category === chip.value;
          return (
            <button
              key={chip.value || 'todo'}
              type="button"
              onClick={() => setParam('category', chip.value)}
              style={{ flex: 'none', display: 'grid', justifyItems: 'center', gap: 6, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: activo ? PET_COLORS.teal : PET_COLORS.ink }}
            >
              <span style={{ width: 62, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: activo ? '#14614F' : '#FFFFFF', color: activo ? '#FFFFFF' : PET_COLORS.ink, border: activo ? 0 : `1px solid ${PET_COLORS.border}`, boxShadow: '0 4px 12px -10px rgba(31,55,40,.3)' }}>
                {chip.icon}
              </span>
              <span style={{ fontSize: 13, fontWeight: activo ? 800 : 500 }}>{chip.label}</span>
            </button>
          );
        })}
        {!masAbierto && (
          <button type="button" onClick={() => setMasAbierto(true)} style={{ flex: 'none', display: 'grid', justifyItems: 'center', gap: 6, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: PET_COLORS.ink }}>
            <span style={{ width: 62, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', border: `1px solid ${PET_COLORS.border}` }}>
              <Ellipsis size={24} />
            </span>
            <span style={{ fontSize: 13 }}>Más</span>
          </button>
        )}
      </div>

      {/* Compra solidaria: el banner de Jorge en alta (2 nov 2026), con el texto también para lectores de pantalla. */}
      <section style={{ borderRadius: 20, overflow: 'hidden' }}>
        <h2 className="sr-only">Compra solidaria: cada compra suma Patitas. Ayuda a las protectoras con tus compras diarias.</h2>
        <img src="/ilustraciones/tienda-banner.jpg" alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />
      </section>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
        <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 21, fontWeight: 800, margin: 0, color: PET_COLORS.ink }}>
          {category ? CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || 'Productos' : 'Productos destacados'}
        </h2>
        {(q || category || species) && (
          <button type="button" onClick={() => setParams(new URLSearchParams())} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 0, padding: 0, color: '#14614F', fontWeight: 700, fontSize: 15, textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer' }}>
            Ver todo <ArrowRight size={16} />
          </button>
        )}
      </div>

      {isLoading && <p style={{ color: MPL.muted, fontSize: 13.5 }}>Cargando productos…</p>}
      {isError && (
        <p style={{ color: MPL.coralDark, fontSize: 13.5 }}>
          No hemos podido cargar la tienda. Inténtalo de nuevo en un momento.
        </p>
      )}

      {!isLoading && !isError && items.length === 0 && (
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
          {q || category || species
            ? 'No hay nada que encaje con esa búsqueda. Prueba con menos filtros.'
            : 'Todavía no hay productos a la venta. Estamos dando de alta tiendas de la red.'}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))',
        }}
      >
        {items.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setParam('page', String(page - 1))}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: `1px solid ${MPL.border}`,
              background: MPL.card,
              color: MPL.ink,
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            Anterior
          </button>
          <span style={{ color: MPL.muted, fontSize: 13 }}>
            Página {page} de {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setParam('page', String(page + 1))}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: `1px solid ${MPL.border}`,
              background: MPL.card,
              color: MPL.ink,
              opacity: page >= pages ? 0.5 : 1,
            }}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
