import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listMyPets } from '../../api/animals';
import PetSwitcher from '../../components/pet/PetSwitcher';
import { loadSelectedPet, saveSelectedPet } from '../../utils/selectedPet';
import { petAge } from '../../utils/age';
import { useAuth } from '../../context/AuthContext';
import { fetchFeaturedAnimal } from '../../utils/featuredAnimal';
import { toAbsoluteUrl } from '../../utils/media';
import { moodLabel, speciesLabel } from '../../styles/mypetlive';
import DailyCareCard from '../../components/pet/DailyCareCard';

const colors = {
  bg: '#F6F3EC',
  panel: '#EFEADF',
  card: '#FFFFFF',
  border: '#E5E1D6',
  ink: '#3F4A3C',
  muted: '#6B7464',
  soft: '#98A088',
  teal: '#1F6F6F',
  coral: '#C0512F',
  olive: '#6A7B4F',
  gold: '#E9A93C',
  goldSoft: '#FBEFD4',
};

const paw = (
  <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
    <ellipse cx="24" cy="32" rx="11" ry="8.5" fill="currentColor" />
    <circle cx="11" cy="23" r="4.6" fill="currentColor" />
    <circle cx="19.5" cy="15" r="5" fill="currentColor" />
    <circle cx="28.5" cy="15" r="5" fill="currentColor" />
    <circle cx="37" cy="23" r="4.6" fill="currentColor" />
  </svg>
);

function Card({
  children,
  className = '',
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section
      className={className}
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 20,
        boxShadow: '0 1px 3px rgba(31,55,40,.06), 0 8px 24px -18px rgba(31,55,40,.22)',
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'secondary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'gold';
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: colors.coral, color: '#fff', borderColor: colors.coral, boxShadow: '0 8px 18px -12px rgba(232,101,74,.8)' },
    secondary: { background: colors.teal, color: '#fff', borderColor: colors.teal },
    ghost: { background: '#fff', color: colors.teal, borderColor: colors.teal },
    gold: { background: colors.goldSoft, color: '#A77B1C', borderColor: '#F2DC9B' },
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: 14,
        border: '1.5px solid',
        padding: '12px 18px',
        fontWeight: 800,
        opacity: disabled ? 0.55 : 1,
        ...styles[variant],
      }}
    >
      {children}
    </button>
  );
}

export default function Home() {
  const nav = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const assignedAnimalId = (user as any)?.assignedAnimalId || (user as any)?.animalId || (user as any)?.petId || null;

  // Todas sus mascotas: con varias se elige cuál se ve (la elegida se comparte
  // con «Mi mascota», ver utils/selectedPet).
  const { data: myPets } = useQuery({ queryKey: ['my-pets'], queryFn: listMyPets, staleTime: 60_000 });
  const pets = React.useMemo(() => (myPets?.items || []).map(item => item.animal).filter(Boolean), [myPets?.items]);
  const [selectedPetId, setSelectedPetIdState] = React.useState<string | null>(() => loadSelectedPet());
  const selectPet = (id: string) => {
    setSelectedPetIdState(id);
    saveSelectedPet(id);
  };
  const petIds = pets.map((p: any) => String(p._id || p.id));
  const currentId = selectedPetId && petIds.includes(selectedPetId) ? selectedPetId : petIds[0] || null;

  const { data: featuredAnimal, isLoading, isError, refetch } = useQuery({
    queryKey: ['tenant-featured-animal', currentId || assignedAnimalId],
    queryFn: () => fetchFeaturedAnimal(currentId || assignedAnimalId),
    staleTime: 60_000,
  });


  const hasPet = Boolean(featuredAnimal);
  const displayName = featuredAnimal?.name || 'tu mascota';
  // Título: el nombre con una mascota, los nombres con dos o tres, el número
  // con cuatro o más; sin ninguna, «tu mascota».
  const names = pets.map((p: any) => p.name).filter(Boolean) as string[];
  const titleTarget = names.length >= 4
    ? `tus ${names.length} mascotas`
    : names.length >= 2
      ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
      : names[0] || displayName;
  const displaySpecies = speciesLabel(featuredAnimal?.species);
  const displayAge = petAge(featuredAnimal);
  const image = featuredAnimal?.images?.[0] ? toAbsoluteUrl(featuredAnimal.images[0]) : '';

  return (
    <main style={{ background: colors.bg, color: colors.ink, margin: '-24px -16px', minHeight: 'calc(100vh - 56px)' }}>
      <div className="mx-auto grid gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" style={{ maxWidth: 1120 }}>
        <section
          className="grid gap-6 lg:grid-cols-[minmax(0,1.16fr)_minmax(320px,.84fr)]"
          style={{
            borderBottom: `1px solid ${colors.border}`,
            paddingBottom: 28,
          }}
        >
          <div className="grid gap-6">
            {/* Sin logo ni etiquetas: la cabecera ya lleva la marca. */}
            <div className="grid gap-4">
              <h1
                className="max-w-3xl text-4xl font-extrabold leading-none sm:text-5xl lg:text-6xl"
                style={{ fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: '-0.03em' }}
              >
                Cuida, sigue y acompaña a {titleTarget}.
              </h1>
              <p className="max-w-2xl text-base leading-7 sm:text-lg" style={{ color: colors.muted }}>
                Tu espacio para ver cómo está tu mascota, apoyar a su protectora y registrar pequeños cuidados sin ruido.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <ActionButton variant="primary" onClick={() => nav('/animals')}>
                Ver animales en adopción
              </ActionButton>
              {/* Sin mascota registrada, /pet abre el alta: el botón lo dice. Mientras
                  carga o si falla la consulta se queda en «Ver mi mascota». */}
              <ActionButton variant="ghost" onClick={() => nav('/pet')}>
                {!isLoading && !isError && !featuredAnimal ? 'Registrar mi mascota' : 'Ver mi mascota'}
              </ActionButton>
            </div>
          </div>

          {/* Sin mascota registrada no se enseña: el botón de arriba ya invita a registrarla. */}
          {(isLoading || isError || featuredAnimal) && (
          <div className="grid gap-3">
          {pets.length > 1 && (
            <PetSwitcher pets={pets} selectedId={currentId} onSelect={selectPet} onAdd={() => nav('/pet?nueva=1')} />
          )}
          <Card className="overflow-hidden">
            <div className="relative aspect-[4/3]" style={{ background: colors.panel }}>
              {isLoading ? (
                <div className="flex h-full items-center justify-center text-sm font-semibold" style={{ color: colors.soft }}>
                  Cargando mascota
                </div>
              ) : image ? (
                <img src={image} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3" style={{ color: colors.teal }}>
                  <span style={{ transform: 'scale(2.4)' }}>{paw}</span>
                  <span className="text-sm font-bold" style={{ color: colors.soft }}>Sin imagen todavía</span>
                </div>
              )}
              {hasPet && (
                <span
                  className="absolute left-4 top-4 rounded-lg px-3 py-1.5 text-xs font-bold"
                  style={{ background: '#E2EEEC', color: '#176363' }}
                >
                  Mi mascota
                </span>
              )}
            </div>
            {isError ? (
              <div className="grid gap-3 p-5">
                <h2
                  className="text-2xl font-extrabold"
                  style={{ fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: '-0.02em' }}
                >
                  No hemos podido cargar tu mascota
                </h2>
                <p className="text-sm font-semibold" style={{ color: colors.muted }}>
                  Puede ser un problema de conexión. Vuelve a intentarlo en un momento.
                </p>
                <ActionButton variant="ghost" onClick={() => refetch()}>
                  Reintentar
                </ActionButton>
              </div>
            ) : hasPet ? (
              <div className="grid gap-3 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    className="text-3xl font-extrabold"
                    style={{ fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: '-0.03em' }}
                  >
                    {displayName}
                  </h2>
                  {displayAge && <span className="text-sm font-bold" style={{ color: colors.muted }}>{displayAge}</span>}
                </div>
                <p className="text-sm font-semibold" style={{ color: colors.muted }}>
                  {displaySpecies}{featuredAnimal?.code ? ` · ${featuredAnimal.code}` : ''}
                </p>
                <div className="flex flex-wrap gap-2">
                  {featuredAnimal?.city && (
                    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: colors.bg, color: colors.muted }}>
                      {featuredAnimal.city}
                    </span>
                  )}
                  {featuredAnimal?.mood && (
                    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: colors.bg, color: colors.muted }}>
                      {moodLabel(featuredAnimal.mood)}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 p-5">
                <h2
                  className="text-2xl font-extrabold"
                  style={{ fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: '-0.02em' }}
                >
                  Aún no has registrado tu mascota
                </h2>
                <p className="text-sm font-semibold" style={{ color: colors.muted }}>
                  Da de alta a tu compañero para seguir sus cuidados, o adopta uno nuevo.
                </p>
                <ActionButton variant="primary" onClick={() => nav('/pet')}>
                  Registrar mi mascota
                </ActionButton>
              </div>
            )}
          </Card>
          </div>
          )}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr_1fr]">
          {/* El mismo cuidado diario que «Mi mascota»: pregunta qué comió, qué
              arena y cómo fue el paseo. Antes el inicio tenía botones propios que
              marcaban sin preguntar nada. La despensa se queda en «Mi mascota». */}
          {featuredAnimal && (
            <div className="lg:col-span-2">
              <DailyCareCard
                animalId={String(featuredAnimal._id || featuredAnimal.id || '')}
                species={featuredAnimal.species}
                showPantry={false}
                onMarked={() => {
                  queryClient.invalidateQueries({ queryKey: ['tenant-featured-animal'] });
                  queryClient.invalidateQueries({ queryKey: ['my-pets'] });
                }}
              />
            </div>
          )}

          <Card className="grid gap-5 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: colors.soft }}>
                Cupones
              </p>
              <h2
                className="mt-2 text-2xl font-extrabold"
                style={{ fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: '-0.02em' }}
              >
                Ventajas para ti
              </h2>
            </div>

            <p className="text-sm leading-6" style={{ color: colors.muted }}>
              Descubre cupones de tiendas y veterinarios aliados. Al usarlos, generas Patitas para apoyar a las protectoras.
            </p>

            <div className="grid gap-2">
              <ActionButton variant="gold" onClick={() => nav('/coupons')}>
                Ver cupones disponibles
              </ActionButton>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
