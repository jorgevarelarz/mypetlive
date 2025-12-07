import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listProtectoras, type ProtectoraOption } from '../../api/protectoras';

type Props = {
  open: boolean;
  selectedId?: string;
  onClose: () => void;
  onConfirm: (option: ProtectoraOption) => void;
  title?: string;
};

export default function SelectProtectoraModal({ open, selectedId, onClose, onConfirm, title }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['protectoras-options'],
    queryFn: listProtectoras,
    enabled: open,
    staleTime: 60_000,
  });

  const options = useMemo(() => data?.items || [], [data]);
  const [value, setValue] = useState<string>(selectedId || '');

  useEffect(() => {
    if (!open) return;
    if (selectedId) {
      setValue(selectedId);
      return;
    }
    if (!value && options.length > 0) {
      setValue(options[0].id);
    }
  }, [open, selectedId, options, value]);

  if (!open) return null;

  const handleConfirm = () => {
    const option = options.find(opt => opt.id === value);
    if (!option) return;
    onConfirm(option);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 border" style={{ borderColor: '#E7E1D5' }}>
        <h2 className="text-xl font-semibold" style={{ color: '#3F4A3C' }}>
          {title || 'Selecciona una protectora'}
        </h2>
        {isLoading ? (
          <p className="mt-3 text-sm" style={{ color: '#7A8273' }}>Cargando opciones…</p>
        ) : options.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: '#7A8273' }}>Aún no hay protectoras disponibles.</p>
        ) : (
          <label className="mt-3 grid gap-1 text-sm" style={{ color: '#3F4A3C' }}>
            Protectora
            <select
              value={value}
              onChange={e => setValue(e.target.value)}
              className="border rounded px-3 py-2"
              style={{ borderColor: '#E7E1D5' }}
            >
              <option value="">Selecciona una opción</option>
              {options.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" onClick={handleConfirm} disabled={!value || options.length === 0}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
