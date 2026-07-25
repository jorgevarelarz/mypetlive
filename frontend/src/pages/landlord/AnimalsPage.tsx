import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { AlertTriangle, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  AnimalMood,
  AnimalStatus,
  createAnimal,
  deleteAnimal,
  listAllShelterAnimals,
  updateAnimal,
  updateAnimalStatus,
} from '../../api/animals';
import { uploadImage } from '../../api/uploads';
import { getPatitasBalance } from '../../api/patitas';
import { getMyVerification } from '../../api/verification';
import { toAbsoluteUrl } from '../../utils/media';
import {
  MPL,
  MPL_FONT_BODY,
  MPL_FONT_DISPLAY,
  ageGroupLabel,
  moodLabel,
  sexLabel,
  sizeLabel,
  speciesLabel,
  statusLabel,
} from '../../styles/mypetlive';

// Los siete estados reales de `animal.model` / `animalStatusSchema`. Las etiquetas
// salen de `statusLabel` para no mantener dos vocabularios en paralelo.
const STATUS_VALUES: AnimalStatus[] = [
  'borrador',
  'publicado',
  'reservado',
  'preadoptado',
  'adoptado',
  'no_disponible',
  'archivado',
];

// La especie se guarda canonizada (`set: normalizeSpecies` convierte perro→dog y
// gato→cat), así que un campo de texto libre acababa pintando "dog" en la ficha y
// permitía typos ("perrp") que ningún filtro del buscador puede casar. Los valores
// son exactamente los que entiende `speciesLabel`.
const SPECIES_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'dog', label: 'Perro' },
  { value: 'cat', label: 'Gato' },
  { value: 'rabbit', label: 'Conejo' },
  { value: 'bird', label: 'Ave' },
  { value: 'other', label: 'Otro' },
];

const AGE_GROUP_OPTIONS: Array<{ value: '' | 'puppy' | 'young' | 'adult' | 'senior'; label: string }> = [
  // Sin opción vacía el formulario mandaba "adult" por defecto y la ficha afirmaba
  // una etapa vital que la protectora no había elegido. `ageGroup` es opcional.
  { value: '', label: 'Sin especificar' },
  { value: 'puppy', label: 'Cachorro' },
  { value: 'young', label: 'Joven' },
  { value: 'adult', label: 'Adulto' },
  { value: 'senior', label: 'Senior' },
];

const PERSONALITY_OPTIONS = ['Juguetón', 'Curioso', 'Sociable', 'Tranquilo', 'Independiente', 'Cariñoso'];

const MOOD_OPTIONS: Array<{ value: AnimalMood; label: string; icon: string }> = [
  { value: 'relajado', label: 'Relajado', icon: '🌱' },
  { value: 'timido', label: 'Tímido', icon: '🍃' },
  { value: 'energico', label: 'Enérgico', icon: '⚡️' },
  { value: 'en_adaptacion', label: 'En adaptación', icon: '💫' },
];

// Límites que ya aplica el servidor y que la UI tiene que respetar para no
// provocar un 400 sin explicación: `personality` lleva validador de máximo 3 en el
// modelo (`personality_limit`) y en `animalCreateSchema`, que además topa imágenes
// en 20, ciudad en 120 y descripción en 8000. Multer rechaza archivos > 10 MB.
const MAX_PERSONALITY = 3;
const MAX_IMAGES = 20;
const MAX_CITY = 120;
const MAX_DESCRIPTION = 8000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const FIELD_LABELS: Record<string, string> = {
  shelter: 'protectora',
  name: 'nombre',
  species: 'especie',
  breed: 'raza',
  sex: 'sexo',
  age: 'edad',
  ageGroup: 'etapa vital',
  city: 'ciudad',
  size: 'tamaño',
  status: 'estado',
  personality: 'personalidad',
  mood: 'estado emocional',
  description: 'descripción',
  images: 'imágenes',
};

// Códigos del backend traducidos: sin esto la protectora leía literalmente
// "shelter_verification_required" en un toast.
const BACKEND_ERRORS: Record<string, string> = {
  shelter_verification_required: 'Para publicar animales tu protectora tiene que estar verificada.',
  forbidden: 'Esa ficha no es de tu protectora.',
  'No autorizado': 'Tu cuenta no tiene permiso para gestionar fichas de animales.',
  not_found: 'La ficha ya no existe. Recarga el listado.',
  invalid_status: 'Ese estado no existe.',
  invalid_file_type: 'Ese archivo no es una imagen. Sube un JPG o un PNG.',
  missing_file: 'No hemos recibido el archivo. Vuelve a intentarlo.',
  upload_error: 'No se pudo subir la imagen. Inténtalo otra vez.',
  animal_code_generation_failed: 'No hemos podido generar el código del animal. Inténtalo otra vez.',
  unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
};

function backendErrorMessage(error: any, fallback: string) {
  const data = error?.response?.data;
  const code = data?.error;
  if (typeof code === 'string' && BACKEND_ERRORS[code]) return BACKEND_ERRORS[code];
  // `validate()` responde `{ message: 'validation_error', details }` y NO trae campo
  // `error`, así que el patrón habitual `data.error || fallback` se comía el motivo
  // real y la protectora solo veía "No se pudo crear" sin saber qué campo falla.
  if (data?.message === 'validation_error') {
    const fields = Object.keys(data?.details?.fieldErrors || {});
    const named = fields.map(field => FIELD_LABELS[field] || field);
    return named.length
      ? `El servidor ha rechazado estos campos: ${named.join(', ')}.`
      : 'Hay datos de la ficha que el servidor no acepta.';
  }
  if (error?.response?.status === 413) return 'El archivo es demasiado grande (máximo 10 MB).';
  return fallback;
}

const INITIAL_FORM = {
  name: '',
  species: '',
  breed: '',
  sex: 'female' as 'male' | 'female',
  age: '',
  ageGroup: '' as '' | 'puppy' | 'young' | 'adult' | 'senior',
  city: '',
  size: 'medium' as 'small' | 'medium' | 'large',
  goodWithChildren: false,
  goodWithDogs: false,
  goodWithCats: false,
  description: '',
  status: 'borrador' as AnimalStatus,
  personality: [] as string[],
  mood: '' as '' | AnimalMood,
};

type AnimalForm = typeof INITIAL_FORM;

function formFromAnimal(animal: any): AnimalForm {
  return {
    name: animal?.name || '',
    species: animal?.species ? String(animal.species).toLowerCase() : '',
    breed: animal?.breed || '',
    sex: animal?.sex === 'male' ? 'male' : 'female',
    age: animal?.age || '',
    ageGroup: animal?.ageGroup || '',
    city: animal?.city || '',
    size: animal?.size === 'small' || animal?.size === 'large' ? animal.size : 'medium',
    goodWithChildren: Boolean(animal?.goodWithChildren),
    goodWithDogs: Boolean(animal?.goodWithDogs),
    goodWithCats: Boolean(animal?.goodWithCats),
    description: animal?.description || '',
    status: STATUS_VALUES.includes(animal?.status) ? animal.status : 'borrador',
    personality: Array.isArray(animal?.personality) ? animal.personality.filter(Boolean) : [],
    mood: animal?.mood || '',
  };
}

// Alineado con `animalCreateSchema`: si algo de esto falla el servidor responde
// `validation_error` y el usuario no sabría qué corregir.
function validateForm(form: AnimalForm, images: string[]): string | null {
  if (!form.name.trim()) return 'Escribe el nombre del animal.';
  if (!form.species) return 'Elige la especie.';
  if (!form.age.trim()) return 'Indica la edad, por ejemplo «2 años» o «8 meses».';
  if (form.city.trim().length > MAX_CITY) return `La ciudad no puede pasar de ${MAX_CITY} caracteres.`;
  if (form.description.trim().length > MAX_DESCRIPTION) {
    return `La descripción no puede pasar de ${MAX_DESCRIPTION} caracteres.`;
  }
  if (form.personality.length > MAX_PERSONALITY) return `Elige como máximo ${MAX_PERSONALITY} rasgos de personalidad.`;
  if (images.length > MAX_IMAGES) return `Una ficha admite como máximo ${MAX_IMAGES} imágenes.`;
  return null;
}

// Construimos el payload campo a campo (antes se hacía `...form`) para no mandar
// cadenas vacías donde el esquema espera un enum —`ageGroup: ''` es un 400— y para
// que `mood: null` pueda borrar de verdad el estado emocional al editar: con
// `undefined` mongoose ignora la clave y el valor viejo se queda.
function buildPayload(form: AnimalForm, images: string[]) {
  return {
    name: form.name.trim(),
    species: form.species,
    breed: form.breed.trim() || undefined,
    sex: form.sex,
    age: form.age.trim(),
    ageGroup: form.ageGroup || undefined,
    city: form.city.trim() || undefined,
    size: form.size,
    goodWithChildren: form.goodWithChildren,
    goodWithDogs: form.goodWithDogs,
    goodWithCats: form.goodWithCats,
    description: form.description.trim() || undefined,
    status: form.status,
    personality: form.personality,
    mood: form.mood || null,
    images,
  };
}

const inputStyle: React.CSSProperties = {
  border: `1px solid ${MPL.border}`,
  borderRadius: 10,
  padding: '9px 11px',
  fontSize: 14.5,
  width: '100%',
  background: '#fff',
  color: MPL.ink,
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: `1px solid ${MPL.border}`,
  borderRadius: 18,
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: MPL.faint }}>{hint}</span>}
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 14px',
        borderRadius: 999,
        fontSize: 13.5,
        fontWeight: 700,
        cursor: 'pointer',
        border: `1px solid ${active ? MPL.teal : MPL.border}`,
        background: active ? MPL.teal100 : '#fff',
        color: active ? MPL.tealDark : MPL.muted,
      }}
    >
      {children}
    </button>
  );
}

// Un fallo de red no puede pintarse como "no tienes animales": en un panel de
// gestión eso hace creer a la protectora que no tiene trabajo pendiente.
function LoadError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div style={{ ...cardStyle, padding: 20, display: 'grid', gap: 10, justifyItems: 'start' }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ color: MPL.muted, fontSize: 14 }}>
        Puede ser un problema de conexión. No damos el listado por vacío: vuelve a intentarlo.
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '8px 16px', fontSize: 13.5, fontWeight: 800, color: MPL.tealDark, cursor: 'pointer' }}
      >
        Reintentar
      </button>
    </div>
  );
}

function ImageUploader({
  images,
  uploading,
  onFiles,
  onRemove,
}: {
  images: string[];
  uploading: boolean;
  onFiles: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          border: `2px dashed ${MPL.border}`,
          borderRadius: 14,
          padding: 16,
          textAlign: 'center',
          fontSize: 13.5,
          color: MPL.muted,
          background: uploading ? MPL.panel : 'transparent',
        }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
      >
        {uploading ? (
          'Subiendo imágenes…'
        ) : (
          <>
            Arrastra imágenes o{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              style={{ textDecoration: 'underline', color: MPL.tealDark, fontWeight: 700, cursor: 'pointer' }}
            >
              haz clic para seleccionarlas
            </button>
            . JPG o PNG, hasta 10 MB y {MAX_IMAGES} imágenes por ficha.
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => {
            onFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
      </div>
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {images.map((url, idx) => (
            <div key={`${url}-${idx}`} style={{ position: 'relative' }}>
              <img
                src={toAbsoluteUrl(url)}
                alt={idx === 0 ? 'Foto principal' : `Foto ${idx + 1}`}
                style={{ width: 104, height: 84, objectFit: 'cover', borderRadius: 10, border: `1px solid ${MPL.border}` }}
              />
              {idx === 0 && (
                <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999 }}>
                  Principal
                </span>
              )}
              <button
                type="button"
                aria-label="Quitar imagen"
                onClick={() => onRemove(idx)}
                style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 999, border: 'none', background: MPL.coral, color: '#fff', cursor: 'pointer', fontWeight: 800, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnimalFields({
  form,
  onChange,
  publishBlocked,
}: {
  form: AnimalForm;
  onChange: (patch: Partial<AnimalForm>) => void;
  publishBlocked: boolean;
}) {
  // Una especie o un rasgo antiguo que no esté entre las opciones seguiría en la
  // ficha pero sin control visible, y al guardar se perdería sin avisar: lo
  // añadimos a la lista para que se vea y se pueda mantener.
  const speciesOptions = useMemo(() => {
    if (!form.species || SPECIES_OPTIONS.some(option => option.value === form.species)) return SPECIES_OPTIONS;
    return [...SPECIES_OPTIONS, { value: form.species, label: speciesLabel(form.species) }];
  }, [form.species]);

  const personalityOptions = useMemo(() => {
    const extra = form.personality.filter(trait => !PERSONALITY_OPTIONS.includes(trait));
    return [...PERSONALITY_OPTIONS, ...extra];
  }, [form.personality]);

  const togglePersonality = (value: string) => {
    if (form.personality.includes(value)) {
      onChange({ personality: form.personality.filter(trait => trait !== value) });
      return;
    }
    if (form.personality.length >= MAX_PERSONALITY) {
      // El modelo tiene un validador de máximo 3: sin este aviso el guardado
      // fallaba con un 400 y el usuario no sabía por qué.
      toast.error(`Solo puedes elegir ${MAX_PERSONALITY} rasgos. Quita uno antes de añadir otro.`);
      return;
    }
    onChange({ personality: [...form.personality, value] });
  };

  return (
    <>
      <div className="animal-form-grid">
        <Field label="Nombre *">
          <input style={inputStyle} value={form.name} onChange={e => onChange({ name: e.target.value })} placeholder="Nina" />
        </Field>
        <Field label="Especie *">
          <select style={inputStyle} value={form.species} onChange={e => onChange({ species: e.target.value })}>
            <option value="">Selecciona…</option>
            {speciesOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Raza">
          <input style={inputStyle} value={form.breed} onChange={e => onChange({ breed: e.target.value })} placeholder="Opcional" />
        </Field>
        <Field label="Edad *" hint="Texto libre: «2 años», «8 meses»…">
          <input style={inputStyle} value={form.age} onChange={e => onChange({ age: e.target.value })} placeholder="2 años" />
        </Field>
        <Field label="Etapa vital">
          <select style={inputStyle} value={form.ageGroup} onChange={e => onChange({ ageGroup: e.target.value as AnimalForm['ageGroup'] })}>
            {AGE_GROUP_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Ciudad">
          <input
            style={inputStyle}
            value={form.city}
            maxLength={MAX_CITY}
            onChange={e => onChange({ city: e.target.value })}
            placeholder="Donde está ahora"
          />
        </Field>
        <Field label="Sexo">
          <select style={inputStyle} value={form.sex} onChange={e => onChange({ sex: e.target.value as AnimalForm['sex'] })}>
            <option value="female">Hembra</option>
            <option value="male">Macho</option>
          </select>
        </Field>
        <Field label="Tamaño">
          <select style={inputStyle} value={form.size} onChange={e => onChange({ size: e.target.value as AnimalForm['size'] })}>
            <option value="small">Pequeño</option>
            <option value="medium">Mediano</option>
            <option value="large">Grande</option>
          </select>
        </Field>
        <Field
          label="Estado"
          hint={publishBlocked ? 'Publicado no está disponible hasta que la protectora esté verificada.' : undefined}
        >
          <select style={inputStyle} value={form.status} onChange={e => onChange({ status: e.target.value as AnimalStatus })}>
            {STATUS_VALUES.map(value => (
              // El backend devuelve 403 al pasar a `publicado` sin verificación
              // (`canPublishAnimals`): ofrecerlo sería llevar a la protectora a un error.
              <option key={value} value={value} disabled={value === 'publicado' && publishBlocked}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <legend style={{ fontSize: 13, fontWeight: 700, padding: 0 }}>Convivencia</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {([
            ['goodWithChildren', 'Con niños'],
            ['goodWithDogs', 'Con perros'],
            ['goodWithCats', 'Con gatos'],
          ] as Array<[keyof AnimalForm, string]>).map(([key, label]) => (
            <label key={String(key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={e => onChange({ [key]: e.target.checked } as Partial<AnimalForm>)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Descripción">
        <textarea
          style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          value={form.description}
          maxLength={MAX_DESCRIPTION}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="Cómo es, qué necesita, cómo llegó…"
        />
      </Field>

      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          Personalidad{' '}
          <span style={{ color: MPL.faint, fontWeight: 600 }}>
            (máx. {MAX_PERSONALITY} · {form.personality.length} elegidos)
          </span>
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {personalityOptions.map(option => (
            <Chip key={option} active={form.personality.includes(option)} onClick={() => togglePersonality(option)}>
              {option}
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Estado emocional</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {MOOD_OPTIONS.map(option => (
            <Chip
              key={option.value}
              active={form.mood === option.value}
              onClick={() => onChange({ mood: form.mood === option.value ? '' : option.value })}
            >
              {option.icon} {option.label}
            </Chip>
          ))}
        </div>
      </div>
    </>
  );
}

export default function AnimalsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const shelterId = useMemo(() => String(user?._id || ''), [user?._id]);

  const [form, setForm] = useState<AnimalForm>(INITIAL_FORM);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [uploadingCreate, setUploadingCreate] = useState(false);

  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<AnimalForm>(INITIAL_FORM);
  const [editImages, setEditImages] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingEdit, setUploadingEdit] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const animalsQ = useQuery({
    queryKey: ['shelter-animals', shelterId],
    queryFn: () => listAllShelterAnimals(shelterId),
    enabled: !!shelterId,
  });

  const patitasQ = useQuery({
    queryKey: ['patitas-balance', shelterId || 'protectora'],
    queryFn: () => getPatitasBalance(shelterId),
    enabled: !!shelterId,
    staleTime: 30_000,
  });

  // El backend exige verificación aprobada para publicar (`canPublishAnimals`), así
  // que sin ella tanto el alta en `publicado` como el cambio de estado acaban en un
  // 403 `shelter_verification_required`. Si no conocemos el estado (fallo de red) no
  // afirmamos nada y dejamos que el servidor decida.
  const verificationQ = useQuery({
    queryKey: ['my-verification', shelterId],
    queryFn: () => getMyVerification(shelterId),
    enabled: !!shelterId,
    staleTime: 60_000,
  });
  const verificationStatus = verificationQ.data?.status;
  const publishBlocked = !!verificationStatus && verificationStatus !== 'verified';

  const animals = animalsQ.data?.items || [];
  const total = animalsQ.data?.total ?? 0;
  const truncated = Boolean(animalsQ.data?.truncated);

  const refreshLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['shelter-animals', shelterId] });
    // Los contadores del dashboard salen de otras queries: sin invalidarlas el
    // panel de inicio quedaba desactualizado tras crear o cambiar de estado.
    queryClient.invalidateQueries({ queryKey: ['shelter-animals-count', shelterId] });
    queryClient.invalidateQueries({ queryKey: ['shelter-metrics'] });
  }, [queryClient, shelterId]);

  const uploadFiles = async (files: FileList | null, target: 'create' | 'edit') => {
    if (!files?.length) return;
    const current = target === 'create' ? formImages : editImages;
    const room = MAX_IMAGES - current.length;
    if (room <= 0) {
      toast.error(`Una ficha admite como máximo ${MAX_IMAGES} imágenes.`);
      return;
    }
    const chosen = Array.from(files);
    if (chosen.length > room) {
      toast.error(`Solo caben ${room} imagen(es) más en esta ficha; las demás no se subirán.`);
    }
    const setUploading = target === 'create' ? setUploadingCreate : setUploadingEdit;
    setUploading(true);
    try {
      for (const file of chosen.slice(0, room)) {
        // Multer solo acepta imágenes y corta en 10 MB: comprobarlo aquí permite
        // decir qué archivo ha fallado en vez de un "no se pudo subir" a secas.
        if (!file.type.startsWith('image/')) {
          toast.error(`«${file.name}» no es una imagen.`);
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`«${file.name}» pesa más de 10 MB.`);
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const { url } = await uploadImage(file);
          if (target === 'create') setFormImages(prev => [...prev, url]);
          else setEditImages(prev => [...prev, url]);
        } catch (error) {
          toast.error(backendErrorMessage(error, `No se pudo subir «${file.name}».`));
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shelterId) {
      // `animalCreateSchema` exige `shelter` como ObjectId: sin él el 400 llegaba
      // como un genérico "No se pudo crear".
      toast.error('No hemos podido identificar tu protectora. Vuelve a iniciar sesión.');
      return;
    }
    const problem = validateForm(form, formImages);
    if (problem) {
      toast.error(problem);
      return;
    }
    setCreating(true);
    try {
      await createAnimal({ shelter: shelterId, ...buildPayload(form, formImages) });
      setForm(INITIAL_FORM);
      setFormImages([]);
      toast.success(form.status === 'publicado' ? 'Ficha creada y publicada' : `Ficha creada en «${statusLabel(form.status)}»`);
      refreshLists();
    } catch (error) {
      toast.error(backendErrorMessage(error, 'No se pudo crear la ficha.'));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (animal: any) => {
    setEditing(animal);
    setEditForm(formFromAnimal(animal));
    setEditImages(Array.isArray(animal.images) ? [...animal.images] : []);
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    const problem = validateForm(editForm, editImages);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSavingEdit(true);
    try {
      await updateAnimal(editing._id || editing.id, buildPayload(editForm, editImages));
      toast.success('Ficha guardada');
      setEditing(null);
      refreshLists();
    } catch (error) {
      toast.error(backendErrorMessage(error, 'No se pudo guardar la ficha.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const onChangeStatus = async (animal: any, status: AnimalStatus) => {
    const id = String(animal._id || animal.id || '');
    if (status === 'publicado' && publishBlocked) {
      toast.error('Verifica tu protectora antes de publicar animales.');
      return;
    }
    setBusyId(id);
    try {
      await updateAnimalStatus(id, status);
      toast.success(`${animal.name || 'La ficha'} pasa a «${statusLabel(status)}»`);
      refreshLists();
    } catch (error) {
      toast.error(backendErrorMessage(error, 'No se pudo actualizar el estado.'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (animal: any) => {
    const id = String(animal._id || animal.id || '');
    // Borrar es irreversible y tira el código del pasaporte: lo decimos y ofrecemos
    // la alternativa no destructiva que ya existe en el modelo.
    const confirmed = window.confirm(
      `¿Eliminar la ficha de ${animal.name || 'este animal'}?\n\n` +
        `Se borrará para siempre${animal.code ? ` y su código ${animal.code} dejará de funcionar` : ''}. ` +
        'Si solo quieres retirarla del buscador, cambia su estado a «Archivado».',
    );
    if (!confirmed) return;
    setBusyId(id);
    try {
      await deleteAnimal(id);
      toast.success('Ficha eliminada');
      if (editing && String(editing._id || editing.id) === id) setEditing(null);
      refreshLists();
    } catch (error) {
      toast.error(backendErrorMessage(error, 'No se pudo eliminar la ficha.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, display: 'grid', gap: 20 }}>
      <style>{`
        .animal-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;}
        .animal-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}
        @media (max-width: 900px){.animal-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width: 560px){.animal-form-grid{grid-template-columns:1fr}}
      `}</style>

      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, margin: 0 }}>Mis animales</h1>
          <p style={{ color: MPL.muted, margin: '6px 0 0', fontSize: 14.5 }}>
            Da de alta fichas, corrige sus datos y mueve su estado según avanza cada adopción.
          </p>
        </div>
        <div style={{ ...cardStyle, padding: '12px 18px', display: 'grid', gap: 2 }}>
          <span style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: MPL.faint, fontWeight: 800 }}>
            Patitas disponibles
          </span>
          <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, fontWeight: 800, color: MPL.tealDark }}>
            {/* Con un fallo de red el contador anterior pintaba un 0 con pinta de dato real. */}
            {patitasQ.isLoading ? '…' : patitasQ.isError ? '—' : patitasQ.data?.patitas ?? 0}
          </span>
        </div>
      </header>

      {!shelterId && (
        <LoadError
          title="No hemos podido identificar tu protectora"
          onRetry={() => window.location.reload()}
        />
      )}

      {publishBlocked && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: MPL.gold100, border: `1px solid ${MPL.gold}`, borderRadius: 16, padding: 16 }}>
          <AlertTriangle size={18} color={MPL.goldDark} style={{ flex: 'none', marginTop: 2 }} />
          <div style={{ fontSize: 14 }}>
            <strong>Todavía no puedes publicar animales.</strong>{' '}
            {verificationStatus === 'pending'
              ? 'Estamos revisando la documentación de tu protectora; te avisaremos en cuanto esté aprobada.'
              : verificationStatus === 'rejected'
              ? 'Tu verificación fue rechazada. Revisa las observaciones y vuelve a enviarla.'
              : 'Necesitas verificar tu protectora antes de publicar fichas.'}{' '}
            Puedes ir preparando las fichas en <strong>Borrador</strong>.{' '}
            <Link to="/landlord/verificacion" style={{ color: MPL.tealDark, fontWeight: 800 }}>
              Ir a la verificación →
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={onCreate} style={{ ...cardStyle, padding: 22, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: MPL.teal100, color: MPL.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={18} />
          </span>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, margin: 0 }}>Nueva ficha</h2>
        </div>

        <AnimalFields form={form} onChange={patch => setForm(prev => ({ ...prev, ...patch }))} publishBlocked={publishBlocked} />

        <div style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Imágenes</span>
          <ImageUploader
            images={formImages}
            uploading={uploadingCreate}
            onFiles={files => uploadFiles(files, 'create')}
            onRemove={idx => setFormImages(prev => prev.filter((_, i) => i !== idx))}
          />
        </div>

        <div>
          <button
            type="submit"
            /* Antes se podía guardar mientras las fotos seguían subiendo y la ficha
               se creaba sin ellas. */
            disabled={creating || uploadingCreate}
            style={{ background: MPL.coral, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 26px', fontWeight: 800, fontSize: 15, cursor: creating || uploadingCreate ? 'default' : 'pointer', opacity: creating || uploadingCreate ? 0.6 : 1 }}
          >
            {creating ? 'Creando…' : uploadingCreate ? 'Esperando las imágenes…' : 'Crear ficha'}
          </button>
        </div>
      </form>

      <section style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, fontWeight: 800, margin: 0 }}>Fichas de tu protectora</h2>
          {/* El total lo dice el servidor; antes se contaba sobre una lista ya
              truncada a 100 por el tope de `limit`. */}
          {!animalsQ.isError && !animalsQ.isLoading && (
            <span style={{ fontSize: 13, color: MPL.muted }}>
              {total === 0 ? 'ninguna todavía' : `${animals.length} de ${total}`}
            </span>
          )}
        </div>

        {animalsQ.isError ? (
          <LoadError title="No hemos podido cargar tus fichas" onRetry={() => animalsQ.refetch()} />
        ) : animalsQ.isLoading ? (
          <div style={{ ...cardStyle, padding: 20, color: MPL.muted }}>Cargando fichas…</div>
        ) : animals.length === 0 ? (
          <div style={{ ...cardStyle, padding: '28px 20px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: 800 }}>Aún no tienes ninguna ficha</p>
            <p style={{ margin: '6px 0 0', color: MPL.muted, fontSize: 14 }}>
              Rellena el formulario de arriba para dar de alta a tu primer animal.
            </p>
          </div>
        ) : (
          <>
            {truncated && (
              <div style={{ fontSize: 13, color: MPL.muted }}>
                Mostramos las {animals.length} fichas más recientes de {total}: las {total - animals.length} restantes
                todavía no caben en este listado.
              </div>
            )}
            <div className="animal-cards">
              {animals.map((animal: any) => {
                const id = String(animal._id || animal.id || '');
                const busy = busyId === id;
                // Valores del modelo traducidos: `species` se guarda canonizada, de modo
                // que la ficha de un perro llegaba a pintar literalmente "dog", y `mood`
                // solo se maquillaba con un replace («en adaptacion»).
                const meta = [speciesLabel(animal.species), animal.breed, sexLabel(animal.sex), sizeLabel(animal.size)]
                  .filter(Boolean)
                  .join(' · ');
                const ages = [animal.age, ageGroupLabel(animal.ageGroup)].filter(Boolean).join(' · ');
                return (
                  <article key={id} style={{ ...cardStyle, overflow: 'hidden', display: 'flex', flexDirection: 'column', opacity: busy ? 0.6 : 1 }}>
                    <div style={{ aspectRatio: '16 / 10', background: MPL.panel }}>
                      {Array.isArray(animal.images) && animal.images[0] ? (
                        <img
                          src={toAbsoluteUrl(animal.images[0])}
                          alt={animal.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: MPL.faint, fontSize: 13.5 }}>
                          <ImagePlus size={16} /> Sin imagen
                        </div>
                      )}
                    </div>
                    <div style={{ padding: 14, display: 'grid', gap: 10, flex: 1 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: 16 }}>{animal.name}</span>
                          {animal.code && (
                            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.04em', color: MPL.olive }}>{animal.code}</span>
                          )}
                        </div>
                        {meta && <div style={{ fontSize: 13, color: MPL.muted, marginTop: 2 }}>{meta}</div>}
                        {(ages || animal.city) && (
                          <div style={{ fontSize: 12.5, color: MPL.faint, marginTop: 2 }}>
                            {[ages, animal.city].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>

                      <label style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: MPL.faint, fontWeight: 800 }}>
                          Estado
                        </span>
                        <select
                          style={{ ...inputStyle, padding: '7px 9px', fontSize: 13.5 }}
                          value={animal.status || 'borrador'}
                          disabled={busy}
                          onChange={e => onChangeStatus(animal, e.target.value as AnimalStatus)}
                        >
                          {/* Un estado que no sea uno de los siete (dato heredado) se
                              muestra tal cual: pintarlo como "Borrador" sería mentir
                              sobre la situación real de la ficha. */}
                          {!!animal.status && !STATUS_VALUES.includes(animal.status) && (
                            <option value={animal.status}>Estado desconocido: {animal.status}</option>
                          )}
                          {STATUS_VALUES.map(value => (
                            <option key={value} value={value} disabled={value === 'publicado' && publishBlocked && animal.status !== 'publicado'}>
                              {statusLabel(value)}
                            </option>
                          ))}
                        </select>
                      </label>

                      {animal.mood && (
                        <div style={{ fontSize: 12.5, color: MPL.muted }}>Estado emocional: {moodLabel(animal.mood)}</div>
                      )}
                      {Array.isArray(animal.personality) && animal.personality.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {animal.personality.map((trait: string) => (
                            <span key={trait} style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 999, border: `1px solid ${MPL.border}`, color: MPL.muted }}>
                              {trait}
                            </span>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
                        <button
                          type="button"
                          onClick={() => openEdit(animal)}
                          disabled={busy}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '7px 13px', fontSize: 13, fontWeight: 800, color: MPL.tealDark, cursor: 'pointer' }}
                        >
                          <Pencil size={14} /> Editar ficha
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(animal)}
                          disabled={busy}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 10, padding: '7px 13px', fontSize: 13, fontWeight: 800, color: MPL.coralDark, cursor: 'pointer' }}
                        >
                          <Trash2 size={14} /> Eliminar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Editar la ficha de ${editing.name || 'animal'}`}
          style={{ position: 'fixed', inset: 0, background: 'rgba(31,55,40,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 60 }}
        >
          <div style={{ ...cardStyle, width: '100%', maxWidth: 780, maxHeight: '92vh', overflowY: 'auto', padding: 22, display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                Editar {editing.name}
                {editing.code && (
                  <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.04em', color: MPL.olive }}>{editing.code}</span>
                )}
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setEditing(null)}
                style={{ border: 'none', background: 'none', color: MPL.muted, cursor: 'pointer', display: 'inline-flex' }}
              >
                <X size={20} />
              </button>
            </div>

            <AnimalFields
              form={editForm}
              onChange={patch => setEditForm(prev => ({ ...prev, ...patch }))}
              publishBlocked={publishBlocked}
            />

            <div style={{ display: 'grid', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Imágenes</span>
              <ImageUploader
                images={editImages}
                uploading={uploadingEdit}
                onFiles={files => uploadFiles(files, 'edit')}
                onRemove={idx => setEditImages(prev => prev.filter((_, i) => i !== idx))}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEditing(null)}
                style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '11px 20px', fontWeight: 800, fontSize: 14.5, color: MPL.muted, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                disabled={savingEdit || uploadingEdit}
                style={{ background: MPL.teal, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 24px', fontWeight: 800, fontSize: 14.5, cursor: savingEdit || uploadingEdit ? 'default' : 'pointer', opacity: savingEdit || uploadingEdit ? 0.6 : 1 }}
              >
                {savingEdit ? 'Guardando…' : uploadingEdit ? 'Esperando las imágenes…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
