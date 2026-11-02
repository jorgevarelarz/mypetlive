import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Users, X } from 'lucide-react';
import { M } from './maqueta';
import {
  getPetFamily,
  invitePetFamily,
  removePetMember,
  revokePetInvite,
  sharingErrorMessage,
  type FamilyPerson,
} from '../../api/petSharing';

// «Quién cuida de Luna»: la mascota compartida, en la ficha.
//
// El dueño ve a todos, las invitaciones pendientes y el formulario para
// invitar por correo; quien la comparte ve quién más la cuida y puede salirse.
// Las reglas viven en el servidor (petSharing.controller); aquí solo se
// esconde lo que cada uno no puede hacer.

const CARD: React.CSSProperties = { borderRadius: 14, background: M.tarjeta, boxShadow: M.sombra, border: '1px solid #F1EBE2', padding: '12px 14px' };
const TITLE: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, margin: 0, fontFamily: M.titulos, fontSize: 17, fontWeight: 700, color: M.tinta };
const SMALL_BUTTON: React.CSSProperties = {
  flexShrink: 0, height: 28, padding: '0 14px', borderRadius: 14, border: `1px solid ${M.verde}`,
  background: '#FFFFFF', color: M.verdeBoton, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();

export default function PetFamilyCard({ animalId, petName, onLeft }: { animalId: string; petName: string; onLeft?: () => void }) {
  const queryClient = useQueryClient();
  const key = ['pet-family', animalId];
  const familyQ = useQuery({ queryKey: key, queryFn: () => getPetFamily(animalId), enabled: Boolean(animalId) });
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const inviteM = useMutation({
    mutationFn: () => invitePetFamily(animalId, email.trim()),
    onSuccess: () => {
      toast.success(`Invitación enviada a ${email.trim()}`);
      setEmail('');
      setInviteOpen(false);
      setError(null);
      refresh();
    },
    onError: err => setError(sharingErrorMessage(err)),
  });

  const revokeM = useMutation({
    mutationFn: (inviteId: string) => revokePetInvite(animalId, inviteId),
    onSuccess: refresh,
    onError: err => toast.error(sharingErrorMessage(err)),
  });

  const removeM = useMutation({
    mutationFn: (userId: string) => removePetMember(animalId, userId),
    onSuccess: (_data, userId) => {
      if (userId === 'me') {
        toast.success(`Ya no compartes a ${petName}`);
        queryClient.invalidateQueries({ queryKey: ['my-pets'] });
        onLeft?.();
        return;
      }
      refresh();
    },
    onError: err => toast.error(sharingErrorMessage(err)),
  });

  const family = familyQ.data;
  if (!family) return null;
  const isOwner = family.me === 'owner';
  const slotsLeft = family.maxMembers - family.members.length - family.invites.length;

  const person = (p: FamilyPerson, label: string, action?: React.ReactNode) => (
    <li key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid #EDE7DE' }}>
      <span aria-hidden style={{ width: 30, height: 30, borderRadius: 999, background: '#DDEDE8', color: M.verdeBoton, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
        {initial(p.name)}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, color: M.tinta, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.isMe ? `${p.name} (tú)` : p.name}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: M.gris }}>{label}</span>
      </span>
      {action}
    </li>
  );

  const confirmRemove = (p: FamilyPerson) => {
    if (window.confirm(`¿Quitar a ${p.name}? Dejará de ver a ${petName} y de recibir sus avisos.`)) removeM.mutate(p.userId);
  };
  const confirmLeave = () => {
    if (window.confirm(`¿Dejar de compartir a ${petName}? Ya no la verás en tu cuenta ni te llegarán sus avisos.`)) removeM.mutate('me');
  };

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={TITLE}><Users size={22} color={M.verde} /> Quién cuida de {petName}</h2>
        {isOwner && slotsLeft > 0 && (
          <button type="button" style={SMALL_BUTTON} onClick={() => { setInviteOpen(v => !v); setError(null); }}>
            {inviteOpen ? 'Cancelar' : 'Invitar'}
          </button>
        )}
      </div>

      {family.members.length === 0 && family.invites.length === 0 && isOwner && !inviteOpen && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: M.gris }}>
          ¿La cuidáis entre varios? Invita a tu pareja o a quien la saque, y llevaréis los dos lo mismo: comidas, paseos, vacunas y los avisos si se pierde.
        </p>
      )}

      {inviteOpen && (
        <form
          onSubmit={e => { e.preventDefault(); if (email.trim()) inviteM.mutate(); }}
          style={{ marginTop: 10, display: 'grid', gap: 8, padding: 12, borderRadius: 12, background: '#F7F5EF' }}
        >
          <label style={{ fontSize: 14, color: '#3F4A3C' }}>
            Su correo
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nombre@correo.com"
              style={{ marginTop: 4, width: '100%', borderRadius: 8, border: '1px solid #E7E1D5', padding: '8px 12px', fontSize: 16 }}
            />
          </label>
          <span style={{ fontSize: 12, color: M.gris }}>
            Le llegará un enlace para aceptar. Si aún no tiene cuenta, podrá crearla desde ahí.
          </span>
          {error && <p style={{ margin: 0, fontSize: 13, color: '#B3261E' }}>{error}</p>}
          <button
            type="submit"
            disabled={inviteM.isPending || !email.trim()}
            style={{ border: 0, borderRadius: 8, padding: '9px 12px', background: '#2E6B4F', color: '#fff', fontWeight: 600, fontSize: 14, opacity: inviteM.isPending || !email.trim() ? 0.6 : 1 }}
          >
            {inviteM.isPending ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </form>
      )}

      {(family.members.length > 0 || family.invites.length > 0 || !isOwner) && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
          {family.owner && person(family.owner, 'La dio de alta')}
          {family.members.map(m =>
            person(
              m,
              'La cuida contigo',
              isOwner ? (
                <button type="button" aria-label={`Quitar a ${m.name}`} onClick={() => confirmRemove(m)} style={{ border: 0, background: 'none', color: M.gris, padding: 4, cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              ) : undefined,
            ),
          )}
          {isOwner && family.invites.map(i => (
            <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid #EDE7DE' }}>
              <span aria-hidden style={{ width: 30, height: 30, borderRadius: 999, border: '1.5px dashed #B9D3CF', flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: 14, color: M.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.email}</span>
                <span style={{ display: 'block', fontSize: 12, color: M.gris }}>Invitación enviada · sin responder</span>
              </span>
              <button type="button" onClick={() => revokeM.mutate(i.id)} disabled={revokeM.isPending} style={{ border: 0, background: 'none', color: M.gris, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}>
                Anular
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isOwner && (
        <button type="button" onClick={confirmLeave} disabled={removeM.isPending} style={{ marginTop: 8, padding: 0, border: 0, background: 'none', color: M.gris, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}>
          Dejar de compartir a {petName}
        </button>
      )}
    </div>
  );
}
