import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchFeaturedAnimal } from '../../utils/featuredAnimal';
import {
  listMyPets,
  markAnimalFeeding,
  markAnimalLitter,
  createPersonalPet,
  AnimalMood,
} from '../../api/animals';
import { uploadImage } from '../../api/uploads';
import { offersForAnimal } from '../../api/offers';
import { toast } from 'react-hot-toast';
import { toAbsoluteUrl } from '../../utils/media';
import SelectProtectoraModal from '../../components/protectora/SelectProtectoraModal';
import WelcomeChecklist from '../../components/pet/WelcomeChecklist';
import { loadPreferredProtectora, savePreferredProtectora, type PreferredProtectora } from '../../utils/preferredProtectora';
import { healthCategoryLabel, moodLabel, speciesLabel, usesLitter } from '../../styles/mypetlive';

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

// El backend (multer) rechaza cualquier archivo por encima de 10 MB o que no sea
// imagen; validamos lo mismo aquí para poder decir qué ha pasado.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// `createPersonal` exige nombre, especie y edad (responde `missing_fields`).
function validateRegisterForm(form: RegisterForm): string | null {
  if (!form.name.trim()) return 'Escribe el nombre de tu mascota.';
  if (!form.species.trim()) return 'Elige la especie de tu mascota.';
  if (!form.age.trim()) return 'Indica la edad, por ejemplo «2 años» o «8 meses».';
  return null;
}

// Códigos de error del backend traducidos: sin esto el usuario leía
// "missing_fields" o "invalid_file_type" en pantalla.
const BACKEND_ERRORS: Record<string, string> = {
  missing_fields: 'Faltan datos: nombre, especie y edad son obligatorios.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión para registrar la mascota.',
  animal_code_generation_failed: 'No hemos podido generar el código de la mascota. Inténtalo otra vez.',
  invalid_file_type: 'Ese archivo no es una imagen. Sube un JPG o un PNG.',
  upload_error: 'No se pudo subir la imagen. Inténtalo otra vez.',
};

function backendErrorMessage(error: any, fallback: string) {
  const code = error?.response?.data?.error;
  if (code && BACKEND_ERRORS[code]) return BACKEND_ERRORS[code];
  if (error?.response?.status === 413) return 'La imagen es demasiado grande (máximo 10 MB).';
  return fallback;
}

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

  const [registerError, setRegisterError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const {
    data: myPets,
    isLoading: myPetsLoading,
    isError: myPetsError,
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
  // Mientras cualquiera de las dos fuentes siga en vuelo seguimos "cargando": con
  // la condición anterior (`&&`) el respaldo aún en curso ya pintaba el estado
  // vacío, así que aparecía un falso "no tienes mascota" y luego la mascota.
  const isLoading = !featuredAnimal && (myPetsLoading || fallbackQuery.isFetching);

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

  const petCode: string | undefined = featuredAnimal?.code;
  const { data: offersData } = useQuery({
    queryKey: ['offers-animal', petCode],
    queryFn: () => offersForAnimal(petCode as string),
    enabled: Boolean(petCode),
    staleTime: 60_000,
  });
  const petOffers = offersData?.items || [];

  const handleSharePassport = async () => {
    if (!petCode) return;
    const url = `${window.location.origin}/p/${encodeURIComponent(petCode)}`;
    const shareData = {
      title: `Pasaporte de ${featuredAnimal?.name || 'mi mascota'}`,
      text: `Conoce el pasaporte digital de ${featuredAnimal?.name || 'mi mascota'} (${petCode}) en MyPetLive`,
      url,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Enlace del pasaporte copiado');
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') toast.error('No se pudo compartir');
    }
  };

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
      // La home cachea el mismo animal 60 s: sin esto seguía diciendo que tocaba
      // rellenar la comida justo después de marcarla aquí.
      queryClient.invalidateQueries({ queryKey: ['tenant-featured-animal'] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.status === 403
          ? 'No tienes permiso para registrar el cuidado de esta mascota'
          : 'No se pudo registrar el cuidado',
      );
    },
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

  // Solo los gatos usan arena: a un perro no se le ofrece "cambiar arena".
  const showLitter = usesLitter(featuredAnimal?.species);

  const addRegisterImage = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setRegisterError('Ese archivo no es una imagen. Sube un JPG o un PNG.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setRegisterError('La imagen supera los 10 MB. Prueba con una más ligera.');
      return;
    }
    setRegisterError(null);
    setUploadingImage(true);
    try {
      const { url } = await uploadImage(file);
      setRegisterForm(prev => ({ ...prev, images: [...prev.images, url] }));
    } catch (error: any) {
      setRegisterError(backendErrorMessage(error, 'No se pudo subir la imagen. Inténtalo otra vez.'));
    } finally {
      setUploadingImage(false);
    }
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
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
      setRegisterError(null);
      refetchPets();
      // El panel de inicio cachea su animal destacado: sin esto no refleja
      // la mascota recién registrada hasta que expira el staleTime.
      queryClient.invalidateQueries({ queryKey: ['tenant-featured-animal'] });
      const newId = String(pet?._id || pet?.id || '');
      if (newId) setSelectedPetId(newId);
    },
    onError: (error: any) => {
      setRegisterError(backendErrorMessage(error, 'No hemos podido registrar la mascota. Inténtalo de nuevo.'));
    },
  });

  const submitRegister = () => {
    const problem = validateRegisterForm(registerForm);
    if (problem) {
      setRegisterError(problem);
      return;
    }
    setRegisterError(null);
    registerMutation.mutate();
  };

  const closeRegister = () => {
    setRegisterOpen(false);
    setRegisterError(null);
  };

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

  // Un fallo al cargar las mascotas no puede disfrazarse de "no tienes mascota".
  if (myPetsError && !featuredAnimal) {
    return (
      <div className="p-6 grid gap-3" style={{ color: '#3F4A3C' }}>
        <p className="text-lg font-semibold">No hemos podido cargar tus mascotas</p>
        <p className="text-sm" style={{ color: '#7A8273' }}>
          Puede ser un problema de conexión. Vuelve a intentarlo en un momento.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              refetchPets();
              fallbackQuery.refetch();
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!featuredAnimal) {
    return (
      <div className="p-6 grid gap-3" style={{ color: '#3F4A3C' }}>
        <p className="text-lg font-semibold">Todavía no tienes ninguna mascota aquí</p>
        <p className="text-sm" style={{ color: '#7A8273' }}>
          Registra la mascota con la que ya vives o busca un animal en adopción.
        </p>
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
            onClose={closeRegister}
            onChange={setRegisterForm}
            onUpload={addRegisterImage}
            onSubmit={submitRegister}
            submitting={registerMutation.isPending}
            uploading={uploadingImage}
            error={registerError}
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
                  className={`px-3 py-1 rounded-full border text-sm ${active ? 'bg-teal-100 border-teal text-teal-700' : 'border-gray-300 text-gray-600'}`}
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
        {/* flex-wrap: por debajo de 380 px los dos botones no caben en una línea. */}
        <div className="flex flex-wrap items-center gap-3">
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
            {speciesLabel(featuredAnimal.species) || 'Animal'}
            {featuredAnimal.age ? ` · ${featuredAnimal.age}` : ''}
          </p>
          {mood && (
            <p className="text-sm" style={{ color: '#7A8273' }}>Estado: {moodLabel(mood)} 🌱</p>
          )}
        </div>
        {petCode && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => nav(`/p/${encodeURIComponent(petCode)}`)}
              className="px-3 py-2 rounded-xl text-sm font-semibold"
              style={{ background: '#1F6F6F', color: '#FFFFFF' }}
            >
              📕 Ver pasaporte
            </button>
            <button
              type="button"
              onClick={handleSharePassport}
              className="px-3 py-2 rounded-xl text-sm font-semibold border"
              style={{ borderColor: '#1F6F6F', color: '#1F6F6F', background: '#FFFFFF' }}
            >
              🔗 Compartir
            </button>
          </div>
        )}
      </div>

      {currentPetEntry?.type === 'adopted' && (
        <WelcomeChecklist
          animalId={String(featuredAnimal._id || featuredAnimal.id || '')}
          petName={featuredAnimal.name}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="border rounded-2xl p-4 grid gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">Cuidado diario</h2>
          <p>{describeFeeding()}</p>
          {showLitter && <p>{describeLitter()}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => careMutation.mutate('feed')} disabled={careMutation.isPending}>
              Marcar comida
            </button>
            {showLitter && (
              <button type="button" onClick={() => careMutation.mutate('litter')} disabled={careMutation.isPending}>
                Cambiar arena
              </button>
            )}
          </div>
        </div>

        <div className="border rounded-2xl p-4 grid gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">Cupones</h2>
          {shelterId ? (
            <>
              <div className="flex flex-wrap gap-2">
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
                Al usar un cupón generas Patitas para la protectora que elijas 🤍
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
            <p style={{ color: '#7A8273' }}>Esta mascota no está vinculada a una protectora, por lo que no tiene cupones asociados.</p>
          )}
        </div>
      </div>

      {petOffers.length > 0 && (
        <div className="border rounded-2xl p-4" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">Ofertas para {featuredAnimal.name || 'tu mascota'}</h2>
          <p className="text-xs" style={{ color: '#7A8273' }}>Seleccionadas según el perfil de tu mascota 🤍</p>
          <div className="grid gap-2 mt-3">
            {petOffers.map(offer => (
              <div
                key={offer._id}
                className="flex items-center gap-3 border rounded-xl px-3 py-2"
                style={{ borderColor: '#E7E1D5' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    {offer.title}
                    {offer.sponsored && (
                      <span className="ml-2 text-xs font-semibold" style={{ color: '#B8860B' }}>· Destacado</span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: '#7A8273' }}>
                    {offer.discount}{offer.partner?.name ? ` · ${offer.partner.name}` : ''}
                  </div>
                </div>
                {offer.exact && (
                  <span className="text-xs font-semibold rounded-full px-2 py-1" style={{ color: '#1F6F6F', background: '#D7ECEC' }}>
                    Para {petCode}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(featuredAnimal.healthHistory) && featuredAnimal.healthHistory.length > 0 && (
        <div className="border rounded-2xl p-4" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">Historial de salud</h2>
          <ul className="mt-2 space-y-2">
            {featuredAnimal.healthHistory.map((entry: any, idx: number) => (
              <li key={idx} className="text-sm" style={{ color: '#3F4A3C' }}>
                <span className="text-xs" style={{ color: '#7A8273' }}>{entry.date ? new Date(entry.date).toLocaleDateString() : ''}</span>
                <div>{healthCategoryLabel(entry.type)}{entry.notes ? ` · ${entry.notes}` : ''}</div>
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
          onClose={closeRegister}
          onChange={setRegisterForm}
          onUpload={addRegisterImage}
          onSubmit={submitRegister}
          submitting={registerMutation.isPending}
          uploading={uploadingImage}
          error={registerError}
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
  uploading: boolean;
  error?: string | null;
};

function RegisterModal({ form, onChange, onUpload, onSubmit, onClose, submitting, uploading, error }: RegisterModalProps) {
  return (
    // El overlay hace scroll: en pantallas bajas el formulario no cabe entero y
    // antes los botones Cancelar/Guardar quedaban fuera, sin forma de alcanzarlos.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Registrar mascota"
        className="w-full max-w-md rounded-2xl bg-white p-5 border"
        style={{ borderColor: '#E7E1D5' }}
      >
        <h2 className="text-xl font-semibold" style={{ color: '#3F4A3C' }}>Registrar mascota</h2>
        <div className="grid gap-3 mt-3 text-sm">
          <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
            Nombre
            <input
              className="border rounded px-3 py-2"
              value={form.name}
              placeholder="Nombre de tu mascota"
              onChange={e => onChange(prev => ({ ...prev, name: e.target.value }))}
            />
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
            {/* `age` es texto libre en el modelo: se acepta "8 meses" o "2 años". */}
            <input
              className="border rounded px-3 py-2"
              value={form.age}
              placeholder="Ej.: 2 años"
              onChange={e => onChange(prev => ({ ...prev, age: e.target.value }))}
            />
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
            Fotos (opcional)
            <input
              type="file"
              accept="image/*"
              disabled={uploading || submitting}
              onChange={e => onUpload(e.target.files?.[0])}
            />
            {uploading && <span className="text-xs" style={{ color: '#7A8273' }}>Subiendo imagen…</span>}
          </label>
          {form.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.images.map((url, idx) => (
                <div key={url + idx} className="relative">
                  <img src={toAbsoluteUrl(url)} alt="preview" className="w-24 h-20 object-cover rounded border" />
                  <button
                    type="button"
                    aria-label="Quitar foto"
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
        {error && (
          <p className="mt-3 text-sm" role="alert" style={{ color: '#C0512F' }}>{error}</p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting}>Cancelar</button>
          {/* Bloqueado también mientras sube una foto: si no, se guardaba sin ella. */}
          <button type="button" onClick={onSubmit} disabled={submitting || uploading}>
            {submitting ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
