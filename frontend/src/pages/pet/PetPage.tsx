import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchFeaturedAnimal } from '../../utils/featuredAnimal';
import { getPatitasBalance, echoPatita } from '../../api/patitas';
import {
  listMyPets,
  markAnimalFeeding,
  markAnimalLitter,
  createPersonalPet,
  AnimalMood,
} from '../../api/animals';
import { uploadImage } from '../../api/uploads';
import { toast } from 'react-hot-toast';
import { toAbsoluteUrl } from '../../utils/media';
import SelectProtectoraModal from '../../components/protectora/SelectProtectoraModal';
import { loadPreferredProtectora, savePreferredProtectora, type PreferredProtectora } from '../../utils/preferredProtectora';

const MOOD_OPTIONS: Array<{ value: '' | AnimalMood; label: string }> = [
  { value: '', label: 'Sin especificar' },
  { value: 'relajado', label: 'Relajado' },
  { value: 'timido', label: 'Tímido' },
  { value: 'energico', label: 'Enérgico' },
  { value: 'en_adaptacion', label: 'En adaptación' },
];

const SPECIES_OPTIONS = [
  { value: 'cat', label: 'Gato' },
  { value: 'dog', label: 'Perro' },
  { value: 'rabbit', label: 'Conejo' },
  { value: 'bird', label: 'Ave' },
  { value: 'other', label: 'Otro' },
];

const REGISTER_INITIAL = {
  name: '',
  species: 'cat',
  age: '',
  mood: '' as '' | AnimalMood,
  images: [] as string[],
};

type RegisterForm = typeof REGISTER_INITIAL;

type PetListEntry = {
  type: 'personal' | 'adopted';
  adoptionId?: string;
  animal: any;
};

export default function PetPage() {
  const { user, token: authToken } = useAuth();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterForm>(REGISTER_INITIAL);
  const [preferredProtectora, setPreferredProtectoraState] = useState<PreferredProtectora | null>(() => loadPreferredProtectora());
  const [selectProtectoraOpen, setSelectProtectoraOpen] = useState(false);
  const [pendingCouponsNav, setPendingCouponsNav] = useState(false);
  const assignedAnimalId = (user as any)?.assignedAnimalId || (user as any)?.animalId || (user as any)?.petId || null;
  const setPreferredProtectora = (value: PreferredProtectora | null) => {
    setPreferredProtectoraState(value);
    savePreferredProtectora(value);
  };

  const {
    data: myPets,
    isLoading: myPetsLoading,
    refetch: refetchPets,
  } = useQuery<{ items: PetListEntry[] }>({
    queryKey: ['my-pets'],
    queryFn: listMyPets,
  });

  const petItems = useMemo(() => myPets?.items || [], [myPets?.items]);

  useEffect(() => {
    if (!petItems.length) {
      setSelectedPetId(null);
      return;
    }
    if (selectedPetId && petItems.some(item => String(item.animal?._id || item.animal?.id) === selectedPetId)) {
      return;
    }
    const firstId = String(petItems[0].animal?._id || petItems[0].animal?.id || '');
    setSelectedPetId(firstId || null);
  }, [petItems, selectedPetId]);

  const currentPetEntry = useMemo(() => {
    if (!selectedPetId) return undefined;
    return petItems.find(item => String(item.animal?._id || item.animal?.id) === selectedPetId);
  }, [petItems, selectedPetId]);

  const currentPet = currentPetEntry?.animal;

  const fallbackQuery = useQuery({
    queryKey: ['pet-animal-fallback', selectedPetId || assignedAnimalId || 'auto'],
    queryFn: () => fetchFeaturedAnimal(selectedPetId || assignedAnimalId),
    enabled: !currentPet,
  });

  const featuredAnimal = currentPet || fallbackQuery.data;
  const isLoading = myPetsLoading && !currentPet && fallbackQuery.isLoading;

  const adoptedProtectora = useMemo(() => {
    const adopted = petItems.find(item => item.type === 'adopted' && item.animal?.shelter);
    if (!adopted) return null;
    const shelterField = adopted.animal.shelter;
    const shelterId = typeof shelterField === 'object' ? shelterField._id || shelterField.id : shelterField;
    if (!shelterId) return null;
    const shelterName =
      typeof shelterField === 'object'
        ? shelterField.name || adopted.animal?.shelterName || 'Tu protectora'
        : 'Tu protectora';
    return { id: String(shelterId), name: shelterName } as PreferredProtectora;
  }, [petItems]);

  useEffect(() => {
    if (!preferredProtectora && adoptedProtectora) {
      setPreferredProtectora(adoptedProtectora);
    }
  }, [preferredProtectora, adoptedProtectora]);

  const isPersonal = Boolean(featuredAnimal?.isPersonalPet);
  const shelterId = !isPersonal && featuredAnimal?.shelter ? String(featuredAnimal.shelter) : undefined;

  const patitasKey: [string, string] = ['patitas-balance', shelterId || 'pet'];
  const { data: patitasData, isLoading: patitasLoading } = useQuery({
    queryKey: patitasKey,
    queryFn: () => getPatitasBalance(shelterId),
    enabled: Boolean(shelterId),
    staleTime: 30_000,
  });

  const echoMutation = useMutation({
    mutationFn: async () => {
      if (!featuredAnimal) throw new Error('missing_animal');
      if (!shelterId) throw new Error('missing_shelter');
      const animalRef = featuredAnimal._id || featuredAnimal.id;
      return echoPatita({ shelterId, animalId: animalRef ? String(animalRef) : undefined });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: patitasKey });
      const previous = queryClient.getQueryData(patitasKey);
      queryClient.setQueryData(patitasKey, (old: any) => ({ ...old, patitas: (old?.patitas ?? 0) + 1 }));
      return { previous };
    },
    onSuccess: data => {
      toast.success('Tu ayuda llegó donde hace falta 🤍');
      queryClient.setQueryData(patitasKey, (old: any) => ({ ...old, patitas: data?.newBalance ?? old?.patitas ?? 0 }));
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(patitasKey, context.previous);
      toast.error('No se pudo registrar. Inténtalo de nuevo');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['patitas-balance'] });
    },
  });

  const careMutation = useMutation<{ ok: boolean } | any, unknown, 'feed' | 'litter'>({
    mutationFn: async type => {
      if (!featuredAnimal) throw new Error('missing_animal');
      const animalId = String(featuredAnimal._id || featuredAnimal.id || '');
      if (!animalId) throw new Error('missing_animal');
      if (type === 'feed') return markAnimalFeeding(animalId);
      return markAnimalLitter(animalId);
    },
    onSuccess: (_data, type) => {
      toast.success(type === 'feed' ? 'Gracias por cuidar de él 🌿' : 'Gracias por mantener su espacio limpio ✨');
      queryClient.invalidateQueries({ queryKey: ['my-pets'] });
      queryClient.invalidateQueries({ queryKey: ['pet-animal-fallback', selectedPetId || assignedAnimalId || 'auto'] });
    },
    onError: () => toast.error('No se pudo registrar el cuidado'),
  });

  const describeFeeding = () => {
    if (!featuredAnimal?.lastFeeding) return 'Aún no registramos una comida.';
    const last = new Date(featuredAnimal.lastFeeding);
    const hours = (Date.now() - last.getTime()) / 36e5;
    return hours < 24 ? 'Ya comió hoy 🫶' : 'Puede que toque rellenar comida 🌿';
  };

  const describeLitter = () => {
    if (!featuredAnimal?.lastLitterChange) return 'Aún no registramos un cambio de arena.';
    const last = new Date(featuredAnimal.lastLitterChange);
    const hours = (Date.now() - last.getTime()) / 36e5;
    return hours < 72 ? 'Arena en buen estado.' : 'Quizás convenga cambiar la arena pronto ✨';
  };

  const needsFeeding = featuredAnimal?.lastFeeding
    ? (Date.now() - new Date(featuredAnimal.lastFeeding).getTime()) / 36e5 >= 24
    : false;
  const needsLitter = featuredAnimal?.lastLitterChange
    ? (Date.now() - new Date(featuredAnimal.lastLitterChange).getTime()) / 36e5 >= 72
    : false;

  const addRegisterImage = async (file?: File | null) => {
    if (!file) return;
    try {
      const { url } = await uploadImage(file);
      setRegisterForm(prev => ({ ...prev, images: [...prev.images, url] }));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'No se pudo subir la imagen');
    }
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!registerForm.name.trim() || !registerForm.species.trim() || !registerForm.age.trim()) {
        throw new Error('Completa los campos requeridos');
      }
      return createPersonalPet({
        name: registerForm.name.trim(),
        species: registerForm.species.trim(),
        age: registerForm.age.trim(),
        images: registerForm.images,
        mood: registerForm.mood || undefined,
      }, authToken || undefined);
    },
    onSuccess: (pet: any) => {
      toast.success('Mascota registrada');
      setRegisterOpen(false);
      setRegisterForm(REGISTER_INITIAL);
      refetchPets();
      const newId = String(pet?._id || pet?.id || '');
      if (newId) setSelectedPetId(newId);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || error?.message || 'No se pudo registrar');
    },
  });

  const handleViewCoupons = () => {
    if (preferredProtectora) {
      nav('/coupons');
      return;
    }
    setPendingCouponsNav(true);
    setSelectProtectoraOpen(true);
  };

  const handleProtectoraSelected = (option: PreferredProtectora) => {
    setPreferredProtectora(option);
    setSelectProtectoraOpen(false);
    if (pendingCouponsNav) {
      setPendingCouponsNav(false);
      nav('/coupons');
    }
  };

  const showChips = petItems.length > 0;

  if (isLoading) return <div className="p-4">Cargando…</div>;

  if (!featuredAnimal) {
    return (
      <div className="p-6 grid gap-3" style={{ color: '#3F4A3C' }}>
        <p>Hoy no tenemos una mascota asignada.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => nav('/animals')}>
            Buscar animales en adopción
          </button>
          <button type="button" onClick={() => setRegisterOpen(true)}>
            Registrar mi mascota
          </button>
        </div>
        {registerOpen && (
          <RegisterModal
            form={registerForm}
            onClose={() => setRegisterOpen(false)}
            onChange={setRegisterForm}
            onUpload={addRegisterImage}
            onSubmit={() => registerMutation.mutate()}
            submitting={registerMutation.isPending}
          />
        )}
      </div>
    );
  }

  const image = Array.isArray(featuredAnimal.images) ? featuredAnimal.images[0] : undefined;
  const mood = featuredAnimal.mood || null;
  const code = featuredAnimal.code;

  return (
    <div className="p-4 grid gap-4" style={{ color: '#3F4A3C' }}>
      <div className="flex flex-wrap items-center gap-3">
        {showChips && (
          <div className="flex flex-wrap gap-2">
            {petItems.map(item => {
              const animal = item.animal;
              const id = String(animal?._id || animal?.id || '');
              if (!id) return null;
              const active = selectedPetId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedPetId(id)}
                  className={`px-3 py-1 rounded-full border text-sm ${active ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'border-gray-300 text-gray-600'}`}
                >
                  {animal?.name || 'Mascota'}
                  {animal?.code && (
                    <span className="ml-2 text-xs" style={{ color: '#6A7B4F' }}>{animal.code}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="button" className="text-sm" onClick={() => setRegisterOpen(true)}>
            ➕ Añadir otra mascota
          </button>
          <button
            type="button"
            onClick={() => nav('/animals')}
            className="text-sm"
            style={{ color: '#3F4A3C', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            🐾 Adoptar otra mascota
          </button>
        </div>
      </div>

      {!myPetsLoading && petItems.length === 0 && (
        <div className="border rounded-2xl p-4" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <p className="text-lg font-semibold">¿Ya vives con un animal?</p>
          <p className="text-sm" style={{ color: '#7A8273' }}>Regístralo para llevar un control personal y acceder rápido a su ficha.</p>
          <button type="button" onClick={() => setRegisterOpen(true)} className="mt-2">
            Registrar mi mascota
          </button>
        </div>
      )}

      <div className="border rounded-2xl p-4 grid gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
        {image ? (
          <img src={toAbsoluteUrl(image)} alt={featuredAnimal.name} className="w-full rounded-2xl object-cover" style={{ maxHeight: 320 }} />
        ) : (
          <div className="rounded-2xl bg-[#F1ECE4] h-48 flex items-center justify-center">Sin imagen</div>
        )}
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {featuredAnimal.name || 'Mi mascota'}
            {code && (
              <span className="text-xs font-semibold tracking-wide" style={{ color: '#6A7B4F' }}>{code}</span>
            )}
          </h1>
          <p className="text-sm" style={{ color: '#7A8273' }}>
            {featuredAnimal.species || 'Animal'}
            {featuredAnimal.age ? ` · ${featuredAnimal.age}` : ''}
          </p>
          {mood && (
            <p className="text-sm" style={{ color: '#7A8273' }}>Estado: {mood.replace('_', ' ')} 🌱</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="border rounded-2xl p-4 grid gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">Cuidado diario</h2>
          <p>{describeFeeding()}</p>
          {needsFeeding && <span className="text-xs" style={{ color: '#7A8273' }}>Puede tocar revisar la comida 🌿</span>}
          <p>{describeLitter()}</p>
          {needsLitter && <span className="text-xs" style={{ color: '#7A8273' }}>La arena puede necesitar un cambio pronto ✨</span>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => careMutation.mutate('feed')} disabled={careMutation.isPending}>
              Marcar comida
            </button>
            <button type="button" onClick={() => careMutation.mutate('litter')} disabled={careMutation.isPending}>
              Cambiar arena
            </button>
          </div>
        </div>

        <div className="border rounded-2xl p-4 grid gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">Patitas</h2>
          {shelterId ? (
            <>
              <p style={{ margin: 0 }}>
                {patitasLoading ? 'Cargando Patitas…' : `Has echado ${(patitasData?.patitas ?? 0)} Patitas este mes.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => echoMutation.mutate()} disabled={echoMutation.isPending}>
                  {echoMutation.isPending ? 'Registrando…' : 'Echar una Patita'}
                </button>
                <button
                  type="button"
                  onClick={handleViewCoupons}
                  className="text-sm"
                  style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}
                >
                  Ver cupones
                </button>
              </div>
              <p className="text-xs" style={{ color: '#6A7B4F' }}>
                Usando este cupón estás echando Patitas a la protectora que elijas 🤍
                {preferredProtectora ? ` · ${preferredProtectora.name}` : ''}
              </p>
              {!preferredProtectora && (
                <button
                  type="button"
                  className="text-xs"
                  style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}
                  onClick={() => {
                    setPendingCouponsNav(false);
                    setSelectProtectoraOpen(true);
                  }}
                >
                  Elegir protectora
                </button>
              )}
            </>
          ) : (
            <p style={{ color: '#7A8273' }}>Esta mascota no está vinculada a una protectora, por lo que no usa Patitas.</p>
          )}
        </div>
      </div>

      {Array.isArray(featuredAnimal.healthHistory) && featuredAnimal.healthHistory.length > 0 && (
        <div className="border rounded-2xl p-4" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">Historial de salud</h2>
          <ul className="mt-2 space-y-2">
            {featuredAnimal.healthHistory.map((entry: any, idx: number) => (
              <li key={idx} className="text-sm" style={{ color: '#3F4A3C' }}>
                <span className="text-xs" style={{ color: '#7A8273' }}>{entry.date ? new Date(entry.date).toLocaleDateString() : ''}</span>
                <div>{entry.type}{entry.notes ? ` · ${entry.notes}` : ''}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SelectProtectoraModal
        open={selectProtectoraOpen}
        selectedId={preferredProtectora?.id}
        onClose={() => {
          setSelectProtectoraOpen(false);
          setPendingCouponsNav(false);
        }}
        onConfirm={handleProtectoraSelected}
        title="Elige a qué protectora apoyar"
      />

      {registerOpen && (
        <RegisterModal
          form={registerForm}
          onClose={() => setRegisterOpen(false)}
          onChange={setRegisterForm}
          onUpload={addRegisterImage}
          onSubmit={() => registerMutation.mutate()}
          submitting={registerMutation.isPending}
        />
      )}
    </div>
  );
}

type RegisterModalProps = {
  form: RegisterForm;
  onChange: React.Dispatch<React.SetStateAction<RegisterForm>>;
  onUpload: (file?: File | null) => void;
  onSubmit: () => void;
  onClose: () => void;
  submitting: boolean;
};

function RegisterModal({ form, onChange, onUpload, onSubmit, onClose, submitting }: RegisterModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 border" style={{ borderColor: '#E7E1D5' }}>
        <h2 className="text-xl font-semibold" style={{ color: '#3F4A3C' }}>Registrar mascota</h2>
        <div className="grid gap-3 mt-3 text-sm">
          <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
            Nombre
            <input className="border rounded px-3 py-2" value={form.name} onChange={e => onChange(prev => ({ ...prev, name: e.target.value }))} />
          </label>
          <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
            Especie
            <select className="border rounded px-3 py-2" value={form.species} onChange={e => onChange(prev => ({ ...prev, species: e.target.value }))}>
              {SPECIES_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
            Edad
            <input className="border rounded px-3 py-2" value={form.age} onChange={e => onChange(prev => ({ ...prev, age: e.target.value }))} />
          </label>
          <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
            Estado emocional
            <select className="border rounded px-3 py-2" value={form.mood} onChange={e => onChange(prev => ({ ...prev, mood: e.target.value as '' | AnimalMood }))}>
              {MOOD_OPTIONS.map(option => (
                <option key={option.value || 'none'} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
            Foto principal
            <input type="file" accept="image/*" onChange={e => onUpload(e.target.files?.[0])} />
          </label>
          {form.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.images.map((url, idx) => (
                <div key={url + idx} className="relative">
                  <img src={toAbsoluteUrl(url)} alt="preview" className="w-24 h-20 object-cover rounded border" />
                  <button
                    type="button"
                    className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6"
                    onClick={() => onChange(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
