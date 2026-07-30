import React from 'react';
import { RedeemFromShelter } from '../../components/patitas/PatitasPartnerPanel';
import { MPL, MPL_FONT_DISPLAY } from '../../styles/mypetlive';

// Patitas pendientes: cobrar los canjes de Patitas de las protectoras.
// Antes compartía pantalla con el Inicio del partner (el menú llevaba a las dos
// entradas al mismo sitio); ahora es su propia página.
export default function PatitasPending() {
  return (
    <div style={{ display: 'grid', gap: 24, padding: 24 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 32, fontWeight: 800, margin: 0 }}>Patitas pendientes 🐾</h1>
        <p style={{ color: MPL.muted, margin: '6px 0 0' }}>Cobra canjes de Patitas de las protectoras y recibe el pago en tu cuenta.</p>
      </header>
      <RedeemFromShelter />
    </div>
  );
}
