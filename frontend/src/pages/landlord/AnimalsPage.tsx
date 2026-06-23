import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import {
  AnimalMood,
  AnimalStatus,
  createAnimal,
  deleteAnimal,
  searchAnimals,
  updateAnimal,
  updateAnimalStatus,
} from '../../api/animals';
import { toast } from 'react-hot-toast';
import { uploadImage } from '../../api/uploads';
import { getPatitasBalance, spendPatitas } from '../../api/patitas';
import { listCoupons, type Coupon } from '../../api/coupons';

const STATUS_OPTIONS: Array<{ value: AnimalStatus; label: string }> = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'publicado', label: 'Publicado' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'preadoptado', label: 'Preadoptado' },
  { value: 'adoptado', label: 'Adoptado' },
  { value: 'no_disponible', label: 'No disponible' },
  { value: 'archivado', label: 'Archivado' },
];

const PERSONALITY_OPTIONS = ['Juguetón', 'Curioso', 'Sociable', 'Tranquilo', 'Independiente', 'Cariñoso'];

const MOOD_OPTIONS: Array<{ value: AnimalMood; label: string; icon: string }> = [
  { value: 'relajado', label: 'Relajado', icon: '🌱' },
  { value: 'timido', label: 'Tímido', icon: '🍃' },
  { value: 'energico', label: 'Enérgico', icon: '⚡️' },
  { value: 'en_adaptacion', label: 'En adaptación', icon: '💫' },
];

const INITIAL_FORM = {
  name: '',
  species: '',
  breed: '',
  sex: 'female',
  age: '',
  size: 'medium',
  description: '',
  status: 'borrador' as AnimalStatus,
  personality: [] as string[],
  mood: '' as '' | AnimalMood,
};

export default function AnimalsPage() {
  const { user } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const [editingImagesFor, setEditingImagesFor] = useState<any | null>(null);
  const [editingImagesList, setEditingImagesList] = useState<string[]>([]);
  const shelterId = useMemo(() => String(user?._id || ''), [user?._id]);
  const queryClient = useQueryClient();
  const [spendOpen, setSpendOpen] = useState(false);
  const [spendForm, setSpendForm] = useState({ amount: '', partnerType: 'store', concept: '', animalId: '', couponId: '' });

  const { data: patitasData, isLoading: patitasLoading } = useQuery({
    queryKey: ['patitas-balance', shelterId || 'protectora'],
    queryFn: () => getPatitasBalance(shelterId),
    enabled: !!shelterId,
    staleTime: 30_000,
  });

  const { data: couponsData } = useQuery({
    queryKey: ['coupons', 'active'],
    queryFn: listCoupons,
    staleTime: 30_000,
  });
  const coupons = useMemo(() => (couponsData?.items || []) as Coupon[], [couponsData?.items]);

  const spendMutation = useMutation({
    mutationFn: async () => {
      const parsedAmount = Number(spendForm.amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) throw new Error('Importe inválido');
      if (!spendForm.concept.trim()) throw new Error('Concepto requerido');
      return spendPatitas({
        amount: parsedAmount,
        partnerType: spendForm.partnerType as 'store' | 'vet',
        concept: spendForm.concept.trim(),
        animalId: spendForm.animalId.trim() || undefined,
        couponId: spendForm.couponId || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Patitas usadas');
      setSpendOpen(false);
      setSpendForm({ amount: '', partnerType: 'store', concept: '', animalId: '', couponId: '' });
      queryClient.invalidateQueries({ queryKey: ['patitas-balance'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.message || 'No se pudo registrar el gasto');
    },
  });

  const load = useCallback(async () => {
    if (!shelterId) return;
    setLoading(true);
    try {
      const res = await searchAnimals({ shelter: shelterId, limit: 200, page: 1, sort: 'createdAt', dir: 'desc' });
      setList(res.items || []);
    } finally {
      setLoading(false);
    }
  }, [shelterId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedAnimal = useMemo(() => {
    if (!spendForm.animalId) return undefined;
    return list.find(item => String(item._id || item.id) === spendForm.animalId);
  }, [list, spendForm.animalId]);

  const filteredCoupons = useMemo(() => {
    return coupons.filter(coupon => {
      if (!coupon.targetAnimalCode) return true;
      const code = selectedAnimal?.code;
      return Boolean(code) && coupon.targetAnimalCode === code;
    });
  }, [coupons, selectedAnimal?.code]);

  useEffect(() => {
    if (spendForm.couponId && !filteredCoupons.some(c => c._id === spendForm.couponId)) {
      setSpendForm(prev => ({ ...prev, couponId: '' }));
    }
  }, [filteredCoupons, spendForm.couponId]);

  const handleCouponChange = (value: string) => {
    setSpendForm(prev => {
      const next = { ...prev, couponId: value };
      const coupon = coupons.find(c => c._id === value);
      if (coupon?.targetAnimalCode) {
        const match = list.find(a => a.code === coupon.targetAnimalCode);
        if (match) {
          next.animalId = String(match._id || match.id);
        }
      }
      return next;
    });
  };

  const uploadFiles = async (files: FileList | null, target: 'form' | 'edit') => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        const { url } = await uploadImage(file);
        if (target === 'form') {
          setFormImages(prev => [...prev, url]);
        } else {
          setEditingImagesList(prev => [...prev, url]);
        }
      } catch {
        toast.error('No se pudo subir la imagen');
      }
    }
  };

  const togglePersonality = (value: string) => {
    setForm(prev => {
      const current = prev.personality || [];
      if (current.includes(value)) {
        return { ...prev, personality: current.filter(v => v !== value) };
      }
      if (current.length >= 3) {
        toast.error('Máximo 3 rasgos');
        return prev;
      }
      return { ...prev, personality: [...current, value] };
    });
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        shelter: shelterId,
        ...form,
        personality: form.personality,
        mood: form.mood || undefined,
        images: formImages,
      };
      await createAnimal(payload);
      setForm(INITIAL_FORM);
      setFormImages([]);
      toast.success('Animal creado');
      load();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'No se pudo crear');
    }
  };

  const onChangeStatus = async (id: string, status: AnimalStatus) => {
    try {
      await updateAnimalStatus(id, status);
      toast.success('Estado actualizado');
      load();
    } catch (error) {
      toast.error('No se pudo actualizar el estado');
    }
  };

  return (
    <div className="p-4 grid gap-4">
      <header>
        <h1 className="text-xl font-semibold">Mis animales</h1>
        <p className="text-gray-600">Crea y gestiona los animales de tu protectora.</p>
        <div className="mt-3 inline-flex flex-col rounded-lg border border-emerald-100 bg-white px-4 py-3 shadow-sm gap-1">
          <span className="text-xs uppercase tracking-wide text-emerald-800">Patitas disponibles</span>
          <span className="text-2xl font-semibold text-emerald-700">{patitasLoading ? '…' : (patitasData?.patitas ?? 0)}</span>
          <button type="button" className="mt-1 text-sm" onClick={() => setSpendOpen(true)} disabled={patitasLoading}>
            Usar Patitas
          </button>
        </div>
      </header>

      {spendOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 border border-emerald-100 grid gap-3">
            <h2 className="text-lg font-medium">Usar Patitas</h2>
            <label className="text-sm text-gray-600 grid gap-1">
              Importe
              <input type="number" min="1" className="border rounded px-3 py-2" value={spendForm.amount} onChange={e => setSpendForm(f => ({ ...f, amount: e.target.value }))} />
            </label>
            <label className="text-sm text-gray-600 grid gap-1">
              Proveedor
              <select className="border rounded px-3 py-2" value={spendForm.partnerType} onChange={e => setSpendForm(f => ({ ...f, partnerType: e.target.value }))}>
                <option value="store">Tienda</option>
                <option value="vet">Veterinario</option>
              </select>
            </label>
            <label className="text-sm text-gray-600 grid gap-1">
              Concepto
              <input type="text" className="border rounded px-3 py-2" value={spendForm.concept} onChange={e => setSpendForm(f => ({ ...f, concept: e.target.value }))} />
            </label>
            <label className="text-sm text-gray-600 grid gap-1">
              Mascota (opcional)
              <select className="border rounded px-3 py-2" value={spendForm.animalId} onChange={e => setSpendForm(f => ({ ...f, animalId: e.target.value }))}>
                <option value="">Sin asignar</option>
                {list.map(animal => (
                  <option key={animal._id || animal.id} value={String(animal._id || animal.id)}>
                    {animal.name}
                    {animal.code ? ` · ${animal.code}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-600 grid gap-1">
              Cupón (opcional)
              <select className="border rounded px-3 py-2" value={spendForm.couponId} onChange={e => handleCouponChange(e.target.value)}>
                <option value="">Sin cupón</option>
                {filteredCoupons.map(coupon => (
                  <option key={coupon._id} value={coupon._id}>
                    {coupon.title}
                    {coupon.targetAnimalCode ? ` · ${coupon.targetAnimalCode}` : ''}
                  </option>
                ))}
              </select>
              {coupons.length > 0 && filteredCoupons.length === 0 && (
                <span className="text-xs text-amber-700">Selecciona una mascota con código para ver cupones asociados.</span>
              )}
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setSpendOpen(false)} className="px-4 py-2 rounded border">
                Cancelar
              </button>
              <button type="button" onClick={() => spendMutation.mutate()} className="px-4 py-2 rounded" disabled={spendMutation.isPending}>
                {spendMutation.isPending ? 'Procesando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={onCreate} className="grid gap-3 max-w-2xl p-3 border rounded">
        <div className="grid grid-cols-2 gap-2">
          <input className="border rounded px-2 py-1" placeholder="Nombre" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <input className="border rounded px-2 py-1" placeholder="Especie" value={form.species} onChange={e => setForm(f => ({ ...f, species: e.target.value }))} required />
          <input className="border rounded px-2 py-1" placeholder="Raza (opcional)" value={form.breed} onChange={e => setForm(f => ({ ...f, breed: e.target.value }))} />
          <input className="border rounded px-2 py-1" placeholder="Edad" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} required />
          <select className="border rounded px-2 py-1" value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value }))}>
            <option value="female">Hembra</option>
            <option value="male">Macho</option>
          </select>
          <select className="border rounded px-2 py-1" value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))}>
            <option value="small">Pequeño</option>
            <option value="medium">Mediano</option>
            <option value="large">Grande</option>
          </select>
          <select className="border rounded px-2 py-1 col-span-2" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AnimalStatus }))}>
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <textarea className="border rounded px-2 py-1" placeholder="Descripción (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div>
          <p className="text-sm text-gray-600 mb-1">Personalidad (máx 3)</p>
          <div className="flex flex-wrap gap-2">
            {PERSONALITY_OPTIONS.map(option => {
              const active = form.personality.includes(option);
              return (
                <button
                  type="button"
                  key={option}
                  onClick={() => togglePersonality(option)}
                  className={`px-3 py-1 rounded-full border text-sm ${active ? 'bg-emerald-100 border-emerald-400 text-emerald-700' : 'border-gray-300 text-gray-600'}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Estado emocional</p>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map(option => (
              <button
                type="button"
                key={option.value}
                onClick={() => setForm(prev => ({ ...prev, mood: prev.mood === option.value ? '' : option.value }))}
                className={`px-3 py-1 rounded-full border text-sm ${form.mood === option.value ? 'bg-emerald-100 border-emerald-400 text-emerald-700' : 'border-gray-300 text-gray-600'}`}
              >
                {option.icon} {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Imágenes</p>
          <div
            className="border-2 border-dashed rounded-xl p-4 text-center text-sm text-gray-500"
            style={{ borderColor: '#E7E1D5' }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              uploadFiles(e.dataTransfer.files, 'form');
            }}
          >
            Arrastra imágenes o{' '}
            <button type="button" className="underline" onClick={() => createInputRef.current?.click()}>
              haz clic para seleccionarlas
            </button>
            .
            <input
              ref={createInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={e => {
                uploadFiles(e.target.files, 'form');
                if (createInputRef.current) createInputRef.current.value = '';
              }}
            />
          </div>
          {formImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {formImages.map((url, idx) => (
                <div key={url + idx} className="relative">
                  <img src={url} alt="foto" className="w-24 h-20 object-cover rounded border" />
                  <button type="button" className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6" onClick={() => setFormImages(list => list.filter((_, i) => i !== idx))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <button type="submit" className="px-4 py-2 rounded bg-emerald-600 text-white">
            Crear animal
          </button>
        </div>
      </form>

      <section>
        <h2 className="font-semibold mb-2">Listado</h2>
        {loading ? (
          <div>Cargando…</div>
        ) : list.length === 0 ? (
          <div className="text-gray-600">No hay animales.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map(animal => (
              <div key={animal._id || animal.id} className="border rounded-2xl overflow-hidden flex flex-col" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
                <div className="aspect-video bg-gray-100">
                  {Array.isArray(animal.images) && animal.images[0] ? (
                    <img src={animal.images[0]} alt={animal.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">Sin imagen</div>
                  )}
                </div>
                <div className="p-3 grid gap-2 flex-1">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {animal.name}
                      {animal.code && (
                        <span className="text-xs font-semibold tracking-wide" style={{ color: '#6A7B4F' }}>{animal.code}</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      {animal.species}
                      {animal.breed ? ` · ${animal.breed}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-xs uppercase text-gray-500">Estado</span>
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={animal.status}
                      onChange={e => onChangeStatus(animal._id || animal.id, e.target.value as AnimalStatus)}
                    >
                      {STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {animal.mood && (
                    <div className="text-xs text-gray-500">Estado emocional: {animal.mood.replace('_', ' ')}</div>
                  )}
                  {Array.isArray(animal.personality) && animal.personality.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {animal.personality.map((trait: string) => (
                        <span key={trait} className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#E7E1D5', color: '#3F4A3C' }}>
                          {trait}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-auto">
                    <button
                      className="px-3 py-1 border rounded text-sm"
                      onClick={() => {
                        setEditingImagesFor(animal);
                        setEditingImagesList(Array.isArray(animal.images) ? [...animal.images] : []);
                      }}
                    >
                      Gestionar imágenes
                    </button>
                    <button
                      className="px-3 py-1 border rounded text-sm text-red-700"
                      onClick={async () => {
                        if (!window.confirm('¿Eliminar este animal?')) return;
                        try {
                          await deleteAnimal(animal._id || animal.id);
                          toast.success('Eliminado');
                          load();
                        } catch {
                          toast.error('No se pudo eliminar');
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editingImagesFor && (
        <section className="border rounded p-3 grid gap-2" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              Imágenes de {editingImagesFor.name}
              {editingImagesFor.code && (
                <span className="text-xs font-semibold tracking-wide" style={{ color: '#6A7B4F' }}>{editingImagesFor.code}</span>
              )}
            </h3>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 rounded border"
                onClick={async () => {
                  try {
                    await updateAnimal(editingImagesFor._id || editingImagesFor.id, { images: editingImagesList });
                    toast.success('Imágenes guardadas');
                    setEditingImagesFor(null);
                    load();
                  } catch {
                    toast.error('No se pudo guardar');
                  }
                }}
              >
                Guardar
              </button>
              <button className="px-3 py-1.5 rounded border" onClick={() => setEditingImagesFor(null)}>
                Cerrar
              </button>
            </div>
          </div>
          <div
            className="border-2 border-dashed rounded-xl p-4 text-center text-sm text-gray-500"
            style={{ borderColor: '#E7E1D5' }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              uploadFiles(e.dataTransfer.files, 'edit');
            }}
          >
            Arrastra imágenes o{' '}
            <button type="button" className="underline" onClick={() => editInputRef.current?.click()}>
              haz clic para seleccionarlas
            </button>
            .
            <input
              ref={editInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={e => {
                uploadFiles(e.target.files, 'edit');
                if (editInputRef.current) editInputRef.current.value = '';
              }}
            />
          </div>
          {editingImagesList.length === 0 ? (
            <div className="text-gray-600">No hay imágenes.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {editingImagesList.map((url, idx) => (
                <div key={url + idx} className="relative">
                  <img src={url} alt="foto" className="w-28 h-24 object-cover rounded border" />
                  <button type="button" className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6" onClick={() => setEditingImagesList(list => list.filter((_, i) => i !== idx))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
