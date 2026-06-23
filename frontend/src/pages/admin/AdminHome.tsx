import React from 'react';
import { Link } from 'react-router-dom';

const LINKS: Array<{ to: string; label: string; desc: string }> = [
  { to: '/admin/users', label: 'Usuarios', desc: 'Adoptantes, protectoras y partners' },
  { to: '/admin/animals', label: 'Animales', desc: 'Fichas publicadas en la plataforma' },
  { to: '/admin/adoptions', label: 'Adopciones', desc: 'Solicitudes y su estado' },
  { to: '/admin/coupons', label: 'Cupones', desc: 'Crea y gestiona cupones de partners' },
  { to: '/admin/reports', label: 'Reportes', desc: 'Métricas del ecosistema' },
];

export default function AdminHome() {
  return (
    <div className="p-4 grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">Panel de administración</h1>
        <p className="text-gray-600">Modera la plataforma y revisa el ecosistema MyPetLive.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="rounded-2xl border p-4 bg-white hover:shadow-sm transition"
            style={{ borderColor: '#E7E1D5' }}
          >
            <div className="font-semibold">{l.label}</div>
            <div className="text-sm text-gray-600 mt-1">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
