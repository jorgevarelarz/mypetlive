import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import Brand from '../components/Brand';
import BackButton from '../components/BackButton';

export default function AuthLayout() {
  return (
    <div className="auth-shell safe-top">
      <BackButton className="auth-back" />
      <div className="auth-card">
        <div className="auth-logo" style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Link to="/" aria-label="MyPetLive — inicio"><Brand size={24} /></Link>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
