import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api, { API_BASE } from '../../api/client';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: `1px solid ${MPL.bg}` }}>
      <span style={{ color: MPL.muted }}>{label}</span>
      <strong style={{ textAlign: 'right' }}>{value}</strong>
    </div>
  );
}

export default function AdminSettings() {
  const healthQ = useQuery({
    queryKey: ['admin-settings-health'],
    queryFn: async () => {
      const { data } = await api.get('/health');
      return data as { ok: boolean; env?: string; mongo?: { state?: number } };
    },
    refetchInterval: 30_000,
  });

  const mongoState = healthQ.data?.mongo?.state === 1 ? 'Conectado' : 'Revisar';

  return (
    <div style={{ display: 'grid', gap: 24, padding: 24 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Ajustes</h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0' }}>Estado operativo y configuración visible de la plataforma.</p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, margin: '0 0 12px' }}>Sistema</h2>
          <Row label="API base" value={API_BASE || 'mismo origen'} />
          <Row label="Health" value={healthQ.isLoading ? 'Comprobando...' : healthQ.data?.ok ? 'OK' : 'Error'} />
          <Row label="Entorno API" value={healthQ.data?.env || 'n/d'} />
          <Row label="Mongo" value={mongoState} />
        </div>

        <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20 }}>
          <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, margin: '0 0 12px' }}>Marca</h2>
          <Row label="Sistema visual" value={<Link to="/sistema" style={{ color: MPL.teal }}>Abrir</Link>} />
          <Row label="Direcciones mood" value={<Link to="/mood" style={{ color: MPL.teal }}>Abrir</Link>} />
          <Row label="Landing pública" value={<Link to="/" style={{ color: MPL.teal }}>Abrir</Link>} />
          <Row label="Compañeros" value={<Link to="/animals" style={{ color: MPL.teal }}>Abrir</Link>} />
        </div>
      </section>

      <section style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20 }}>
        <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, margin: '0 0 12px' }}>Checklist de operación</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            'Revisar usuarios nuevos y roles asignados.',
            'Mantener cupones activos con partner válido.',
            'Moderar fichas de animales sin imagen o sin descripción.',
            'Controlar solicitudes abiertas por protectora.',
          ].map(item => (
            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, color: MPL.muted }}>
              <input type="checkbox" />
              {item}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
