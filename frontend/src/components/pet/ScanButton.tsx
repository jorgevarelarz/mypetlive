import React from 'react';
import { ScanBarcode } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { isNativeApp } from '../../utils/native';
import { lookupBarcode } from '../../api/animals';

/**
 * Botón «Escanear» (solo en la app): abre la cámara, lee el código de barras
 * del paquete y lo busca en el catálogo. Devuelve el producto si lo conocemos
 * o el código solo, para que la persona escriba el nombre y lo aprendamos.
 */
export default function ScanButton({ onResult }: { onResult: (r: { code: string; name?: string; kind?: 'food' | 'litter' }) => void }) {
  const [busy, setBusy] = React.useState(false);
  if (!isNativeApp()) return null;
  const scan = async () => {
    setBusy(true);
    try {
      const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHintALLOption } = await import('@capacitor/barcode-scanner');
      const res = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHintALLOption.ALL,
        scanInstructions: 'Apunta al código de barras del paquete',
        cancelButtonAccessibilityLabel: 'Cancelar',
      });
      const code = String(res?.ScanResult || '').trim();
      if (!code) return;
      const product = await lookupBarcode(code).catch(() => null);
      onResult(product ? { code, name: product.name, kind: product.kind } : { code });
    } catch (error: any) {
      // Cerrar la cámara no es un error que merezca aviso.
      if (!/cancel/i.test(String(error?.message || error))) toast.error('No se pudo leer el código');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={scan}
      disabled={busy}
      aria-label="Escanear código de barras"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid #D7D0C2', background: '#FFFFFF', color: '#1F6F6F', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
    >
      <ScanBarcode size={18} />
      {busy ? 'Leyendo…' : 'Escanear'}
    </button>
  );
}
