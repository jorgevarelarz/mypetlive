import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getMyPatitas, getWalletToken } from '../../api/patitas';
import PatitasHistory from './PatitasHistory';
import { MPL, MPL_FONT_DISPLAY, MPL_FONT_MONO } from '../../styles/mypetlive';

const card: React.CSSProperties = { background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22 };

export default function PatitasShelterPanel() {
  const { user } = useAuth();
  const meId = String(user?._id || '');
  const qc = useQueryClient();
  const [wallet, setWallet] = useState<{ token: string; code: string } | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);

  const meQ = useQuery({ queryKey: ['patitas-me'], queryFn: getMyPatitas });
  const balance = meQ.data?.balance ?? 0;

  const showWallet = async () => {
    setLoadingWallet(true);
    try {
      const w = await getWalletToken();
      setWallet({ token: w.token, code: w.code });
      qc.invalidateQueries({ queryKey: ['patitas-me'] });
    } catch {
      // Sin esto el fallo era invisible: el botón volvía a su estado sin QR ni aviso.
      toast.error('No se pudo generar el QR de canje. Vuelve a intentarlo.');
    } finally {
      setLoadingWallet(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 14 }}>
        <div style={{ ...card, background: MPL.teal, color: '#fff', border: 'none' }}>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.8)', fontWeight: 800 }}>Saldo de Patitas</div>
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 38, fontWeight: 800, lineHeight: 1.1 }}>{balance} 🐾</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12.5, color: MPL.faint, fontWeight: 800 }}>Valor monetario</div>
          <div style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 38, fontWeight: 800, lineHeight: 1.1, color: MPL.oliveDark }}>{(meQ.data?.valueEur ?? 0).toFixed(2)} €</div>
          <div style={{ fontSize: 13, color: MPL.muted }}>canjeable en tiendas y veterinarios</div>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 4px' }}>Cobrar / canjear en un partner</h3>
        <p style={{ color: MPL.muted, fontSize: 13.5, margin: '0 0 14px' }}>Muestra este QR (o dicta el código) en la tienda o veterinario asociado para canjear tus Patitas. Caduca a los 10 minutos.</p>
        {!wallet ? (
          <button type="button" onClick={showWallet} disabled={loadingWallet} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: MPL.teal, color: '#fff', border: 0, borderRadius: 13, padding: '12px 18px', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
            <QrCode size={18} /> {loadingWallet ? 'Generando…' : 'Mostrar QR de canje'}
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ background: '#fff', border: `1px solid ${MPL.border}`, borderRadius: 16, padding: 14 }}>
              <QRCodeSVG value={wallet.token} size={168} bgColor="#ffffff" fgColor={MPL.ink} />
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12.5, color: MPL.faint, fontWeight: 800 }}>Código manual</div>
                <div style={{ fontFamily: MPL_FONT_MONO, fontSize: 30, fontWeight: 800, letterSpacing: 2, color: MPL.ink }}>{wallet.code}</div>
              </div>
              <button type="button" onClick={showWallet} disabled={loadingWallet} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', border: `1.5px solid ${MPL.border}`, borderRadius: 11, padding: '9px 14px', font: 'inherit', fontWeight: 800, cursor: 'pointer', color: MPL.ink, justifySelf: 'start' }}>
                <RefreshCw size={15} /> Regenerar
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 18, margin: '0 0 14px' }}>Histórico (entradas y canjes)</h3>
        <PatitasHistory items={meQ.data?.history || []} meId={meId} emptyText="Todavía no has recibido ni canjeado Patitas." />
      </div>
    </div>
  );
}
