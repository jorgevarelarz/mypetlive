import React from 'react';
import { MPL, MPL_FONT_DISPLAY, MPL_FONT_MONO } from '../../styles/mypetlive';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };
const h2: React.CSSProperties = { fontFamily: MPL_FONT_DISPLAY, fontSize: 20, fontWeight: 800, margin: '0 0 10px' };
const p: React.CSSProperties = { color: MPL.muted, fontSize: 14, lineHeight: 1.6, margin: '0 0 10px' };

function CodeBlock({ children }: { children: string }) {
  return (
    <pre style={{ fontFamily: MPL_FONT_MONO, fontSize: 12.5, background: MPL.bg, borderRadius: 12, padding: 14, overflowX: 'auto', margin: '0 0 10px', lineHeight: 1.55 }}>
      {children}
    </pre>
  );
}

// Guía pública de integración del TPV: el partner se la reenvía a su proveedor
// de software de caja. Público a propósito — el proveedor no tiene cuenta.
export default function TpvGuidePage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gap: 16 }}>
      <header>
        <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 30, fontWeight: 800, margin: '0 0 6px' }}>
          Integración de TPV — MyPetLive
        </h1>
        <p style={p}>
          Guía para proveedores de software de caja: conectar el TPV de una tienda o clínica veterinaria
          con MyPetLive. Al escanear el código del cliente, el TPV registra la venta con sus productos y
          aplica automáticamente sus cupones. Dos llamadas REST y listo.
        </p>
      </header>

      <section style={card}>
        <h2 style={h2}>Autenticación</h2>
        <p style={p}>
          Todas las llamadas llevan la cabecera <code>X-Api-Key</code> con la clave del establecimiento
          (formato <code>mpl_pos_…</code>). El partner la genera en su panel de MyPetLive
          (<strong>Perfil → Conectar tu TPV</strong>) y os la hace llegar. Empezad con una{' '}
          <strong>clave de pruebas</strong> (<code>mpl_pos_test_…</code>): mismo flujo y misma respuesta,
          pero sin efectos reales (no crea ventas, ni consume cupones, ni acredita Patitas); las respuestas
          llevan <code>"test": true</code>. Base URL: <code>https://mypetlive.es/api/pos</code>.
        </p>
      </section>

      <section style={card}>
        <h2 style={h2}>1. Identificar al cliente — POST /identify</h2>
        <p style={p}>
          El cliente muestra su QR (contenido: <code>userToken</code>) o su código corto de 6 caracteres.
          Nunca se acepta un id de usuario directo: la venta exige cliente presente.
        </p>
        <CodeBlock>{`curl -X POST https://mypetlive.es/api/pos/identify \\
  -H "X-Api-Key: mpl_pos_XXXX" \\
  -H "Content-Type: application/json" \\
  -d '{"code": "ABC123"}'

// 200 → { "userId": "6a3a…", "name": "Ana",
//   "coupons": [{ "_id": "6a41…", "title": "10% en pienso",
//     "discount": "-10%", "bonusPatitas": 20 }] }`}</CodeBlock>
        <p style={p}>
          Los <code>coupons</code> son los aplicables de ese cliente en ese establecimiento: aplicad el
          descuento en el ticket y pasad sus ids en la venta.
        </p>
      </section>

      <section style={card}>
        <h2 style={h2}>2. Exportar la venta — POST /sales</h2>
        <CodeBlock>{`curl -X POST https://mypetlive.es/api/pos/sales \\
  -H "X-Api-Key: mpl_pos_XXXX" \\
  -H "Content-Type: application/json" \\
  -d '{
    "code": "ABC123",
    "amountEur": 47.50,
    "externalRef": "TICKET-2026-000123",
    "couponIds": ["6a41…"],
    "items": [
      { "name": "Pienso cachorro 3kg", "qty": 1, "priceEur": 32.50 }
    ]
  }'

// 201 → { "ok": true, "saleId": "6a47…", "commissionPct": 5,
//   "commissionEur": 2.38, "patitasEarned": 67,
//   "appliedCoupons": [ … ] }`}</CodeBlock>
        <p style={p}>
          <strong>Idempotencia:</strong> enviad siempre el id del ticket como <code>externalRef</code>.
          Un reintento (timeout, corte de red) devuelve <code>200</code> con <code>"duplicate": true</code>{' '}
          y la misma respuesta que la original, cupones incluidos — sin duplicar la venta ni las Patitas.
          Los cupones: <code>couponIds</code> consume solo los que descontasteis de verdad;{' '}
          <code>applyCoupons: true</code> consume todos los elegibles; por defecto, ninguno.
        </p>
      </section>

      <section style={card}>
        <h2 style={h2}>Notas</h2>
        <p style={p}>
          El código corto del cliente caduca a los 10 minutos. Los cupones son de un solo uso (marcado
          atómico entre cajas concurrentes). Rate limit: 120 llamadas/minuto por IP — ante un{' '}
          <code>429</code>, reintentad con backoff. Errores comunes: <code>401 invalid_api_key</code>,{' '}
          <code>400 invalid_user_code</code>, <code>400 invalid_amount</code>.
        </p>
        <p style={{ ...p, margin: 0 }}>
          Dudas de integración: <a href="mailto:soporte@mypetlive.es" style={{ color: MPL.tealDark, fontWeight: 800 }}>soporte@mypetlive.es</a>
        </p>
      </section>
    </div>
  );
}
