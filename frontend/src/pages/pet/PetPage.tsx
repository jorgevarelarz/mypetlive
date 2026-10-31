import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { BookOpen, Camera, CheckCircle2, MapPin, Pencil, Share2 } from 'lucide-react';
import PetSwitcher from '../../components/pet/PetSwitcher';
import { loadSelectedPet, saveSelectedPet } from '../../utils/selectedPet';
import { ageFromBirthDate, petAge } from '../../utils/age';
import { vaccinesFor } from '../../utils/vaccines';
import { QRCodeSVG } from 'qrcode.react';
import { listMyTags, claimTag, getTagEligibility } from '../../api/tags';
import { useAuth } from '../../context/AuthContext';
import { fetchFeaturedAnimal } from '../../utils/featuredAnimal';
import {
  listMyPets,
  createPersonalPet,
  markPetLost,
  listPetSightings,
  markPetFound,
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
import CareRemindersCard from '../../components/pet/CareRemindersCard';
import RehomeEntry from '../../components/rehome/RehomeEntry';
import MemorialFamily from '../../components/memorial/MemorialFamily';
import FarewellSheet from '../../components/memorial/FarewellSheet';
import { startMemorial } from '../../api/memorial';
import { loadPreferredProtectora, savePreferredProtectora, type PreferredProtectora } from '../../utils/preferredProtectora';
import { healthCategoryLabel, moodLabel, speciesLabel } from '../../styles/mypetlive';
import { shareLink, webUrl, openPaymentPage, isNativeApp } from '../../utils/native';

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
  { value: 'relajado', label: 'Tranquilo' },
  { value: 'carinoso', label: 'Cariñoso' },
  { value: 'energico', label: 'Enérgico' },
  { value: 'timido', label: 'Tímido' },
  { value: 'independiente', label: 'Independiente' },
  { value: 'en_adaptacion', label: 'En adaptación' },
];

const SPECIES_OPTIONS = [
  { value: 'cat', label: 'Gato' },
  { value: 'dog', label: 'Perro' },
  { value: 'rabbit', label: 'Conejo' },
  { value: 'bird', label: 'Ave' },
  { value: 'reptile', label: 'Reptil' },
  { value: 'other', label: 'Otro' },
];

// Sexo y tamaño con "sin especificar" de primero y a propósito: son opcionales
// en el modelo y quien no lo sepa (una acogida recién llegada) no tiene por qué
// inventárselo. Lo que NO puede volver a pasar es que la ficha lo rellene sola.
const SEX_OPTIONS: Array<{ value: '' | 'male' | 'female'; label: string }> = [
  { value: '', label: 'Sin especificar' },
  { value: 'female', label: 'Hembra' },
  { value: 'male', label: 'Macho' },
];

const SIZE_OPTIONS: Array<{ value: '' | 'small' | 'medium' | 'large'; label: string }> = [
  { value: '', label: 'Sin especificar' },
  { value: 'small', label: 'Pequeño' },
  { value: 'medium', label: 'Mediano' },
  { value: 'large', label: 'Grande' },
];

const REGISTER_INITIAL = {
  name: '',
  species: 'cat',
  age: '',
  // Fecha de nacimiento (AAAA-MM-DD): la edad sale de ella.
  birthDate: '',
  sex: '' as '' | 'male' | 'female',
  size: '' as '' | 'small' | 'medium' | 'large',
  mood: '' as '' | AnimalMood,
  // Solo en el alta: la fecha de la última vacuna. No es un campo del animal,
  // es la semilla del pasaporte — ver `registerMutation`.
  lastVaccine: '',
  lastVaccineType: '',
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
    birthDate: animal?.birthDate ? String(animal.birthDate).slice(0, 10) : '',
    sex: (animal?.sex || '') as '' | 'male' | 'female',
    size: (animal?.size || '') as '' | 'small' | 'medium' | 'large',
    mood: (animal?.mood || '') as '' | AnimalMood,
    // Vacío a propósito: editar la ficha no reabre el alta. Para apuntar salud
    // está el formulario de la propia ficha, que además admite todas las
    // categorías y no solo la vacuna.
    lastVaccine: '',
    lastVaccineType: '',
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
  if (!form.birthDate && !form.age.trim()) return 'Indica su fecha de nacimiento.';
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
  // Chapas. Sin esto, activar una chapa ya usada enseñaba "tag_already_claimed".
  tag_not_found: 'Ese código no es de ninguna chapa de MyPetLive. Revísalo: son letras y números.',
  tag_already_claimed: 'Esa chapa ya está vinculada a otra mascota.',
  tag_revoked: 'Esa chapa está anulada y no se puede usar.',
  animal_already_tagged: 'Esta mascota ya tiene una chapa. Suéltala antes de vincular otra.',
  animal_code_required: 'No hemos podido identificar a tu mascota. Recarga la página.',
  animal_not_found: 'No hemos podido identificar a tu mascota. Recarga la página.',
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
  // La elegida se recuerda (la comparte el inicio, ver utils/selectedPet).
  const [selectedPetId, setSelectedPetIdState] = useState<string | null>(() => loadSelectedPet());
  const setSelectedPetId = (id: string | null) => {
    setSelectedPetIdState(id);
    saveSelectedPet(id);
  };
  // «+ Añadir» del inicio llega con ?nueva=1 y abre el alta directamente.
  // Una notificación («Han visto a Luna») llega con ?mascota=<id> y la deja elegida.
  const [searchParams, setSearchParams] = useSearchParams();
  const [registerOpen, setRegisterOpen] = useState(() => searchParams.get('nueva') === '1');
  useEffect(() => {
    const fromPush = searchParams.get('mascota');
    if (fromPush) setSelectedPetId(fromPush);
    if (searchParams.get('nueva') === '1' || fromPush) {
      const next = new URLSearchParams(searchParams);
      next.delete('nueva');
      next.delete('mascota');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    // Mientras se cargan no hay nada que corregir: borrar aquí la elegida pisaba
    // la que trae `?mascota=` (tocar una notificación abría otra mascota).
    if (!myPets) return;
    if (!petItems.length) {
      setSelectedPetId(null);
      return;
    }
    if (selectedPetId && petItems.some(item => String(item.animal?._id || item.animal?.id) === selectedPetId)) {
      return;
    }
    const firstId = String(petItems[0].animal?._id || petItems[0].animal?.id || '');
    setSelectedPetId(firstId || null);
  }, [myPets, petItems, selectedPetId]);

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
    const ok = await shareLink({
      title: `Pasaporte de ${featuredAnimal?.name || 'mi mascota'}`,
      text: `Conoce el pasaporte digital de ${featuredAnimal?.name || 'mi mascota'} (${petCode}) en MyPetLive`,
      path: `/p/${encodeURIComponent(petCode)}`,
      onCopied: () => toast.success('Enlace del pasaporte copiado'),
    });
    if (!ok) toast.error('No se pudo compartir');
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

  // ---------------------------------------------------------------- la chapa
  //
  // En producción había **100 chapas fabricadas y 0 reclamadas**, y no era
  // casualidad: la única forma de activar una era escanearla, y en la app no
  // existía una sola pantalla que dijera que la chapa existe. Aquí se ve el QR
  // del pasaporte —que ya sirve para imprimirlo uno mismo— y se puede activar
  // una chapa física tecleando su código, sin tener que escanearla.
  const tagsQ = useQuery({ queryKey: ['mis-chapas'], queryFn: listMyTags, enabled: Boolean(authToken) });
  const [tagCode, setTagCode] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  const petCodeActual = String(currentPet?.code || featuredAnimal?.code || '');
  const chapa = (tagsQ.data?.items || []).find(t => t.animal?.code && t.animal.code === petCodeActual);
  // ¿Hay chapa en la tienda y ya la ha comprado? Decide qué enseña su tarjeta.
  const tagEligQ = useQuery({ queryKey: ['chapa-eligibility'], queryFn: getTagEligibility, enabled: Boolean(authToken) });

  const claimMutation = useMutation({
    mutationFn: async () => claimTag(tagCode.trim(), petCodeActual),
    onSuccess: () => {
      toast.success('Chapa activada. Ya lleva el pasaporte colgado del collar.');
      setTagCode('');
      setTagError(null);
      tagsQ.refetch();
    },
    onError: (error: any) => {
      setTagError(backendErrorMessage(error, 'No hemos podido activar la chapa.'));
    },
  });

  // ---------------------------------------------------------------- modo perdido
  //
  // Marcar "se ha perdido" PUBLICA datos: el pasaporte es la página del QR de la
  // chapa y cualquiera que la escanee la ve. Por eso el diálogo lo dice antes de
  // guardar y el teléfono se escribe aquí, en vez de tirar del que haya en el
  // perfil: así se elige qué número se enseña y se consiente en el momento.
  const [lostOpen, setLostOpen] = useState(false);
  const [lostError, setLostError] = useState<string | null>(null);
  const [lostForm, setLostForm] = useState({ area: '', notes: '', contact: '' });

  const lostMutation = useMutation({
    mutationFn: async () => {
      const id = String(currentPet?._id || currentPet?.id || '');
      if (!id) throw new Error('missing_pet_id');
      return markPetLost(id, {
        area: lostForm.area.trim() || undefined,
        notes: lostForm.notes.trim() || undefined,
        contact: lostForm.contact.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Marcado como perdido. Su pasaporte ya lo dice.');
      setLostOpen(false);
      setLostError(null);
      refetchPets();
      invalidateAnimalCaches();
    },
    onError: (error: any) => {
      setLostError(backendErrorMessage(error, 'No hemos podido marcarlo. Inténtalo de nuevo.'));
    },
  });

  // Despedirla: su ficha pasa a ser su mural (ver components/memorial).
  const [farewellOpen, setFarewellOpen] = useState(false);
  const farewellMutation = useMutation({
    mutationFn: async (diedAt?: string) => {
      const id = String(currentPet?._id || currentPet?.id || '');
      if (!id) throw new Error('missing_pet_id');
      return startMemorial(id, diedAt);
    },
    onSuccess: () => {
      setFarewellOpen(false);
      refetchPets();
      invalidateAnimalCaches();
    },
    onError: () => toast.error('No se ha podido guardar. Inténtalo de nuevo.'),
  });

  const foundMutation = useMutation({
    mutationFn: async () => {
      const id = String(currentPet?._id || currentPet?.id || '');
      if (!id) throw new Error('missing_pet_id');
      return markPetFound(id);
    },
    onSuccess: () => {
      toast.success('¡Qué alegría! Su pasaporte vuelve a la normalidad.');
      refetchPets();
      invalidateAnimalCaches();
    },
    onError: (error: any) => {
      toast.error(backendErrorMessage(error, 'No hemos podido actualizarlo.'));
    },
  });

  const openLost = () => {
    // El teléfono del perfil se propone, no se publica solo: llega escrito en el
    // campo y quien lo marca lo ve, lo cambia o lo borra antes de guardar.
    setLostForm({ area: '', notes: '', contact: String((user as any)?.profile?.phone || '') });
    setLostError(null);
    setLostOpen(true);
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      const creada = await createPersonalPet({
        name: registerForm.name.trim(),
        species: registerForm.species.trim(),
        birthDate: registerForm.birthDate || undefined,
        age: registerForm.birthDate ? undefined : registerForm.age.trim(),
        images: registerForm.images,
        // Vacío = no se manda el campo. El modelo ya no rellena por su cuenta.
        sex: registerForm.sex || undefined,
        size: registerForm.size || undefined,
        mood: registerForm.mood || undefined,
      }, authToken || undefined);

      // La semilla del pasaporte. Sin esto el alta termina en una ficha vacía:
      // sin salud, sin despensa y sin nada que devuelva a nadie a la app. En
      // producción había 22 mascotas y CERO entradas de salud, o sea que la
      // función que avisa de lo que toca no tenía de qué avisar.
      //
      // No se manda `nextDueAt`: el servidor le suma el intervalo de la
      // categoría A LA FECHA QUE SE APUNTA, así que una vacuna de hace ocho
      // meses programa el aviso dentro de cuatro, no dentro de doce.
      //
      // Y si esta llamada falla, el alta NO falla: la mascota ya existe.
      if (registerForm.lastVaccine && creada?.code) {
        try {
          await addHealthRecord(String(creada.code), {
            category: 'vaccine',
            note: registerForm.lastVaccineType ? `Vacuna: ${registerForm.lastVaccineType}` : 'Vacunación',
            date: new Date(`${registerForm.lastVaccine}T09:00:00`).toISOString(),
          });
        } catch {
          toast('Hemos registrado a tu mascota, pero no pudimos apuntar la vacuna. Puedes hacerlo desde su ficha.');
        }
      }
      return creada;
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
        // Con fecha, el servidor recalcula la edad; sin ella (fichas viejas) se
        // conserva el texto que tuviera.
        ...(editForm.birthDate ? { birthDate: editForm.birthDate } : { age: editForm.age.trim() }),
        images: editForm.images,
        // `null` borra el ánimo: sin él, quien lo puso por error no podía quitarlo.
        mood: editForm.mood || null,
        // Igual con sexo y tamaño, y aquí importa más: toda mascota dada de alta
        // antes del 2 sep 2026 salió con "hembra" y "mediano" puestos por el
        // modelo sin que nadie los eligiera, así que esto es la vía para
        // corregirlos —o dejarlos en blanco— desde la propia ficha.
        sex: editForm.sex || null,
        size: editForm.size || null,
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

  const showChips = petItems.length > 1;

  // Mientras está perdido, los avisos de quien escanea la chapa (la notificación
  // «Han visto a…» trae aquí). Se refrescan solos: es cuando más se mira.
  const lostPetId = currentPetEntry && currentPet?.lost?.isLost ? String(currentPet._id || currentPet.id || '') : '';
  const sightingsQ = useQuery({
    queryKey: ['pet-sightings', lostPetId],
    queryFn: () => listPetSightings(lostPetId),
    enabled: Boolean(lostPetId),
    refetchInterval: 60_000,
  });
  const sightings = sightingsQ.data?.items || [];

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
          <RehomeEntry style={{ alignSelf: 'center' }} />
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
  const inMemory = Boolean(featuredAnimal.memorial?.active);

  return (
    <div className="p-4 grid gap-4" style={{ color: '#3F4A3C' }}>
      <div className="flex flex-wrap items-center gap-3">
        {showChips && (
          <PetSwitcher
            pets={petItems.map(item => item.animal).filter(Boolean)}
            selectedId={selectedPetId}
            onSelect={setSelectedPetId}
          />
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
          <RehomeEntry />
        </div>
      </div>

      {inMemory && canEdit ? (
        <MemorialFamily animal={featuredAnimal} onChanged={() => { refetchPets(); invalidateAnimalCaches(); }} />
      ) : (
      <>
      {/* Ficha tipo carnet: la foto con sus datos encima y debajo cuatro
          accesos. Antes eran botones con emojis repartidos en tres filas. */}
      <div className="border rounded-2xl overflow-hidden" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
        <div className="relative" style={{ aspectRatio: '4 / 3', background: '#F1ECE4' }}>
          {image ? (
            <img src={toAbsoluteUrl(image)} alt={featuredAnimal.name} className="absolute inset-0 h-full w-full object-cover" />
          ) : canEdit ? (
            // Sin foto, el hueco es el sitio donde la gente busca ponerla.
            <button
              type="button"
              onClick={openEdit}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{ padding: 0, border: 0, background: 'transparent', color: '#6B7464' }}
            >
              <Camera size={30} />
              <span className="text-sm font-semibold">Añadir una foto</span>
            </button>
          ) : null}
          <div
            className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-10"
            style={{ background: image ? 'linear-gradient(to top, rgba(20,28,20,.72), rgba(20,28,20,0))' : 'transparent', color: image ? '#FFFFFF' : '#3F4A3C', pointerEvents: 'none' }}
          >
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-extrabold" style={{ fontFamily: '"Bricolage Grotesque", sans-serif', margin: 0 }}>
                {featuredAnimal.name || 'Mi mascota'}
              </h1>
              {code && <span className="text-xs font-bold tracking-wide" style={{ opacity: 0.85 }}>{code}</span>}
            </div>
            <div className="text-sm font-semibold" style={{ opacity: 0.9 }}>
              {[speciesLabel(featuredAnimal.species) || 'Animal', petAge(featuredAnimal), mood ? moodLabel(mood) : ''].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        {(petCode || canEdit) && (
          <div className="grid grid-cols-4" style={{ borderTop: '1px solid #E7E1D5' }}>
            {canEdit && (
              <CardAction icon={<Pencil size={20} />} label="Editar" onClick={openEdit} />
            )}
            {petCode && (
              <CardAction icon={<BookOpen size={20} />} label="Pasaporte" onClick={() => nav(`/p/${encodeURIComponent(petCode)}`)} />
            )}
            {petCode && (
              <CardAction icon={<Share2 size={20} />} label="Compartir" onClick={handleSharePassport} />
            )}
            {/* «Se ha perdido» activa lo que enseña la chapa a quien la escanea. */}
            {canEdit && (
              featuredAnimal.lost?.isLost ? (
                <CardAction
                  icon={<CheckCircle2 size={20} />}
                  label={foundMutation.isPending ? 'Guardando…' : 'Ha aparecido'}
                  color="#566A3D"
                  onClick={() => foundMutation.mutate()}
                  disabled={foundMutation.isPending}
                />
              ) : (
                <CardAction icon={<MapPin size={20} />} label="Perdido" color="#C0512F" onClick={openLost} />
              )
            )}
          </div>
        )}
      </div>

      {featuredAnimal.lost?.isLost && (
        <div className="border rounded-2xl p-4" style={{ borderColor: '#C8553D', background: '#FFF4F1' }}>
          <div className="font-semibold" style={{ color: '#8F3827' }}>
            📍 {featuredAnimal.name} está marcado como perdido
          </div>
          <p className="text-sm" style={{ color: '#7A8273', margin: '6px 0 0' }}>
            Su pasaporte lo dice y enseña
            {featuredAnimal.lost.contact ? ` tu contacto (${featuredAnimal.lost.contact})` : ' el formulario de aviso'}
            {' '}a quien escanee su chapa. Cuando aparezca, dale a «Ha aparecido» y deja de mostrarse.
          </p>
          {lostPetId && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <div className="text-sm font-semibold" style={{ color: '#3F4A3C' }}>
                {sightings.length
                  ? `Avisos de que le han visto (${sightings.length})`
                  : 'Aún no hay avisos. Te mandaremos una notificación en cuanto alguien escanee su chapa.'}
              </div>
              {sightings.map((s, i) => {
                const mapUrl = s.lat !== undefined && s.lng !== undefined
                  ? `https://www.google.com/maps?q=${s.lat},${s.lng}`
                  : null;
                return (
                  <div key={`${s.at}-${i}`} className="rounded-xl border bg-white p-3 text-sm" style={{ borderColor: '#E7E1D5', color: '#3F4A3C' }}>
                    <div className="text-xs" style={{ color: '#7A8273' }}>
                      {new Date(s.at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                    {s.note && <div style={{ marginTop: 4 }}>«{s.note}»</div>}
                    {s.contact && <div style={{ marginTop: 4 }}>Contacto: <strong>{s.contact}</strong></div>}
                    {mapUrl ? (
                      <button
                        type="button"
                        onClick={() => (isNativeApp() ? void openPaymentPage(mapUrl) : window.open(mapUrl, '_blank', 'noopener'))}
                        className="font-semibold"
                        style={{ marginTop: 6, padding: 0, background: 'none', border: 0, color: '#1F6F6F' }}
                      >
                        📍 Ver dónde en el mapa{s.accuracy ? ` (±${Math.round(s.accuracy)} m)` : ''}
                      </button>
                    ) : (
                      <div className="text-xs" style={{ marginTop: 4, color: '#7A8273' }}>No compartió su ubicación.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {currentPetEntry?.type === 'adopted' && (
        <WelcomeChecklist
          animalId={String(featuredAnimal._id || featuredAnimal.id || '')}
          petName={featuredAnimal.name}
        />
      )}

      <DailyCareCard
        animalId={String(featuredAnimal._id || featuredAnimal.id || '')}
        species={featuredAnimal.species}
        onMarked={invalidateAnimalCaches}
      />

      {canEdit && (
        <CareRemindersCard
          animalId={String(featuredAnimal._id || featuredAnimal.id || '')}
          species={featuredAnimal.species}
          petName={featuredAnimal.name}
        />
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

      {/* La chapa. Es lo único físico que tiene MyPetLive y lo que hace que el
          pasaporte sirva de algo el día que el animal se pierde, y hasta ahora
          la app no la mencionaba en ninguna parte. */}
      {petCodeActual && (
        <div className="border rounded-2xl p-4 grid gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">La chapa de {featuredAnimal.name}</h2>
          {chapa ? (
            // Vinculada: quien la escanee llega a su pasaporte.
            <div className="flex items-center gap-4">
              <div style={{ background: '#FFFFFF', border: '1px solid #E7E1D5', borderRadius: 10, padding: 6, flexShrink: 0 }}>
                <QRCodeSVG value={webUrl(`/p/${encodeURIComponent(petCodeActual)}`)} size={72} bgColor="#ffffff" fgColor="#2E3A2C" />
              </div>
              <p className="text-sm" style={{ color: '#3F4A3C', margin: 0 }}>
                Chapa <strong style={{ fontFamily: 'ui-monospace, monospace' }}>{chapa.code}</strong> activada
                {typeof chapa.scans === 'number' ? ` · ${chapa.scans} ${chapa.scans === 1 ? 'escaneo' : 'escaneos'}` : ''}.
                {' '}Quien se encuentre a {featuredAnimal.name} y la escanee llega a su pasaporte.
              </p>
            </div>
          ) : tagEligQ.data?.purchased ? (
            // Ya la ha comprado (pedido pagado): ahora toca registrar su código.
            <div className="grid gap-2">
              <p className="text-sm" style={{ color: '#3F4A3C', margin: 0 }}>
                Escribe el código que viene grabado en la chapa para vincularla a {featuredAnimal.name}.
              </p>
              <div className="flex gap-2">
                <input
                  className="border rounded px-3 py-2 text-sm"
                  style={{ fontFamily: 'ui-monospace, monospace', textTransform: 'uppercase', flex: 1, minWidth: 0 }}
                  placeholder="Código de la chapa"
                  value={tagCode}
                  onChange={e => { setTagCode(e.target.value); setTagError(null); }}
                />
                <button
                  type="button"
                  disabled={!tagCode.trim() || claimMutation.isPending}
                  onClick={() => claimMutation.mutate()}
                  className="px-3 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: tagCode.trim() ? '#1F6F6F' : '#C9D2C4', color: '#FFFFFF', flexShrink: 0 }}
                >
                  {claimMutation.isPending ? 'Registrando…' : 'Registrar chapa'}
                </button>
              </div>
              {tagError && <p className="text-xs" style={{ color: '#8F3827', margin: 0 }}>{tagError}</p>}
            </div>
          ) : (
            // Sin chapa: se ofrece pedirla. Con el pedido pagado aparece el registro.
            <div className="grid gap-3">
              <p className="text-sm" style={{ color: '#3F4A3C', margin: 0 }}>
                No tienes chapa de {featuredAnimal.name}. Pide la tuya ya: con ella, quien se la encuentre
                y la escanee llega a su pasaporte y puede avisarte.
              </p>
              {tagEligQ.data?.productId && (
                <button
                  type="button"
                  onClick={() => nav(`/tienda/${tagEligQ.data!.productId}`)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold justify-self-start"
                  style={{ background: '#C0512F', color: '#FFFFFF' }}
                >
                  Pedir chapa{tagEligQ.data?.priceEur ? ` · ${tagEligQ.data.priceEur.toLocaleString('es-ES')} €` : ''}
                </button>
              )}
            </div>
          )}
        </div>
      )}

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

      {/* Cupones solo si la mascota viene de una protectora: sin ella no hay
          ninguno y la tarjeta solo decía eso. */}
      {shelterId && (
        <div className="border rounded-2xl p-4 grid gap-3" style={{ borderColor: '#E7E1D5', background: '#FFFFFF' }}>
          <h2 className="text-lg font-semibold">Cupones</h2>
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
        </div>
      )}

      {/* Discreto y al final: nadie debería encontrárselo buscando otra cosa. */}
      {canEdit && (
        <button
          type="button"
          onClick={() => setFarewellOpen(true)}
          style={{ justifySelf: 'center', padding: '8px 0', border: 0, background: 'none', color: '#6B7464', fontSize: 14, textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          {featuredAnimal.name} ha fallecido
        </button>
      )}
      </>
      )}

      {farewellOpen && (
        <FarewellSheet
          petName={featuredAnimal.name}
          busy={farewellMutation.isPending}
          onCancel={() => setFarewellOpen(false)}
          onConfirm={diedAt => farewellMutation.mutate(diedAt)}
        />
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

      {lostOpen && (
        <div className="safe-top fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Marcar como perdido"
            className="w-full max-w-md rounded-2xl bg-white p-5 border"
            style={{ borderColor: '#E7E1D5' }}
          >
            <h2 className="text-xl font-semibold" style={{ color: '#3F4A3C' }}>
              ¿Se ha perdido {featuredAnimal.name}?
            </h2>

            {/* El aviso va ARRIBA y antes de pedir nada: es la información con
                la que se decide, no la letra pequeña de debajo del botón. */}
            <div
              className="text-sm rounded-xl border p-3"
              style={{ marginTop: 12, borderColor: '#C8553D', background: '#FFF4F1', color: '#8F3827' }}
            >
              <strong>Se van a publicar tus datos.</strong> Mientras esté marcado como perdido, su
              pasaporte —la página del QR de su chapa— mostrará tu nombre de pila y el teléfono que
              dejes aquí, para que quien lo encuentre pueda avisarte. Dejan de verse en cuanto
              marques que ha aparecido.
            </div>

            <div className="grid gap-3 mt-3 text-sm">
              <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
                Teléfono de contacto
                <input
                  className="border rounded px-3 py-2"
                  value={lostForm.contact}
                  placeholder="Ej.: 600 123 456"
                  onChange={e => setLostForm(prev => ({ ...prev, contact: e.target.value }))}
                />
                <span className="text-xs" style={{ color: '#7A8273' }}>
                  Opcional. Si lo dejas vacío no se publica nada tuyo y quien lo encuentre solo podrá
                  avisarte por el formulario del pasaporte, sin ver tus datos.
                </span>
              </label>
              <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
                ¿Por dónde se perdió?
                <input
                  className="border rounded px-3 py-2"
                  value={lostForm.area}
                  placeholder="Ej.: Sada, cerca del puerto"
                  onChange={e => setLostForm(prev => ({ ...prev, area: e.target.value }))}
                />
              </label>
              <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
                Algo que ayude a reconocerlo
                <textarea
                  className="border rounded px-3 py-2"
                  value={lostForm.notes}
                  placeholder="Ej.: collar rojo, es muy asustadizo"
                  onChange={e => setLostForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </label>
            </div>

            {lostError && <p className="text-sm" style={{ color: '#8F3827', marginTop: 10 }}>{lostError}</p>}

            <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
              <button
                type="button"
                onClick={() => { setLostOpen(false); setLostError(null); }}
                className="px-3 py-2 rounded-xl text-sm font-semibold border"
                style={{ borderColor: '#D7D0C2', color: '#3F4A3C', background: '#FFFFFF' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => lostMutation.mutate()}
                disabled={lostMutation.isPending}
                className="px-3 py-2 rounded-xl text-sm font-semibold"
                style={{ background: '#C8553D', color: '#FFFFFF' }}
              >
                {lostMutation.isPending ? 'Guardando…' : 'Marcar como perdido'}
              </button>
            </div>
          </div>
        </div>
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
  // Portal a <body>: dentro de la app el contenido se desplaza en #root y el
  // iPhone no dejaba desplazar este diálogo fijo metido ahí dentro.
  return createPortal(
    // El overlay hace scroll: en pantallas bajas el formulario no cabe entero y
    // antes los botones Cancelar/Guardar quedaban fuera, sin forma de alcanzarlos.
    <div className="safe-top fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-6 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pet-form w-full max-w-md rounded-2xl bg-white p-5 border"
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
            <select className="border rounded px-3 py-2" value={form.species} onChange={e => onChange(prev => ({ ...prev, species: e.target.value, lastVaccineType: vaccinesFor(e.target.value).includes(prev.lastVaccineType) ? prev.lastVaccineType : '' }))}>
              {SPECIES_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          {/* Sexo y tamaño en una sola fila: son dos desplegables cortos y en
              vertical alargaban el diálogo hasta obligar a hacer scroll para
              llegar a Guardar. */}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
              Sexo
              <select
                className="border rounded px-3 py-2"
                value={form.sex}
                onChange={e => onChange(prev => ({ ...prev, sex: e.target.value as '' | 'male' | 'female' }))}
              >
                {SEX_OPTIONS.map(option => (
                  <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
              Tamaño
              <select
                className="border rounded px-3 py-2"
                value={form.size}
                onChange={e => onChange(prev => ({ ...prev, size: e.target.value as '' | 'small' | 'medium' | 'large' }))}
              >
                {SIZE_OPTIONS.map(option => (
                  <option key={option.value || 'none'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
            Fecha de nacimiento
            {/* La edad se calcula de aquí y se actualiza sola en cada cumpleaños. */}
            <input
              type="date"
              className="border rounded px-3 py-2"
              max={new Date().toISOString().slice(0, 10)}
              value={form.birthDate}
              onChange={e => onChange(prev => ({ ...prev, birthDate: e.target.value }))}
            />
            <span className="text-xs" style={{ color: '#7A8273' }}>
              {form.birthDate
                ? `Tiene ${ageFromBirthDate(form.birthDate).toLowerCase()}.`
                : isEdit && form.age
                  ? `Ahora pone «${form.age}». Si no sabes el día exacto, una fecha aproximada vale.`
                  : 'Si no sabes el día exacto, una fecha aproximada vale.'}
            </span>
          </label>
          {/* Solo en el alta. Es la única pregunta del formulario que no describe
              al animal sino que ARRANCA algo: con ella el pasaporte nace con un
              hito y con un aviso programado, y la app tiene por fin una razón
              para volver a escribir. Opcional, y quien no la sepa la deja. */}
          {!isEdit && (
            <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
              ¿Cuándo fue su última vacuna?
              <input
                type="date"
                className="border rounded px-3 py-2"
                max={new Date().toISOString().slice(0, 10)}
                value={form.lastVaccine}
                onChange={e => onChange(prev => ({ ...prev, lastVaccine: e.target.value }))}
              />
              {/* Las opciones dependen de la especie elegida arriba. */}
              <select
                className="border rounded px-3 py-2"
                aria-label="Tipo de vacuna"
                value={form.lastVaccineType}
                onChange={e => onChange(prev => ({ ...prev, lastVaccineType: e.target.value }))}
              >
                <option value="">Tipo de vacuna (opcional)</option>
                {vaccinesFor(form.species).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <span className="text-xs" style={{ color: '#7A8273' }}>
                Opcional. Si la pones, te avisamos una semana antes de la siguiente y su pasaporte
                empieza con su primer hito de salud.
              </span>
            </label>
          )}
          <label className="grid gap-1" style={{ color: '#3F4A3C' }}>
            ¿Qué carácter tiene?
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
    </div>,
    document.body,
  );
}

// Acceso de la ficha tipo carnet: icono y texto, todos del mismo tamaño.
function CardAction({ icon, label, onClick, color = '#1F6F6F', disabled }: { icon: React.ReactNode; label: string; onClick: () => void; color?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1"
      style={{ padding: '12px 4px', border: 0, background: '#FFFFFF', color, font: 'inherit', fontSize: 12.5, fontWeight: 700, minWidth: 0, cursor: 'pointer' }}
    >
      {icon}
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{label}</span>
    </button>
  );
}
