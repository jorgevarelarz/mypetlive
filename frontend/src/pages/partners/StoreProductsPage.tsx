import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Package, Plus, Truck } from 'lucide-react';
import {
  CATEGORY_LABELS,
  PRODUCT_CATEGORIES,
  deleteProduct,
  myProducts,
  saveProduct,
  saveShippingConfig,
  type OwnProduct,
  type ProductCategory,
} from '../../api/marketplace';
import { useAuth } from '../../context/AuthContext';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { formatPriceEur } from '../../utils/limits';

// Panel de productos.
//
// La misma pantalla sirve a una tienda y al admin, porque el trabajo es el
// mismo; lo que cambia es que el admin lista en nombre de la plataforma y ahí
// sí existe un coste de proveedor. Ese coste no se le muestra nunca a nadie más
// (el servidor no lo devuelve en la API pública).

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  borderRadius: 10,
  border: `1px solid ${MPL.border}`,
  background: MPL.card,
  color: MPL.ink,
};

type FormState = {
  id?: string;
  name: string;
  description: string;
  category: ProductCategory;
  species: string[];
  priceEur: string;
  costEur: string;
  stock: string;
  images: string;
  active: boolean;
  listedBy: 'partner' | 'platform';
};

const emptyForm = (isAdmin: boolean): FormState => ({
  name: '',
  description: '',
  category: 'comida',
  species: [],
  priceEur: '',
  costEur: '',
  stock: '0',
  images: '',
  active: true,
  listedBy: isAdmin ? 'platform' : 'partner',
});

const SAVE_ERRORS: Record<string, string> = {
  name_required: 'El producto necesita un nombre.',
  invalid_price: 'Revisa el precio: mínimo 0,50 €.',
  price_below_cost: 'El precio de venta está por debajo del coste. Eso siempre es un dedazo.',
  not_a_store: 'Tu cuenta no es de tienda.',
  forbidden: 'Ese producto no es tuyo.',
};

/** Portes de la tienda: sin ellos no se puede vender con envío. */
function ShippingCard() {
  const { user, updateUser } = useAuth();
  const current = (user as any)?.profile?.marketplace || {};
  const [shippingEur, setShippingEur] = React.useState(
    current.shippingEur === undefined ? '' : String(current.shippingEur),
  );
  const [freeFromEur, setFreeFromEur] = React.useState(
    current.freeFromEur === undefined ? '' : String(current.freeFromEur),
  );
  const configured = current.shippingEur !== undefined;

  const mutation = useMutation({
    mutationFn: () =>
      saveShippingConfig(String(user?._id), {
        shippingEur: Number(shippingEur),
        freeFromEur: freeFromEur === '' ? null : Number(freeFromEur),
      }),
    onSuccess: updated => {
      toast.success('Portes guardados');
      // Sin refrescar la cuenta en sesión, la tarjeta seguiría avisando de que
      // faltan los portes que se acaban de guardar.
      if (updated) updateUser(updated);
    },
    onError: () => toast.error('No hemos podido guardar los portes'),
  });

  return (
    <div
      style={{
        background: configured ? MPL.card : MPL.gold100,
        border: `1px solid ${configured ? MPL.border : MPL.gold}`,
        borderRadius: 14,
        padding: 14,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Truck size={18} color={MPL.tealDark} />
        <strong style={{ fontSize: 14.5 }}>Gastos de envío de tu tienda</strong>
      </div>
      {!configured && (
        <p style={{ margin: 0, fontSize: 13, color: MPL.ink }}>
          Antes de poner el primer producto a la venta, dinos qué cobras por el envío. Sin esto no podemos
          calcular el total de un pedido.
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '0 1 160px' }}>
          Portes (€)
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={shippingEur}
            onChange={event => setShippingEur(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '0 1 200px' }}>
          Envío gratis desde (€, opcional)
          <input
            type="number"
            min={0}
            max={1000}
            step="0.01"
            value={freeFromEur}
            onChange={event => setFreeFromEur(event.target.value)}
            style={inputStyle}
          />
        </label>
        <button
          type="button"
          disabled={shippingEur === '' || mutation.isPending}
          onClick={() => mutation.mutate()}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: shippingEur === '' ? MPL.faint : MPL.teal,
            color: '#fff',
            fontWeight: 800,
            cursor: shippingEur === '' ? 'default' : 'pointer',
          }}
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

export default function StoreProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<FormState | null>(null);

  const { data, isLoading, isError } = useQuery({ queryKey: ['marketplace-mine'], queryFn: myProducts });
  const products = data || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['marketplace-mine'] });

  const save = useMutation({
    mutationFn: (state: FormState) =>
      saveProduct({
        id: state.id,
        listedBy: state.listedBy,
        name: state.name.trim(),
        description: state.description.trim() || undefined,
        category: state.category,
        species: state.species,
        priceEur: state.priceEur === '' ? undefined : Number(state.priceEur),
        costEur: state.costEur === '' ? undefined : Number(state.costEur),
        stock: Number(state.stock) || 0,
        images: state.images
          .split(/[\n,]/)
          .map(url => url.trim())
          .filter(Boolean),
        active: state.active,
      }),
    onSuccess: async () => {
      toast.success('Producto guardado');
      setForm(null);
      await invalidate();
    },
    onError: (error: any) => {
      const code = error?.response?.data?.error;
      toast.error(SAVE_ERRORS[code] || 'No hemos podido guardar el producto');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: async result => {
      toast.success(
        result.retired
          ? 'Producto retirado de la venta. Se conserva porque tiene pedidos.'
          : 'Producto borrado',
      );
      await invalidate();
    },
    onError: () => toast.error('No hemos podido borrar el producto'),
  });

  const edit = (product: OwnProduct) =>
    setForm({
      id: product._id,
      name: product.name,
      description: product.description || '',
      category: product.category,
      species: product.species || [],
      priceEur: String(product.priceEur),
      costEur: product.costEur === undefined ? '' : String(product.costEur),
      stock: String(product.stock),
      images: (product.images || []).join('\n'),
      active: product.active,
      listedBy: product.listedBy,
    });

  const toggleSpecies = (value: string) =>
    setForm(current =>
      current
        ? {
            ...current,
            species: current.species.includes(value)
              ? current.species.filter(item => item !== value)
              : [...current.species, value],
          }
        : current,
    );

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 820, margin: '0 auto' }}>
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
          <Package size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 25, fontWeight: 800, margin: 0 }}>
            {isAdmin ? 'Productos del marketplace' : 'Mis productos'}
          </h1>
          <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
            {isAdmin
              ? 'Todo lo que hay a la venta. Lo que listamos nosotros lleva coste de proveedor y nos convierte en vendedores.'
              : 'Lo que vendes con envío en MyPetLive. Tú facturas y respondes de la garantía; nosotros retenemos la comisión.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm(emptyForm(!!isAdmin))}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 12,
            border: 'none',
            background: MPL.coral,
            color: '#fff',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          <Plus size={18} /> Nuevo producto
        </button>
      </header>

      {!isAdmin && <ShippingCard />}

      {form && (
        <form
          onSubmit={event => {
            event.preventDefault();
            save.mutate(form);
          }}
          style={{
            background: MPL.card,
            border: `1px solid ${MPL.border}`,
            borderRadius: 14,
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <strong style={{ fontSize: 15 }}>{form.id ? 'Editar producto' : 'Nuevo producto'}</strong>

          <input
            required
            placeholder="Nombre del producto"
            aria-label="Nombre del producto"
            value={form.name}
            onChange={event => setForm({ ...form, name: event.target.value })}
            style={inputStyle}
          />
          <textarea
            placeholder="Descripción (opcional)"
            aria-label="Descripción"
            value={form.description}
            onChange={event => setForm({ ...form, description: event.target.value })}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '0 1 170px' }}>
              Categoría
              <select
                value={form.category}
                onChange={event => setForm({ ...form, category: event.target.value as ProductCategory })}
                style={inputStyle}
              >
                {PRODUCT_CATEGORIES.map(value => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '0 1 130px' }}>
              Precio (€)
              <input
                type="number"
                min={0.5}
                max={1000}
                step="0.01"
                value={form.priceEur}
                onChange={event => setForm({ ...form, priceEur: event.target.value })}
                style={inputStyle}
              />
            </label>
            {form.listedBy === 'platform' && (
              <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '0 1 150px' }}>
                Coste proveedor (€)
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  value={form.costEur}
                  onChange={event => setForm({ ...form, costEur: event.target.value })}
                  style={inputStyle}
                />
              </label>
            )}
            <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '0 1 110px' }}>
              Existencias
              <input
                type="number"
                min={0}
                value={form.stock}
                onChange={event => setForm({ ...form, stock: event.target.value })}
                style={inputStyle}
              />
            </label>
          </div>

          {form.listedBy === 'platform' && !form.priceEur && (
            <p style={{ margin: 0, fontSize: 12.5, color: MPL.muted }}>
              Si dejas el precio en blanco, se calcula aplicando el sobrecoste por defecto al coste.
            </p>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
            <span style={{ color: MPL.muted }}>Para:</span>
            {[
              { value: 'dog', label: 'Perro' },
              { value: 'cat', label: 'Gato' },
            ].map(option => (
              <label key={option.value} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={form.species.includes(option.value)}
                  onChange={() => toggleSpecies(option.value)}
                />
                {option.label}
              </label>
            ))}
            <span style={{ color: MPL.faint, fontSize: 12 }}>Sin marcar nada, vale para todos.</span>
          </div>

          <textarea
            placeholder="URLs de imágenes, una por línea (opcional)"
            aria-label="Imágenes"
            value={form.images}
            onChange={event => setForm({ ...form, images: event.target.value })}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={event => setForm({ ...form, active: event.target.checked })}
            />
            A la venta
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={save.isPending}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                border: 'none',
                background: MPL.teal,
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                border: `1px solid ${MPL.border}`,
                background: MPL.card,
                color: MPL.ink,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {isLoading && <p style={{ color: MPL.muted, fontSize: 13.5 }}>Cargando…</p>}
      {isError && <p style={{ color: MPL.coralDark, fontSize: 13.5 }}>No hemos podido cargar tus productos.</p>}

      {!isLoading && !isError && products.length === 0 && (
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
          Todavía no has puesto nada a la venta.
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {products.map(product => (
          <div
            key={product._id}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              flexWrap: 'wrap',
              background: MPL.card,
              border: `1px solid ${MPL.border}`,
              borderRadius: 14,
              padding: 12,
              opacity: product.active ? 1 : 0.65,
            }}
          >
            <div style={{ flex: 1, minWidth: 180, display: 'grid', gap: 2 }}>
              <strong style={{ fontSize: 14.5 }}>{product.name}</strong>
              <span style={{ color: MPL.muted, fontSize: 12.5 }}>
                {CATEGORY_LABELS[product.category]} · {product.stock} en stock
                {product.active ? '' : ' · retirado'}
                {isAdmin && product.listedBy === 'platform' ? ' · lo vendemos nosotros' : ''}
              </span>
              {isAdmin && product.costEur !== undefined && (
                <span style={{ color: MPL.faint, fontSize: 12 }}>
                  Coste {formatPriceEur(product.costEur)} · margen{' '}
                  {formatPriceEur(product.priceEur - product.costEur)}
                </span>
              )}
            </div>
            <span style={{ fontWeight: 800 }}>{formatPriceEur(product.priceEur)}</span>
            <button
              type="button"
              onClick={() => edit(product)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${MPL.border}`,
                background: MPL.card,
                color: MPL.ink,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`¿Quitar "${product.name}" de la venta?`)) remove.mutate(product._id);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: `1px solid ${MPL.border}`,
                background: MPL.card,
                color: MPL.coralDark,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
