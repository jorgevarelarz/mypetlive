import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { optionClickUrl, whereToBuy } from '../../api/shop';
import { MPL } from '../../styles/mypetlive';
import { formatPriceEur } from '../../utils/limits';

// Aterrizaje del enlace "dónde comprarlo" del aviso de existencias bajas.
//
// Nació como una lista a secas, cuando no había marketplace: solo podía decir
// qué tiendas dicen tener el producto. Ahora lo primero que ofrece es lo que se
// puede **comprar y recibir en casa**, porque el aviso llega justo cuando algo se
// está acabando y ahí una lista de sitios no resuelve nada.
//
// Las tiendas que solo lo tienen en el catálogo de su TPV siguen apareciendo
// debajo: es lo que cubre a la tienda de barrio que no vende online.

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
  const buyable = options.filter(option => option.source === 'marketplace');
  const listed = options.filter(option => option.source !== 'marketplace');

  return (
    <div className="grid gap-4 p-4" style={{ color: MPL.ink }}>
      <header className="grid gap-1">
        <Link to="/pet" className="text-sm font-medium" style={{ color: MPL.teal }}>
          Volver a mi mascota
        </Link>
        <h1 className="text-2xl font-semibold">Dónde comprar {product || 'lo que te falta'}</h1>
        <p className="text-sm" style={{ color: MPL.faint }}>
          Lo que podemos enviarte y las tiendas de MyPetLive que lo tienen. Al pagar en tienda, enseña tu código
          para que la compra sume Patitas.
        </p>
      </header>

      {!product && (
        <p className="text-sm" style={{ color: MPL.faint }}>
          Entra desde el aviso de tu despensa o dinos qué producto buscas.
        </p>
      )}

      {isLoading && <p className="text-sm">Buscando…</p>}
      {isError && <p className="text-sm">No hemos podido consultar las tiendas. Inténtalo de nuevo.</p>}

      {!!product && !isLoading && options.length === 0 && (
        <div className="border p-4" style={{ borderColor: MPL.border, borderRadius: 12, background: MPL.card }}>
          <p className="text-sm">
            Todavía no tenemos ese producto ni hay ninguna tienda de la red que lo tenga en su catálogo. Si
            conoces una que te guste, dínoslo y la invitamos.
          </p>
          <Link to="/tienda" className="text-sm font-semibold" style={{ color: MPL.teal }}>
            Ver todo lo que sí hay en la tienda
          </Link>
        </div>
      )}

      {buyable.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold" style={{ color: MPL.muted }}>
            Te lo enviamos a casa
          </h2>
          {buyable.map(option => (
            <a
              key={option.productId}
              href={optionClickUrl(option, product, 'comprar')}
              className="border p-4 grid gap-1"
              style={{
                borderColor: MPL.teal,
                borderRadius: 12,
                background: MPL.card,
                color: MPL.ink,
                textDecoration: 'none',
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{option.item}</span>
                {option.priceEur !== undefined && (
                  <span className="font-semibold">{formatPriceEur(option.priceEur)}</span>
                )}
              </div>
              <span className="text-sm" style={{ color: MPL.faint }}>
                Vende {option.partnerName}
                {option.city ? ` · ${option.city}` : ''}
              </span>
              <span className="text-sm font-semibold" style={{ color: MPL.teal }}>
                Ver y comprar →
              </span>
            </a>
          ))}
        </section>
      )}

      {listed.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold" style={{ color: MPL.muted }}>
            {buyable.length > 0 ? 'También lo tienen en tienda' : 'Tiendas que lo tienen'}
          </h2>
          {listed.map(option => {
            const isHighlighted = option.partnerId === highlighted;
            return (
              <div
                key={option.partnerId}
                className="border p-4 grid gap-1"
                style={{
                  borderColor: isHighlighted ? MPL.teal : MPL.border,
                  borderRadius: 12,
                  background: MPL.card,
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{option.partnerName}</span>
                  {option.priceEur !== undefined && (
                    <span className="font-semibold">{formatPriceEur(option.priceEur)}</span>
                  )}
                </div>
                <span className="text-sm" style={{ color: MPL.faint }}>
                  {option.item}
                  {option.city ? ` · ${option.city}` : ''}
                </span>
                {!!option.coupon && (
                  <span className="text-sm" style={{ color: MPL.coralDark }}>
                    Cupón disponible: {option.coupon.discount}
                  </span>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
