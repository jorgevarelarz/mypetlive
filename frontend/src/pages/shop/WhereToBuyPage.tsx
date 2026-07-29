import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { whereToBuy } from '../../api/shop';

// Aterrizaje del enlace "dónde comprarlo" del aviso de existencias bajas.
//
// Es deliberadamente una lista y no un carrito: mientras no haya datos de que la
// gente pincha, montar pagos, stock y logística sería construir sobre una
// suposición. Lo que sí hay es el precio de cada tienda y su cupón, que ya viven
// en el catálogo del TPV.

export default function WhereToBuyPage() {
  const [params] = useSearchParams();
  const product = params.get('producto') || '';
  const highlighted = params.get('tienda') || '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['where-to-buy', product],
    queryFn: () => whereToBuy(product),
    enabled: !!product,
  });

  const options = data?.options || [];

  return (
    <div className="grid gap-4 p-4" style={{ color: '#3F4A3C' }}>
      <header className="grid gap-1">
        <Link to="/pet" className="text-sm font-medium" style={{ color: '#1F6F6F' }}>
          Volver a mi mascota
        </Link>
        <h1 className="text-2xl font-semibold">Dónde comprar {product || 'lo que te falta'}</h1>
        <p className="text-sm" style={{ color: '#7A8273' }}>
          Tiendas de MyPetLive que lo tienen en su catálogo. Al pagar, enseña tu código para que la compra sume
          Patitas.
        </p>
      </header>

      {!product && (
        <p className="text-sm" style={{ color: '#7A8273' }}>
          Entra desde el aviso de tu despensa o dinos qué producto buscas.
        </p>
      )}

      {isLoading && <p className="text-sm">Buscando tiendas…</p>}
      {isError && <p className="text-sm">No hemos podido consultar las tiendas. Inténtalo de nuevo.</p>}

      {!!product && !isLoading && options.length === 0 && (
        <div className="border p-4" style={{ borderColor: '#E7E1D5', borderRadius: 12, background: '#FFFFFF' }}>
          <p className="text-sm">
            Todavía ninguna tienda de la red tiene ese producto en su catálogo. Si conoces una que te guste,
            dínoslo y la invitamos.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        {options.map(option => {
          const isHighlighted = option.partnerId === highlighted;
          return (
            <div
              key={option.partnerId}
              className="border p-4 grid gap-1"
              style={{
                borderColor: isHighlighted ? '#1F6F6F' : '#E7E1D5',
                borderRadius: 12,
                background: '#FFFFFF',
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{option.partnerName}</span>
                {option.priceEur !== undefined && (
                  <span className="font-semibold">{option.priceEur.toFixed(2).replace('.', ',')} €</span>
                )}
              </div>
              <span className="text-sm" style={{ color: '#7A8273' }}>
                {option.item}
                {option.city ? ` · ${option.city}` : ''}
              </span>
              {!!option.coupon && (
                <span className="text-sm" style={{ color: '#8F2F2F' }}>
                  Cupón disponible: {option.coupon.discount}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
