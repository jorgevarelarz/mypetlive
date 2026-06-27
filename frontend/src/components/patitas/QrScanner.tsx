import React, { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { MPL } from '../../styles/mypetlive';

// Escáner de QR con cámara. Llama onResult con el texto decodificado (el wallet token).
export default function QrScanner({ onResult, onError }: { onResult: (text: string) => void; onError?: (msg: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef(`qr-${Math.random().toString(36).slice(2)}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(idRef.current);
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        decoded => {
          if (doneRef.current) return;
          doneRef.current = true;
          onResult(decoded);
        },
        () => {},
      )
      .catch(err => onError?.(String(err?.message || err)));
    return () => {
      scanner.stop().then(() => scanner.clear()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div id={idRef.current} ref={ref} style={{ width: '100%', maxWidth: 320, borderRadius: 14, overflow: 'hidden', border: `1px solid ${MPL.border}` }} />;
}
