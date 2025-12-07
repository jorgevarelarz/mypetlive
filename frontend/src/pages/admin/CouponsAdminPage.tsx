import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  getAllCoupons,
  getCouponPartners,
  createCoupon,
  updateCoupon,
  toggleCoupon,
  type AdminCoupon,
} from '../../api/coupons.admin';

type CouponForm = {
  copy: string;
  discount: string;
  partnerId: string;
  targetAnimalCode: string;
  expiresAt: string;
};

const INITIAL_FORM: CouponForm = {
  copy: '',
  discount: '',
  partnerId: '',
  targetAnimalCode: '',
  expiresAt: '',
};

export default function CouponsAdminPage() {
  const queryClient = useQueryClient();
  const { data: couponsData, isLoading } = useQuery({ queryKey: ['admin-coupons'], queryFn: getAllCoupons });
  const { data: partnersData } = useQuery({ queryKey: ['admin-coupon-partners'], queryFn: getCouponPartners, staleTime: 60_000 });
  const partners = partnersData?.items || [];
  const couponItems = couponsData?.items || [];

  const [isModalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CouponForm>(INITIAL_FORM);
  const [editing, setEditing] = useState<AdminCoupon | null>(null);

  const sortedCoupons = [...couponItems].sort((a, b) => {
    if (a.active === b.active) return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    return a.active ? -1 : 1;
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(INITIAL_FORM);
  };

  const openCreateModal = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
    setModalOpen(true);
  };

  const openEditModal = (coupon: AdminCoupon) => {
    setEditing(coupon);
    setForm({
      copy: coupon.copy || '',
      discount: coupon.discount || '',
      partnerId: coupon.partnerId,
      targetAnimalCode: coupon.targetAnimalCode || '',
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : '',
    });
    setModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.copy.trim() || !form.discount.trim() || !form.partnerId) {
        throw new Error('Completa copy, descuento y partner.');
      }
      const payload = {
        copy: form.copy.trim(),
        discount: form.discount.trim(),
        partnerId: form.partnerId,
        targetAnimalCode: form.targetAnimalCode.trim() || undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      };
      if (editing) {
        return updateCoupon(editing._id, payload);
      }
      return createCoupon(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Cupón actualizado' : 'Cupón creado');
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.message || 'No se pudo guardar el cupón');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (coupon: AdminCoupon) => toggleCoupon(coupon._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
    },
    onError: () => toast.error('No se pudo actualizar el estado'),
  });

  const partnerName = (coupon: AdminCoupon) => {
    if (coupon.partner?.name) return coupon.partner.name;
    const partner = partners.find(p => p._id === coupon.partnerId);
    return partner?.name || 'Partner';
  };

  return (
    <div style={{ padding: 24, background: '#F9F6EE', minHeight: '100vh' }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: '#3F4A3C' }}>Cupones</h1>
          <p className="text-sm" style={{ color: '#7A8273' }}>Gestiona los beneficios para tiendas y veterinarios.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2 rounded-full text-sm"
          style={{ background: '#3F4A3C', color: '#FDFBF4' }}
        >
          Crear cupón
        </button>
      </div>

      {isLoading ? (
        <div style={{ marginTop: 24 }}>Cargando cupones…</div>
      ) : (
        <div className="grid gap-4 mt-6">
      {sortedCoupons.map(coupon => (
            <div
              key={coupon._id}
              className="p-4 rounded-2xl shadow-sm"
              style={{ background: '#FFFDF7', border: '1px solid #E7E1D5' }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm uppercase tracking-wide" style={{ color: '#7A8273' }}>
                    {coupon.partnerType === 'store' ? 'Tienda' : 'Veterinario'}
                  </p>
                  <h2 className="text-lg font-semibold" style={{ color: '#3F4A3C' }}>{coupon.copy || 'Cupón'}</h2>
                  <p className="text-sm" style={{ color: '#7A8273' }}>{partnerName(coupon)}</p>
                  <p className="text-sm" style={{ color: '#3F4A3C' }}>Descuento: {coupon.discount}</p>
                  {coupon.targetAnimalCode && (
                    <p className="text-xs" style={{ color: '#6A7B4F' }}>Código mascota: {coupon.targetAnimalCode}</p>
                  )}
                  {coupon.expiresAt && (
                    <p className="text-xs" style={{ color: '#7A8273' }}>
                      Expira: {new Date(coupon.expiresAt).toLocaleDateString()}
                    </p>
                  )}
                  <p className="text-xs" style={{ color: '#7A8273' }}>
                    {coupon.active ? 'Activo' : 'Inactivo'}
                    {coupon.usedAt ? ` · Usado el ${new Date(coupon.usedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(coupon)}
                    className="px-3 py-1 rounded-full text-sm border"
                    style={{ borderColor: '#C7D2B9', color: '#3F4A3C' }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate(coupon)}
                    className="px-3 py-1 rounded-full text-sm"
                    style={{ background: coupon.active ? '#EBF2D9' : '#F0E4DA', color: '#3F4A3C' }}
                  >
                    {coupon.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
              <p className="text-xs mt-3" style={{ color: '#7A8273' }}>Al usar este cupón estarás ayudando a una protectora 🐾🤍</p>
            </div>
          ))}
          {!sortedCoupons.length && (
            <div className="p-4 rounded-2xl border" style={{ borderColor: '#E7E1D5', background: '#FFFDF7' }}>
              Aún no hay cupones registrados.
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-2xl p-5 shadow-lg" style={{ background: '#FFFDF7', border: '1px solid #E7E1D5' }}>
            <h3 className="text-xl font-semibold" style={{ color: '#3F4A3C' }}>
              {editing ? 'Editar cupón' : 'Crear cupón'}
            </h3>
            <div className="grid gap-3 mt-4 text-sm">
              <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
                Copy
                <input
                  className="border rounded px-3 py-2"
                  style={{ borderColor: '#D9D2C4', background: '#FFFEFB' }}
                  value={form.copy}
                  onChange={e => setForm(prev => ({ ...prev, copy: e.target.value }))}
                />
              </label>
              <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
                Descuento
                <input
                  className="border rounded px-3 py-2"
                  style={{ borderColor: '#D9D2C4', background: '#FFFEFB' }}
                  value={form.discount}
                  onChange={e => setForm(prev => ({ ...prev, discount: e.target.value }))}
                />
              </label>
              <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
                Partner
                <select
                  className="border rounded px-3 py-2"
                  style={{ borderColor: '#D9D2C4', background: '#FFFEFB' }}
                  value={form.partnerId}
                  onChange={e => setForm(prev => ({ ...prev, partnerId: e.target.value }))}
                >
                  <option value="">Selecciona una tienda o vet</option>
                  {partners.map(partner => (
                    <option key={partner._id} value={partner._id}>
                      {partner.name || partner.email} · {partner.role === 'store' ? 'Tienda' : 'Vet'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
                Código de mascota (opcional)
                <input
                  className="border rounded px-3 py-2"
                  style={{ borderColor: '#D9D2C4', background: '#FFFEFB' }}
                  value={form.targetAnimalCode}
                  onChange={e => setForm(prev => ({ ...prev, targetAnimalCode: e.target.value.toUpperCase() }))}
                  placeholder="EJEMPLO-123"
                />
              </label>
              <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
                Expira el (opcional)
                <input
                  type="date"
                  className="border rounded px-3 py-2"
                  style={{ borderColor: '#D9D2C4', background: '#FFFEFB' }}
                  value={form.expiresAt}
                  onChange={e => setForm(prev => ({ ...prev, expiresAt: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={closeModal} className="px-4 py-2 rounded-full text-sm" style={{ border: '1px solid #D7CAB8', color: '#3F4A3C' }}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                className="px-4 py-2 rounded-full text-sm"
                style={{ background: '#3F4A3C', color: '#FDFBF4' }}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
