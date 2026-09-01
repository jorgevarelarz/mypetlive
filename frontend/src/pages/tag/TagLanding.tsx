import React from 'react';
import { useParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { PawPrint, Tag as TagIcon, AlertCircle } from 'lucide-react';
import { resolveTag, claimTag } from '../../api/tags';
import { listMyPets } from '../../api/animals';
import { useAuth } from '../../context/AuthContext';
import { usePageMeta } from '../../utils/usePageMeta';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, MPL_FONT_MONO } from '../../styles/mypetlive';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };

// ---------------------------------------------------------------------------
// Aterrizaje del QR de la chapa: `/t/:code`
//
// Es la única pantalla de la app a la que se llega con el móvil de un
// desconocido, en la calle, con un perro tirando de la correa. Por eso el
// camino "chapa ya asignada" no pregunta nada: redirige al pasaporte y punto.
// ---------------------------------------------------------------------------
export default function TagLanding() {
  const { code = '' } = useParams();
  const normalized = code.trim().toUpperCase();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [animalCode, setAnimalCode] = React.useState('');
  const [error, setError] = React.useState('');

  usePageMeta({ title: 'Chapa MyPetLive', description: 'Chapa QR de identificación de MyPetLive' });

  const tagQ = useQuery({
    queryKey: ['tag', normalized],
    queryFn: () => resolveTag(normalized),
    enabled: !!normalized,
    retry: false,
  });

  // Solo se piden las mascotas del usuario si hay sesión y la chapa está libre:
  // el desconocido que escanea por la calle nunca dispara esta llamada.
  const petsQ = useQuery({
    queryKey: ['my-animals-for-tag'],
    queryFn: () => listMyPets(),
    enabled: !!user && tagQ.data?.status === 'libre',
    retry: false,
  });

  const claim = useMutation({
    mutationFn: (animal: string) => claimTag(normalized, animal),
    onSuccess: (data) => {
      if (data.animal?.code) navigate(`/p/${data.animal.code}`, { replace: true });
    },
    onError: (err: any) => {
      const codeErr = err?.response?.data?.error;
      setError(
        codeErr === 'animal_not_found' ? 'No encontramos ninguna mascota con ese código. Míralo en su pasaporte.'
        : codeErr === 'forbidden' ? 'Esa mascota no es tuya. Solo puede asignar la chapa quien la tiene a su cargo.'
        : codeErr === 'animal_already_tagged' ? 'Esa mascota ya tiene una chapa asignada.'
        : codeErr === 'tag_already_claimed' ? 'Esta chapa acaba de asignarse a otra mascota.'
        : 'No hemos podido asignar la chapa. Inténtalo de nuevo.',
      );
    },
  });

  const status = tagQ.data?.status;

  // Chapa asignada: al pasaporte, sin escala. `replace` para que el botón
  // "atrás" del móvil no devuelva a esta pantalla intermedia.
  if (status === 'vinculada' && tagQ.data?.animal?.code) {
    return <Navigate to={`/p/${tagQ.data.animal.code}`} replace />;
  }

  const shell = (children: React.ReactNode) => (
    <div style={{ fontFamily: MPL_FONT_BODY, background: MPL.bg, color: MPL.ink, minHeight: '100vh' }}>
      <header style={{ borderBottom: `1px solid ${MPL.border}`, background: '#fff' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '14px 20px' }}>
          <Link to="/" style={{ textDecoration: 'none', color: MPL.ink, display: 'flex', alignItems: 'center', gap: 9 }}>
            <PawPrint size={22} color={MPL.teal} />
            <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800 }}>MyPet<span style={{ color: MPL.coral }}>Live</span></span>
          </Link>
        </div>
      </header>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 60px', display: 'grid', gap: 16 }}>{children}</main>
    </div>
  );

  if (tagQ.isLoading) return shell(<div style={{ color: MPL.faint }}>Leyendo la chapa…</div>);

  const httpStatus = (tagQ.error as any)?.response?.status;

  if (httpStatus === 410) {
    return shell(
      <div style={card}>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: '0 0 8px' }}>Chapa anulada</h1>
        <p style={{ color: MPL.muted, margin: 0 }}>
          Esta chapa se dio de baja y ya no identifica a ninguna mascota. Si te has encontrado un animal con ella,
          escríbenos a <a href="mailto:soporte@mypetlive.es" style={{ color: MPL.teal, fontWeight: 700 }}>soporte@mypetlive.es</a>.
        </p>
      </div>,
    );
  }

  if (!tagQ.data) {
    return shell(
      <div style={card}>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: '0 0 8px' }}>Chapa no reconocida</h1>
        <p style={{ color: MPL.muted }}>
          No existe ninguna chapa con el código <strong style={{ fontFamily: MPL_FONT_MONO }}>{normalized}</strong>.
          Comprueba que has escaneado bien el QR.
        </p>
      </div>,
    );
  }

  // A partir de aquí: chapa libre, es decir el dueño estrenando el collar.
  if (!user) {
    return shell(
      <div style={card}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: MPL.teal100, color: MPL.tealDark, borderRadius: 999, padding: '5px 12px', fontFamily: MPL_FONT_MONO, fontWeight: 800, fontSize: 12 }}>
          <TagIcon size={13} /> {tagQ.data.code}
        </div>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, margin: '12px 0 8px' }}>Esta chapa está sin asignar</h1>
        <p style={{ color: MPL.muted }}>
          Entra en tu cuenta para vincularla con tu mascota. Cuando lo hagas, quien escanee este QR verá su pasaporte
          y podrá avisarte si se pierde.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <Link to={`/login?redirect=/t/${normalized}`} style={{ background: MPL.teal, color: '#fff', borderRadius: 12, padding: '11px 18px', fontWeight: 800, textDecoration: 'none' }}>
            Entrar
          </Link>
          <Link to={`/register?redirect=/t/${normalized}`} style={{ border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '11px 18px', fontWeight: 800, textDecoration: 'none', color: MPL.ink }}>
            Crear cuenta
          </Link>
        </div>
      </div>,
    );
  }

  // `/api/animals/mine` envuelve cada ficha en { type, animal }: mascota propia
  // y animal adoptado llegan por caminos distintos pero valen igual para la chapa.
  const pets = (petsQ.data?.items || []).map((it: any) => it.animal).filter((a: any) => a?.code);

  return shell(
    <div style={card}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: MPL.teal100, color: MPL.tealDark, borderRadius: 999, padding: '5px 12px', fontFamily: MPL_FONT_MONO, fontWeight: 800, fontSize: 12 }}>
        <TagIcon size={13} /> {tagQ.data.code}
      </div>
      <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, margin: '12px 0 8px' }}>¿De quién es esta chapa?</h1>
      <p style={{ color: MPL.muted, marginTop: 0 }}>
        Elige la mascota o escribe su código de pasaporte. Podrás cambiarlo más adelante.
      </p>

      {pets.length > 0 && (
        <div style={{ display: 'grid', gap: 8, margin: '16px 0' }}>
          {pets.map((p: any) => (
            <button
              key={p._id || p.code}
              type="button"
              disabled={claim.isPending}
              onClick={() => { setError(''); claim.mutate(p.code); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer',
                background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 14, padding: 12,
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: MPL.teal100, flexShrink: 0 }}>
                {p.images?.[0]
                  ? <img src={p.images[0]} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.teal }}><PawPrint size={22} /></div>}
              </div>
              <div>
                <div style={{ fontWeight: 800 }}>{p.name}</div>
                <div style={{ fontFamily: MPL_FONT_MONO, fontSize: 12, color: MPL.faint }}>{p.code}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); setError(''); claim.mutate(animalCode.trim().toUpperCase()); }}
        style={{ display: 'grid', gap: 10, marginTop: pets.length ? 4 : 16 }}
      >
        <label style={{ fontWeight: 700, fontSize: 14 }}>
          {pets.length > 0 ? 'O escribe el código de la mascota' : 'Código de la mascota'}
        </label>
        <input
          value={animalCode}
          onChange={(e) => setAnimalCode(e.target.value)}
          placeholder="LUNA-472"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{
            border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '12px 14px',
            fontFamily: MPL_FONT_MONO, fontSize: 16, textTransform: 'uppercase',
          }}
        />
        <button
          type="submit"
          disabled={!animalCode.trim() || claim.isPending}
          style={{
            background: animalCode.trim() ? MPL.teal : MPL.border, color: '#fff', border: 'none',
            borderRadius: 12, padding: '12px 18px', fontWeight: 800, fontSize: 15,
            cursor: animalCode.trim() ? 'pointer' : 'default',
          }}
        >
          {claim.isPending ? 'Asignando…' : 'Asignar chapa'}
        </button>
      </form>

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, color: MPL.coral, fontSize: 14 }}>
          <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      <p style={{ color: MPL.faint, fontSize: 13, marginTop: 18, marginBottom: 0 }}>
        El código de tu mascota aparece en su pasaporte, debajo de la foto.
      </p>
    </div>,
  );
}
