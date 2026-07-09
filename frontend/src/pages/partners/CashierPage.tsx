import React from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { GeneratePatitas } from '../../components/patitas/PatitasPartnerPanel';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// Modo Caja: el alta sin TPV. Pantalla única pensada para el móvil o tablet que
// el partner ya tiene junto a la caja — escanear al cliente, ver sus cupones y
// registrar la venta, sin integrar nada. La integración del TPV (API) es el
// paso opcional de después, desde Perfil → Conectar tu TPV.
export default function CashierPage() {
  const { user } = useAuth();
  const meId = String(user?._id || '');
  const qc = useQueryClient();

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 44, height: 44, borderRadius: 13, background: MPL.teal, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <Store size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, margin: 0 }}>Caja</h1>
          <p style={{ color: MPL.muted, fontSize: 13.5, margin: 0 }}>
            Escanea el código del cliente, aplica sus cupones y registra la venta. Sin TPV ni instalación.
          </p>
        </div>
      </header>

      <GeneratePatitas meId={meId} onDone={() => qc.invalidateQueries({ queryKey: ['my-coupons'] })} />

      <p style={{ color: MPL.faint, fontSize: 12.5, margin: 0 }}>
        ¿Tu sistema de caja puede integrarse? Conéctalo desde{' '}
        <Link to="/profile" style={{ color: MPL.tealDark, fontWeight: 800 }}>Perfil → Conectar tu TPV</Link>{' '}
        y las ventas se registrarán solas.
      </p>
    </div>
  );
}
