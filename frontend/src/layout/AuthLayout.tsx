import React from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Brand from '../components/Brand';

export default function AuthLayout() {
  const nav = useNavigate();
  // En la app no hay botón «atrás» de navegador: sin esto, del login no se
  // podía salir. Si se entró directo (sin historial), vuelve al inicio.
  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) nav(-1);
    else nav('/', { replace: true });
  };
  return (
    <div className="auth-shell">
      <button type="button" className="auth-back" onClick={back}>
        <ChevronLeft size={20} aria-hidden="true" />
        Volver
      </button>
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Link to="/" aria-label="MyPetLive — inicio"><Brand size={24} /></Link>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
