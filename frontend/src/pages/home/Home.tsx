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
import { CalcoDestellosTitulo } from '../../components/icons/calcados';
import { M } from '../../components/pet/maqueta';

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
  onClick,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  // Con onClick la tarjeta entera abre algo (la gente la pulsa esperando que se
  // abra). Es un <section> con role="link" y no un <button>: index.css da
  // padding a todo botón y aquí dentro hay más botones.
  onClick?: () => void;
  label?: string;
}) {
  return (
    <section
      className={className}
      role={onClick ? 'link' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? label : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        background: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: 20,
        boxShadow: '0 1px 3px rgba(31,55,40,.06), 0 8px 24px -18px rgba(31,55,40,.22)',
        cursor: onClick ? 'pointer' : undefined,
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
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
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
      className={className}
      style={{
        borderRadius: 14,
        border: '1.5px solid',
        padding: '12px 12px',
        fontWeight: 800,
        fontSize: 14,
        whiteSpace: 'nowrap',
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
  // Las que ya han fallecido no salen en el inicio (es el sitio del cuidado de
  // cada día); su mural vive en «Mi mascota».
  const allPets = React.useMemo(() => (myPets?.items || []).map(item => item.animal).filter(Boolean), [myPets?.items]);
  const pets = React.useMemo(() => allPets.filter((p: any) => !p.memorial?.active), [allPets]);
  const [selectedPetId, setSelectedPetIdState] = React.useState<string | null>(() => loadSelectedPet());
  const selectPet = (id: string) => {
    setSelectedPetIdState(id);
    saveSelectedPet(id);
  };
  const petIds = pets.map((p: any) => String(p._id || p.id));
  const currentId = selectedPetId && petIds.includes(selectedPetId) ? selectedPetId : petIds[0] || null;

  const { data: featuredRaw, isLoading, isError, refetch } = useQuery({
    queryKey: ['tenant-featured-animal', currentId || assignedAnimalId],
    queryFn: () => fetchFeaturedAnimal(currentId || assignedAnimalId),
    staleTime: 60_000,
  });
  const featuredAnimal = (featuredRaw as any)?.memorial?.active ? null : featuredRaw;


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
    <main className="hm" style={{ background: colors.bg, color: colors.ink, margin: '-24px -16px', minHeight: 'calc(100vh - 56px)' }}>
      {/* Móvil: medidas de la maqueta del 2 nov 2026 (iPhone de 390; tarjetas a 10 del borde, textos a 19). */}
      <style>{`
        @media (max-width: 720px) {
          .hm { margin: -24px -12px 0 !important; background: ${M.fondo} !important; font-family: ${M.letra}; letter-spacing: 0; }
          .hm-in { padding: 14px 10px 18px !important; gap: 15px !important; }
          .hm-s1 { border-bottom: 0 !important; padding-bottom: 0 !important; gap: 16px !important; }
          .hm-txt { padding: 0 9px 0 9px; gap: 4px !important; }
          .hm-txt-wrap { gap: 15px !important; }
          .hm-h1 { font-family: ${M.titulos} !important; font-size: 27px !important; line-height: 28px !important; font-weight: 800 !important; letter-spacing: -0.005em !important; color: #1E3A32 !important; }
          .hm-sub { font-size: 13px !important; line-height: 19px !important; color: #4A4F4C !important; margin-top: 3px; }
          .hm-l1 { display: block; }
          .hm-btns { display: grid !important; grid-template-columns: 205fr 143fr; gap: 12px !important; padding: 0 5px 0 5px; margin-left: -4px; }
          .hm-btn { height: 37px !important; padding: 0 6px !important; border-radius: 12px !important; font-size: 13px !important; font-weight: 700 !important; font-family: ${M.letra}; }
          .hm-card { border-radius: 18px !important; box-shadow: ${M.sombra} !important; border: 1px solid #F1EBE2 !important; }
          .hm-foto { aspect-ratio: 370 / 168 !important; }
          .hm-chip { left: 15px !important; top: 12px !important; height: 25px; display: inline-flex !important; align-items: center; padding: 0 12px !important; border-radius: 12px !important; font-size: 11.5px !important; background: #DDEDE8 !important; color: #0E5F5B !important; }
          .hm-info { padding: 6px 17px 12px 20px !important; gap: 0 !important; }
          .hm-info p { margin: 0 !important; }
          .hm-nombre { font-family: ${M.titulos} !important; font-size: 23px !important; line-height: 28px !important; letter-spacing: 0 !important; color: #222826 !important; }
          .hm-edad, .hm-especie { font-size: 11.5px !important; color: #5E6460 !important; font-weight: 600 !important; }
          .hm-ficha { font-size: 12.5px !important; color: #0E5F5B !important; }
          .hm-tag { font-size: 10.5px !important; padding: 3px 12px !important; background: #F3EDE2 !important; color: #5E6460 !important; margin-top: 4px; }
          .hm-cup { padding: 12px 20px 12px 20px !important; gap: 4px !important; border-radius: 16px !important; box-shadow: ${M.sombra} !important; border: 1px solid #F1EBE2 !important; background: #FDFAF5 !important; }
          .hm-cup-k { font-size: 9.5px !important; line-height: 12px !important; letter-spacing: .18em !important; color: #6B706A !important; margin: 0 !important; }
          .hm-cup-t { font-family: ${M.titulos} !important; font-size: 19px !important; line-height: 24px !important; margin-top: 3px !important; letter-spacing: 0 !important; color: #222826 !important; }
          .hm-cup-p { font-size: 11.5px !important; line-height: 14.5px !important; color: #3D4340 !important; padding-right: 100px !important; margin: 0 0 10px !important; }
          .hm-cup-b { height: 35px !important; padding: 0 !important; border-radius: 12px !important; font-size: 13px !important; background: #FDF0CF !important; border-color: #F1DFAE !important; color: #A26F14 !important; margin-left: -1px; }
        }
      `}</style>
      <div className="hm-in mx-auto grid gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8" style={{ maxWidth: 1120 }}>
        <section
          className="hm-s1 grid gap-6 lg:grid-cols-[minmax(0,1.16fr)_minmax(320px,.84fr)]"
          style={{
            borderBottom: `1px solid ${colors.border}`,
            paddingBottom: 28,
          }}
        >
          <div className="hm-txt-wrap grid gap-6">
            {/* Sin logo ni etiquetas: la cabecera ya lleva la marca. */}
            <div className="hm-txt grid gap-3">
              <h1
                className="hm-h1 max-w-3xl text-4xl font-extrabold leading-none sm:text-5xl lg:text-6xl"
                style={{ fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: '-0.03em' }}
              >
                <span className="hm-l1" style={{ whiteSpace: 'nowrap' }}>
                  Cuida, sigue y
                  <CalcoDestellosTitulo size={23} style={{ verticalAlign: 'top', marginLeft: 10, marginTop: -8 }} />
                </span>{' '}
                acompaña a <span style={{ color: '#0E5F5B' }}>{titleTarget}</span>.
              </h1>
              <p className="hm-sub max-w-2xl text-[15px] leading-6 sm:text-lg sm:leading-7" style={{ color: colors.muted }}>
                Tu espacio para ver cómo está tu mascota, apoyar a su protectora y registrar pequeños cuidados sin ruido.
              </p>
            </div>

            {/* Los dos en una fila (maqueta del 2 nov 2026); en móviles muy estrechos bajan. */}
            <div className="hm-btns flex flex-wrap gap-2.5" style={{ rowGap: 10 }}>
              <ActionButton className="hm-btn" variant="primary" onClick={() => nav('/animals')}>
                Ver animales en adopción
              </ActionButton>
              {/* Sin mascota registrada, /pet abre el alta: el botón lo dice. Mientras
                  carga o si falla la consulta se queda en «Ver mi mascota». */}
              <ActionButton className="hm-btn" variant="ghost" onClick={() => nav('/pet')}>
                {!isLoading && !isError && !featuredAnimal && !allPets.length ? 'Registrar mi mascota' : 'Ver mi mascota'}
              </ActionButton>
            </div>
          </div>

          {/* Sin mascota registrada no se enseña: el botón de arriba ya invita a registrarla. */}
          {(isLoading || isError || featuredAnimal) && (
          <div className="grid gap-3">
          {pets.length > 1 && (
            <PetSwitcher pets={pets} selectedId={currentId} onSelect={selectPet} onAdd={() => nav('/pet?nueva=1')} />
          )}
          <Card
            className="hm-card overflow-hidden"
            onClick={hasPet && !isError ? () => nav('/pet') : undefined}
            label={`Abrir la ficha de ${displayName}`}
          >
            <div className="hm-foto relative aspect-[2/1] lg:aspect-[4/3]" style={{ background: colors.panel }}>
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
                  className="hm-chip absolute left-4 top-4 rounded-lg px-3 py-1.5 text-xs font-bold"
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
              <div className="hm-info grid gap-3 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2
                    className="hm-nombre text-3xl font-extrabold"
                    style={{ fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: '-0.03em' }}
                  >
                    {displayName}
                  </h2>
                  {displayAge && <span className="hm-edad text-sm font-bold" style={{ color: colors.muted }}>{displayAge}</span>}
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="hm-especie text-sm font-semibold" style={{ color: colors.muted }}>
                    {displaySpecies}{featuredAnimal?.code ? ` · ${featuredAnimal.code}` : ''}
                  </p>
                  <span className="hm-ficha shrink-0 text-sm font-bold" style={{ color: colors.teal }}>
                    Ver ficha ›
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {featuredAnimal?.city && (
                    <span className="hm-tag rounded-full px-3 py-1 text-xs font-bold" style={{ background: colors.bg, color: colors.muted }}>
                      {featuredAnimal.city}
                    </span>
                  )}
                  {featuredAnimal?.mood && (
                    <span className="hm-tag rounded-full px-3 py-1 text-xs font-bold" style={{ background: colors.bg, color: colors.muted }}>
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

        <section className="hm-s2 grid gap-5 lg:grid-cols-[1fr_1fr_1fr]" style={{ gap: 15 }}>
          {/* El mismo cuidado diario que «Mi mascota»: pregunta qué comió, qué
              arena y cómo fue el paseo. Antes el inicio tenía botones propios que
              marcaban sin preguntar nada. La despensa se queda en «Mi mascota». */}
          {featuredAnimal && (
            <div className="lg:col-span-2">
              <DailyCareCard
                animalId={String(featuredAnimal._id || featuredAnimal.id || '')}
                species={featuredAnimal.species}
                showPantry={false}
                compact
                onMarked={() => {
                  queryClient.invalidateQueries({ queryKey: ['tenant-featured-animal'] });
                  queryClient.invalidateQueries({ queryKey: ['my-pets'] });
                }}
              />
            </div>
          )}

          <Card className="hm-cup grid gap-4 p-5" style={{ position: 'relative', overflow: 'hidden' }}>
            {/* Recorte exacto de la maqueta: cupón dorado, destellos y mancha verde. */}
            <img src="/ilustraciones/cupon-maqueta.png" alt="" aria-hidden style={{ position: 'absolute', right: 2, top: 0, width: 105, height: 'auto', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <p className="hm-cup-k text-xs font-bold uppercase tracking-[0.14em]" style={{ color: colors.soft }}>
                Cupones
              </p>
              <h2
                className="hm-cup-t mt-2 text-2xl font-extrabold"
                style={{ fontFamily: '"Bricolage Grotesque", sans-serif', letterSpacing: '-0.02em' }}
              >
                Ventajas para ti
              </h2>
            </div>

            <p className="hm-cup-p text-sm leading-6" style={{ color: colors.muted, position: 'relative', paddingRight: 104 }}>
              Descubre cupones de tiendas y veterinarios aliados. Al usarlos, generas Patitas para apoyar a las protectoras.
            </p>

            <div className="grid gap-2" style={{ position: 'relative' }}>
              <ActionButton className="hm-cup-b" variant="gold" onClick={() => nav('/coupons')}>
                Ver cupones disponibles
              </ActionButton>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
