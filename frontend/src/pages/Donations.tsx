import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createDonationSession } from '../api/donations';
import { toast } from 'react-hot-toast';
import { MPL, MPL_FONT_BODY, MPL_FONT_DISPLAY, PawMark } from '../styles/mypetlive';

const PRESETS = [5, 10, 20, 50];

export default function DonationsPage() {
  const [sp] = useSearchParams();
  const [amount, setAmount] = useState<string>('10');
  const animalId = sp.get('animalId') || undefined;

  const startDonation = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.error('Importe inválido'); return; }
    try {
      const session = await createDonationSession(value, animalId);
      if (session.url) window.location.href = session.url;
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo iniciar la donación');
    }
  };

  return (
    <div style={{ fontFamily: MPL_FONT_BODY, color: MPL.ink, background: MPL.bg, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: MPL.coral }}>
          <PawMark size={26} />
          <h1 style={{ fontFamily: MPL_FONT_DISPLAY, fontSize: 26, fontWeight: 800, color: MPL.ink, margin: 0 }}>Haz una donación</h1>
        </div>
        <p style={{ color: MPL.muted, margin: 0, fontSize: 14 }}>
          Tu aportación ayuda a las protectoras a seguir cuidando de los animales que buscan hogar.
        </p>

        <div style={{ background: MPL.card, border: `1px solid ${MPL.border}`, borderRadius: 18, padding: 22, display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((p) => {
              const active = Number(amount) === p;
              return (
                <button
                  key={p}
                  onClick={() => setAmount(String(p))}
                  style={{
                    flex: '1 0 auto', minWidth: 70, padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
                    fontFamily: MPL_FONT_BODY, fontWeight: 700, fontSize: 15,
                    border: `1.5px solid ${active ? MPL.teal : MPL.border}`,
                    background: active ? MPL.teal100 : '#fff',
                    color: active ? MPL.tealDark : MPL.ink,
                  }}
                >
                  {p} €
                </button>
              );
            })}
          </div>

          <label style={{ display: 'grid', gap: 6, fontSize: 13, color: MPL.muted, fontWeight: 600 }}>
            Otro importe (EUR)
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number" step="1" min="1"
              style={{ width: '100%', border: `1px solid ${MPL.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 15, fontFamily: MPL_FONT_BODY, color: MPL.ink, background: '#fff' }}
            />
          </label>

          <button
            onClick={startDonation}
            style={{ height: 50, borderRadius: 12, border: 'none', cursor: 'pointer', background: MPL.coral, color: '#fff', fontFamily: MPL_FONT_BODY, fontWeight: 800, fontSize: 16 }}
          >
            Donar {Number(amount) > 0 ? `${Number(amount)} €` : ''}
          </button>

          {animalId && <div style={{ fontSize: 12, color: MPL.faint }}>Donación dirigida al animal {animalId}</div>}
        </div>
      </div>
    </div>
  );
}
