import React from 'react';
import { isNativeApp, openPaymentPage, webUrl } from '../../utils/native';

// Casilla de aceptación del registro. Va SIN marcar y sin ella no se envía el
// formulario: un consentimiento premarcado no es válido. El servidor guarda la
// aceptación en el mismo alta (acceptLegal), así nadie pasa después por la
// pantalla de aceptación.
export default function LegalCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  // En la app un target=_blank no abre nada: el texto va en Safari por encima.
  const open = (path: string) => (e: React.MouseEvent) => {
    if (!isNativeApp()) return;
    e.preventDefault();
    void openPaymentPage(webUrl(path));
  };
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, lineHeight: 1.45, color: '#5C6455', cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        required
        style={{ width: 20, height: 20, margin: '2px 4px 0 2px', flexShrink: 0, accentColor: '#1F6F6F', transform: 'scale(1.35)', transformOrigin: 'top left' }}
      />
      <span>
        He leído y acepto los{' '}
        <a href="/legal/terms" target="_blank" rel="noreferrer" onClick={open('/legal/terms')} style={{ textDecoration: 'underline' }}>términos y condiciones</a>
        {' '}y la{' '}
        <a href="/legal/privacy" target="_blank" rel="noreferrer" onClick={open('/legal/privacy')} style={{ textDecoration: 'underline' }}>política de privacidad</a>.
      </span>
    </label>
  );
}
