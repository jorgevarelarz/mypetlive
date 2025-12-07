import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RedirectHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    const path = user?.role === 'tenant' ? '/home'
      : user?.role === 'landlord' ? '/landlord'
      : user?.role === 'pro' ? '/pro'
      : user?.role === 'admin' ? '/admin'
      : user?.role === 'store' || user?.role === 'vet' ? '/partner'
      : '/login';
    nav(path, { replace: true });
  }, [user, nav]);
  return null;
}
