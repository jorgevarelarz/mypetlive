import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchPetProducts } from '../../api/animals';

/**
 * Sugerencias del catálogo bajo un campo de producto (comida o arena): se
 * tocan para elegir. Con el campo vacío enseña las más usadas para la especie.
 * No se usa <datalist>: en la app del iPhone no siempre aparece.
 */
export default function ProductSuggestions({
  q, kind, species, onPick, exclude = [],
}: {
  q: string;
  kind: 'food' | 'litter';
  species?: string;
  onPick: (name: string) => void;
  exclude?: string[];
}) {
  const [debounced, setDebounced] = React.useState(q);
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const { data = [] } = useQuery({
    queryKey: ['pet-products', kind, species || '', debounced],
    queryFn: () => searchPetProducts(debounced, kind, species),
    staleTime: 5 * 60_000,
  });
  const lower = exclude.map(e => e.toLowerCase());
  const items = data.filter(i => !lower.includes(i.name.toLowerCase()) && i.name.toLowerCase() !== q.trim().toLowerCase()).slice(0, 6);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }} aria-label="Sugerencias">
      {items.map(item => (
        <button
          key={item.name}
          type="button"
          onClick={() => onPick(item.name)}
          style={{
            padding: '6px 10px', borderRadius: 999, border: '1px solid #D7D0C2', background: '#FFFFFF',
            color: '#3F4A3C', fontSize: 13, fontWeight: 600, cursor: 'pointer', maxWidth: '100%',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}
