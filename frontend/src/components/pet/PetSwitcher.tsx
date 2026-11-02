import React from 'react';
import { Plus } from 'lucide-react';
import { PawMark } from '../../styles/mypetlive';
import { M } from './maqueta';
import { toAbsoluteUrl } from '../../utils/media';

type Pet = { _id?: string; id?: string; name?: string; images?: string[]; memorial?: { active?: boolean } | null };

/**
 * Fila de mascotas para cambiar de una a otra (inicio y «Mi mascota»), con el estilo de las
 * maquetas del 2 nov 2026: píldoras de 30 de alto con la foto redonda y el nombre; la elegida en
 * verde. Si no caben, la fila se desliza de lado. Al final, «+» para añadir otra.
 */
export default function PetSwitcher({
  pets,
  selectedId,
  onSelect,
  onAdd,
}: {
  pets: Pet[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
}) {
  const pill = (active: boolean): React.CSSProperties => ({
    flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px 0 4px', borderRadius: 15,
    border: `1px solid ${active ? '#9CC4BE' : '#EFE9E0'}`, background: active ? '#DDEDE8' : '#FFFFFF',
    color: active ? M.verdeBoton : M.tinta, fontFamily: M.letra, fontSize: 11, fontWeight: active ? 700 : 500, letterSpacing: 0,
    boxShadow: active ? 'none' : '0 2px 6px -3px rgba(60,45,30,.22)', cursor: 'pointer', whiteSpace: 'nowrap',
  });
  return (
    <div role="tablist" aria-label="Tus mascotas" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 5px 2px', width: '100%', scrollbarWidth: 'none' }}>
      {pets.map(pet => {
        const id = String(pet._id || pet.id || '');
        if (!id) return null;
        const active = id === selectedId;
        const img = pet.images?.[0];
        // La que ya no está: misma foto, más tenue. Sin iconos ni cintas.
        const inMemory = Boolean(pet.memorial?.active);
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={inMemory ? `${pet.name || 'Mascota'}, en su memoria` : undefined}
            onClick={() => onSelect(id)}
            style={pill(active)}
          >
            <span style={{ width: 22, height: 22, borderRadius: 999, overflow: 'hidden', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#E4EFEC', color: M.verde }}>
              {img ? (
                <img src={toAbsoluteUrl(img)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: inMemory ? 'grayscale(0.7)' : undefined, opacity: inMemory ? 0.85 : 1 }} />
              ) : (
                <PawMark size={12} />
              )}
            </span>
            <span style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{pet.name || 'Mascota'}</span>
          </button>
        );
      })}
      {onAdd && (
        <button type="button" onClick={onAdd} aria-label="Añadir otra mascota" style={{ ...pill(false), padding: '0 12px 0 6px', border: '1px dashed #D8D0C3', boxShadow: 'none' }}>
          <span style={{ width: 20, height: 20, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: M.gris }}>
            <Plus size={14} />
          </span>
          Añadir
        </button>
      )}
    </div>
  );
}
