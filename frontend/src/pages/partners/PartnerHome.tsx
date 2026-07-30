import React from 'react';
import PatitasPartnerPanel from '../../components/patitas/PatitasPartnerPanel';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// Inicio del partner (tienda / veterinario): el resumen de su cuenta.
export default function PartnerHome() {
  return (
    <div style={{ display: 'grid', gap: 24, padding: 24 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Tu panel 🐾</h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0' }}>Tu actividad, tus liquidaciones y el cobro de tus clientes.</p>
      </header>
      <PatitasPartnerPanel />
    </div>
  );
}
