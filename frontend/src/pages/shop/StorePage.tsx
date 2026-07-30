import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag, ShoppingCart, Search } from 'lucide-react';
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

function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      to={`/tienda/${product.id}`}
      style={{
        display: 'grid',
        gap: 8,
        background: MPL.card,
        border: `1px solid ${MPL.border}`,
        borderRadius: 14,
        padding: 12,
        color: MPL.ink,
        textDecoration: 'none',
      }}
    >
      <div
        style={{
          aspectRatio: '1 / 1',
          borderRadius: 10,
          background: MPL.panel,
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
          <ShoppingBag size={28} color={MPL.faint} />
        )}
      </div>
      <span style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.25 }}>{product.name}</span>
      <span style={{ color: MPL.muted, fontSize: 12.5 }}>
        {CATEGORY_LABELS[product.category] || 'Otros'}
        {product.species.length ? ` · ${product.species.map(speciesLabel).join(', ')}` : ''}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>{formatPriceEur(product.priceEur)}</span>
        {/* Quién vende importa: es quien factura y a quien se le reclama. */}
        <span style={{ color: MPL.faint, fontSize: 12 }}>
          {product.seller ? product.seller.name : 'MyPetLive'}
        </span>
      </div>
      {product.stock <= 3 && (
        <span style={{ color: MPL.coralDark, fontSize: 12, fontWeight: 700 }}>
          Quedan {product.stock}
        </span>
      )}
    </Link>
  );
}

export default function StorePage() {
  const [params, setParams] = useSearchParams();
  const { count } = useCart();

  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const species = params.get('species') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [search, setSearch] = React.useState(q);
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
          <ShoppingBag size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, margin: 0 }}>Tienda</h1>
          <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
            Lo que necesita tu mascota, de tiendas de la red. Cada compra deja Patitas para las protectoras.
          </p>
        </div>
        <Link
          to="/carrito"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: count ? MPL.coral : MPL.panel,
            color: count ? '#fff' : MPL.ink,
            border: `1px solid ${count ? MPL.coral : MPL.border}`,
            borderRadius: 12,
            padding: '10px 14px',
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          <ShoppingCart size={18} />
          {count ? `Carrito (${count})` : 'Carrito'}
        </Link>
      </header>

      <form
        onSubmit={event => {
          event.preventDefault();
          setParam('q', search.trim());
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search
            size={16}
            color={MPL.faint}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar pienso, arena, juguetes…"
            aria-label="Buscar productos"
            style={{
              width: '100%',
              padding: '10px 12px 10px 34px',
              borderRadius: 12,
              border: `1px solid ${MPL.border}`,
              background: MPL.card,
              color: MPL.ink,
            }}
          />
        </div>
        <select
          value={category}
          onChange={event => setParam('category', event.target.value)}
          aria-label="Categoría"
          style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${MPL.border}`, background: MPL.card, color: MPL.ink }}
        >
          <option value="">Todas las categorías</option>
          {PRODUCT_CATEGORIES.map(value => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          value={species}
          onChange={event => setParam('species', event.target.value)}
          aria-label="Especie"
          style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${MPL.border}`, background: MPL.card, color: MPL.ink }}
        >
          <option value="">Perros y gatos</option>
          <option value="dog">Perro</option>
          <option value="cat">Gato</option>
        </select>
      </form>

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
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
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
