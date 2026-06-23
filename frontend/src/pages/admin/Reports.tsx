import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { adminListAdoptions, ADOPTION_STATUS_LABEL } from '../../api/adoptions';
import { searchAnimals } from '../../api/animals';
import { getAllCoupons } from '../../api/coupons.admin';
import api from '../../api/client';
import { MPL, MPL_FONT_DISPLAY, PawMark } from '../../styles/mypetlive';

function Metric({ label, value, note, tone = MPL.teal }: { label: string; value: React.ReactNode; note?: string; tone?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, textTransform: 'uppercase', color: MPL.faint, fontWeight: 800 }}>{label}</div>
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 34, lineHeight: 1, fontWeight: 800, marginTop: 10, color: MPL.ink }}>{value}</div>
        </div>
        <span style={{ width: 38, height: 38, borderRadius: 12, background: `${tone}18`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PawMark size={19} />
        </span>
      </div>
      {note && <div style={{ marginTop: 10, color: MPL.muted, fontSize: 13 }}>{note}</div>}
    </div>
  );
}

export default function AdminReports() {
  const usersQ = useQuery({
    queryKey: ['admin-report-users'],
    queryFn: async () => {
      const { data } = await api.get('/api/users', { params: { page: 1, limit: 100 } });
      return data as { items: any[]; total: number };
    },
    retry: false,
  });
  const animalsQ = useQuery({
    queryKey: ['admin-report-animals'],
    queryFn: () => searchAnimals({ limit: 100, page: 1, sort: 'createdAt', dir: 'desc' }),
    retry: false,
  });
  const adoptionsQ = useQuery({
    queryKey: ['admin-report-adoptions'],
    queryFn: () => adminListAdoptions({ page: 1, limit: 100 }),
    retry: false,
  });
  const couponsQ = useQuery({ queryKey: ['admin-report-coupons'], queryFn: getAllCoupons, retry: false });

  const users = useMemo(() => usersQ.data?.items || [], [usersQ.data?.items]);
  const animals = useMemo(() => animalsQ.data?.items || [], [animalsQ.data?.items]);
  const adoptions = useMemo(() => adoptionsQ.data?.items || [], [adoptionsQ.data?.items]);
  const coupons = useMemo(() => couponsQ.data?.items || [], [couponsQ.data?.items]);

  const usersByRole = useMemo(() => {
    return users.reduce((acc: Record<string, number>, user: any) => {
      acc[user.role || 'sin_rol'] = (acc[user.role || 'sin_rol'] || 0) + 1;
      return acc;
    }, {});
  }, [users]);

  const animalStatuses = useMemo(() => {
    return animals.reduce((acc: Record<string, number>, animal: any) => {
      acc[animal.status || 'sin_estado'] = (acc[animal.status || 'sin_estado'] || 0) + 1;
      return acc;
    }, {});
  }, [animals]);

  const adoptionStatuses = useMemo(() => {
    return adoptions.reduce((acc: Record<string, number>, adoption: any) => {
      acc[adoption.status || 'sin_estado'] = (acc[adoption.status || 'sin_estado'] || 0) + 1;
      return acc;
    }, {});
  }, [adoptions]);

  const activeCoupons = coupons.filter((coupon: any) => coupon.active !== false && !coupon.usedAt).length;
  const loading = usersQ.isLoading || animalsQ.isLoading || adoptionsQ.isLoading || couponsQ.isLoading;

  return (
    <div style={{ display: 'grid', gap: 24, padding: 24 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Reportes</h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0' }}>Lectura rápida del estado de MyPetLive.</p>
      </header>

      {[usersQ, animalsQ, adoptionsQ, couponsQ].some(query => query.isError) && (
        <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 16, color: MPL.coralDark }}>
          Algunas métricas no están disponibles para esta sesión. Revisa que el usuario admin esté verificado y tenga permisos completos.
        </div>
      )}

      {loading ? (
        <div style={{ color: MPL.muted }}>Cargando métricas...</div>
      ) : (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
            <Metric label="Usuarios" value={usersQ.data?.total ?? users.length} note={`${usersByRole.tenant || 0} adoptantes · ${usersByRole.landlord || 0} protectoras`} />
            <Metric label="Animales" value={animalsQ.data?.total ?? animals.length} note={`${animalStatuses.publicado || 0} publicados`} tone={MPL.olive} />
            <Metric label="Solicitudes" value={adoptionsQ.data?.total ?? adoptions.length} note={`${adoptionStatuses.recibida || 0} recibidas`} tone={MPL.gold} />
            <Metric label="Cupones" value={coupons.length} note={`${activeCoupons} activos`} tone={MPL.coral} />
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16 }}>
            <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20 }}>
              <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, margin: '0 0 14px' }}>Adopciones por estado</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {Object.entries(ADOPTION_STATUS_LABEL).map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${MPL.bg}`, paddingBottom: 7 }}>
                    <span style={{ color: MPL.muted }}>{label}</span>
                    <strong>{adoptionStatuses[key] || 0}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 20 }}>
              <h2 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 22, margin: '0 0 14px' }}>Accesos directos</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  ['/admin/users', 'Revisar usuarios'],
                  ['/admin/animals', 'Moderar animales'],
                  ['/admin/adoptions', 'Ver solicitudes'],
                  ['/admin/coupons', 'Gestionar cupones'],
                ].map(([to, label]) => (
                  <Link key={to} to={to} style={{ color: MPL.teal, fontWeight: 800, textDecoration: 'none' }}>{label}</Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
