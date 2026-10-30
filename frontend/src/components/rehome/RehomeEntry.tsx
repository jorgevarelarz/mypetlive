import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getRehomeStatus } from '../../api/rehome';
import { useAuth } from '../../context/AuthContext';

/** Acceso a «Buscar casa a un animal». Solo lo ve quien el admin ha activado. */
export default function RehomeEntry({ style }: { style?: React.CSSProperties }) {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['rehome-status'], queryFn: getRehomeStatus, enabled: user?.role === 'tenant', staleTime: 5 * 60_000 });
  if (!q.data) return null;
  return (
    <Link to="/buscar-casa" className="text-sm" style={{ color: '#3F4A3C', textDecoration: 'underline', textUnderlineOffset: 3, ...style }}>
      🏠 Buscar casa a un animal
    </Link>
  );
}
