import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PawPrint } from 'lucide-react';
import BackButton from '../../components/BackButton';
import { useAuth } from '../../context/AuthContext';
import { usePageMeta } from '../../utils/usePageMeta';
import { toAbsoluteUrl } from '../../utils/media';
import { saveSelectedPet } from '../../utils/selectedPet';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY } from '../../styles/mypetlive';
import { acceptPetInvite, declinePetInvite, previewPetInvite, sharingErrorMessage } from '../../api/petSharing';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const primary: React.CSSProperties = { background: MPL.teal, color: '#fff', border: 0, borderRadius: 12, padding: '11px 18px', fontWeight: 800, textDecoration: 'none', cursor: 'pointer', fontSize: 15 };
const secondary: React.CSSProperties = { background: '#fff', color: MPL.ink, border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '11px 18px', fontWeight: 800, textDecoration: 'none', cursor: 'pointer', fontSize: 15 };

// ---------------------------------------------------------------------------
// `/compartir/:token` — el enlace del correo «Ana quiere compartir a Luna
// contigo». Sin ProtectedRoute: quien lo abre quizá aún no tiene cuenta. El
// token es la credencial; la vista previa solo enseña lo que ya decía el correo.
// ---------------------------------------------------------------------------
export default function AcceptPetInvite() {
  const { token = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState('');

  usePageMeta({ title: 'Invitación · MyPetLive', description: 'Te han invitado a cuidar de una mascota en MyPetLive' });

  const previewQ = useQuery({
    queryKey: ['pet-invite', token],
    queryFn: () => previewPetInvite(token),
    enabled: Boolean(token),
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => acceptPetInvite({ token }),
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['my-pets'] });
      saveSelectedPet(data.animalId);
      navigate(`/pet?mascota=${data.animalId}`, { replace: true });
    },
    onError: err => setError(sharingErrorMessage(err)),
  });

  const decline = useMutation({
    mutationFn: () => declinePetInvite({ token }),
    onSuccess: () => {
      navigate('/', { replace: true });
    },
    onError: err => setError(sharingErrorMessage(err)),
  });

  const shell = (children: React.ReactNode) => (
    <div style={{ fontFamily: MPL_FONT_BODY, background: MPL.bg, color: MPL.ink, minHeight: '100vh' }}>
      <header className="safe-top" style={{ borderBottom: `1px solid ${MPL.border}`, background: '#fff' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9 }}>
          <BackButton style={{ color: MPL.ink, marginLeft: -6 }} />
          <Link to="/" style={{ textDecoration: 'none', color: MPL.ink, display: 'flex', alignItems: 'center', gap: 9 }}>
            <PawPrint size={22} color={MPL.teal} />
            <span style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800 }}>MyPet<span style={{ color: MPL.coral }}>Live</span></span>
          </Link>
        </div>
      </header>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px 60px', display: 'grid', gap: 16 }}>{children}</main>
    </div>
  );

  if (previewQ.isLoading) return shell(<div style={{ color: MPL.faint }}>Abriendo la invitación…</div>);

  const invite = previewQ.data;
  if (!invite || !invite.animal) {
    return shell(
      <div style={card}>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, margin: '0 0 8px' }}>Invitación no encontrada</h1>
        <p style={{ color: MPL.muted, margin: 0 }}>
          El enlace no es válido o está incompleto. Ábrelo de nuevo desde el correo o pide que te manden otra invitación.
        </p>
      </div>,
    );
  }

  const { animal } = invite;
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', background: MPL.teal100, flexShrink: 0 }}>
        {animal.image
          ? <img src={toAbsoluteUrl(animal.image)} alt={animal.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MPL.teal }}><PawPrint size={28} /></div>}
      </div>
      <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 24, lineHeight: 1.2, margin: 0 }}>
        {invite.invitedBy} quiere compartir a {animal.name} contigo
      </h1>
    </div>
  );

  if (invite.status !== 'pending') {
    const why: Record<string, string> = {
      accepted: 'Esta invitación ya se aceptó. Si fuiste tú, la tienes en «Mi mascota».',
      declined: 'Esta invitación se rechazó.',
      revoked: 'Esta invitación ya no vale: la anularon o mandaron otra más nueva.',
      expired: 'Esta invitación ha caducado.',
    };
    return shell(
      <div style={card}>
        {head}
        <p style={{ color: MPL.muted, margin: '14px 0 0' }}>
          {why[invite.status]} {invite.status !== 'accepted' && `Pídele a ${invite.invitedBy} que te mande otra.`}
        </p>
        {invite.status === 'accepted' && user && (
          <div style={{ marginTop: 14 }}><Link to="/pet" style={primary}>Ir a Mi mascota</Link></div>
        )}
      </div>,
    );
  }

  const here = `/compartir/${encodeURIComponent(token)}`;
  return shell(
    <div style={card}>
      {head}
      <p style={{ color: MPL.muted, margin: '14px 0 0' }}>
        Podréis apuntar las comidas y los paseos, su salud y sus vacunas, y os llegarán a los dos los avisos: por ejemplo,
        si se pierde y alguien escanea su chapa.
      </p>
      <p style={{ color: MPL.faint, fontSize: 13, margin: '8px 0 0' }}>
        La invitación se envió a {invite.email}. {invite.invitedBy} verá con qué cuenta entras y puede quitarte el acceso cuando quiera.
      </p>

      {error && <p style={{ color: '#B3261E', margin: '12px 0 0', fontSize: 14 }}>{error}</p>}

      {user ? (
        (user as any).role !== 'tenant' ? (
          <p style={{ color: '#B3261E', margin: '14px 0 0', fontSize: 14 }}>
            Has entrado con una cuenta de protectora, veterinario o tienda. Para cuidar de {animal.name} entra con tu cuenta personal.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" style={primary} disabled={accept.isPending || decline.isPending} onClick={() => { setError(''); accept.mutate(); }}>
              {accept.isPending ? 'Aceptando…' : 'Aceptar'}
            </button>
            <button type="button" style={secondary} disabled={accept.isPending || decline.isPending} onClick={() => { setError(''); decline.mutate(); }}>
              No, gracias
            </button>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <Link to={`/login?redirect=${encodeURIComponent(here)}`} style={primary}>Entrar para aceptar</Link>
          <Link to={`/register?redirect=${encodeURIComponent(here)}`} style={secondary}>Crear cuenta</Link>
        </div>
      )}
    </div>,
  );
}
