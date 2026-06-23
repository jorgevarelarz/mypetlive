import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import Brand from '../components/Brand';

export default function AuthLayout() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Link to="/" aria-label="MyPetLive — inicio"><Brand size={24} /></Link>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
