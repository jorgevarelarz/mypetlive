import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPendingPatitas, confirmPatita } from '../../api/patitas';
import { listAvailableCoupons, redeemCoupon, type Coupon } from '../../api/coupons';
import { getAnimalByCode } from '../../api/animals';
import { recordPurchase } from '../../api/purchases';
import { uploadImage } from '../../api/uploads';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';

type Animal = {
  _id?: string;
  id?: string;
  name?: string;
  species?: string;
  code?: string;
  shelter?: string;
};

type CouponLog = Coupon & { _id: string; targetAnimalCode?: string | null };

type PatitaLog = {
  _id?: string;
  id?: string;
  amount?: number;
  concept?: string;
  source?: 'store' | 'vet';
  animal?: Animal | null;
  couponId?: string;
  coupon?: CouponLog | null;
};

const palette = {
  text: '#3F4A3C',
  muted: '#7A8273',
  accent: '#6A7B4F',
  surface: '#FFFFFF',
  surfaceAlt: '#FAF7F0',
  border: '#E7E1D5',
  chip: '#F1F3E8',
  chipText: '#5F6B3D',
  button: '#3F4A3C',
  buttonText: '#FDFBF4',
};

const getLogId = (log: PatitaLog) => String(log._id || log.id || '');

export default function PatitasPending() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PatitaLog | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [form, setForm] = useState({ proofImageUrl: '', notes: '', treatmentType: '' });
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ code: '', amount: '', notes: '' });
  const [purchaseAnimal, setPurchaseAnimal] = useState<Animal | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['patitas-pending'], queryFn: listPendingPatitas });
  const pending = data?.items || [];
  const [codeFilter, setCodeFilter] = useState('');
  const normalizedFilter = codeFilter.trim().toUpperCase();
  const filteredPending = useMemo(() => {
    if (!normalizedFilter) return pending as PatitaLog[];
    const exact = pending.filter(log => String(log.animal?.code || '').toUpperCase() === normalizedFilter);
    if (exact.length > 0) return exact;
    return pending.filter(log => String(log.animal?.code || '').toUpperCase().includes(normalizedFilter));
  }, [pending, normalizedFilter]);

  const highlightedId =
    normalizedFilter && filteredPending.length === 1 ? getLogId(filteredPending[0]) : null;

  const canUseCoupons = user?.role === 'store' || user?.role === 'vet';

  const { data: availableCouponsData, isLoading: availableCouponsLoading } = useQuery({
    queryKey: ['available-coupons', normalizedFilter, user?.role],
    queryFn: () => listAvailableCoupons({ code: normalizedFilter }),
    enabled: canUseCoupons && normalizedFilter.length >= 3,
    staleTime: 30_000,
  });
  const availableCoupons = canUseCoupons ? availableCouponsData?.items || [] : [];

  const openPurchaseModal = () => {
    setPurchaseOpen(true);
    setPurchaseForm({ code: '', amount: '', notes: '' });
    setPurchaseAnimal(null);
  };

  const lookupAnimal = async () => {
    const code = purchaseForm.code.trim().toUpperCase();
    if (!code) {
      toast.error('Introduce un código válido');
      return;
    }
    try {
      setLookupLoading(true);
      const animal = await getAnimalByCode(code);
      setPurchaseAnimal(animal);
      toast.success('Mascota encontrada');
    } catch (error: any) {
      setPurchaseAnimal(null);
      toast.error(error?.response?.data?.error || 'No encontramos esa mascota');
    } finally {
      setLookupLoading(false);
    }
  };

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      if (!purchaseAnimal?._id) {
        throw new Error('Busca un código válido antes de guardar');
      }
      const amountValue = Number(purchaseForm.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        throw new Error('Importe inválido');
      }
      const animalId = (purchaseAnimal._id || purchaseAnimal.id) as string;
      return recordPurchase({
        animalId,
        amount: amountValue,
        notes: purchaseForm.notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Gracias — esta compra ayudó a una protectora 🐾🤍');
      setPurchaseOpen(false);
      setPurchaseForm({ code: '', amount: '', notes: '' });
      setPurchaseAnimal(null);
      queryClient.invalidateQueries({ queryKey: ['patitas-pending'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.message || 'No se pudo registrar la compra');
    },
  });

  const formatPatitas = (amount: number) => {
    if (!Number.isFinite(amount)) return '0';
    return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  };

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('missing_log');
      if (!form.proofImageUrl) throw new Error('proof_required');
      const logId = (selected._id || selected.id) as string;
      if (selected.source === 'vet') {
        const treatment = form.treatmentType.trim();
        if (!treatment) {
          throw new Error('Debes indicar el tratamiento realizado');
        }
      }
      const treatmentValue =
        selected.source === 'store' ? undefined : form.treatmentType.trim() || undefined;
      return confirmPatita({
        logId,
        proofImageUrl: form.proofImageUrl,
        notes: form.notes.trim() || undefined,
        treatmentType: treatmentValue,
      });
    },
    onSuccess: data => {
      if (data?.couponDonation?.amount) {
        toast.success(`Has generado +${formatPatitas(data.couponDonation.amount)} Patitas para ${data.couponDonation.shelterName || 'la protectora'} 🤍`);
      } else {
        toast.success('Patita confirmada');
      }
      setSelected(null);
      setForm({ proofImageUrl: '', notes: '', treatmentType: '' });
      queryClient.invalidateQueries({ queryKey: ['patitas-pending'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.message || 'Error al confirmar');
    },
  });

  const useCouponMutation = useMutation({
    mutationFn: async (coupon: Coupon) => {
      if (!selected) {
        throw new Error('Selecciona un gasto antes de aplicar el cupón');
      }
      if (!normalizedFilter) {
        throw new Error('Ingresa un código de mascota');
      }
      return redeemCoupon(coupon._id, {
        animalCode: normalizedFilter,
        logId: selected._id || selected.id,
      });
    },
    onSuccess: (response) => {
      toast.success('Cupón aplicado');
      if (response?.coupon) {
        setSelected((prev: any) => (prev ? { ...prev, coupon: response.coupon, couponId: response.coupon._id } : prev));
      }
      queryClient.invalidateQueries({ queryKey: ['available-coupons', normalizedFilter, user?.role] });
      queryClient.invalidateQueries({ queryKey: ['patitas-pending'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.message || 'No se pudo usar el cupón');
    },
  });

  const isVet = user?.role === 'vet';

  const uploadProof = async (file?: File) => {
    if (!file) return;
    try {
      setProofUploading(true);
      const { url } = await uploadImage(file);
      setForm(f => ({ ...f, proofImageUrl: url }));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'No se pudo subir la imagen');
    } finally {
      setProofUploading(false);
    }
  };

  return (
    <div className="p-4 grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold" style={{ color: palette.text }}>Patitas pendientes</h1>
        <p className="text-sm" style={{ color: palette.muted }}>
          Confirma los gastos presentando el comprobante correspondiente.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={openPurchaseModal}
            className="px-3 py-1.5 rounded-full text-sm"
            style={{ background: palette.button, color: palette.buttonText }}
          >
            Registrar compra
          </button>
        </div>
        <div className="mt-2">
          <input
            type="text"
            placeholder="Buscar por código de mascota"
            value={codeFilter}
            onChange={e => setCodeFilter(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && filteredPending.length === 1) {
                e.preventDefault();
                setSelected(filteredPending[0]);
                setForm({ proofImageUrl: '', notes: '', treatmentType: '' });
              }
            }}
            className="border rounded px-3 py-2 text-sm"
            style={{ borderColor: palette.border }}
          />
        </div>
      </header>
      {canUseCoupons && normalizedFilter.length >= 3 && (
        <section
          className="border rounded-2xl p-4 grid gap-3"
          style={{ borderColor: palette.border, background: palette.surface }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: palette.text }}>Cupones aplicables</h2>
              <p className="text-xs" style={{ color: palette.muted }}>
                Código detectado: {normalizedFilter || '—'}
              </p>
            </div>
          </div>
          {availableCouponsLoading ? (
            <p className="text-sm" style={{ color: palette.muted }}>Buscando cupones…</p>
          ) : availableCoupons.length === 0 ? (
            <p className="text-sm" style={{ color: palette.muted }}>No hay cupones disponibles para este código.</p>
          ) : (
            <div className="grid gap-2">
              {availableCoupons.map(coupon => {
                const copyText = coupon.copy || coupon.title;
                return (
                  <div
                    key={coupon._id}
                    className="border rounded-xl p-3 flex items-center justify-between gap-3"
                    style={{ borderColor: palette.border }}
                  >
                    <div>
                      <div className="text-sm font-semibold" style={{ color: palette.text }}>
                        {copyText}
                      </div>
                      <div className="text-xs" style={{ color: palette.muted }}>{coupon.discount}</div>
                      <div className="text-xs" style={{ color: palette.muted }}>
                        Al usar este cupón estarás ayudando a una protectora 🐾🤍
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => useCouponMutation.mutate(coupon)}
                      disabled={useCouponMutation.isPending}
                      className="text-sm underline"
                      style={{ textUnderlineOffset: 3 }}
                    >
                      {useCouponMutation.isPending ? 'Aplicando…' : 'Usar cupón'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {!selected && availableCoupons.length > 0 && (
            <p className="text-xs" style={{ color: '#B45309' }}>Selecciona primero un gasto para adjuntar el cupón.</p>
          )}
        </section>
      )}
      {purchaseOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 border" style={{ borderColor: palette.border }}>
            <h2 className="text-xl font-semibold" style={{ color: palette.text }}>Registrar compra</h2>
            <p className="text-xs mt-1" style={{ color: palette.muted }}>Cada compra ayuda a una protectora 🐾🤍</p>
            <div className="mt-4 grid gap-3 text-sm" style={{ color: palette.text }}>
              <label className="grid gap-1">
                Código de la mascota
                <div className="flex gap-2">
                  <input
                    className="border rounded px-3 py-2 flex-1 uppercase"
                    style={{ borderColor: palette.border }}
                    value={purchaseForm.code}
                    onChange={e => {
                      const value = e.target.value.toUpperCase();
                      setPurchaseForm(prev => ({ ...prev, code: value }));
                      setPurchaseAnimal(null);
                    }}
                    placeholder="EJEMPLO-123"
                  />
                  <button
                    type="button"
                    onClick={lookupAnimal}
                    className="px-3 py-2 rounded text-sm"
                    style={{ border: '1px solid #C7D2B9', color: '#3F4A3C' }}
                    disabled={lookupLoading}
                  >
                    {lookupLoading ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>
              </label>
              {purchaseAnimal && (
                <div className="text-xs" style={{ color: palette.accent }}>
                  {purchaseAnimal.name} · {purchaseAnimal.species}
                  {purchaseAnimal.code ? ` · ${purchaseAnimal.code}` : ''}
                </div>
              )}
              <label className="grid gap-1">
                Importe total (€)
                <input
                  type="number"
                  min="0"
                  className="border rounded px-3 py-2"
                  style={{ borderColor: palette.border }}
                  value={purchaseForm.amount}
                  onChange={e => setPurchaseForm(prev => ({ ...prev, amount: e.target.value }))}
                />
              </label>
              <label className="grid gap-1">
                Notas (opcional)
                <textarea
                  className="border rounded px-3 py-2"
                  style={{ borderColor: palette.border }}
                  rows={3}
                  value={purchaseForm.notes}
                  onChange={e => setPurchaseForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPurchaseOpen(false)}>Cancelar</button>
              <button type="button" onClick={() => purchaseMutation.mutate()} disabled={purchaseMutation.isPending}>
                {purchaseMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {isLoading ? (
        <div>Cargando...</div>
      ) : filteredPending.length === 0 ? (
        <div className="text-sm" style={{ color: palette.muted }}>No hay Patitas pendientes.</div>
      ) : (
        <div className="grid gap-3">
          {filteredPending.map(log => {
            const isHighlighted = highlightedId === getLogId(log);
            return (
              <div
                key={getLogId(log)}
                className="p-4 border"
                style={{
                  borderRadius: 16,
                  borderColor: isHighlighted ? 'rgba(164, 179, 154, 0.5)' : palette.border,
                  background: isHighlighted ? palette.surfaceAlt : palette.surface,
                  transition: 'background 120ms ease, border 120ms ease',
                }}
              >
                <div className="text-xs uppercase" style={{ color: palette.muted }}>{log.source === 'store' ? 'Tienda' : 'Veterinario'}</div>
                <div className="font-semibold" style={{ color: palette.text }}>{log.concept || 'Compra registrada'}</div>
                <div className="text-sm" style={{ color: palette.text }}>Patitas: {Math.abs(log.amount || 0)}</div>
                {log.animal && (
                  <div className="text-sm" style={{ color: palette.muted }}>
                    {log.animal.name} · {log.animal.species}
                    {log.animal.code && (
                      <span className="ml-2 text-xs font-semibold" style={{ color: palette.accent }}>{log.animal.code}</span>
                    )}
                  </div>
                )}
                {log.coupon && (
                  <div
                    className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full"
                    style={{ background: palette.chip, color: palette.chipText }}
                  >
                    Cupón: {log.coupon.copy || log.coupon.title}
                    {log.coupon.targetAnimalCode ? ` · ${log.coupon.targetAnimalCode}` : ''}
                  </div>
                )}
                <button type="button" className="mt-2" onClick={() => { setSelected(log); setForm({ proofImageUrl: '', notes: '', treatmentType: '' }); }}>
                  Confirmar
                </button>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 border" style={{ borderColor: palette.border }}>
            <h2 className="text-xl font-semibold" style={{ color: palette.text }}>Confirmar gasto</h2>
            <div className="mt-3 grid gap-2 text-sm" style={{ color: palette.text }}>
              {selected.animal?.code && (
                <div className="text-xs" style={{ color: palette.accent }}>Mascota: {selected.animal.code}</div>
              )}
              {selected.coupon && (
                <div className="text-xs" style={{ color: palette.accent }}>
                  Cupón aplicado: {selected.coupon.copy || selected.coupon.title}
                  {selected.coupon.targetAnimalCode ? ` · ${selected.coupon.targetAnimalCode}` : ''}
                </div>
              )}
              <label className="grid gap-1">
                Comprobante
                <input type="file" accept="image/*" onChange={e => uploadProof(e.target.files?.[0])} />
              </label>
              {form.proofImageUrl && (
                <span className="text-xs" style={{ color: '#7A8273' }}>Imagen lista para enviar.</span>
              )}
              <label className="grid gap-1">
                Notas
                <textarea className="border rounded px-3 py-2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </label>
              {isVet && (
                <label className="grid gap-1">
                  Tratamiento realizado
                  <input className="border rounded px-3 py-2" value={form.treatmentType} onChange={e => setForm(f => ({ ...f, treatmentType: e.target.value }))} />
                </label>
              )}
              {treatmentMissing && (
                <div className="text-xs" style={{ color: '#B45309' }}>
                  Indica el tratamiento antes de confirmar.
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setSelected(null)}>Cancelar</button>
              <button
                type="button"
                disabled={confirmMutation.isPending || proofUploading || !form.proofImageUrl || treatmentMissing}
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending ? 'Confirmando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
  const treatmentMissing = isVet && selected?.source === 'vet' && !form.treatmentType.trim();
