import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import ProBadge from '../../components/ui/ProBadge';
import api from '../../api/client';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

const roleLabel: Record<string, string> = {
  tenant: 'Adoptante',
  landlord: 'Protectora',
  admin: 'Administración',
  store: 'Tienda',
  vet: 'Veterinario',
  pro: 'Profesional',
};

export default function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const isTenantPro = user?.role === 'tenant' && user?.tenantPro?.status === 'verified';

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?._id) throw new Error('missing_user');
      const payload = { name: name.trim(), email: email.trim().toLowerCase() };
      const { data } = await api.patch(`/api/users/${user._id}`, payload);
      return data;
    },
    onSuccess: updated => {
      if (user?.token) {
        localStorage.setItem('user', JSON.stringify({ ...user, ...updated, token: user.token }));
      }
      toast.success('Perfil actualizado');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'No se pudo guardar el perfil');
    },
  });

  if (!user) {
    return <div style={{ padding: 24 }}>Inicia sesión para ver tu perfil.</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 24, padding: 24 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Perfil y cuenta</h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0' }}>Gestiona los datos básicos con los que operas en MyPetLive.</p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 16 }}>
        <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, margin: '0 0 16px' }}>Datos personales</h2>
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
              Nombre
              <input value={name} onChange={e => setName(e.target.value)} style={{ border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit' }} />
            </label>
            <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
              Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ border: `1.5px solid ${MPL.border}`, borderRadius: 12, padding: '11px 13px', font: 'inherit' }} />
            </label>
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !name.trim() || !email.trim()}
              style={{ justifySelf: 'start', background: MPL.coral, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: saveMutation.isPending ? .7 : 1 }}
            >
              {saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <p style={{ color: MPL.faint, fontSize: 13, margin: 0 }}>Si cambias el email, vuelve a iniciar sesión si notas que tu sesión no refresca al momento.</p>
          </div>
        </div>

        <aside style={{ background: MPL.teal, color: '#fff', borderRadius: 18, padding: 22, alignSelf: 'start' }}>
          <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', fontWeight: 800 }}>Rol</div>
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 28, fontWeight: 800, marginTop: 8 }}>{roleLabel[user.role] || user.role}</div>
          <div style={{ marginTop: 16, color: 'rgba(255,255,255,.82)', fontSize: 14 }}>{user.email}</div>
          {isTenantPro && (
            <div style={{ marginTop: 18, background: '#fff', color: MPL.ink, borderRadius: 14, padding: 12 }}>
              <ProBadge maxRent={user?.tenantPro?.maxRent} />
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
