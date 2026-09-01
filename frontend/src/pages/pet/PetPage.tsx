import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchFeaturedAnimal } from '../../utils/featuredAnimal';
import {
  listMyPets,
  createPersonalPet,
  updateMyPet,
  addHealthRecord,
  AnimalMood,
  type HealthCategory,
} from '../../api/animals';
import { uploadImage } from '../../api/uploads';
import { offersForAnimal } from '../../api/offers';
import { toast } from 'react-hot-toast';
import { toAbsoluteUrl } from '../../utils/media';
import SelectProtectoraModal from '../../components/protectora/SelectProtectoraModal';
import WelcomeChecklist from '../../components/pet/WelcomeChecklist';
import DailyCareCard from '../../components/pet/DailyCareCard';
import { loadPreferredProtectora, savePreferredProtectora, type PreferredProtectora } from '../../utils/preferredProtectora';
import { healthCategoryLabel, moodLabel, speciesLabel } from '../../styles/mypetlive';

// Lo que la familia puede apuntar. 'visit' se queda fuera a propósito: una
// visita al veterinario la registra la clínica, con su tratamiento.
const HEALTH_OPTIONS: Array<{ value: HealthCategory; label: string }> = [
  { value: 'vaccine', label: 'Vacuna' },
  { value: 'deworming', label: 'Desparasitación' },
  { value: 'checkup', label: 'Revisión' },
  { value: 'test', label: 'Prueba' },
  { value: 'surgery', label: 'Intervención' },
  { value: 'other', label: 'Otro' },
];

// Lo que el servidor programará solo si no se pone fecha. Se enseña como pista
// para que nadie tenga que adivinar si va a recibir un aviso o no.
const DEFAULT_REPEAT_HINT: Partial<Record<HealthCategory, string>> = {
  vaccine: 'Si lo dejas vacío, te avisaremos dentro de un año.',
  deworming: 'Si lo dejas vacío, te avisaremos dentro de tres meses.',
};

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

// La ficha guardada, traída al mismo formulario que la del alta: así editar y
// registrar no se pueden ir divergiendo campo a campo.
function formFromAnimal(animal: any): RegisterForm {
  return {
    name: animal?.name || '',
    species: animal?.species || 'cat',
    age: animal?.age || '',
    mood: (animal?.mood || '') as '' | AnimalMood,
    images: Array.isArray(animal?.images) ? animal.images.filter(Boolean) : [],
  };
}

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
  not_found: 'Esta mascota ya no está en tu cuenta. Recarga la página.',
  forbidden: 'Esta mascota no es tuya, así que no puedes editar su ficha.',
};

function backendErrorMessage(error: any, fallback: string) {
  const data = error?.response?.data;
  const code = data?.error;
  if (code && BACKEND_ERRORS[code]) return BACKEND_ERRORS[code];
  // El middleware `validate` responde con otra forma (`message`), no con `error`.
  if (data?.message === 'validation_error') return 'Revisa los datos: hay algún campo vacío o demasiado largo.';
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
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<RegisterForm>(REGISTER_INITIAL);
  const [editError, setEditError] = useState<string | null>(null);

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

  // El cuidado diario (marcas, detalle, resumen semanal) vive en DailyCareCard;
  // aquí solo se refresca lo que cachea el mismo animal por su cuenta.
  const invalidateAnimalCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['pet-animal-fallback', selectedPetId || assignedAnimalId || 'auto'] });
    // La home cachea el mismo animal 60 s: sin esto seguía diciendo que tocaba
    // rellenar la comida justo después de marcarla aquí.
    queryClient.invalidateQueries({ queryKey: ['tenant-featured-animal'] });
  };

  // Subida compartida por el alta y la edición: el mismo archivo, los mismos
  // límites y el mismo mensaje de error en los dos formularios.
  const addImage = async (
    file: File | null | undefined,
    setForm: React.Dispatch<React.SetStateAction<RegisterForm>>,
    setError: (message: string | null) => void,
  ) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Ese archivo no es una imagen. Sube un JPG o un PNG.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('La imagen supera los 10 MB. Prueba con una más ligera.');
      return;
    }
    setError(null);
    setUploadingImage(true);
    try {
      const { url } = await uploadImage(file);
      setForm(prev => ({ ...prev, images: [...prev.images, url] }));
    } catch (error: any) {
      setError(backendErrorMessage(error, 'No se pudo subir la imagen. Inténtalo otra vez.'));
    } finally {
      setUploadingImage(false);
    }
  };

  const addRegisterImage = (file?: File | null) => addImage(file, setRegisterForm, setRegisterError);
  const addEditImage = (file?: File | null) => addImage(file, setEditForm, setEditError);

  // Apuntar salud desde la ficha. Vive aquí y no en el panel del veterinario
  // porque quien pone la pipeta y guarda la cartilla es la familia.
  const [healthOpen, setHealthOpen] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthForm, setHealthForm] = useState<{ category: HealthCategory; note: string; nextDueAt: string }>({
    category: 'vaccine',
    note: '',
    nextDueAt: '',
  });

  const healthMutation = useMutation({
    mutationFn: async () => {
      const code = String(featuredAnimal?.code || '');
      if (!code) throw new Error('sin_codigo');
      return addHealthRecord(code, {
        category: healthForm.category,
        note: healthForm.note.trim(),
        // Vacío = que decida el servidor con el intervalo de la categoría; para
        // lo que no se repite, manda `null` y no programa nada.
        nextDueAt: healthForm.nextDueAt
          ? new Date(`${healthForm.nextDueAt}T09:00:00`).toISOString()
          : (DEFAULT_REPEAT_HINT[healthForm.category] ? undefined : null),
      });
    },
    onSuccess: (res) => {
      toast.success(res.nextDueAt ? 'Apuntado. Te avisaremos cuando toque.' : 'Apuntado en el pasaporte');
      setHealthOpen(false);
      setHealthForm({ category: 'vaccine', note: '', nextDueAt: '' });
      setHealthError(null);
      invalidateAnimalCaches();
    },
    onError: (error: any) => {
      setHealthError(backendErrorMessage(error, 'No hemos podido apuntarlo. Inténtalo de nuevo.'));
    },
  });

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

  const editMutation = useMutation({
    mutationFn: async () => {
      const id = String(currentPet?._id || currentPet?.id || '');
      if (!id) throw new Error('missing_pet_id');
      return updateMyPet(id, {
        name: editForm.name.trim(),
        species: editForm.species.trim(),
        age: editForm.age.trim(),
        images: editForm.images,
        // `null` borra el ánimo: sin él, quien lo puso por error no podía quitarlo.
        mood: editForm.mood || null,
      });
    },
    onSuccess: () => {
      toast.success('Ficha actualizada');
      setEditOpen(false);
      setEditError(null);
      refetchPets();
      invalidateAnimalCaches();
    },
    onError: (error: any) => {
      setEditError(backendErrorMessage(error, 'No hemos podido guardar los cambios. Inténtalo de nuevo.'));
    },
  });

  const openEdit = () => {
    if (!currentPet) return;
    setEditForm(formFromAnimal(currentPet));
    setEditError(null);
    setEditOpen(true);
  };

  const submitEdit = () => {
    const problem = validateRegisterForm(editForm);
    if (problem) {
      setEditError(problem);
      return;
    }
    setEditError(null);
    editMutation.mutate();
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditError(null);
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
          <PetFormModal
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
  // Solo se edita lo propio: el respaldo (`fallbackQuery`) puede estar pintando
  // el animal destacado de una protectora, que no es de esta familia.
  const canEdit = Boolean(currentPetEntry);

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
        ) : canEdit ? (
          // Sin foto, el hueco es el sitio donde la gente busca ponerla: que sea
          // el propio botón y no un cartel muerto que dice "Sin imagen".
          <button
            type="button"
            onClick={openEdit}
            className="rounded-2xl bg-[#F1ECE4] h-48 w-full flex flex-col items-center justify-center gap-1"
          >
            <span className="text-2xl">📷</span>
            <span className="text-sm font-semibold">Añadir una foto</span>
          </button>
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
        {(petCode || canEdit) && (
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={openEdit}
                className="px-3 py-2 rounded-xl text-sm font-semibold border"
                style={{ borderColor: '#6A7B4F', color: '#3F4A3C', background: '#FFFFFF' }}
              >
                ✏️ Editar ficha y fotos
              </button>
            )}
            {petCode && (
              <>
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
              </>
            )}
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
        <DailyCareCard
          animalId={String(featuredAnimal._id || featuredAnimal.id || '')}
          species={featuredAnimal.species}
          onMarked={invalidateAnimalCaches}
        />

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

      <div className="border rounded-2xl p-4" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Historial de salud</h2>
          <button
            type="button"
            className="text-sm font-semibold underline"
            style={{ color: '#2E6B4F' }}
            onClick={() => { setHealthOpen(v => !v); setHealthError(null); }}
          >
            {healthOpen ? 'Cancelar' : 'Apuntar'}
          </button>
        </div>

        {healthOpen && (
          <div className="mt-3 space-y-2 rounded-xl p-3" style={{ background: '#F7F5EF' }}>
            <label className="block text-sm">
              <span style={{ color: '#3F4A3C' }}>¿Qué le habéis hecho?</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: '#E7E1D5' }}
                value={healthForm.category}
                onChange={e => setHealthForm(f => ({ ...f, category: e.target.value as HealthCategory }))}
              >
                {HEALTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            <label className="block text-sm">
              <span style={{ color: '#3F4A3C' }}>Detalle</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: '#E7E1D5' }}
                placeholder="Trivalente, pipeta, revisión…"
                value={healthForm.note}
                onChange={e => setHealthForm(f => ({ ...f, note: e.target.value }))}
              />
            </label>

            <label className="block text-sm">
              <span style={{ color: '#3F4A3C' }}>¿Cuándo toca la próxima?</span>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: '#E7E1D5' }}
                value={healthForm.nextDueAt}
                min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                onChange={e => setHealthForm(f => ({ ...f, nextDueAt: e.target.value }))}
              />
              <span className="mt-1 block text-xs" style={{ color: '#7A8273' }}>
                {healthForm.nextDueAt
                  ? 'Te avisaremos por correo una semana antes.'
                  : DEFAULT_REPEAT_HINT[healthForm.category] || 'Sin fecha no enviaremos ningún aviso.'}
              </span>
            </label>

            {healthError && <p className="text-sm" style={{ color: '#B3261E' }}>{healthError}</p>}

            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: '#2E6B4F' }}
              disabled={healthMutation.isPending || !healthForm.note.trim()}
              onClick={() => healthMutation.mutate()}
            >
              {healthMutation.isPending ? 'Guardando…' : 'Apuntar en el pasaporte'}
            </button>
          </div>
        )}

        {Array.isArray(featuredAnimal.healthHistory) && featuredAnimal.healthHistory.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {featuredAnimal.healthHistory.map((entry: any, idx: number) => (
              <li key={idx} className="text-sm" style={{ color: '#3F4A3C' }}>
                <span className="text-xs" style={{ color: '#7A8273' }}>{entry.date ? new Date(entry.date).toLocaleDateString() : ''}</span>
                <div>{healthCategoryLabel(entry.type)}{entry.notes ? ` · ${entry.notes}` : ''}</div>
                {entry.nextDueAt && (
                  <div className="text-xs" style={{ color: '#7A8273' }}>
                    Próxima: {new Date(entry.nextDueAt).toLocaleDateString()}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          !healthOpen && (
            <p className="mt-2 text-sm" style={{ color: '#7A8273' }}>
              Aquí van las vacunas y desparasitaciones. Si apuntas cuándo toca la próxima, te avisamos.
            </p>
          )
        )}
      </div>

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
        <PetFormModal
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

      {editOpen && (
        <PetFormModal
          mode="edit"
          form={editForm}
          onClose={closeEdit}
          onChange={setEditForm}
          onUpload={addEditImage}
          onSubmit={submitEdit}
          submitting={editMutation.isPending}
          uploading={uploadingImage}
          error={editError}
        />
      )}
    </div>
  );
}

type PetFormModalProps = {
  form: RegisterForm;
  onChange: React.Dispatch<React.SetStateAction<RegisterForm>>;
  onUpload: (file?: File | null) => void;
  onSubmit: () => void;
  onClose: () => void;
  submitting: boolean;
  uploading: boolean;
  error?: string | null;
  mode?: 'create' | 'edit';
};

function PetFormModal({ form, onChange, onUpload, onSubmit, onClose, submitting, uploading, error, mode = 'create' }: PetFormModalProps) {
  const isEdit = mode === 'edit';
  const title = isEdit ? 'Editar ficha' : 'Registrar mascota';
  // La tarjeta y el pasaporte enseñan `images[0]`: para "cambiar la foto" basta
  // con poder poner otra la primera, sin obligar a borrar la que había.
  const makeMain = (index: number) =>
    onChange(prev => ({
      ...prev,
      images: [prev.images[index], ...prev.images.filter((_, i) => i !== index)],
    }));
  return (
    // El overlay hace scroll: en pantallas bajas el formulario no cabe entero y
    // antes los botones Cancelar/Guardar quedaban fuera, sin forma de alcanzarlos.
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl bg-white p-5 border"
        style={{ borderColor: '#E7E1D5' }}
      >
        <h2 className="text-xl font-semibold" style={{ color: '#3F4A3C' }}>{title}</h2>
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
            {isEdit ? 'Fotos' : 'Fotos (opcional)'}
            <input
              type="file"
              accept="image/*"
              disabled={uploading || submitting}
              onChange={e => {
                onUpload(e.target.files?.[0]);
                // Sin esto, volver a elegir el mismo archivo (tras quitarlo por
                // error) no dispara `change` y parecía que la subida fallaba.
                e.target.value = '';
              }}
            />
            {uploading && <span className="text-xs" style={{ color: '#7A8273' }}>Subiendo imagen…</span>}
          </label>
          {form.images.length > 0 && (
            <div className="grid gap-1">
              <div className="flex flex-wrap gap-2">
                {form.images.map((url, idx) => (
                  <div key={url + idx} className="relative">
                    <img
                      src={toAbsoluteUrl(url)}
                      alt={idx === 0 ? 'Foto principal' : `Foto ${idx + 1}`}
                      className="w-24 h-20 object-cover rounded border"
                      style={idx === 0 ? { borderColor: '#1F6F6F', borderWidth: 2 } : undefined}
                    />
                    <button
                      type="button"
                      aria-label="Quitar foto"
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6"
                      onClick={() => onChange(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                    >
                      ×
                    </button>
                    {idx === 0 ? (
                      <span
                        className="absolute bottom-1 left-1 text-[10px] font-semibold rounded px-1"
                        style={{ background: '#1F6F6F', color: '#FFFFFF' }}
                      >
                        Principal
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="absolute bottom-1 left-1 text-[10px] font-semibold rounded px-1 border"
                        style={{ background: '#FFFFFF', color: '#1F6F6F', borderColor: '#1F6F6F' }}
                        onClick={() => makeMain(idx)}
                      >
                        Hacer principal
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-xs" style={{ color: '#7A8273' }}>
                La foto principal es la que se ve en tu panel y en el pasaporte.
              </span>
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
            {submitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
