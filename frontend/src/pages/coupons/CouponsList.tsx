import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listCoupons, Coupon } from '../../api/coupons';
import SelectProtectoraModal from '../../components/protectora/SelectProtectoraModal';
import { loadPreferredProtectora, savePreferredProtectora, type PreferredProtectora } from '../../utils/preferredProtectora';

export default function CouponsList() {
  const { data, isLoading } = useQuery({ queryKey: ['coupons'], queryFn: listCoupons });
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [preferredProtectora, setPreferredProtectoraState] = useState<PreferredProtectora | null>(() => loadPreferredProtectora());
  const setPreferredProtectora = (value: PreferredProtectora | null) => {
    setPreferredProtectoraState(value);
    savePreferredProtectora(value);
  };
  const handleProtectoraSelected = (option: PreferredProtectora) => {
    setPreferredProtectora(option);
    setSelectorOpen(false);
  };
  const coupons = data?.items || [];

  return (
    <div className="p-4 grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold" style={{ color: '#3F4A3C' }}>Cupones disponibles</h1>
        <p className="text-sm" style={{ color: '#7A8273' }}>Enseña el cupón en la tienda o veterinario asociado y aplica tus Patitas.</p>
        <div className="mt-2 text-xs" style={{ color: '#6A7B4F' }}>
          Usando este cupón estás echando Patitas a la protectora que elijas 🤍
          {preferredProtectora ? ` · ${preferredProtectora.name}` : ''}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setSelectorOpen(true)}
            style={{ textUnderlineOffset: 3 }}
          >
            {preferredProtectora ? 'Cambiar protectora' : 'Elegir protectora'}
          </button>
        </div>
      </header>
      {isLoading ? (
        <div>Cargando cupones…</div>
      ) : coupons.length === 0 ? (
        <div className="text-sm" style={{ color: '#7A8273' }}>Aún no hay cupones activos.</div>
      ) : (
        <div className="grid gap-3">
          {coupons.map(coupon => {
            const copyText = coupon.copy || coupon.title;
            return (
              <div
                key={coupon._id}
                className="p-4 border"
                style={{ borderColor: '#E7E1D5', borderRadius: 16, background: '#FFFFFF' }}
              >
              <div className="text-xs uppercase" style={{ color: '#7A8273', letterSpacing: '0.08em' }}>
                {coupon.partnerType === 'store' ? 'Tienda' : 'Veterinario'}
              </div>
              <h2 className="text-lg font-medium" style={{ color: '#3F4A3C' }}>{copyText}</h2>
              {coupon.description ? (
                <p className="text-sm" style={{ color: '#3F4A3C' }}>{coupon.description}</p>
              ) : null}
              {coupon.targetAnimalCode && (
                <p className="text-xs" style={{ color: '#6A7B4F' }}>Mascota: {coupon.targetAnimalCode}</p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-base font-semibold" style={{ color: '#3F4A3C' }}>{coupon.discount}</span>
                <button
                  type="button"
                  onClick={() => setSelected(coupon)}
                  className="text-sm"
                >
                  Mostrar en tienda
                </button>
              </div>
                <p className="text-xs mt-2" style={{ color: '#7A8273' }}>Al usar este cupón estarás ayudando a una protectora 🐾🤍</p>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 border" style={{ borderColor: '#E7E1D5' }}>
            <h3 className="text-xl font-semibold" style={{ color: '#3F4A3C' }}>{selected.copy || selected.title}</h3>
            <p className="mt-2 text-sm" style={{ color: '#3F4A3C' }}>{selected.description}</p>
            {selected.targetAnimalCode && (
              <p className="mt-1 text-xs" style={{ color: '#6A7B4F' }}>Solo para la mascota: {selected.targetAnimalCode}</p>
            )}
            <div className="mt-4 text-2xl font-bold" style={{ color: '#3F4A3C' }}>{selected.discount}</div>
            <p className="mt-4 text-sm" style={{ color: '#7A8273' }}>Enseña esta pantalla en la tienda para aplicar la Patita.</p>
            <p className="mt-2 text-xs" style={{ color: '#7A8273' }}>Al usar este cupón estarás ayudando a una protectora 🐾🤍</p>
            <button type="button" className="mt-4" onClick={() => setSelected(null)}>Cerrar</button>
          </div>
        </div>
      )}

      <SelectProtectoraModal
        open={selectorOpen}
        selectedId={preferredProtectora?.id}
        onClose={() => setSelectorOpen(false)}
        onConfirm={handleProtectoraSelected}
      />
    </div>
  );
}
