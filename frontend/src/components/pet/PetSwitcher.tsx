import React from 'react';
import { Plus } from 'lucide-react';
import { MPL, PawMark } from '../../styles/mypetlive';
import { toAbsoluteUrl } from '../../utils/media';

type Pet = { _id?: string; id?: string; name?: string; images?: string[] };

/**
 * Fila de mascotas para cambiar de una a otra (inicio y «Mi mascota»): foto
 * redonda y nombre, la elegida con aro. Al final, «+» para añadir otra.
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
  const circle: React.CSSProperties = {
    width: 56, height: 56, borderRadius: 999, overflow: 'hidden', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: MPL.teal100, color: MPL.teal,
  };
  return (
    <div role="tablist" aria-label="Tus mascotas" style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '4px 2px 6px' }}>
      {pets.map(pet => {
        const id = String(pet._id || pet.id || '');
        if (!id) return null;
        const active = id === selectedId;
        const img = pet.images?.[0];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(id)}
            style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 64, flexShrink: 0, font: 'inherit' }}
          >
            <span style={{ ...circle, boxShadow: active ? `0 0 0 3px ${MPL.bg}, 0 0 0 5px ${MPL.teal}` : 'none' }}>
              {img ? (
                <img src={toAbsoluteUrl(img)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <PawMark size={24} />
              )}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: active ? 800 : 600, color: active ? MPL.ink : MPL.muted, maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pet.name || 'Mascota'}
            </span>
          </button>
        );
      })}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Añadir otra mascota"
          style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 64, flexShrink: 0, font: 'inherit' }}
        >
          <span style={{ ...circle, background: '#fff', border: `1.5px dashed ${MPL.border}`, color: MPL.muted }}>
            <Plus size={22} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: MPL.muted }}>Añadir</span>
        </button>
      )}
    </div>
  );
}
