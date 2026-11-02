import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { PawPrint } from 'lucide-react';
import { M } from './maqueta';
import { toAbsoluteUrl } from '../../utils/media';
import { acceptPetInvite, declinePetInvite, listMyPetInvites, sharingErrorMessage } from '../../api/petSharing';

// Invitaciones a cuidar una mascota que han llegado a MI correo. Salen arriba en
// «Mi mascota» para que se puedan aceptar desde la app sin abrir el correo (el
// enlace del correo abre la web, no la app).
export default function PetInvitesBanner({ onAccepted }: { onAccepted?: (animalId: string) => void }) {
  const queryClient = useQueryClient();
  const invitesQ = useQuery({ queryKey: ['my-pet-invites'], queryFn: listMyPetInvites, staleTime: 60_000 });

  const done = () => queryClient.invalidateQueries({ queryKey: ['my-pet-invites'] });
  const acceptM = useMutation({
    mutationFn: (inviteId: string) => acceptPetInvite({ inviteId }),
    onSuccess: data => {
      done();
      queryClient.invalidateQueries({ queryKey: ['my-pets'] });
      toast.success('Ya la tienes en Mi mascota');
      onAccepted?.(data.animalId);
    },
    onError: err => toast.error(sharingErrorMessage(err)),
  });
  const declineM = useMutation({
    mutationFn: (inviteId: string) => declinePetInvite({ inviteId }),
    onSuccess: done,
    onError: err => toast.error(sharingErrorMessage(err)),
  });

  const items = invitesQ.data?.items || [];
  if (!items.length) return null;
  const busy = acceptM.isPending || declineM.isPending;

  return (
    <>
      {items.map(invite => (
        <div key={invite.id} style={{ borderRadius: 14, background: '#EAF4F1', border: '1px solid #B9D3CF', padding: '12px 14px', display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', background: '#DDEDE8', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {invite.animal?.image
                ? <img src={toAbsoluteUrl(invite.animal.image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <PawPrint size={22} color={M.verde} />}
            </span>
            <p style={{ margin: 0, fontSize: 14, color: M.tinta, lineHeight: 1.35 }}>
              <strong>{invite.invitedBy}</strong> quiere compartir a <strong>{invite.animal?.name}</strong> contigo.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => acceptM.mutate(invite.id)} style={{ flex: 1, height: 36, border: 0, borderRadius: 10, background: M.verdeBoton, color: '#fff', fontWeight: 700, fontSize: 14 }}>
              Aceptar
            </button>
            <button type="button" disabled={busy} onClick={() => declineM.mutate(invite.id)} style={{ flex: 1, height: 36, borderRadius: 10, border: '1px solid #B9D3CF', background: '#fff', color: M.tinta, fontWeight: 600, fontSize: 14 }}>
              No, gracias
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
